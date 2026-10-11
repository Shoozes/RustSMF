// Thin Tauri bridge with browser fallback.
// Native dialogs and filesystem authority stay in Rust; browser input/downloads
// remain DOM-owned and never accept arbitrary native paths.

import { invoke } from '@tauri-apps/api/core'
import { bytesToArrayBuffer } from '../loaders'
import { normalizeBinaryBundlePayload, normalizeBinaryPayload } from './binaryPayload'
import {
  assertModelFileSize,
  assertModelInputSize,
  ModelInputSizeError,
  detectModelFormat,
  MAX_MODEL_INPUT_BYTES,
  SUPPORTED_MODEL_RESOURCE_ACCEPT,
} from '../utils/modelFormat'
import {
  createModelResourceBundle,
  MAX_MODEL_RESOURCE_BUNDLE_BYTES,
  MAX_MODEL_RESOURCE_FILE_BYTES,
  ModelResourceError,
} from '../utils/modelResourceBundle'
import { PROJECT_EXTENSION } from '../utils/projectCodec'
import type { ProjectState } from '../utils/projectCodec'

export interface OpenFileEntry {
  path?: string
  name: string
  data?: Uint8Array
}

export interface OpenResult {
  path?: string
  name?: string
  data?: Uint8Array // browser-read bytes or test/native-injected bytes
  files?: readonly OpenFileEntry[]
  projectState?: ProjectState
  error?: string
}

export interface TauriClient {
  openFile: () => Promise<OpenResult | null>;
  readBrowserModelFiles: (files: readonly File[]) => Promise<OpenResult>;
  saveFile: (data: Uint8Array | Blob, suggestedName: string) => Promise<boolean>;
  saveProjectFile: (data: Uint8Array, suggestedName: string) => Promise<boolean>;
  openProjectFile: () => Promise<Uint8Array | null>;
  autosaveProject: (data: Uint8Array) => Promise<boolean>;
  discoverProjectRecovery: () => Promise<readonly string[]>;
  readProjectRecovery: (name: string) => Promise<Uint8Array>;
  readBinaryFile: (path: string) => Promise<Uint8Array>;
  readBinaryBundle: (paths: readonly string[]) => Promise<readonly Uint8Array[]>;
  invokeCommand: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

function isTauriEnv(): boolean {
  return !!(Reflect.get(window, '__TAURI__') || Reflect.get(window, '__TAURI_INTERNALS__'));
}

export async function openFile(): Promise<OpenResult | null> {
  const isTauri = isTauriEnv()
  if (isTauri) {
    try {
      const selected = await invokeCommand<string | string[] | null>('open_file')
      if (!selected) return null
      if (Array.isArray(selected)) {
        const modelCount = selected.filter((path) => detectModelFormat(path) !== '').length
        if (modelCount > 1) {
          return { error: 'Select exactly one supported model file; the remaining selected files are treated as sidecars.' }
        }
        const modelIndex = selected.findIndex((path) => detectModelFormat(path) !== '')
        if (modelIndex < 0) {
          return { error: 'No supported model file was selected. Select one .smf, .glb, .gltf, .fbx, .dae, or .obj file with optional sidecars.' }
        }
        const orderedPaths = [selected[modelIndex], ...selected.filter((_, index) => index !== modelIndex)]
        const primaryPath = orderedPaths[0]
        const primaryDirectory = primaryPath.slice(0, Math.max(primaryPath.lastIndexOf('\\'), primaryPath.lastIndexOf('/')) + 1)
        const files = orderedPaths.map((path) => ({
          path,
          name: nativeBundleName(primaryDirectory, path),
        }))
        return { path: primaryPath, name: files[0].name, files }
      }
      const path = selected
      // Rust returns a path only after the native dialog has authorized it;
      // the following read is rejected if a caller supplies an unselected path.
      return { path, name: path.split(/[\\/]/).pop() }
    } catch (e) {
      console.warn('[tauri] dialog open failed, falling back', e)
    }
  }

  // Browser fallback: hidden file input
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = SUPPORTED_MODEL_RESOURCE_ACCEPT
    input.style.display = 'none'
    input.multiple = true

    let settled = false
    let focusTimeout: number | null = null

    const finalize = (result: OpenResult | null) => {
      if (settled) return
      settled = true
      if (focusTimeout !== null) {
        window.clearTimeout(focusTimeout)
        focusTimeout = null
      }
      window.removeEventListener('focus', onWindowFocus)
      input.removeEventListener('change', onChange)
      input.onchange = null
      input.removeEventListener('cancel', onCancel)
      if (input.parentElement) input.parentElement.removeChild(input)
      resolve(result)
    }

    const onChange = async () => {
      const files = Array.from(input.files ?? [])
      if (files.length === 0) {
        finalize(null)
        return
      }
      try {
        finalize(await readBrowserModelFiles(files))
      } catch (e) {
        console.warn('[tauri] failed to read file from browser input', e)
        const message = e instanceof Error && e.message.trim()
          ? e.message
          : 'The browser could not read the selected file.'
        const primary = files.find((file) => detectModelFormat(file.name) !== '')
        finalize({
          name: primary?.name,
          error: e instanceof ModelInputSizeError
            ? message
            : `Could not read model bundle "${primary?.name || 'selected files'}": ${message}`,
        })
      }
    }

    const onCancel = () => finalize(null)
    const onWindowFocus = () => {
      if (settled) return
      if (focusTimeout !== null) window.clearTimeout(focusTimeout)
      focusTimeout = window.setTimeout(() => {
        focusTimeout = null
        if (!settled && (!input.files || input.files.length === 0)) {
          finalize(null)
        }
      }, 150)
    }

    input.onchange = onChange
    input.addEventListener('cancel', onCancel)
    window.addEventListener('focus', onWindowFocus)
    document.body.appendChild(input)
    input.click()
  })
}

