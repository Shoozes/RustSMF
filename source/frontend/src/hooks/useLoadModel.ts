import { useCallback, useRef, useEffect } from 'react';
import { OpenResult } from '../backend-client/tauri';
import { readBinaryFile } from '../backend-client/tauri';
import { importSMF, buildThreeScene as buildSmfScene, exportSMFToBuffer } from '../loaders/smf';
import { loadGLB } from '../loaders/glb';
import { loadFBX } from '../loaders/fbx';
import { useUiSlice, useModelSlice, usePlaybackSlice } from '../store';

/**
 * Custom hook to encapsulate model loading logic, error handling, and related handlers.
 * Uses the store slices internally for state.
 * This further thins App.tsx (orchestrator only).
 * Preserves all previous behavior.
 */
export function useLoadModel() {
  const ui = useUiSlice();
  const model = useModelSlice();
  const playback = usePlaybackSlice();
  const playbackRef = useRef(playback);
  useEffect(() => { playbackRef.current = playback }, [playback]);

  // Keep raw ImportedSmf for high-fidelity SMF export roundtrips
  const lastSmfDataRef = useRef<any>(null);

  const clearLoadedModel = useCallback(() => {
    lastSmfDataRef.current = null;
    model.clear();
    ui.setSelected('Scene');
    ui.clearError();
    const pb = playbackRef.current;
    pb.setIsPlaying(false);
    pb.setCurrentTime(0);
    pb.setDuration(0);
    pb.setCurrentClipName('');
    pb.setPlaybackSpeed(1);
  }, [model, ui, playbackRef]);

  const loadModel = useCallback(async (res: OpenResult) => {
    clearLoadedModel();
    ui.setIsLoading(true);
    ui.clearError();
    ui.setStatus('Loading model...');

    try {
      let loaded: any;
      const name = (res.name || res.path || '').toLowerCase();

      let data: Uint8Array | undefined = res.data;
      if (!data && res.path) {
        ui.setStatus('Reading binary from desktop path...');
        data = await readBinaryFile(res.path);
      }

      let rustPeekMsg = '';
      // Optional Rust peek for .smf desktop (real header peek command, advances rust-smf-parser)
      if (name.endsWith('.smf') && res.path) {
        try {
          rustPeekMsg = await (await import('../backend-client/tauri')).peekSmfHeader(res.path);
        } catch {}
      }

      // Rust subtask: early validation for desktop .smf using validate_smf (real, wires new command for bad/corrupt edge case)
      let rustValidated = false;
      if (name.endsWith('.smf') && res.path) {
        try {
          const val = await (await import('../backend-client/tauri')).validateSmf(res.path);
          if (val.includes('invalid')) {
            ui.setErrorMsg(`Invalid SMF (Rust validate): ${val}`);
            ui.setStatus(val);
            ui.setIsLoading(false);
            return;
          }
          rustValidated = true;
        } catch {}
      }

      if (name.endsWith('.smf')) {
        if (!data) {
          throw new Error('Could not obtain binary data for .smf (browser provides via input; desktop uses read_file_binary)');
        }
        const imported = importSMF(data.buffer);
        lastSmfDataRef.current = imported;
        loaded = buildSmfScene(imported);
      } else if (name.endsWith('.fbx')) {
        const urlOrBuf: string | ArrayBuffer = data ? data.buffer : (res.path || '');
        loaded = await loadFBX(urlOrBuf);
      } else {
        const urlOrBuf: string | ArrayBuffer = data ? data.buffer : (res.path || '');
        loaded = await loadGLB(urlOrBuf);
      }

      const root = loaded.root as THREE.Group;
      const availableClips = loaded.clips || (root as any).animations || [];

      model.setRoot(root);
      model.setSkeleton(loaded.skeleton);
      model.setClips(availableClips);

      if (availableClips.length > 0) {
        const first = availableClips[0];
        const pb = playbackRef.current;
        pb.setCurrentClipName(first.name || 'clip_0');
        pb.setDuration(first.duration);
        pb.setIsPlaying(true);
        pb.setCurrentTime(0);
      }

      if (name.endsWith('.fbx')) {
        ui.setStatus(`Loaded FBX: ${res.name || 'model'} | bones: ${loaded.skeleton?.bones?.length || '?'} | clips: ${availableClips.length || 0}`);
      } else {
        let status = `Loaded: ${res.name || 'model'} | bones: ${loaded.skeleton?.bones?.length || '?'} | clips: ${availableClips.length} | verts: ${loaded.skinnedMeshes?.[0]?.geometry?.attributes?.position?.count || '?'}`;
        if (rustPeekMsg) {
          status = `${rustPeekMsg} | ${status}`;
        }
        if (rustValidated && name.endsWith('.smf')) {
          status = `Rust validated SMF | ${status}`;
        }
        ui.setStatus(status);
      }

      ui.setSelected(loaded.skinnedMeshes?.[0]?.name || 'root');

      if (rustPeekMsg) {
        // Polish: surface Rust peek with final loaded info for desktop .smf
        const currentStatus = ui.status; // but since state, better append in final set below; for simplicity include in loaded status
      }

    } catch (e: any) {
      console.error(e);
      const msg = e?.message || String(e);
      ui.setErrorMsg(`Load error: ${msg}`);
      ui.setStatus(`Load error: ${msg}. Try a .glb or .smf from docs/references/old-src/datafiles/SMF/.`);
    } finally {
      ui.setIsLoading(false);
    }
  }, [ui, model, playbackRef, clearLoadedModel]);

  const handleOpen = useCallback(async () => {
    ui.setStatus('Opening file picker (GLB/SMF supported)...');
    try {
      const res: OpenResult | null = await (await import('../backend-client/tauri')).openFile();
      if (!res) {
        ui.setStatus('No file selected.');
        return;
      }
      await loadModel(res);
    } catch (e: any) {
      const msg = e?.message || String(e);
      ui.setErrorMsg(`Open error: ${msg}`);
      ui.setStatus(`Open error: ${msg}`);
    }
  }, [ui, loadModel]);

  const handleExport = useCallback(async () => {
    const smfData = lastSmfDataRef.current;
    if (smfData) {
      ui.setStatus('Exporting as SMF (fidelity path using imported data + coord transforms)...');
      try {
        const buf = exportSMFToBuffer(smfData);
        await (await import('../backend-client/tauri')).saveFile(buf, 'exported_model.smf');
        ui.setStatus('Exported .smf (using our ImportedSmf + DQ handling). Test roundtrip by re-importing!');
        return;
      } catch (e: any) {
        ui.setStatus(`SMF export error: ${e?.message || e}. Falling back to GLB...`);
      }
    }

    const rootToExport = model.root;
    if (!rootToExport) {
      ui.setStatus('Nothing to export.');
      return;
    }
    ui.setStatus('Exporting current model as GLB...');
    try {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const exporter = new GLTFExporter();
      const result = await exporter.parseAsync(rootToExport, { binary: true, animations: model.clips });
      const buf = new Uint8Array(result as ArrayBuffer);
      await (await import('../backend-client/tauri')).saveFile(buf, 'exported_model.glb');
      ui.setStatus('Exported .glb (animations included when present).');
    } catch (e: any) {
      const msg = e?.message || String(e);
      ui.setErrorMsg(`Export error: ${msg}`);
      ui.setStatus(`Export error: ${msg}`);
    }
  }, [ui, model]);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    ui.setIsLoading(true);
    ui.setStatus('Loading selected file...');
    try {
      const buf = await file.arrayBuffer();
      await loadModel({ name: file.name, data: new Uint8Array(buf) });
    } catch (err: any) {
      const m = err?.message || String(err);
      ui.setErrorMsg(`File load error: ${m}`);
      ui.setStatus(`File load error: ${m}`);
    } finally {
      ui.setIsLoading(false);
      (e.target as HTMLInputElement).value = '';
    }
  }, [ui, loadModel]);

  // Keyboard handler (can be used in useEffect in App or moved)
  const setupKeyboard = useCallback(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === ' ') {
        e.preventDefault();
        playbackRef.current.setIsPlaying(p => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playbackRef]);

  const togglePlay = useCallback(() => {
    playbackRef.current.toggle();
  }, [playbackRef]);

  const changeClip = useCallback((clip: THREE.AnimationClip) => {
    playback.selectClip(clip.name || 'clip', clip.duration);
  }, [playback]);

  const onScrub = useCallback((t: number) => {
    playback.scrub(Math.max(0, Math.min(t, playback.duration || 0)));
  }, [playback]);

  const setSpeed = useCallback((s: number) => {
    playback.setPlaybackSpeed(s);
  }, [playback]);

  const pingRust = useCallback(async () => {
    try {
      const msg = await (await import('../backend-client/tauri')).invokeCommand<string>('greet', { name: 'RustSMF' });
      ui.setStatus(msg + ' (real tauri invoke)');
    } catch (e: any) {
      ui.setStatus('Ping only works in Tauri desktop shell: ' + (e?.message || e));
    }
  }, [ui]);

  return {
    ui,
    model,
    playback,
    lastSmfDataRef,
    loadModel,
    clearLoadedModel,
    handleOpen,
    handleExport,
    handleFileInputChange,
    setupKeyboard,
    togglePlay,
    changeClip,
    onScrub,
    setSpeed,
    pingRust,
  };
}
