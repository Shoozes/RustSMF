import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { openFile, OpenResult, invokeCommand, readBinaryFile, saveFile } from './backend-client/tauri'
import { loadGLB } from './loaders/glb'
import { importSMF, buildThreeScene as buildSmfScene, exportSMFToBuffer } from './loaders/smf'
import { loadFBX } from './loaders/fbx'
import ThreeViewport from './components/ThreeViewport'
import { usePlaybackSlice } from './store'

// Main application: UI shell + state + loaders. Three.js viewport, scene, orbit, RAF, skinned attach
// and mixer driving are fully delegated to <ThreeViewport> for modularity (no more duplication/dead code).
// All model data (root/skeleton/clips) flow as props; playback is driven by props + callbacks.
export default function App() {
  const [status, setStatus] = useState('Three.js viewport ready (Y-up). Open .smf/.glb/.fbx. SMF/GLB export (FBX limited).')
  const [selected, setSelected] = useState<string>('Scene')
  const [clips, setClips] = useState<THREE.AnimationClip[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string>('')

  // Model data passed down to the self-contained ThreeViewport (modularity)
  const [currentRoot, setCurrentRoot] = useState<THREE.Group | null>(null)
  const [currentSkeleton, setCurrentSkeleton] = useState<THREE.Skeleton | undefined>(undefined)

  // Keep raw ImportedSmf for high-fidelity SMF export roundtrips (SMF path only)
  const lastSmfDataRef = useRef<any>(null) // ImportedSmf | null

  // Playback state via store hook for modularity (reduces local state duplication, demonstrates store)
  const playback = usePlaybackSlice()
  const playbackRef = useRef(playback)
  useEffect(() => { playbackRef.current = playback }, [playback])

  // Logical clear (resets UI state and signals viewport via null root)
  function clearLoadedModel() {
    lastSmfDataRef.current = null
    setCurrentRoot(null)
    setCurrentSkeleton(undefined)
    setClips([])
    setSelected('Scene')
    setErrorMsg('')
    const pb = playbackRef.current
    pb.setIsPlaying(false)
    pb.setCurrentTime(0)
    pb.setDuration(0)
    pb.setCurrentClipName('')
    pb.setPlaybackSpeed(1)
  }

  // Load a model (GLB/SMF/FBX). Desktop path-only cases now uniformly use readBinaryFile for robustness
  // (tauri openFile returns path; browser hidden input path gives data). The actual three scene attach,
  // skeleton helper, mixer and RAF are handled inside ThreeViewport via props.
  const loadModel = useCallback(async (res: OpenResult) => {
    clearLoadedModel()
    setIsLoading(true)
    setErrorMsg('')
    setStatus('Loading model...')

    try {
      let loaded: any
      const name = (res.name || res.path || '').toLowerCase()

      // Unified binary read for desktop (tauri) path-only case for all binary formats.
      let data: Uint8Array | undefined = res.data
      if (!data && res.path) {
        setStatus('Reading binary from desktop path...')
        data = await readBinaryFile(res.path)
      }

      if (name.endsWith('.smf')) {
        if (!data) {
          throw new Error('Could not obtain binary data for .smf (browser provides via input; desktop uses read_file_binary)')
        }
        const imported = importSMF(data.buffer)
        lastSmfDataRef.current = imported
        loaded = buildSmfScene(imported)
      } else if (name.endsWith('.fbx')) {
        const urlOrBuf: string | ArrayBuffer = data ? data.buffer : (res.path || '')
        loaded = await loadFBX(urlOrBuf)
      } else {
        // GLB / GLTF
        const urlOrBuf: string | ArrayBuffer = data ? data.buffer : (res.path || '')
        loaded = await loadGLB(urlOrBuf)
      }

      const root = loaded.root as THREE.Group
      const availableClips = loaded.clips || (root as any).animations || []

      // Signal to viewport (it will attach root, build internal mixer/helper, start first clip)
      setCurrentRoot(root)
      setCurrentSkeleton(loaded.skeleton)
      setClips(availableClips)

      if (availableClips.length > 0) {
        const first = availableClips[0]
        const pb = playbackRef.current
        pb.setCurrentClipName(first.name || 'clip_0')
        pb.setDuration(first.duration)
        pb.setIsPlaying(true)
        pb.setCurrentTime(0)
      }

      if (name.endsWith('.fbx')) {
        setStatus(`Loaded FBX: ${res.name || 'model'} | bones: ${loaded.skeleton?.bones?.length || '?'} | clips: ${availableClips.length || 0}`)
      } else {
        setStatus(`Loaded: ${res.name || 'model'} | bones: ${loaded.skeleton?.bones?.length || '?'} | clips: ${availableClips.length} | verts: ${loaded.skinnedMeshes?.[0]?.geometry?.attributes?.position?.count || '?'}`)
      }

      setSelected(loaded.skinnedMeshes?.[0]?.name || 'root')

    } catch (e: any) {
      console.error(e)
      const msg = e?.message || String(e)
      setErrorMsg(`Load error: ${msg}`)
      setStatus(`Load error: ${msg}. Try a .glb or .smf from docs/references/old-src/datafiles/SMF/.`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Keyboard (space toggles play; R reset handled inside viewport)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === ' ') {
        e.preventDefault()
        setIsPlaying(p => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Live open (now actually loads!)
  // The button triggers the real openFile (tauri or dynamic). We also expose a
  // persistent hidden <input data-testid="model-file-input"> for reliable e2e
  // file simulation with page.setInputFiles in Playwright.
  const handleOpen = async () => {
    setStatus('Opening file picker (GLB/SMF supported)...')
    try {
      const res: OpenResult | null = await openFile()
      if (!res) {
        setStatus('No file selected.')
        return
      }
      await loadModel(res)
    } catch (e: any) {
      const msg = e?.message || String(e)
      setErrorMsg(`Open error: ${msg}`)
      setStatus(`Open error: ${msg}`)
    }
  }

  // Export: prefer high-fidelity SMF when we have the raw data (for roundtrips on SMF loads),
  // otherwise fall back to GLB using the currentRoot model group + clips (viewport owns the viz copy).
  // Uses saveFile util (now fully supports native Tauri save via dialog + write command).
  const handleExport = async () => {
    const smfData = lastSmfDataRef.current
    if (smfData) {
      setStatus('Exporting as SMF (fidelity path using imported data + coord transforms)...')
      try {
        const buf = exportSMFToBuffer(smfData)
        await saveFile(buf, 'exported_model.smf')
        setStatus('Exported .smf (using our ImportedSmf + DQ handling). Test roundtrip by re-importing!')
        return
      } catch (e: any) {
        setStatus(`SMF export error: ${e?.message || e}. Falling back to GLB...`)
      }
    }

    // GLB fallback for GLB/FBX loads (and SMF if wanted): export the model root we hold in state.
    const rootToExport = currentRoot
    if (!rootToExport) {
      setStatus('Nothing to export.')
      return
    }
    setStatus('Exporting current model as GLB...')
    try {
      const exporter = new GLTFExporter()
      const result = await exporter.parseAsync(rootToExport, { binary: true, animations: clips })
      const buf = new Uint8Array(result as ArrayBuffer)
      await saveFile(buf, 'exported_model.glb')
      setStatus('Exported .glb (animations included when present).')
    } catch (e: any) {
      const msg = e?.message || String(e)
      setErrorMsg(`Export error: ${msg}`)
      setStatus(`Export error: ${msg}`)
    }
  }

  const pingRust = async () => {
    try {
      const msg = await invokeCommand<string>('greet', { name: 'RustSMF' })
      setStatus(msg + ' (real tauri invoke)')
    } catch (e: any) {
      setStatus('Ping only works in Tauri desktop shell: ' + (e?.message || e))
    }
  }

  // Playback controls driven by store hook (modularity). Viewport consumes the values via props.
  const togglePlay = useCallback(() => {
    playbackRef.current.toggle()
  }, [])  // uses ref to avoid stale; stable for handlers

  const changeClip = (clip: THREE.AnimationClip) => {
    playback.selectClip(clip.name || 'clip', clip.duration)
  }

  const onScrub = (t: number) => {
    playback.scrub(Math.max(0, Math.min(t, playback.duration || 0)))
  }

  const setSpeed = (s: number) => {
    playback.setPlaybackSpeed(s)
  }

  return (
    <div className="app-shell">
      <div className="toolbar">
        <div className="font-semibold tracking-wide">RustSMF</div>
        <button data-testid="open-model-btn" onClick={handleOpen} disabled={isLoading}>Open Model (.glb / .smf)</button>
        <button data-testid="export-btn" onClick={handleExport} disabled={isLoading}>Export (SMF if possible / GLB)</button>
        <button data-testid="ping-rust-btn" onClick={pingRust} disabled={isLoading}>Ping Rust</button>
        {/* Persistent hidden file input for reliable e2e file simulation (Playwright setInputFiles) */}
        <input
          type="file"
          data-testid="model-file-input"
          style={{ display: 'none' }}
          accept=".smf,.glb,.gltf,.fbx"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setIsLoading(true);
            setStatus('Loading selected file...');
            try {
              const buf = await file.arrayBuffer();
              await loadModel({ name: file.name, data: new Uint8Array(buf) });
            } catch (err: any) {
              const m = err?.message || String(err)
              setErrorMsg(`File load error: ${m}`)
              setStatus(`File load error: ${m}`);
            } finally {
              setIsLoading(false);
              // reset input so same file can be chosen again
              (e.target as HTMLInputElement).value = '';
            }
          }}
        />
        <div className="text-xs text-slate-400 ml-auto pr-2">
          Drag orbit • Wheel zoom • R reset • Space play/pause
        </div>
      </div>

      {/* Simple pure error banner (no extra deps) - clear on load or dismiss */}
      {errorMsg && (
        <div data-testid="error-banner" className="bg-red-900/80 text-red-200 text-xs px-3 py-1 flex items-center gap-2">
          <span>{errorMsg}</span>
          <button className="ml-auto underline" onClick={() => setErrorMsg('')}>dismiss</button>
        </div>
      )}

      <div className="main-area">
        <div data-testid="outliner" className="sidebar">
          <div className="panel-title">Outliner</div>
          <div className="text-xs space-y-0.5">
            <div className="cursor-pointer hover:bg-slate-700 px-1 rounded" onClick={() => setSelected('Scene')}>Scene Root</div>
            {clips.length > 0 && <div className="pl-2 text-emerald-400">+ {clips.length} Animation Clips</div>}
            <div className="y-up-note mt-2">Y-up (Three). SMF Z-up + DQ converted via loaders/coord.ts</div>
          </div>
        </div>

        <div
          data-testid="viewport-container"
          className="viewport-container relative"
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault()
            const file = e.dataTransfer.files?.[0]
            if (!file) return
            setIsLoading(true)
            setStatus('Loading dropped file...')
            try {
              const buf = await file.arrayBuffer()
              await loadModel({ name: file.name, data: new Uint8Array(buf) })
            } catch (err: any) {
              const m = err?.message || String(err)
              setErrorMsg(`Drop load error: ${m}`)
              setStatus(`Drop load error: ${m}`)
            } finally {
              setIsLoading(false)
            }
          }}
        >
          <ThreeViewport
            root={currentRoot}
            skeleton={currentSkeleton}
            clips={clips}
            isPlaying={playback.isPlaying}
            currentTime={playback.currentTime}
            currentClipName={playback.currentClipName}
            playbackSpeed={playback.playbackSpeed}
            onTimeUpdate={playback.setCurrentTime}
          />
          {/* Simple pure loading overlay (no deps) */}
          {isLoading && (
            <div data-testid="loading-overlay" className="absolute inset-0 bg-slate-950/60 flex items-center justify-center text-sm text-slate-200 pointer-events-none">
              Loading model…
            </div>
          )}
          <div data-testid="status-text" className={`absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded pointer-events-none ${isLoading ? 'bg-amber-900/70 text-amber-200' : 'bg-black/50 text-slate-300'}`}>
            {status}
            {isLoading && ' …'}
          </div>
          <div className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded bg-black/40 text-slate-400 pointer-events-none">Drop .smf/.glb/.fbx here</div>
        </div>

        <div className="inspector">
          <div className="panel-title">Inspector</div>
          <div className="text-xs">
            <div className="mb-1 text-slate-400">Selected</div>
            <div className="font-mono text-amber-300 break-all">{selected}</div>
            <div className="mt-3 text-[10px] text-slate-400">
              Real SkinnedMesh + Skeleton + clips loaded here.<br />
              Timeline below drives the AnimationMixer.
            </div>
            {clips.length > 0 && (
              <div className="mt-3">
                <div className="panel-title">Clips</div>
                {clips.map((c, idx) => (
                  <div
                    key={idx}
                    data-testid={`clip-item-${idx}`}
                    className={`cursor-pointer px-1 rounded ${playback.currentClipName === (c.name || `clip_${idx}`) ? 'bg-slate-600' : 'hover:bg-slate-700'}`}
                    onClick={() => changeClip(c)}
                  >
                    {c.name || `clip_${idx}`} (${(c.duration || 0).toFixed(2)}s)
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div data-testid="timeline" className="timeline">
        <div className="flex items-center gap-2 text-xs mb-1">
          <button onClick={togglePlay} disabled={clips.length === 0}>
            {playback.isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button onClick={() => { playback.setCurrentTime(0); /* viewport applies via currentTime prop */ }} disabled={clips.length === 0}>⏮ Reset</button>
          <input
            type="range"
            data-testid="scrub-slider"
            className="w-80 accent-emerald-500"
            min={0}
            max={playback.duration || 1}
            step={0.01}
            value={playback.currentTime}
            onChange={(e) => onScrub(parseFloat(e.target.value))}
            disabled={clips.length === 0}
          />
          <span data-testid="time-display" className="tabular-nums w-24 text-right">{playback.currentTime.toFixed(2)} / {(playback.duration || 0).toFixed(2)}s</span>
          <select className="bg-slate-700 text-xs px-1" onChange={(e) => setSpeed(parseFloat(e.target.value))} disabled={clips.length === 0}>
            <option value="1">1x</option>
            <option value="0.5">0.5x</option>
            <option value="2">2x</option>
          </select>
        </div>
        <div className="text-[10px] text-slate-400">
          Real AnimationMixer + tracks from imported clips. SMF dual-quat converted in loaders/coord + smf.ts. Load a real .smf from docs/references/old-src/datafiles/SMF/ to see it in action.
        </div>
      </div>
    </div>
  )
}
