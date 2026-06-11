import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { openFile, OpenResult, invokeCommand, readBinaryFile } from './backend-client/tauri'
import { loadGLB } from './loaders/glb'
import { importSMF, buildThreeScene as buildSmfScene, exportSMF } from './loaders/smf'

// Simple mouse orbit controller (Y-up, right-handed, matching Three.js default)
// This keeps the viewport self-contained without pulling in extra OrbitControls dep yet.
class SimpleOrbit {
  yaw = 0.6
  pitch = 0.4
  distance = 4.5
  target = new THREE.Vector3(0, 0.8, 0)

  private dragging = false
  private lastX = 0
  private lastY = 0

  attach(canvas: HTMLCanvasElement, onChange: () => void) {
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      this.dragging = true
      this.lastX = e.clientX
      this.lastY = e.clientY
    }
    const onUp = () => { this.dragging = false }
    const onMove = (e: MouseEvent) => {
      if (!this.dragging) return
      const dx = e.clientX - this.lastX
      const dy = e.clientY - this.lastY
      this.yaw -= dx * 0.0035
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - dy * 0.0035))
      this.lastX = e.clientX
      this.lastY = e.clientY
      onChange()
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      this.distance = Math.max(1.2, Math.min(18, this.distance + e.deltaY * 0.003))
      onChange()
    }
    canvas.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('mousemove', onMove)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    // Touch support (basic)
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.dragging = true
        this.lastX = e.touches[0].clientX
        this.lastY = e.touches[0].clientY
      }
    })
    canvas.addEventListener('touchend', () => { this.dragging = false })
    canvas.addEventListener('touchmove', (e) => {
      if (!this.dragging || e.touches.length !== 1) return
      const dx = e.touches[0].clientX - this.lastX
      const dy = e.touches[0].clientY - this.lastY
      this.yaw -= dx * 0.004
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - dy * 0.004))
      this.lastX = e.touches[0].clientX
      this.lastY = e.touches[0].clientY
      onChange()
    })
  }

  getPosition(): THREE.Vector3 {
    const x = Math.cos(this.pitch) * Math.sin(this.yaw) * this.distance
    const y = Math.sin(this.pitch) * this.distance
    const z = Math.cos(this.pitch) * Math.cos(this.yaw) * this.distance
    return new THREE.Vector3(x, y, z).add(this.target)
  }
}