export async function readBrowserModelFiles(files: readonly File[]): Promise<OpenResult> {
  const selected = [...files]
  const modelFiles = selected.filter((file) => detectModelFormat(file.name) !== '')
  if (modelFiles.length !== 1) {
    return {
      error: modelFiles.length === 0
        ? 'No supported model file was selected. Select one model file with optional .bin, .mtl, or texture sidecars.'
        : 'Select exactly one supported model file; the remaining selected files are treated as sidecars.',
    }
  }
  const primary = modelFiles[0]
  const ordered = [primary, ...selected.filter((file) => file !== primary)]
  assertBrowserBundleMetadata(ordered)
  const entries = await Promise.all(ordered.map(async (file) => ({
    name: browserBundleName(file),
    data: new Uint8Array(await file.arrayBuffer()),
  })))
  const bundle = createModelResourceBundle(entries[0], entries.slice(1))
  return {
    name: bundle.primary.name,
    data: bundle.primary.data,
    files: bundle.files,
  }
}

export async function saveFile(data: Uint8Array | Blob, suggestedName: string): Promise<boolean> {
  const isTauri = isTauriEnv()
  if (isTauri) {
    assertModelInputSize(suggestedName, data instanceof Blob ? data.size : data.byteLength)
    let bytes: Uint8Array
    if (data instanceof Blob) {
      bytes = new Uint8Array(await data.arrayBuffer())
    } else {
      bytes = data
    }
    return invokeCommand<boolean>('save_file_binary', { suggestedName, data: bytes })
  }
  // Browser (or fallback) download
  assertModelInputSize(suggestedName, data instanceof Blob ? data.size : data.byteLength)
  const blob = data instanceof Blob ? data : new Blob([bytesToArrayBuffer(data)])
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return true
}

// Shared Tauri command wrapper.
export async function invokeCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const isTauri = isTauriEnv()
  if (!isTauri) {
    throw new Error(`Command ${cmd} only available in Tauri desktop`)
  }
  return invoke<T>(cmd, args)
}

/**
 * Read a file as binary (Uint8Array). 
 * - In Tauri: uses read_file_binary after the Rust dialog authority check.
 * - In browser: not directly usable for arbitrary paths (security); openFile() already returns data.
 */
export async function readBinaryFile(path: string): Promise<Uint8Array> {
  const isTauri = isTauriEnv()
  if (!isTauri) {
    throw new Error('readBinaryFile only available in Tauri desktop (use openFile in browser)')
  }
  const payload = await invokeCommand<unknown>('read_file_binary', { path })
  return normalizeBinaryPayload(payload, path)
}

export async function saveProjectFile(data: Uint8Array, suggestedName = `rustsmf-project${PROJECT_EXTENSION}`): Promise<boolean> {
  assertModelInputSize(suggestedName, data.byteLength)
  if (isTauriEnv()) {
    return invokeCommand<boolean>('save_project_atomic', { suggestedName, data })
  }
  return saveFile(data, suggestedName)
}

