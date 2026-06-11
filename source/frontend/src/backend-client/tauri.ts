// Thin Tauri bridge with browser fallback.
// Real SMF/GLB/FBX file I/O and native dialogs/save will use this.
// openFile: tauri dialog or browser input.
// saveFile: native Tauri (dialog + write_file_binary) or browser download.
// readBinaryFile: for desktop binary loads when only path is available.

import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'

export interface OpenResult {
  path?: string
  name?: string
  data?: Uint8Array // for small files or future binary bridge
}

export async function openFile(): Promise<OpenResult | null> {
  // Detect Tauri environment
  const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__

  if (isTauri) {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: '3D Models', extensions: ['smf', 'glb', 'gltf', 'fbx'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (!selected) return null
      const path = typeof selected === 'string' ? selected : (selected as any).path || String(selected)
      // Later: also read bytes via fs plugin or custom command for large models
      return { path, name: path.split(/[\\/]/).pop() }
    } catch (e) {
      console.warn('[tauri] dialog open failed, falling back', e)
    }
  }

  // Browser fallback: hidden file input
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.smf,.glb,.gltf,.fbx,.obj'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      // For browser we can read as ArrayBuffer immediately (good for GLTFLoader etc)
      const buf = await file.arrayBuffer()
      resolve({
        name: file.name,
        data: new Uint8Array(buf)
      })
    }
    input.click()
  })
}

export async function saveFile(data: Uint8Array | Blob, suggestedName: string): Promise<void> {
  const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__
  if (isTauri) {
    const filePath = await save({
      defaultPath: suggestedName,
      filters: [{ name: 'All Files', extensions: ['*'] }]
    })
    if (!filePath) return
    let bytes: Uint8Array
    if (data instanceof Blob) {
      bytes = new Uint8Array(await data.arrayBuffer())
    } else {
      bytes = data
    }
    await invokeCommand('write_file_binary', { path: filePath, data: Array.from(bytes) })
    return
  }
  // Browser (or fallback) download
  const blob = data instanceof Blob ? data : new Blob([data])
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = suggestedName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// Example future command (will be used once Rust side has parse_smf etc)
export async function invokeCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__
  if (!isTauri) {
    throw new Error(`Command ${cmd} only available in Tauri desktop`)
  }
  return invoke<T>(cmd, args)
}

/**
 * Read a file as binary (Uint8Array). 
 * - In Tauri: uses the read_file_binary command (added for SMF/GLB desktop loads).
 * - In browser: not directly usable for arbitrary paths (security); openFile() already returns data.
 */
export async function readBinaryFile(path: string): Promise<Uint8Array> {
  const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__
  if (!isTauri) {
    throw new Error('readBinaryFile only available in Tauri desktop (use openFile in browser)')
  }
  const bytes: number[] = await invokeCommand<number[]>('read_file_binary', { path })
  return new Uint8Array(bytes)
}

export async function peekSmfHeader(path: string): Promise<string> {
  const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__
  if (!isTauri) {
    return 'peek_smf_header only in Tauri desktop'
  }
  return invokeCommand<string>('peek_smf_header', { path })
}

export async function validateSmf(path: string): Promise<string> {
  const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__
  if (!isTauri) {
    return 'validateSmf only in Tauri desktop'
  }
  return invokeCommand<string>('validate_smf', { path })
}

export async function peekSmfRigBasic(path: string): Promise<string> {
  const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__
  if (!isTauri) {
    return 'peekSmfRigBasic only in Tauri desktop'
  }
  return invokeCommand<string>('peek_smf_rig_basic', { path })
}

export async function peekSmfAnimBasic(path: string): Promise<string> {
  const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__
  if (!isTauri) {
    return 'peekSmfAnimBasic only in Tauri desktop'
  }
  return invokeCommand<string>('peek_smf_anim_basic', { path })
}

export async function getSmfDesktopInfo(path: string): Promise<string> {
  const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__
  if (!isTauri) {
    return 'getSmfDesktopInfo only in Tauri desktop'
  }
  return invokeCommand<string>('get_smf_desktop_info', { path })
}