// Main application with fully functional model loading (GLB + SMF), real skinned rendering,
// AnimationMixer driven timeline, SkeletonHelper, and export.
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('Three.js viewport ready (Y-up). Open a .glb or .smf from the reference samples.')
  const [selected, setSelected] = useState<string>('Scene')
  const [clips, setClips] = useState<THREE.AnimationClip[]>([])
  const [currentClipName, setCurrentClipName] = useState<string>('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // Three.js core refs (persistent)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const orbitRef = useRef(new SimpleOrbit())
  const frameRef = useRef<number | null>(null)
  const resizeObsRef = useRef<ResizeObserver | null>(null)

  // Model + animation state (replaces pure placeholder)
  const modelRootRef = useRef<THREE.Group | null>(null)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  const currentActionRef = useRef<THREE.AnimationAction | null>(null)
  const skeletonHelperRef = useRef<THREE.SkeletonHelper | null>(null)
  const clockRef = useRef(new THREE.Clock())

  // Keep raw ImportedSmf for high-fidelity SMF export (roundtrips)
  const lastSmfDataRef = useRef<any>(null) // ImportedSmf | null

  // Build initial empty scene + lights + grid (called once)
  function initBaseScene(scene: THREE.Scene) {
    scene.background = new THREE.Color(0x0b1120)

    const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x080820, 0.6)
    scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xffffff, 0.95)
    dir.position.set(4, 7, 3)
    scene.add(dir)

    const grid = new THREE.GridHelper(14, 14, 0x475569, 0x334155)
    grid.position.y = 0.001
    scene.add(grid)
    scene.add(new THREE.AxesHelper(1.8))
  }

  // Remove previous loaded model + helpers
  function clearLoadedModel(scene: THREE.Scene) {
    if (modelRootRef.current) {
      scene.remove(modelRootRef.current)
      modelRootRef.current.traverse((o: any) => {
        if (o.geometry) o.geometry.dispose?.()
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach((m: any) => m.dispose?.())
        }
      })
    }
    if (skeletonHelperRef.current) {
      scene.remove(skeletonHelperRef.current)
      skeletonHelperRef.current.dispose?.()
      skeletonHelperRef.current = null
    }
    if (mixerRef.current) {
      mixerRef.current.stopAllAction()
    }
    modelRootRef.current = null
    mixerRef.current = null
    currentActionRef.current = null
    lastSmfDataRef.current = null
    setClips([])
    setCurrentClipName('')
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }

  // Load a model (GLB or SMF) and integrate into scene + animation system
  const loadModel = useCallback(async (res: OpenResult) => {
    const scene = sceneRef.current
    const renderer = rendererRef.current
    if (!scene || !renderer) return

    clearLoadedModel(scene)
    setIsLoading(true)
    setStatus('Loading model...')

    try {
      let loaded: any
      const name = (res.name || res.path || '').toLowerCase()

      if (name.endsWith('.smf')) {
        let data: Uint8Array | undefined = res.data
        if (!data && res.path) {
          // Desktop path-only case: use the new binary read command for full SMF support
          setStatus('Reading binary from desktop path...')
          data = await readBinaryFile(res.path)  // from backend-client
        }
        if (!data) {
          throw new Error('Could not obtain binary data for .smf (browser should provide it via file input; desktop uses read_file_binary)')
        }
        const imported = importSMF(data.buffer)
        lastSmfDataRef.current = imported
        loaded = buildSmfScene(imported)
      } else {
        // GLB / GLTF
        let urlOrBuf: string | ArrayBuffer = ''
        if (res.data) {
          urlOrBuf = res.data.buffer
        } else if (res.path) {
          // In tauri we could read bytes, for demo use object URL if path is local file (limited)
          // Better: the openFile in tauri returns path; for full desktop we would read via invoke.
          // For now assume browser or that user drags in dev.
          urlOrBuf = res.path // GLTFLoader can take blob: or http in some cases; for real files use data path
        }
        loaded = await loadGLB(urlOrBuf || (res as any))
      }

      const root = loaded.root as THREE.Group
      modelRootRef.current = root
      scene.add(root)

      // Skeleton helper for nice rig viz (uses the skeleton if present)
      if (loaded.skeleton) {
        const helper = new THREE.SkeletonHelper(root)
        ;(helper.material as THREE.LineBasicMaterial).linewidth = 2
        scene.add(helper)
        skeletonHelperRef.current = helper
      }

      // Animation
      const mixer = loaded.mixer || new THREE.AnimationMixer(root)
      mixerRef.current = mixer

      const availableClips = loaded.clips || (root as any).animations || []
      setClips(availableClips)

      if (availableClips.length > 0) {
        const first = availableClips[0]
        const action = mixer.clipAction(first)
        action.play()
        currentActionRef.current = action
        setCurrentClipName(first.name || 'clip_0')
        setDuration(first.duration)
        setIsPlaying(true)
      }

      setStatus(`Loaded: ${res.name || 'model'} | bones: ${loaded.skeleton?.bones.length || '?'} | clips: ${availableClips.length} | verts in first mesh: ${loaded.skinnedMeshes?.[0]?.geometry.attributes.position.count || '?'}`)

      // Auto select something useful
      setSelected(loaded.skinnedMeshes?.[0]?.name || 'root')

    } catch (e: any) {
      console.error(e)
      setStatus(`Load error: ${e?.message || e}. Try a .glb or .smf from the reference datafiles.`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Main three init (once)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(800, 600)
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    sceneRef.current = scene
    initBaseScene(scene)

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100)
    cameraRef.current = camera

    const orbit = orbitRef.current
    const updateCamera = () => {
      camera.position.copy(orbit.getPosition())
      camera.lookAt(orbit.target)
      camera.updateMatrixWorld()
    }
    updateCamera()
    orbit.attach(canvas, updateCamera)

    // RAF with mixer update + render
    const animate = () => {
      const mixer = mixerRef.current
      if (mixer) {
        const delta = clockRef.current.getDelta()
        mixer.update(delta)
        // sync scrubber UI
        if (currentActionRef.current) {
          const t = currentActionRef.current.time
          setCurrentTime(t)
        }
      }
      renderer.render(scene, camera)
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)

    // Resize
    const container = canvas.parentElement!
    const onResize = () => {
      const w = container.clientWidth || 800
      const h = container.clientHeight || 600
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(container)
    resizeObsRef.current = ro
    setTimeout(onResize, 50)

    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'r') {
        orbit.yaw = 0.6; orbit.pitch = 0.4; orbit.distance = 4.5
        updateCamera()
      }
      if (e.key.toLowerCase() === ' ') {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', onKey)

    setStatus('Viewport ready. Open a .glb or .smf (reference samples work great).')

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      resizeObsRef.current?.disconnect()
      window.removeEventListener('keydown', onKey)
      renderer.dispose()
    }
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
      setStatus(`Open error: ${e?.message || e}`)
    }
  }

  // Helper that clicks the hidden test-friendly input (web path for e2e)
  const triggerFileInput = () => {
    const input = document.querySelector<HTMLInputElement>('[data-testid="model-file-input"]')
    input?.click()
  }

  // Export: prefer high-fidelity SMF when we have the raw data (for roundtrips on SMF loads),
  // otherwise fall back to GLB (which always works for any loaded model).
  const handleExport = async () => {
    const smfData = lastSmfDataRef.current
    if (smfData) {
      setStatus('Exporting as SMF (fidelity path using imported data + coord transforms)...')
      try {
        const url = exportSMF(smfData)
        const a = document.createElement('a')
        a.href = url
        a.download = 'exported_model.smf'
        a.click()
        // revoke later
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        setStatus('Exported .smf (using our ImportedSmf + DQ handling). Test roundtrip by re-importing!')
        return
      } catch (e: any) {
        setStatus(`SMF export error: ${e?.message || e}. Falling back to GLB...`)
      }
    }

    // GLB fallback / for GLB loads
    const scene = sceneRef.current
    if (!scene) return
    setStatus('Exporting current scene as GLB...')
    try {
      const exporter = new GLTFExporter()
      const result = await exporter.parseAsync(scene, { binary: true, animations: clips })
      const blob = new Blob([result as ArrayBuffer], { type: 'application/octet-stream' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'exported_model.glb'
      a.click()
      setStatus('Exported .glb (animations included when present).')
    } catch (e: any) {
      setStatus(`Export error: ${e?.message || e}`)
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

  // Timeline controls
  const togglePlay = () => {
    const action = currentActionRef.current
    if (!action) return
    if (isPlaying) {
      action.paused = true
      setIsPlaying(false)
    } else {
      action.paused = false
      if (action.time === 0 && duration > 0) action.play()
      setIsPlaying(true)
    }
  }

  const changeClip = (clip: THREE.AnimationClip) => {
    const mixer = mixerRef.current
    const root = modelRootRef.current
    if (!mixer || !root) return

    if (currentActionRef.current) currentActionRef.current.stop()

    const action = mixer.clipAction(clip)
    action.reset().play()
    currentActionRef.current = action
    setCurrentClipName(clip.name || 'clip')
    setDuration(clip.duration)
    setCurrentTime(0)
    setIsPlaying(true)
  }

  const onScrub = (t: number) => {
    const action = currentActionRef.current
    const mixer = mixerRef.current
    if (!action || !mixer) return
    action.time = Math.max(0, Math.min(t, duration || 0))
    // Force an update so skinning reflects immediately
    mixer.update(0)
    setCurrentTime(action.time)
  }

  // Simple speed control (stored on action)
  const setSpeed = (s: number) => {
    const action = currentActionRef.current
    if (action) action.setEffectiveTimeScale(s)
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
              setStatus(`File load error: ${err?.message || err}`);
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

      <div className="main-area">
        <div data-testid="outliner" className="sidebar">
          <div className="panel-title">Outliner</div>
          <div className="text-xs space-y-0.5">
            <div className="cursor-pointer hover:bg-slate-700 px-1 rounded" onClick={() => setSelected('Scene')}>Scene Root</div>
            {clips.length > 0 && <div className="pl-2 text-emerald-400">+ {clips.length} Animation Clips</div>}
            <div className="y-up-note mt-2">Y-up (Three). SMF Z-up + DQ converted via loaders/coord.ts</div>
          </div>
        </div>

        <div data-testid="viewport-container" className="viewport-container">
          <canvas data-testid="three-canvas" ref={canvasRef} style={{ width: '100%', height: '100%' }} />
          <div data-testid="status-text" className={`absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded pointer-events-none ${isLoading ? 'bg-amber-900/70 text-amber-200' : 'bg-black/50 text-slate-300'}`}>
            {status}
            {isLoading && ' …'}
          </div>
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
                    className={`cursor-pointer px-1 rounded ${currentClipName === (c.name || `clip_${idx}`) ? 'bg-slate-600' : 'hover:bg-slate-700'}`}
                    onClick={() => changeClip(c)}
                  >
                    {c.name || `clip_${idx}`} ({c.duration.toFixed(2)}s)
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
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button onClick={() => { const a = currentActionRef.current; if (a) { a.time = 0; setCurrentTime(0) } }} disabled={clips.length === 0}>⏮ Reset</button>
          <input
            type="range"
            className="w-80 accent-emerald-500"
            min={0}
            max={duration || 1}
            step={0.01}
            value={currentTime}
            onChange={(e) => onScrub(parseFloat(e.target.value))}
            disabled={clips.length === 0}
          />
          <span className="tabular-nums w-24 text-right">{currentTime.toFixed(2)} / {(duration || 0).toFixed(2)}s</span>
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