export async function openProjectFile(): Promise<Uint8Array | null> {
  if (isTauriEnv()) {
    const path = await invokeCommand<string | null>('open_project_file')
    if (!path) return null
    return readBinaryFile(path)
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = PROJECT_EXTENSION
    input.style.display = 'none'
    let settled = false
    const finalize = (result: Uint8Array | null, error?: unknown) => {
      if (settled) return
      settled = true
      input.removeEventListener('change', onChange)
      input.removeEventListener('cancel', onCancel)
      input.parentElement?.removeChild(input)
      if (error) reject(error)
      else resolve(result)
    }
    const onChange = async () => {
      const file = input.files?.[0]
      if (!file) { finalize(null); return }
      try {
        assertModelInputSize(file.name, file.size)
        finalize(new Uint8Array(await file.arrayBuffer()))
      } catch (error) {
        finalize(null, error)
      }
    }
    const onCancel = () => finalize(null)
    input.addEventListener('change', onChange)
    input.addEventListener('cancel', onCancel)
    document.body.appendChild(input)
    input.click()
  })
}

export async function autosaveProject(data: Uint8Array): Promise<boolean> {
  assertModelInputSize('autosave project', data.byteLength)
  if (isTauriEnv()) return invokeCommand<boolean>('autosave_project', { data })
  try {
    localStorage.setItem('rustsmf.project.autosave.0', new TextDecoder().decode(data))
    return true
  } catch {
    return false
  }
}

export async function discoverProjectRecovery(): Promise<readonly string[]> {
  if (isTauriEnv()) return invokeCommand<string[]>('discover_project_recovery')
  return localStorage.getItem('rustsmf.project.autosave.0') ? ['rustsmf.project.autosave.0'] : []
}

export async function readProjectRecovery(name: string): Promise<Uint8Array> {
  if (isTauriEnv()) {
    const payload = await invokeCommand<unknown>('read_project_recovery', { name })
    return normalizeBinaryPayload(payload, name)
  }
  const value = localStorage.getItem(name)
  if (!value) throw new Error(`Project recovery generation "${name}" was not found.`)
  return new TextEncoder().encode(value)
}

export async function readBinaryBundle(paths: readonly string[]): Promise<readonly Uint8Array[]> {
  if (!isTauriEnv()) {
    throw new Error('readBinaryBundle only available in Tauri desktop (use openFile in browser)')
  }
  if (paths.length === 0) throw new Error('Cannot read an empty model resource bundle.')
  const payload = await invokeCommand<unknown>('read_files_binary', { paths })
  return normalizeBinaryBundlePayload(payload, paths)
}

function assertBrowserBundleMetadata(files: readonly File[]): void {
  if (files.length === 0) throw new Error('No files were selected.')
  if (files.length > 64) throw new ModelResourceError('RESOURCE_BUNDLE_TOO_MANY_FILES', 'Selected model bundle contains too many files.')
  let total = 0
  files.forEach((file, index) => {
    const limit = index === 0 ? MAX_MODEL_INPUT_BYTES : MAX_MODEL_RESOURCE_FILE_BYTES
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > limit) {
      if (index === 0) assertModelFileSize(file)
      throw new ModelResourceError(
        'RESOURCE_FILE_TOO_LARGE',
        `Resource "${file.name}" is ${file.size} bytes; the limit is ${limit} bytes.`,
        file.name,
      )
    }
    total += file.size
    if (total > MAX_MODEL_RESOURCE_BUNDLE_BYTES) {
      throw new ModelResourceError('RESOURCE_BUNDLE_TOO_LARGE', 'Selected model bundle exceeds the aggregate byte limit.')
    }
  })
}

function browserBundleName(file: File): string {
  const relative = file.webkitRelativePath || file.name
  return relative.replace(/\\/g, '/')
}

function nativeBundleName(primaryDirectory: string, path: string): string {
  const normalizedPrimary = primaryDirectory.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedPath = path.replace(/\\/g, '/')
  if (normalizedPrimary && normalizedPath.toLocaleLowerCase('en-US').startsWith(`${normalizedPrimary.toLocaleLowerCase('en-US')}/`)) {
    return normalizedPath.slice(normalizedPrimary.length + 1)
  }
  return normalizedPath
}
