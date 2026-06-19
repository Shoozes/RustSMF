import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import type * as THREE from 'three';
import type { OpenResult, SmfDesktopInfo, TauriClient } from '../backend-client/tauri';
import { importSMF, buildThreeScene as buildSmfScene, exportSMFToBuffer, loadGLB, loadFBX, loadOBJ, exportGLB, exportFBX, bytesToArrayBuffer, buildImportedSmfFromThree, SmfConversionError, collectSkinnedMeshes, compareSmfRoundtrip, inspectThreeToSmfSource, makeDiagnosticReport } from '../loaders';
import type { ImportedSmf, SmfDiagnosticReport, SmfRoundtripReport } from '../loaders';
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
import { detectModelFormat, supportedModelFormatsLabel, type ModelSourceFormat } from '../utils/modelFormat';

type LoadedModelResult =
  | Awaited<ReturnType<typeof buildSmfScene>>
  | Awaited<ReturnType<typeof loadGLB>>
  | Awaited<ReturnType<typeof loadFBX>>
  | Awaited<ReturnType<typeof loadOBJ>>;

let cachedTauriClient: TauriClient | null = null;
const getTauriClient = async (): Promise<TauriClient> => {
  if (cachedTauriClient) return cachedTauriClient;
  const clientMod = await import('../backend-client/tauri');
  const client = clientMod as unknown as TauriClient;
  cachedTauriClient = client;
  return client;
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
  const lastSourceFormatRef = useRef<ModelSourceFormat | ''>('');

  // Pose edits recorded from nudge buttons and gizmo; applied to SMF at export time
  const poseEditsRef = useRef<PoseEditMap>({});

  // Selected-bone weight preview toggle.
  const [showWeightPreview, setShowWeightPreview] = useState(false);

  // Transform mode for the gizmo; Inspector buttons select translate/rotate/scale.
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');

  // Bone labels toggle (3D name sprites in viewport for debug/selection aid). Off by default for perf.
  const [showBoneLabels, setShowBoneLabels] = useState(false);

  const [sourceFormat, setSourceFormat] = useState('');
  const [smfRoundtripReport, setSmfRoundtripReport] = useState<SmfRoundtripReport | null>(null);

  // Editor mode is used by workspace composition and workspace-profile visibility.
  // Stable seq guards prevent stale async results across React re-renders.
  const loadSeqGuardRef = useRef(createSeqGuard());
  const openSeqGuardRef = useRef(createSeqGuard());
  const fileReadSeqGuardRef = useRef(createSeqGuard());
  const exportSeqGuardRef = useRef(createSeqGuard());
  const isExportingRef = useRef(false);

  const smfDiagnosticReport = useMemo<SmfDiagnosticReport>(() => {
    if (!model.root) {
      return makeDiagnosticReport([
        {
          level: 'info',
          code: 'SMF_NO_MODEL_LOADED',
          message: 'Load a model to inspect SMF export compatibility.',
        },
      ]);
    }

    if (lastSmfDataRef.current || sourceFormat === 'smf') {
      return makeDiagnosticReport([
        {
          level: 'info',
          code: 'SMF_SOURCE_FIDELITY_PATH',
          message: 'Loaded SMF sources use the imported-data fidelity export path.',
        },
      ]);
    }

    const report = inspectThreeToSmfSource({
      skeleton: model.skeleton ?? null,
      skinnedMeshes: collectSkinnedMeshes(model.root),
      clips: model.clips,
    });

    if (report.diagnostics.length > 0) {
      return report;
    }

    return makeDiagnosticReport([
      {
        level: 'info',
        code: 'SMF_READY',
        message: 'No blocking SMF compatibility issues detected for the current skinned model.',
      },
    ]);
  }, [model.root, model.skeleton, model.clips, sourceFormat]);

  const withExportBusy = useCallback(async (actionLabel: string, action: () => Promise<void>) => {
    if (isExportingRef.current) {
      ui.setStatus(`${actionLabel} already in progress. Wait for the current save to finish.`);
      return;
    }

    const exportSeq = exportSeqGuardRef.current.next();
    const isCurrentExport = () => exportSeqGuardRef.current.isCurrent(exportSeq);

    isExportingRef.current = true;
    ui.setIsLoading(true);

    try {
      await action();
    } catch (e: any) {
      if (!isCurrentExport()) return;
      ui.setErrorMsg(`${actionLabel} error: ${e?.message || e}`);
      ui.setStatus(`${actionLabel} error: ${e?.message || e}`);
    } finally {
      if (!isCurrentExport()) return;
      isExportingRef.current = false;
      ui.setIsLoading(false);
    }
  }, [ui]);

  const clearLoadedModel = useCallback(() => {
    lastSmfDataRef.current = null;
    lastSourceFormatRef.current = '';
    setSourceFormat('');
    poseEditsRef.current = {};
    setSmfRoundtripReport(null);
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
      const name = res.name || res.path || '';

      let data: Uint8Array | undefined = res.data;

      let rustPeekMsg = '';
      let rustValidated = false;

      // Record source format for export decision and mode surfaces (FBX path etc.).
      const detectedSourceFormat = detectModelFormat(name);
      if (!detectedSourceFormat) {
        throw new Error(`Unsupported model format. Supported formats: ${supportedModelFormatsLabel()}`);
      }
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
      if (res.path) {
        tauri = await getTauriClient();
        if (detectedSourceFormat === 'smf') {
          const peek = await fetchSmfDesktopInfo(res.path, tauri);
          if (!isCurrentLoad()) return;
          if (!peek.rustValidated && peek.rustPeekMsg) return; // already set error above
          rustValidated = peek.rustValidated;
          rustPeekMsg = peek.rustPeekMsg;
        }
      }

      if (!data && res.path) {
        ui.setStatus('Reading binary from desktop path...');
        data = await tauri!.readBinaryFile(res.path);
        if (!isCurrentLoad()) return;
      }

      if (detectedSourceFormat === 'smf') {
        if (!data) {
          throw new Error('Could not obtain binary data for .smf (browser provides via input; desktop uses read_file_binary)');
        }
        const imported = importSMF(bytesToArrayBuffer(data));
        lastSmfDataRef.current = imported;
        loaded = buildSmfScene(imported);
      } else if (detectedSourceFormat === 'fbx') {
        const urlOrBuf: string | ArrayBuffer = data ? bytesToArrayBuffer(data) : (res.path || '');
        loaded = await loadFBX(urlOrBuf);
      } else if (detectedSourceFormat === 'obj') {
        const urlOrBuf: string | ArrayBuffer = data ? bytesToArrayBuffer(data) : (res.path || '');
        loaded = await loadOBJ(urlOrBuf);
      } else {
        const urlOrBuf: string | ArrayBuffer = data ? bytesToArrayBuffer(data) : (res.path || '');
        loaded = await loadGLB(urlOrBuf);
      }

      if (!isCurrentLoad()) return;

      const root = loaded.root;
      const availableClips = loaded.clips || [];

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

      if (detectedSourceFormat === 'fbx') {
        ui.setStatus(`Loaded FBX: ${res.name || 'model'} | bones: ${loaded.skeleton?.bones?.length || '?'} | clips: ${availableClips.length || 0}`);
      } else {
        let status = `Loaded: ${res.name || 'model'} | bones: ${loaded.skeleton?.bones?.length || '?'} | clips: ${availableClips.length} | verts: ${loaded.skinnedMeshes?.[0]?.geometry?.attributes?.position?.count || '?'}`;
        if (rustPeekMsg) {
          status = `${rustPeekMsg} | ${status}`;
        }
        if (rustValidated && detectedSourceFormat === 'smf') {
          status = `Rust validated SMF | ${status}`;
        }
        ui.setStatus(status);
      }

      ui.setSelected(loaded.skinnedMeshes?.[0]?.name || 'root');

    } catch (e: any) {
      if (!isCurrentLoad()) return;
      const msg = e?.message || String(e);
      if (!msg.startsWith('Unsupported model format.')) {
        console.error(e);
      }
      ui.setErrorMsg(`Load error: ${msg}`);
      ui.setStatus(`Load error: ${msg}. Try ${supportedModelFormatsLabel()} from docs/references/old-src/datafiles/SMF/.`);
    } finally {
      if (isCurrentLoad()) ui.setIsLoading(false);
    }
  }, [ui, model, playbackRef, clearLoadedModel, formatSmfDesktopInfo]);

  const handleOpen = useCallback(async () => {
    if (ui.isLoading) return;
    const openSeqGuard = openSeqGuardRef.current;
    const openSeq = openSeqGuard.next();
    ui.setStatus(`Opening file picker (${supportedModelFormatsLabel()} supported)...`);
    ui.setIsLoading(true);
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
    } finally {
      if (openSeqGuard.isCurrent(openSeq)) {
        ui.setIsLoading(false);
      }
    }
  }, [ui, loadModel]);

  const handleExport = useCallback(async () => {
    const smfData = lastSmfDataRef.current;
    await withExportBusy('Export', async () => {
      try {
        if (smfData) {
          ui.setStatus('Exporting as SMF (fidelity path using imported data + coord transforms + live pose edits)...');
          const skeleton = model.skeleton;
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
            if (!ok) {
              ui.setStatus('Export canceled.');
              return;
            }
            ui.setStatus('Exported .glb (from FBX source via GLTF equivalent). Re-import as .glb works; for true .fbx use DCC or save-as-SMF first.');
            return;
          } catch (e: any) {
            ui.setStatus(`FBX export error: ${e?.message || e}. Falling back to generic GLB...`);
          }
        }

        ui.setStatus('Exporting current model as GLB...');
        const buf = await exportGLB(rootToExport, model.clips);
        const ok = await (await getTauriClient()).saveFile(buf, 'exported_model.glb');
        if (!ok) {
          ui.setStatus('Export canceled.');
          return;
        }
        ui.setStatus('Exported .glb (animations included when present).');
      } catch (e: any) {
        const msg = e?.message || String(e);
        ui.setErrorMsg(`Export error: ${msg}`);
        ui.setStatus(`Export error: ${msg}`);
      }
    });
  }, [ui, model, withExportBusy]);

  const buildCurrentSmfExportCandidate = useCallback((): ImportedSmf | null => {
    const smfData = lastSmfDataRef.current;
    const skeleton = model.skeleton;

    if (smfData) {
      return skeleton
        ? applyPoseEditsToSmf(smfData, poseEditsRef.current, skeleton)
        : smfData;
    }

    const rootToExport = model.root;
    if (!rootToExport) {
      return null;
    }

    const skinnedMeshes = collectSkinnedMeshes(rootToExport);
    const diagnostics = inspectThreeToSmfSource({
      skeleton: skeleton ?? null,
      skinnedMeshes,
      clips: model.clips,
    });
    const blockingDiagnostic = diagnostics.diagnostics.find((item) => item.level === 'error');
    if (blockingDiagnostic) {
      const detail = blockingDiagnostic.target ? ` (${blockingDiagnostic.target})` : '';
      throw new SmfConversionError(`${blockingDiagnostic.code}: ${blockingDiagnostic.message}${detail}`);
    }

    return buildImportedSmfFromThree({
      skeleton,
      skinnedMeshes,
      clips: model.clips,
    });
  }, [model.clips, model.root, model.skeleton]);

  const handleRunSmfRoundtripCheck = useCallback(async () => {
    await withExportBusy('SMF roundtrip check', async () => {
      try {
        setSmfRoundtripReport(null);
        ui.clearError();
        ui.setStatus('Running SMF roundtrip check...');

        const candidate = buildCurrentSmfExportCandidate();
        if (!candidate) {
          ui.setStatus('No model loaded for SMF roundtrip check.');
          return;
        }

        const buf = exportSMFToBuffer(candidate);
        const reimported = importSMF(bytesToArrayBuffer(buf));
        const report = compareSmfRoundtrip(candidate, reimported);
        setSmfRoundtripReport(report);

        if (report.ok) {
          ui.setStatus('SMF roundtrip check passed: export summary matches reimport.');
        } else {
          ui.setErrorMsg(`SMF roundtrip mismatch: ${report.messages.join('; ')}`);
          ui.setStatus(`SMF roundtrip mismatch: ${report.messages.join('; ')}`);
        }
      } catch (e: any) {
        if (e instanceof SmfConversionError) {
          ui.setErrorMsg(`SMF roundtrip blocked: ${e.message}`);
          ui.setStatus(`SMF roundtrip blocked: ${e.message}`);
          return;
        }
        const msg = e?.message || String(e);
        ui.setErrorMsg(`SMF roundtrip check error: ${msg}`);
        ui.setStatus(`SMF roundtrip check error: ${msg}`);
      }
    });
  }, [buildCurrentSmfExportCandidate, ui, withExportBusy]);

  const handleSaveSmfDiagnosticReport = useCallback(async () => {
    await withExportBusy('Save SMF diagnostic report', async () => {
      try {
        const payload = {
          sourceFormat: sourceFormat || 'unknown',
          hasModel: !!model.root,
          hasSkeleton: !!model.skeleton && model.skeleton.bones.length > 0,
          diagnostics: smfDiagnosticReport,
          roundtrip: smfRoundtripReport,
        };
        const json = JSON.stringify(payload, null, 2);
        const data = new TextEncoder().encode(json);
        const ok = await (await getTauriClient()).saveFile(data, 'rustsmf-smf-report.json');
        if (!ok) {
          ui.setStatus('SMF diagnostic report save canceled.');
          return;
        }
        ui.setStatus('Saved SMF diagnostic report.');
      } catch (e: any) {
        const msg = e?.message || String(e);
        ui.setErrorMsg(`Save SMF diagnostic report error: ${msg}`);
        ui.setStatus(`Save SMF diagnostic report error: ${msg}`);
      }
    });
  }, [model.root, model.skeleton, smfDiagnosticReport, smfRoundtripReport, sourceFormat, ui, withExportBusy]);

  // Dedicated "Export as SMF" handler. SMF sources use the imported-data fidelity path;
  // non-SMF skinned sources use the guarded Three-to-SMF converter.
  const handleExportSmf = useCallback(async () => {
    await withExportBusy('Export as SMF', async () => {
      try {
        const rootToExport = model.root;
        const skeleton = model.skeleton;
        const smfData = lastSmfDataRef.current;

        if (smfData) {
          ui.setStatus('Exporting as SMF (fidelity path using imported data + coord transforms + live pose edits)...');
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
        }

        if (!rootToExport) {
          ui.setStatus('No model loaded for SMF export. Load a skinned GLB/FBX with skeleton or use GLB export.');
          return;
        }

        ui.setStatus('Exporting as SMF via guarded converter (Three skinned -> ImportedSmf)...');

        const imported = buildCurrentSmfExportCandidate();
        if (!imported) {
          ui.setStatus('No model loaded for SMF export. Load a skinned GLB/FBX with skeleton or use GLB export.');
          return;
        }

        const buf = exportSMFToBuffer(imported);
        const ok = await (await getTauriClient()).saveFile(buf, 'exported_model.smf');
        if (!ok) {
          ui.setStatus('Export canceled.');
          return;
        }
        ui.setStatus('Exported .smf (from GLB/FBX via guarded threeToSmf converter + live pose). Re-import to verify fidelity!');
      } catch (e: any) {
        if (e instanceof SmfConversionError) {
          ui.setErrorMsg(`SMF export blocked: ${e.message}`);
          ui.setStatus(`SMF export blocked: ${e.message}`);
          return;
        }
        const msg = e?.message || String(e);
        ui.setErrorMsg(`SMF export error: ${msg}`);
        ui.setStatus(`SMF export error: ${msg}`);
      }
    });
  }, [ui, model.root, withExportBusy, buildCurrentSmfExportCandidate]);
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
    handleRunSmfRoundtripCheck,
    handleSaveSmfDiagnosticReport,
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
    smfDiagnosticReport,
    smfRoundtripReport,
    sourceFormat,
    viewportLayout: ui.viewportLayout,
    setViewportLayout: ui.setViewportLayout,
    editorMode: ui.editorMode,
    setEditorMode: ui.setEditorMode,
  };
}
