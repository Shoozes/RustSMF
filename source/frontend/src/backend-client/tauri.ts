// Thin Tauri bridge with browser fallback.
// Native dialogs and filesystem authority stay in Rust; browser input/downloads
// remain DOM-owned and never accept arbitrary native paths.

import { invoke } from '@tauri-apps/api/core'
import { bytesToArrayBuffer } from '../loaders'
import { normalizeBinaryPayload } from './binaryPayload'
import {
  assertModelFileSize,
  assertModelInputSize,
  ModelInputSizeError,
  SUPPORTED_MODEL_ACCEPT,
} from '../utils/modelFormat'

export interface OpenResult {
  path?: string
  name?: string
  data?: Uint8Array // browser-read bytes or test/native-injected bytes
  error?: string
}

export interface SmfDesktopInfo {
  valid: boolean
  version: string
  size: number
  off_tex: number
  off_model: number
  off_rig: number
  off_anim: number
  model_count?: number
  rig_bone_count?: number
  anim_clip_count?: number
  error?: string
}

export interface TauriClient {
  openFile: () => Promise<OpenResult | null>;
  saveFile: (data: Uint8Array | Blob, suggestedName: string) => Promise<boolean>;
  readBinaryFile: (path: string) => Promise<Uint8Array>;
  invokeCommand: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  peekSmfHeader: (path: string) => Promise<string>;
  validateSmf: (path: string) => Promise<string>;
  peekSmfRigBasic: (path: string) => Promise<string>;
  peekSmfAnimBasic: (path: string) => Promise<string>;
  peekSmfModelBasic: (path: string) => Promise<string>;
  getSmfDesktopInfo: (path: string) => Promise<SmfDesktopInfo>;
}

function isTauriEnv(): boolean {
  return !!(Reflect.get(window, '__TAURI__') || Reflect.get(window, '__TAURI_INTERNALS__'));
}

export async function openFile(): Promise<OpenResult | null> {
  const isTauri = isTauriEnv()
  if (isTauri) {
    try {
      const path = await invokeCommand<string | null>('open_file')
      if (!path) return null
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
    input.accept = SUPPORTED_MODEL_ACCEPT
    input.style.display = 'none'
    input.multiple = false

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
      const file = input.files?.[0]
      if (!file) {
        finalize(null)
        return
      }
      try {
        // Check metadata before materializing the browser File. The load hook
        // repeats the byte-length check for native and test-injected results.
        assertModelFileSize(file)
        const buf = await file.arrayBuffer()
        finalize({
          name: file.name,
          data: new Uint8Array(buf)
        })
      } catch (e) {
        console.warn('[tauri] failed to read file from browser input', e)
        const message = e instanceof Error && e.message.trim()
          ? e.message
          : 'The browser could not read the selected file.'
        finalize({
          name: file.name,
          error: e instanceof ModelInputSizeError
            ? message
            : `Could not read model file "${file.name}": ${message}`,
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

export async function peekSmfHeader(path: string): Promise<string> {
  const isTauri = isTauriEnv()
  if (!isTauri) {
    return 'peek_smf_header only in Tauri desktop'
  }
  return invokeCommand<string>('peek_smf_header', { path })
}

export async function validateSmf(path: string): Promise<string> {
  const isTauri = isTauriEnv()
  if (!isTauri) {
    return 'validateSmf only in Tauri desktop'
  }
  return invokeCommand<string>('validate_smf', { path })
}

export async function peekSmfRigBasic(path: string): Promise<string> {
  const isTauri = isTauriEnv()
  if (!isTauri) {
    return 'peekSmfRigBasic only in Tauri desktop'
  }
  return invokeCommand<string>('peek_smf_rig_basic', { path })
}

export async function peekSmfAnimBasic(path: string): Promise<string> {
  const isTauri = isTauriEnv()
  if (!isTauri) {
    return 'peekSmfAnimBasic only in Tauri desktop'
  }
  return invokeCommand<string>('peek_smf_anim_basic', { path })
}

export async function peekSmfModelBasic(path: string): Promise<string> {
  const isTauri = isTauriEnv()
  if (!isTauri) {
    return 'peekSmfModelBasic only in Tauri desktop'
  }
  return invokeCommand<string>('peek_smf_model_basic', { path })
}

export async function getSmfDesktopInfo(path: string): Promise<SmfDesktopInfo> {
  const isTauri = isTauriEnv()
  if (!isTauri) {
    return {
      valid: false,
      version: '',
      size: 0,
      off_tex: 0,
      off_model: 0,
      off_rig: 0,
      off_anim: 0,
      error: 'getSmfDesktopInfo only in Tauri desktop',
    }
  }
  return invokeCommand<SmfDesktopInfo>('get_smf_desktop_info', { path })
}
