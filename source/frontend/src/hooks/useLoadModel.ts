import { useCallback, useRef, useEffect, useState } from 'react';
import type * as THREE from 'three';
import type { OpenResult, SmfDesktopInfo, TauriClient } from '../backend-client/tauri';
import { importSMF, buildThreeScene as buildSmfScene, exportSMFToBuffer, loadGLB, loadFBX, loadOBJ, exportGLB, exportFBX, bytesToArrayBuffer, buildImportedSmfFromThree, SmfConversionError } from '../loaders';
import type { ImportedSmf } from '../loaders';
import { useUiSlice, useModelSlice, usePlaybackSlice } from '../store';
import {
  type BoneNudgeDelta,
  type PoseEditMap,
  applyNudgeDelta,
  emptyPoseEdit,
  applyPoseEditsToSmf,
} from './poseEdits';
import { findBoneByName } from '../utils/bonePicker';
import { createSeqGuard } from '../utils/seqGuard';

type LoadedModelResult =
  | Awaited<ReturnType<typeof buildSmfScene>>
  | Awaited<ReturnType<typeof loadGLB>>
  | Awaited<ReturnType<typeof loadFBX>>
  | Awaited<ReturnType<typeof loadOBJ>>;

const getTauriClient = async (): Promise<TauriClient> => {
  const client = await import('../backend-client/tauri');
  return client as unknown as TauriClient;
};

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
  const lastSmfDataRef = useRef<ImportedSmf | null>(null);

  // Track original source format for context-aware export (SMF has fidelity path; FBX gets its own exportFBX entry)
  const lastSourceFormatRef = useRef<string>(''); // 'smf' | 'fbx' | 'glb' | 'obj'

  // Pose edits recorded from nudge buttons and gizmo; applied to SMF at export time
  const poseEditsRef = useRef<PoseEditMap>({});

  // Selected-bone weight preview toggle.
  const [showWeightPreview, setShowWeightPreview] = useState(false);

  // Transform mode for the gizmo; Inspector buttons select translate/rotate/scale.
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');

  // Bone labels toggle (3D name sprites in viewport for debug/selection aid). Off by default for perf.
  const [showBoneLabels, setShowBoneLabels] = useState(false);

  const [sourceFormat, setSourceFormat] = useState('');

  // Editor mode is used by workspace composition and workspace-profile visibility.
  // Stable seq guards prevent stale async results across React re-renders.
  const loadSeqGuardRef = useRef(createSeqGuard());
  const openSeqGuardRef = useRef(createSeqGuard());
  const fileReadSeqGuardRef = useRef(createSeqGuard());

  const clearLoadedModel = useCallback(() => {
    lastSmfDataRef.current = null;
    lastSourceFormatRef.current = '';
    setSourceFormat('');
    poseEditsRef.current = {};
    model.clear();
    ui.setSelected('Scene');
    ui.clearError();
    ui.setEditorMode('view');
    ui.setViewportLayout('single');
    setShowWeightPreview(false);
    setTransformMode('translate');
    setShowBoneLabels(false);
    const pb = playbackRef.current;
    pb.setIsPlaying(false);
    pb.setCurrentTime(0);
    pb.setDuration(0);
    pb.setCurrentClipName('');
    pb.setPlaybackSpeed(1);
  }, [model, ui, playbackRef]);

  const formatSmfDesktopInfo = useCallback((info: SmfDesktopInfo) => {
    if (!info.valid) {
      const reason = info.error ? `: ${info.error}` : '';
      return `Invalid SMF (Rust)${reason}`;
    }

    const parts = [`valid SMF (${info.version})`, `size ${info.size}`];
    if (typeof info.model_count === 'number') parts.push(`model ~${info.model_count}`);
    if (typeof info.rig_bone_count === 'number') parts.push(`rig ~${info.rig_bone_count}`);
    if (typeof info.anim_clip_count === 'number') parts.push(`anim ~${info.anim_clip_count}`);
    parts.push(`offsets t${info.off_tex} m${info.off_model} r${info.off_rig} a${info.off_anim}`);
    return parts.join(' | ');
  }, []);

  const loadModel = useCallback(async (res: OpenResult) => {
    const loadSeqGuard = loadSeqGuardRef.current;
    const loadSeq = loadSeqGuard.next();
    const isCurrentLoad = () => loadSeqGuard.isCurrent(loadSeq);
    clearLoadedModel();
      ui.setIsLoading(true);
    ui.clearError();
    ui.setStatus('Loading model...');

    try {
      let loaded: LoadedModelResult;
      const name = (res.name || res.path || '').toLowerCase();

      let data: Uint8Array | undefined = res.data;

      let rustPeekMsg = '';
      let rustValidated = false;

      // Record source format for export decision and mode surfaces (FBX path etc.).
      const detectedSourceFormat = name.endsWith('.smf')
        ? 'smf'
        : name.endsWith('.fbx')
          ? 'fbx'
          : name.endsWith('.glb') || name.endsWith('.gltf')
            ? 'glb'
            : name.endsWith('.obj')
              ? 'obj'
              : '';
      lastSourceFormatRef.current = detectedSourceFormat;
      setSourceFormat(detectedSourceFormat);

      const fetchSmfDesktopInfo = async (
        path: string,
        tauriClient: TauriClient
      ): Promise<{ rustPeekMsg: string; rustValidated: boolean }> => {
        try {
          const info = await tauriClient.getSmfDesktopInfo(path);
          if (!isCurrentLoad()) return { rustPeekMsg: '', rustValidated: false };
          if (!info.valid) {
            const msg = formatSmfDesktopInfo(info);
            ui.setErrorMsg(msg);
            ui.setStatus(msg);
            ui.setIsLoading(false);
            return { rustPeekMsg: msg, rustValidated: false };
          }
          return { rustPeekMsg: formatSmfDesktopInfo(info), rustValidated: true };
        } catch {
          return { rustPeekMsg: '', rustValidated: false };
        }
      };

      // Single dynamic import for all Tauri client fns when on desktop .smf path.
      // Reduces redundancy (multiple awaits), improves timing (one module load), centralizes.
      let tauri: TauriClient | null = null;
      if (!data && res.path) {
        if (name.endsWith('.smf')) {
          tauri = await getTauriClient();
          const peek = await fetchSmfDesktopInfo(res.path, tauri);
          if (!isCurrentLoad()) return;
          if (!peek.rustValidated && peek.rustPeekMsg) return; // already set error above
          rustValidated = peek.rustValidated;
          rustPeekMsg = peek.rustPeekMsg;
        }
        ui.setStatus('Reading binary from desktop path...');
        if (!tauri) tauri = await getTauriClient();
        data = await tauri.readBinaryFile(res.path);
        if (!isCurrentLoad()) return;
      } else if (name.endsWith('.smf') && res.path) {
        tauri = await getTauriClient();
        const peek = await fetchSmfDesktopInfo(res.path, tauri);
        if (!isCurrentLoad()) return;
        if (!peek.rustValidated && peek.rustPeekMsg) return; // already set error above
        rustValidated = peek.rustValidated;
        rustPeekMsg = peek.rustPeekMsg;
      }

      if (name.endsWith('.smf')) {
        if (!data) {
          throw new Error('Could not obtain binary data for .smf (browser provides via input; desktop uses read_file_binary)');
        }
        const imported = importSMF(bytesToArrayBuffer(data));
        lastSmfDataRef.current = imported;
        loaded = buildSmfScene(imported);
      } else if (name.endsWith('.fbx')) {
        const urlOrBuf: string | ArrayBuffer = data ? bytesToArrayBuffer(data) : (res.path || '');
        loaded = await loadFBX(urlOrBuf);
      } else if (name.endsWith('.obj')) {
        const urlOrBuf: string | ArrayBuffer = data ? bytesToArrayBuffer(data) : (res.path || '');
        loaded = await loadOBJ(urlOrBuf);
      } else {
        const urlOrBuf: string | ArrayBuffer = data ? bytesToArrayBuffer(data) : (res.path || '');
        loaded = await loadGLB(urlOrBuf);
      }

      if (!isCurrentLoad()) return;

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

    } catch (e: any) {
      if (!isCurrentLoad()) return;
      console.error(e);
      const msg = e?.message || String(e);
      ui.setErrorMsg(`Load error: ${msg}`);
      ui.setStatus(`Load error: ${msg}. Try a .glb or .smf from docs/references/old-src/datafiles/SMF/.`);
    } finally {
      if (isCurrentLoad()) ui.setIsLoading(false);
    }
  }, [ui, model, playbackRef, clearLoadedModel, formatSmfDesktopInfo]);

  const handleOpen = useCallback(async () => {
    const openSeqGuard = openSeqGuardRef.current;
    const openSeq = openSeqGuard.next();
    ui.setStatus('Opening file picker (.smf/.glb/.fbx/.obj supported)...');
    try {
      const res: OpenResult | null = await (await getTauriClient()).openFile();
      if (!openSeqGuard.isCurrent(openSeq)) return;
      if (!res) {
        ui.setStatus('No file selected.');
        return;
      }
      await loadModel(res);
    } catch (e: any) {
      if (!openSeqGuard.isCurrent(openSeq)) return;
      const msg = e?.message || String(e);
      ui.setErrorMsg(`Open error: ${msg}`);
      ui.setStatus(`Open error: ${msg}`);
    }
  }, [ui, loadModel]);

  const handleExport = useCallback(async () => {
    const smfData = lastSmfDataRef.current;
    if (smfData) {
      ui.setStatus('Exporting as SMF (fidelity path using imported data + coord transforms + live pose edits)...');
      try {
        const skeleton = model.skeleton;
        const dataToExport = skeleton
          ? applyPoseEditsToSmf(smfData, poseEditsRef.current, skeleton)
          : smfData;
        const buf = exportSMFToBuffer(dataToExport);
        const ok = await (await getTauriClient()).saveFile(buf, 'exported_model.smf');
        if (!ok) { ui.setStatus('Export canceled.'); return; }
        ui.setStatus('Exported .smf (imported data + DQ handling + pose edits applied). Test roundtrip by re-importing!');
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

    const srcFmt = lastSourceFormatRef.current;
    const isFBXSource = srcFmt === 'fbx';

    if (isFBXSource) {
      ui.setStatus('Exporting FBX-loaded model (via GLTF container for full skin/anim fidelity; no new deps)...');
      try {
        const buf = await exportFBX(rootToExport, model.clips);
        const ok = await (await getTauriClient()).saveFile(buf, 'exported_model.glb');
        if (!ok) { ui.setStatus('Export canceled.'); return; }
        ui.setStatus('Exported .glb (from FBX source via GLTF equivalent). Re-import as .glb works; for true .fbx use DCC or save-as-SMF first.');
        return;
      } catch (e: any) {
        ui.setStatus(`FBX export error: ${e?.message || e}. Falling back to generic GLB...`);
      }
    }

    ui.setStatus('Exporting current model as GLB...');
    try {
      const buf = await exportGLB(rootToExport, model.clips);
      const ok = await (await getTauriClient()).saveFile(buf, 'exported_model.glb');
      if (!ok) { ui.setStatus('Export canceled.'); return; }
      ui.setStatus('Exported .glb (animations included when present).');
    } catch (e: any) {
      const msg = e?.message || String(e);
      ui.setErrorMsg(`Export error: ${msg}`);
      ui.setStatus(`Export error: ${msg}`);
    }
  }, [ui, model]);

  // Dedicated "Export as SMF" handler. SMF sources use the imported-data fidelity path;
  // non-SMF skinned sources use the guarded Three-to-SMF converter.
  const handleExportSmf = useCallback(async () => {
    const rootToExport = model.root;
    const skeleton = model.skeleton;

    const smfData = lastSmfDataRef.current;
    if (smfData) {
      ui.setStatus('Exporting as SMF (fidelity path using imported data + coord transforms + live pose edits)...');
      try {
        const dataToExport = skeleton
          ? applyPoseEditsToSmf(smfData, poseEditsRef.current, skeleton)
          : smfData;
        const buf = exportSMFToBuffer(dataToExport);
        const ok = await (await getTauriClient()).saveFile(buf, 'exported_model.smf');
        if (!ok) {
          ui.setStatus('Export canceled.');
          return;
        }
        ui.setStatus('Exported .smf (imported data + DQ handling + pose edits applied). Test roundtrip by re-importing!');
        return;
      } catch (e: any) {
        ui.setStatus(`SMF export error: ${e?.message || e}. Falling back to guarded converter...`);
      }
    }

    if (!rootToExport || !skeleton) {
      ui.setStatus('No skinned model loaded for SMF export. Load a GLB/FBX with skeleton or use GLB export.');
      return;
    }

    ui.setStatus('Exporting as SMF via guarded converter (Three skinned -> ImportedSmf)...');

    try {
      // Collect any SkinnedMeshes under the loaded root (converter uses first for mesh data).
      const skinnedMeshes: THREE.SkinnedMesh[] = [];
      rootToExport.traverse((o: any) => {
        if (o.isSkinnedMesh) skinnedMeshes.push(o as THREE.SkinnedMesh);
      });

      const imported = buildImportedSmfFromThree({
        skeleton,
        skinnedMeshes: skinnedMeshes.length ? skinnedMeshes : undefined,
        clips: model.clips,
      });

      const buf = exportSMFToBuffer(imported);
      const ok = await (await getTauriClient()).saveFile(buf, 'exported_model.smf');
      if (!ok) {
        ui.setStatus('Export canceled.');
        return;
      }
      ui.setStatus('Exported .smf (from GLB/FBX via guarded threeToSmf converter + live pose). Re-import to verify fidelity!');
    } catch (e: any) {
      if (e instanceof SmfConversionError) {
        ui.setStatus(`Cannot export as SMF: ${e.message}. Falling back to GLB for full fidelity.`);
      } else {
        const msg = e?.message || String(e);
        ui.setErrorMsg(`SMF export error: ${msg}`);
        ui.setStatus(`SMF export error: ${msg}`);
      }
    }
  }, [ui, model]);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileReadSeqGuard = fileReadSeqGuardRef.current;
    const readSeq = fileReadSeqGuard.next();
    ui.setStatus('Loading selected file...');
    try {
      const buf = await file.arrayBuffer();
      if (!fileReadSeqGuard.isCurrent(readSeq)) return;
      await loadModel({ name: file.name, data: new Uint8Array(buf) });
    } catch (err: any) {
      if (!fileReadSeqGuard.isCurrent(readSeq)) return;
      const m = err?.message || String(err);
      ui.setErrorMsg(`File load error: ${m}`);
      ui.setStatus(`File load error: ${m}`);
    } finally {
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

  const toggleWeightPreview = useCallback(() => {
    setShowWeightPreview(v => !v);
  }, []);

  const setTransformModeHandler = useCallback((mode: 'translate' | 'rotate' | 'scale') => {
    setTransformMode(mode);
  }, []);

  const toggleBoneLabels = useCallback(() => {
    setShowBoneLabels(v => !v);
  }, []);

  const changeClip = useCallback((clip: THREE.AnimationClip) => {
    playback.selectClip(clip.name || 'clip', clip.duration);
  }, [playback]);

  const onScrub = useCallback((t: number) => {
    playbackRef.current.scrub(Math.max(0, Math.min(t, playbackRef.current.duration || 0)));
  }, [playbackRef]);

  const setSpeed = useCallback((s: number) => {
    playback.setPlaybackSpeed(s);
  }, [playback]);

  const pingRust = useCallback(async () => {
    try {
      const msg = await (await getTauriClient()).invokeCommand<string>('greet', { name: 'RustSMF' });
      ui.setStatus(msg + ' (real tauri invoke)');
    } catch (e: any) {
      ui.setStatus('Ping only works in Tauri desktop shell: ' + (e?.message || e));
    }
  }, [ui]);

  // Extracted for modularity: drop handler (mirrors handleFileInputChange but for DataTransfer)
  const handleDrop = useCallback(async (file: File) => {
    const fileReadSeqGuard = fileReadSeqGuardRef.current;
    const readSeq = fileReadSeqGuard.next();
    ui.setStatus('Loading dropped file...');
    try {
      const buf = await file.arrayBuffer();
      if (!fileReadSeqGuard.isCurrent(readSeq)) return;
      await loadModel({ name: file.name, data: new Uint8Array(buf) });
    } catch (err: any) {
      if (!fileReadSeqGuard.isCurrent(readSeq)) return;
      const m = err?.message || String(err);
      ui.setErrorMsg(`Drop load error: ${m}`);
      ui.setStatus(`Drop load error: ${m}`);
    }
  }, [ui, loadModel]);

  // Extracted for modularity: bone selection updates UI state + status (used by Inspector + Viewport raycast)
  const handleSelectBone = useCallback((name: string) => {
    ui.setSelected(name);
    ui.setStatus(`Selected: ${name}`);
  }, [ui]);

  // Route bone nudge buttons through pose-edit layer so edits are captured at export time.
  // Applies the delta to the Three.js bone for immediate visual feedback, and records the
  // cumulative edit in poseEditsRef for use by handleExport.
  const onNudgeBone = useCallback((boneName: string, delta: BoneNudgeDelta) => {
    const skeleton = model.skeleton;
    if (!skeleton) return;
    const bone = findBoneByName(skeleton, boneName);
    if (!bone) return;

    const prev = poseEditsRef.current[boneName] ?? emptyPoseEdit();
    const next = applyNudgeDelta(prev, delta);
    poseEditsRef.current = { ...poseEditsRef.current, [boneName]: next };

    if (delta.reset) {
      bone.position.set(0, 0, 0);
      bone.rotation.set(0, 0, 0);
    } else {
      if (delta.x !== undefined) bone.position.x += delta.x;
      if (delta.y !== undefined) bone.position.y += delta.y;
      if (delta.rotZ !== undefined) bone.rotation.z += delta.rotZ;
    }
    bone.updateMatrix();
    skeleton.update();
  }, [model]);

  return {
    ui,
    model,
    playback,
    lastSmfDataRef,
    loadModel,
    clearLoadedModel,
    handleOpen,
    handleExport,
    handleExportSmf,
    handleFileInputChange,
    handleDrop,
    handleSelectBone,
    onNudgeBone,
    setupKeyboard,
    togglePlay,
    changeClip,
    onScrub,
    setSpeed,
    pingRust,
    showWeightPreview,
    toggleWeightPreview,
    transformMode,
    setTransformMode: setTransformModeHandler,
    showBoneLabels,
    toggleBoneLabels,
    sourceFormat,
    viewportLayout: ui.viewportLayout,
    setViewportLayout: ui.setViewportLayout,
    editorMode: ui.editorMode,
    setEditorMode: ui.setEditorMode,
  };
}
