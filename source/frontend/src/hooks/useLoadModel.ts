import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import type * as THREE from 'three';
import type { OpenResult, TauriClient } from '../backend-client/tauri';
import { createLazyClientLoader } from '../backend-client/lazyClient';
import { buildThreeScene as buildSmfScene, loadGLB, loadFBX, loadDAE, loadOBJ, exportGLB, validateExportedGLB, exportFBX, validateExportedFBX, exportDAE, validateExportedDAE, bytesToArrayBuffer, SmfConversionError, collectSkinnedMeshes, compareSmfRoundtrip, inspectThreeToSmfSource, makeDiagnosticReport } from '../loaders';
import type { ImportedSmf, SmfDiagnosticReport, SmfRoundtripReport } from '../loaders';
import { useUiSlice, useModelSlice, usePlaybackSlice } from '../store';
import {
  SmfCodecCancelledError,
  type SmfCodecExecution,
} from '../workers/smfCodecClient';
import {
  type BoneNudgeDelta,
  type PoseEditMap,
  hasPoseEdits,
  applyNudgeDelta,
  emptyPoseEdit,
  markPoseBoneEdited,
  clonePoseEditMap,
} from './poseEdits';
import {
  buildSmfExportCandidate,
  UNSUPPORTED_SMF_SCALE_EDIT_MESSAGE,
} from './smfExportCandidate';
import {
  captureRigSkinIndexSnapshots,
  cloneAnimationClips,
  cloneAnimationWorkspaceSnapshot,
  restoreRigSkinIndexSnapshots,
  sameAnimationWorkspaceSnapshot,
  samePoseBoneSnapshot,
  samePoseSnapshot,
  sameRigBoneTransformSnapshot,
  setRigSnapshotSelection,
  type AnimationWorkspaceHistorySnapshot,
  type EditorHistorySnapshot,
  type PoseBoneSnapshot,
  type PoseHistorySnapshot,
  type RigHistorySnapshot,
  type StaticMeshSkinPreparationHistorySnapshot,
} from './editorSnapshots';
import { useSmfCodecTask } from './useSmfCodecTask';
import type {
  BoneTransformEditEvent,
  RigIkEditEvent,
  RigMoveEditEvent,
  RigRotateEditEvent,
} from '../types/viewportEditorEvents';
import { findBoneByName } from '../utils/bonePicker';
import { createSeqGuard } from '../utils/seqGuard';
import { disposeThreeObject } from '../utils/threeDisposal';
import { isThreeBone } from '../utils/threeTypeGuards';
import {
  assertModelInputSize,
  detectModelFormat,
  supportedModelFormatsLabel,
  type ModelSourceFormat,
} from '../utils/modelFormat';
import {
  createModelResourceBundle,
  modelResourceBundleSummary,
  type ModelResourceBundle,
} from '../utils/modelResourceBundle';
import {
  createProjectDocument,
  decodeProjectDocument,
  encodeProjectDocument,
  projectAssetBytes,
  PROJECT_EXTENSION,
} from '../utils/projectCodec';
import {
  cloneRigMetadata,
  createRigMetadata,
  lockedRigBoneNames,
  normalizeRigMetadata,
  parseRigMetadata,
  readRigMetadata,
  serializeRigMetadata,
  updateRigBoneMetadata,
  writeRigMetadata,
  type RigBoneMetadata,
  type RigMetadata,
} from '../utils/rigMetadata';
import { summarizeObjectTextures } from '../utils/textureCompat';
import { diagnoseGeometry, type GeometryDiagnosticsReport } from '../utils/geometryDiagnostics';
import {
  makeSkinEditState,
  averageVertexSkinWeights,
  blendVertexSkinWeights,
  collectBoneBranchIndices,
  type SkinEditState,
  type SkinEditHistoryEntry,
  type SkinWeightEditMode,
  type SkinAutoWeightAlgorithm,
  captureSkinVertexSnapshot,
  cloneSkinEditState,
  getDirtySkinExportBlockReason,
  hasDirtySkinEdits,
  markSkinEdit,
  editVertexBoneWeight,
  restoreSkinVertexSnapshots,
  sameVertexSkinWeights,
  normalizeSkinnedMeshWeights,
  autoSkinSkinnedMeshWeights,
  autoSkinSkinnedMeshVertexWeights,
  getSkinVertexSnapshotKey,
  getSkinAttributes,
  indexSkinVertexSnapshots,
  readVertexSkinWeights,
  resolveSkinAutoWeightOptions,
  SKIN_AUTO_WEIGHT_ALGORITHM_LABELS,
  appendSkinHistoryEntry,
  writeVertexSkinWeights,
  type VertexSkinWeights,
} from '../utils/skinWeights';
import {
  diagnoseSkinVertex,
  diagnoseSkinnedMeshes,
  type SkinDiagnosticsSummary,
  type SkinPaintPoseMode,
  type SkinVertexDiagnostic,
} from '../utils/skinDiagnostics';
import {
  makeEditorHistory,
  popRedo,
  popUndo,
  pushEditorHistory,
  type EditorHistoryEntry,
  type EditorHistoryState,
} from '../utils/editorHistory';
import {
  applyAnimationEditsToClips,
  cloneAnimationEditState,
  deleteAnimationEditBones,
  deleteAnimationEditClip,
  getAnimationClipLockedBoneNames,
  getClipKey,
  getCurrentClipKey,
  hasDirtyAnimationEdits,
  makeAnimationEditState,
  makeKeyframeFromBone,
  renameAnimationEditBone,
  sameAnimationEditState,
  upsertAnimationKeyframe,
  type AnimationClipMetadata,
  type AnimationEditState,
  type AnimationSnapStep,
} from '../utils/animationEdits';
import {
  captureAnimationPose,
  type AnimationPoseSnapshot,
} from '../utils/animationCreation';
import { createAnimationAuthoringController } from '../utils/animationAuthoringController';
import { buildRigMap } from '../utils/rigMapping';
import { retargetAnimationClip } from '../utils/animationRetarget';
import {poseRangeSummary} from '../utils/poseRanges';
import { mergeRetargetClips, profileClipOptions, type RetargetProfile } from '../utils/retargetProfile';
import type { AnimationEditScope } from '../utils/animationScope';
import {
  createChildBone,
  deleteBoneBranch,
  moveBoneToWorldPosition,
  normalizeRigSnapStep,
  reparentBonePreserveWorldTransform,
  resetBoneToBindPose,
  removeAnimationClipBoneNames,
  rotateBoneAroundWorldAxis,
  setBoneDetached,
  spinRig,
  retargetAnimationClipBoneNames,
  snapRigWorldPosition,
  validateBoneRename,
  type RigSpinAxis,
  type RigToolMode,
} from '../utils/rigEdits';
import {
  countStaticMeshes,
  reapplyStaticMeshSkinPreparation,
  prepareStaticMeshesForSkinning,
  restoreStaticMeshSkinPreparation,
} from '../utils/staticMeshSkinPrep';
import { collectRigHierarchyBones } from '../utils/rigHierarchy';
import { hasPendingAuthoringChanges, UNSAVED_REPLACEMENT_MESSAGE } from '../utils/replacementGuard';
import type { ViewportRole } from '../utils/viewportLayout';
import {
  DEFAULT_RIG_IK_SETTINGS,
  createRigIkSession,
  normalizeRigIkSettings,
  solveRigIk,
  type RigIkSession,
  type RigIkSettings,
  type RigIkSolveResult,
} from '../utils/rigIk';

type LoadedModelResult =
  | Awaited<ReturnType<typeof buildSmfScene>>
  | Awaited<ReturnType<typeof loadGLB>>
  | Awaited<ReturnType<typeof loadFBX>>
  | Awaited<ReturnType<typeof loadDAE>>
  | Awaited<ReturnType<typeof loadOBJ>>;

interface KeyboardEditorHistoryHandlers {
  undo?: () => boolean;
  redo?: () => boolean;
}

interface UseLoadModelOptions {
  allocateHistoryOrder?: () => number;
  externalDirtyRef?: { current: boolean };
}

const getTauriClient = createLazyClientLoader<TauriClient>(() => import('../backend-client/tauri').then((clientMod) => ({
    openFile: clientMod.openFile,
    readBrowserModelFiles: clientMod.readBrowserModelFiles,
    saveFile: clientMod.saveFile,
    saveProjectFile: clientMod.saveProjectFile,
    openProjectFile: clientMod.openProjectFile,
    autosaveProject: clientMod.autosaveProject,
    discoverProjectRecovery: clientMod.discoverProjectRecovery,
    readProjectRecovery: clientMod.readProjectRecovery,
    readBinaryFile: clientMod.readBinaryFile,
    readBinaryBundle: clientMod.readBinaryBundle,
    invokeCommand: clientMod.invokeCommand,
  })));

const isSkinnedMesh = (obj: THREE.Object3D): obj is THREE.SkinnedMesh => {
  return obj.type === 'SkinnedMesh';
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const hasNonIdentityScale = (scale: readonly [number, number, number]): boolean => {
  return scale.some((value) => Math.abs(value - 1) > 1e-4);
};

const clampPositive = (value: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number => {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
};

const formatRigSnapStep = (value: number): string => {
  const normalized = normalizeRigSnapStep(value);
  return normalized > 0 ? Number(normalized.toFixed(2)).toString() : 'off';
};

const collectSkinnedMeshById = (
  root: THREE.Object3D | null,
  meshId: string,
): THREE.SkinnedMesh | null => {
  if (!root || !meshId) return null;
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((obj) => {
    if (found) return;
    if (isSkinnedMesh(obj) && obj.uuid === meshId) {
      found = obj;
    }
  });
  return found;
};

interface SkinStrokeDraft {
  beforeState: SkinEditState;
  beforeSnapshots: Map<string, NonNullable<ReturnType<typeof captureSkinVertexSnapshot>>>;
}

interface ActivePoseTransformHistory {
  source: BoneTransformEditEvent['source'];
  boneName: string;
  before: PoseHistorySnapshot;
}

interface ActiveAnimationTransformHistory {
  source: BoneTransformEditEvent['source'];
  boneName: string;
  before: AnimationEditState;
}

interface ActiveRigMoveHistory {
  boneName: string;
  before: RigHistorySnapshot | null;
}

interface ActiveRigRotateHistory {
  boneName: string;
  paneRole: ViewportRole;
  before: RigHistorySnapshot | null;
}

interface ActiveRigIkHistory {
  boneName: string;
  chainNames: string[];
  session: RigIkSession;
  before: PoseHistorySnapshot;
}

const getBoneIndex = (skeleton: THREE.Skeleton | null, boneName: string): number => {
  if (!skeleton || !boneName) return -1;
  const index = skeleton.bones.findIndex((bone) => bone.name === boneName);
  return index;
};

const makeUniqueChildBoneName = (
  skeleton: THREE.Skeleton,
  parentName: string,
  root?: THREE.Object3D | null,
): string => {
  const existing = new Set(collectRigHierarchyBones(root ?? null, skeleton).map((bone) => bone.name).filter(Boolean));
  const cleanParent = parentName && parentName !== 'Scene' ? parentName : 'Bone';
  const base = `${cleanParent}_child`;
  if (!existing.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}_${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
};

/**
 * Custom hook to encapsulate model loading logic, error handling, and related handlers.
 * Uses the store slices internally for state.
 * This further thins App.tsx (orchestrator only).
 * Preserves all previous behavior.
 */
export function useLoadModel(options: UseLoadModelOptions = {}) {
  const ui = useUiSlice();
  const model = useModelSlice();
  const playback = usePlaybackSlice();
  const pendingReplacementRef = useRef<{ label: string; start: () => Promise<void> } | null>(null);
  const [pendingReplacement, setPendingReplacement] = useState<string | null>(null);
  const playbackRef = useRef(playback);
  useEffect(() => { playbackRef.current = playback }, [playback]);
  const allocateHistoryOrderRef = useRef(options.allocateHistoryOrder);
  const localHistoryOrderRef = useRef(0);
  useEffect(() => {
    allocateHistoryOrderRef.current = options.allocateHistoryOrder;
  }, [options.allocateHistoryOrder]);
  const allocateHistoryOrder = useCallback(() => {
    const externalAllocator = allocateHistoryOrderRef.current;
    if (externalAllocator) return externalAllocator();
    localHistoryOrderRef.current += 1;
    return localHistoryOrderRef.current;
  }, []);

  // Keep raw ImportedSmf for high-fidelity SMF export roundtrips
  const lastSmfDataRef = useRef<ImportedSmf | null>(null);

  // Track original source format for context-aware export (SMF has fidelity path; FBX gets its own exportFBX entry)
  const lastSourceFormatRef = useRef<ModelSourceFormat | ''>('');

  // Pose edits recorded from nudge buttons and gizmo; applied to SMF at export time
  const poseEditsRef = useRef<PoseEditMap>({});
  const [poseEditHasDirtyState, setPoseEditHasDirtyState] = useState(false);
  const editorHistoryRef = useRef<EditorHistoryState<EditorHistorySnapshot>>(makeEditorHistory());
  const editorHistoryIdRef = useRef(0);
  const activePoseTransformHistoryRef = useRef<ActivePoseTransformHistory | null>(null);
  const activeAnimationTransformHistoryRef = useRef<ActiveAnimationTransformHistory | null>(null);
  const activeRigMoveHistoryRef = useRef<ActiveRigMoveHistory | null>(null);
  const activeRigRotateHistoryRef = useRef<ActiveRigRotateHistory | null>(null);
  const activeRigIkHistoryRef = useRef<ActiveRigIkHistory | null>(null);
  const [editorUndoAvailable, setEditorUndoAvailable] = useState(false);
  const [editorRedoAvailable, setEditorRedoAvailable] = useState(false);
  const [editorUndoOrder, setEditorUndoOrder] = useState(0);
  const [editorRedoOrder, setEditorRedoOrder] = useState(0);
  const baseClipsRef = useRef<THREE.AnimationClip[]>([]);
  const animationRestPoseRef = useRef<AnimationPoseSnapshot | null>(null);
  const [animationEditState, setAnimationEditState] = useState<AnimationEditState>(() => makeAnimationEditState());
  const animationEditStateRef = useRef<AnimationEditState>(animationEditState);

  // Selected-bone weight preview toggle.
  const [showWeightPreview, setShowWeightPreview] = useState(false);

  // Transform mode for the gizmo; Inspector buttons select translate/rotate/scale.
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');

  // Bone labels toggle (3D name sprites in viewport for debug/selection aid). Off by default for perf.
  const [showBoneLabels, setShowBoneLabels] = useState(false);
  const [rigToolMode, setRigToolMode] = useState<RigToolMode>('select');
  const [rigSnapStep, setRigSnapStep] = useState(0);
  const [rigIkSettings, setRigIkSettings] = useState<RigIkSettings>(DEFAULT_RIG_IK_SETTINGS);
  const [rigIkLastResult, setRigIkLastResult] = useState<RigIkSolveResult | null>(null);
  const rigIkLastResultRef = useRef<RigIkSolveResult | null>(null);
  const rigIkLastTargetRef = useRef<THREE.Vector3 | null>(null);
  const [rigMetadata, setRigMetadata] = useState<RigMetadata>(() => createRigMetadata(null, null));
  const [restPoseSnapshot, setRestPoseSnapshot] = useState<AnimationPoseSnapshot | null>(null);
  const [restPoseGhostEnabled, setRestPoseGhostEnabled] = useState(false);
  const [motionTrailsEnabled, setMotionTrailsEnabled] = useState(false);
  const [onionSkinEnabled, setOnionSkinEnabled] = useState(false);
  const [skinEditState, setSkinEditState] = useState<SkinEditState>(() => makeSkinEditState());
  const skinEditStateRef = useRef<SkinEditState>(skinEditState);
  const skinUndoStackRef = useRef<SkinEditHistoryEntry[]>([]);
  const skinRedoStackRef = useRef<SkinEditHistoryEntry[]>([]);
  const activeSkinStrokeRef = useRef<SkinStrokeDraft | null>(null);
  const [skinUndoAvailable, setSkinUndoAvailable] = useState(false);
  const [skinRedoAvailable, setSkinRedoAvailable] = useState(false);
  const [skinUndoOrder, setSkinUndoOrder] = useState(0);
  const [skinRedoOrder, setSkinRedoOrder] = useState(0);

  const [skinPaintMode, setSkinPaintMode] = useState<SkinWeightEditMode>('set');
  const [skinPaintPose, setSkinPaintPose] = useState<SkinPaintPoseMode>('rest');
  const [selectedSkinVertex, setSelectedSkinVertex] = useState<{ meshId: string; vertexIndex: number } | null>(null);
  const [skinPaintTargetMode, setSkinPaintTargetMode] = useState<'vertex' | 'triangle'>('vertex');
  const [skinPaintRadius, setSkinPaintRadius] = useState(0.2);
  const [skinPaintStrength, setSkinPaintStrength] = useState(0.2);
  const [skinPaintTargetWeight, setSkinPaintTargetWeight] = useState(1);
  const [skinPaintFalloff, setSkinPaintFalloff] = useState(2);
  const [skinAutoWeightAlgorithm, setSkinAutoWeightAlgorithm] = useState<SkinAutoWeightAlgorithm>('segment-inverse-distance');
  const [skinAutoWeightPower, setSkinAutoWeightPower] = useState(2);
  const [skinAutoWeightNormalWeighting, setSkinAutoWeightNormalWeighting] = useState(0);
  const [skinAutoWeightMaxInfluences, setSkinAutoWeightMaxInfluences] = useState(4);
  const [animationSnapStep, setAnimationSnapStep] = useState<AnimationSnapStep>(0);
  const [animationScope, setAnimationScope] = useState<AnimationEditScope>('bone');

  const [sourceFormat, setSourceFormat] = useState('');
  const [smfRoundtripReport, setSmfRoundtripReport] = useState<SmfRoundtripReport | null>(null);

  // Editor mode is used by workspace composition and workspace-profile visibility.
  // Stable seq guards prevent stale async results across React re-renders.
  const loadSeqGuardRef = useRef(createSeqGuard());
  const exportSeqGuardRef = useRef(createSeqGuard());
  const autosaveSeqGuardRef = useRef(createSeqGuard());
  const isExportingRef = useRef(false);
  const activeAutosavePromiseRef = useRef<Promise<void> | null>(null);
  const pendingAutosaveTaskRef = useRef<(() => Promise<void>) | null>(null);
  const {
    smfCodecActivity,
    cancelActiveSmfCodec,
    importSmfInWorker,
    exportSmfInWorker,
  } = useSmfCodecTask(ui.setStatus);

  useEffect(() => () => {
    loadSeqGuardRef.current.next();
    exportSeqGuardRef.current.next();
    autosaveSeqGuardRef.current.next();
    pendingAutosaveTaskRef.current = null;
  }, []);

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
      root: model.root,
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

  const materialTextureSummaries = useMemo(
    () => model.root ? summarizeObjectTextures(model.root) : [],
    [model.root],
  );

  useEffect(() => {
    skinEditStateRef.current = skinEditState;
  }, [skinEditState]);

  useEffect(() => {
    animationEditStateRef.current = animationEditState;
  }, [animationEditState]);

  const skinEditHasDirtyState = useMemo(() => hasDirtySkinEdits(skinEditState), [skinEditState]);
  const skinEditBlockReason = useMemo(() => getDirtySkinExportBlockReason(skinEditState), [skinEditState]);
  const animationEditHasDirtyState = useMemo(() => hasDirtyAnimationEdits(animationEditState), [animationEditState]);
  const skinDiagnostics = useMemo<SkinDiagnosticsSummary>(
    () => diagnoseSkinnedMeshes(model.root ? collectSkinnedMeshes(model.root) : []),
    // Skin attributes mutate in place; the edit-state identity is the explicit diagnostic revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- root identity and skin edit identity are the two invalidation sources.
    [model.root, skinEditState],
  );
  const geometryDiagnostics = useMemo<GeometryDiagnosticsReport>(
    () => diagnoseGeometry(model.root),
    [model.root],
  );
  const skinSelectedVertexDiagnostic = useMemo<SkinVertexDiagnostic | null>(() => {
    if (!model.root || !selectedSkinVertex) return null;
    const mesh = collectSkinnedMeshById(model.root, selectedSkinVertex.meshId);
    return mesh ? diagnoseSkinVertex(mesh, selectedSkinVertex.vertexIndex) : null;
    // Skin attributes mutate in place; the edit-state identity is the explicit diagnostic revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected vertex, root, and edit identity invalidate the raw report.
  }, [model.root, selectedSkinVertex, skinEditState]);

  useEffect(() => {
    setSelectedSkinVertex(null);
  }, [model.root]);

  const authoringChangesPending = useCallback(() => hasPendingAuthoringChanges({
    pose: poseEditHasDirtyState,
    animation: animationEditHasDirtyState,
    skin: skinEditHasDirtyState,
    editorHistory: editorHistoryRef.current.undo.length > 0 || editorHistoryRef.current.redo.length > 0,
    externalHistory: options.externalDirtyRef?.current,
  }), [animationEditHasDirtyState, options.externalDirtyRef, poseEditHasDirtyState, skinEditHasDirtyState]);

  const queueOrStartReplacement = useCallback((
    label: string,
    start: () => Promise<void>,
  ): boolean => {
    if (!authoringChangesPending()) return false;
    pendingReplacementRef.current = { label, start };
    setPendingReplacement(label);
    ui.setIsLoading(false);
    ui.setStatus(UNSAVED_REPLACEMENT_MESSAGE);
    return true;
  }, [authoringChangesPending, ui]);

  const cancelPendingReplacement = useCallback(() => {
    pendingReplacementRef.current = null;
    setPendingReplacement(null);
    ui.setStatus('Model replacement canceled; current authoring state is unchanged.');
  }, [ui]);

  const confirmPendingReplacement = useCallback(async () => {
    const pending = pendingReplacementRef.current;
    pendingReplacementRef.current = null;
    setPendingReplacement(null);
    if (!pending) return;
    await pending.start();
  }, []);

  const beginLoadRequest = useCallback(() => {
    exportSeqGuardRef.current.next();
    const loadSeq = loadSeqGuardRef.current.next();
    cancelActiveSmfCodec();
    return loadSeq;
  }, [cancelActiveSmfCodec]);

  const beginModelOperation = useCallback(() => {
    const sequence = beginLoadRequest();
    return () => loadSeqGuardRef.current.isCurrent(sequence);
  }, [beginLoadRequest]);

  const readModelResourceFiles = useCallback(
    async (files: readonly File[]) => (await getTauriClient()).readBrowserModelFiles(files),
    [],
  );

  const refreshSkinHistoryAvailability = useCallback(() => {
    setSkinUndoAvailable(skinUndoStackRef.current.length > 0);
    setSkinRedoAvailable(skinRedoStackRef.current.length > 0);
    setSkinUndoOrder(skinUndoStackRef.current.at(-1)?.order ?? 0);
    setSkinRedoOrder(skinRedoStackRef.current.at(-1)?.redoOrder ?? 0);
  }, []);

  const appendSkinHistory = useCallback((
    target: 'undo' | 'redo',
    entry: SkinEditHistoryEntry,
  ) => {
    const stackRef = target === 'undo' ? skinUndoStackRef : skinRedoStackRef;
    const result = appendSkinHistoryEntry(stackRef.current, entry);
    stackRef.current = result.entries;
    if (result.evictions > 0) {
      ui.setStatus(result.accepted
        ? `Skin history budget reached; evicted ${result.evictions} oldest entr${result.evictions === 1 ? 'y' : 'ies'}.`
        : 'Skin history budget reached; the current edit remains applied but is not undoable.');
    }
    return result.accepted;
  }, [ui]);

  const commitSkinEditState = useCallback((next: SkinEditState) => {
    skinEditStateRef.current = next;
    setSkinEditState(next);
  }, []);

  const commitAnimationEditState = useCallback((next: AnimationEditState) => {
    const snapshot = cloneAnimationEditState(next);
    animationEditStateRef.current = snapshot;
    setAnimationEditState(snapshot);
    const editedClips = applyAnimationEditsToClips(baseClipsRef.current, snapshot);
    model.setClips(editedClips);
    const activeClipName = getCurrentClipKey(editedClips, playbackRef.current.currentClipName);
    const activeClip = editedClips.find((clip, index) => getClipKey(clip, index) === activeClipName) ?? editedClips[0];
    if (activeClip) {
      playbackRef.current.setDuration(activeClip.duration);
    }
  }, [model, playbackRef]);

  const clearSkinHistory = useCallback(() => {
    skinUndoStackRef.current = [];
    skinRedoStackRef.current = [];
    activeSkinStrokeRef.current = null;
    refreshSkinHistoryAvailability();
  }, [refreshSkinHistoryAvailability]);

  const refreshEditorHistoryAvailability = useCallback(() => {
    setEditorUndoAvailable(editorHistoryRef.current.undo.length > 0);
    setEditorRedoAvailable(editorHistoryRef.current.redo.length > 0);
    setEditorUndoOrder(editorHistoryRef.current.undo.at(-1)?.order ?? 0);
    setEditorRedoOrder(editorHistoryRef.current.redo.at(-1)?.redoOrder ?? 0);
  }, []);

  const clearEditorHistory = useCallback(() => {
    editorHistoryRef.current = makeEditorHistory();
    activePoseTransformHistoryRef.current = null;
    activeAnimationTransformHistoryRef.current = null;
    activeRigMoveHistoryRef.current = null;
    activeRigRotateHistoryRef.current = null;
    activeRigIkHistoryRef.current = null;
    refreshEditorHistoryAvailability();
  }, [refreshEditorHistoryAvailability]);

  const captureRigSnapshot = useCallback((): RigHistorySnapshot | null => {
    const skeleton = model.skeleton;
    if (!skeleton || !model.root) return null;
    const hierarchyBones = collectRigHierarchyBones(model.root, skeleton);

    return {
      selectedBoneName: ui.selected,
      bones: hierarchyBones.map((bone) => ({
        bone,
        name: bone.name,
        parent: bone.parent,
        parentBone: isThreeBone(bone.parent) ? bone.parent : null,
        rustsmfDetached: bone.userData.rustsmfDetached === true,
        position: [bone.position.x, bone.position.y, bone.position.z],
        quaternion: [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w],
        scale: [bone.scale.x, bone.scale.y, bone.scale.z],
      })),
      skeletonBones: [...skeleton.bones],
      boneInverses: skeleton.boneInverses.map((inverse) => inverse.clone()),
      baseClips: cloneAnimationClips(baseClipsRef.current),
      animationEditState: cloneAnimationEditState(animationEditStateRef.current),
      poseEdits: clonePoseEditMap(poseEditsRef.current),
      skinEditState: cloneSkinEditState(skinEditStateRef.current),
      skinIndices: captureRigSkinIndexSnapshots(model.root),
      metadata: normalizeRigMetadata(rigMetadata, model.root, skeleton),
    };
  }, [model.root, model.skeleton, rigMetadata, ui.selected]);

  const capturePoseSnapshot = useCallback((boneNames: string[]): PoseHistorySnapshot => {
    const skeleton = model.skeleton;
    const bones: Record<string, PoseBoneSnapshot> = {};
    const uniqueBoneNames = Array.from(new Set(boneNames.filter(Boolean)));

    if (skeleton) {
      for (const boneName of uniqueBoneNames) {
        const bone = findBoneByName(skeleton, boneName);
        if (!bone) continue;

        bone.updateMatrix();
        bone.updateMatrixWorld(true);
        bones[boneName] = {
          position: [bone.position.x, bone.position.y, bone.position.z],
          quaternion: [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w],
          scale: [bone.scale.x, bone.scale.y, bone.scale.z],
        };
      }
    }

    return {
      selectedBoneName: ui.selected,
      poseEdits: clonePoseEditMap(poseEditsRef.current),
      bones,
    };
  }, [model.skeleton, ui.selected]);

  const captureAnimationWorkspaceSnapshot = useCallback((): AnimationWorkspaceHistorySnapshot => ({
    baseClips: cloneAnimationClips(baseClipsRef.current),
    animationEditState: cloneAnimationEditState(animationEditStateRef.current),
    currentClipName: playbackRef.current.currentClipName,
    currentTime: playbackRef.current.currentTime,
  }), [playbackRef]);

  const applyPoseSnapshot = useCallback((snapshot: PoseHistorySnapshot): boolean => {
    const skeleton = model.skeleton;
    if (!skeleton) return false;

    let restored = 0;
    for (const [boneName, saved] of Object.entries(snapshot.bones)) {
      const bone = findBoneByName(skeleton, boneName);
      if (!bone) continue;

      bone.position.fromArray(saved.position);
      bone.quaternion.fromArray(saved.quaternion);
      bone.scale.fromArray(saved.scale);
      bone.updateMatrix();
      bone.updateMatrixWorld(true);
      restored += 1;
    }

    model.root?.updateMatrixWorld(true);
    skeleton.update();
    poseEditsRef.current = clonePoseEditMap(snapshot.poseEdits);
    setPoseEditHasDirtyState(hasPoseEdits(poseEditsRef.current));
    ui.setSelected(snapshot.selectedBoneName || 'Scene');
    commitSkinEditState({
      ...skinEditStateRef.current,
      selectedBoneName: snapshot.selectedBoneName && snapshot.selectedBoneName !== 'Scene'
        ? snapshot.selectedBoneName
        : '',
    });

    return restored > 0;
  }, [commitSkinEditState, model.root, model.skeleton, ui]);

  const applyRigSnapshot = useCallback((snapshot: RigHistorySnapshot): boolean => {
    const skeleton = model.skeleton;
    const root = model.root;
    if (!skeleton || !root) return false;

    const snapshotBones = new Set(snapshot.bones.map((boneSnapshot) => boneSnapshot.bone));
    for (const bone of collectRigHierarchyBones(root)) {
      if (!snapshotBones.has(bone)) {
        bone.parent?.remove(bone);
      }
    }

    for (const boneSnapshot of snapshot.bones) {
      const bone = boneSnapshot.bone;
      bone.name = boneSnapshot.name;
      bone.position.fromArray(boneSnapshot.position);
      bone.quaternion.fromArray(boneSnapshot.quaternion);
      bone.scale.fromArray(boneSnapshot.scale);
      bone.userData.rustsmfDetached = boneSnapshot.rustsmfDetached;
      bone.updateMatrix();
    }

    for (const boneSnapshot of snapshot.bones) {
      const desiredParent = boneSnapshot.parentBone ?? boneSnapshot.parent ?? root;
      if (boneSnapshot.bone.parent !== desiredParent) {
        desiredParent.add(boneSnapshot.bone);
      }
    }

    root.updateMatrixWorld(true);
    skeleton.bones = [...snapshot.skeletonBones];
    skeleton.boneInverses = snapshot.boneInverses.map((inverse) => inverse.clone());
    skeleton.init();
    skeleton.update();
    restoreRigSkinIndexSnapshots(snapshot.skinIndices);

    baseClipsRef.current = cloneAnimationClips(snapshot.baseClips);
    commitAnimationEditState(snapshot.animationEditState);
    poseEditsRef.current = clonePoseEditMap(snapshot.poseEdits);
    setPoseEditHasDirtyState(hasPoseEdits(poseEditsRef.current));
    const nextMetadata = normalizeRigMetadata(snapshot.metadata, root, skeleton);
    writeRigMetadata(root, nextMetadata);
    setRigMetadata(nextMetadata);
    commitSkinEditState(cloneSkinEditState(snapshot.skinEditState));
    ui.setSelected(snapshot.selectedBoneName || 'Scene');
    return true;
  }, [commitAnimationEditState, commitSkinEditState, model.root, model.skeleton, ui]);

  const applyStaticMeshSkinPreparationSnapshot = useCallback((
    snapshot: StaticMeshSkinPreparationHistorySnapshot,
  ): boolean => {
    if (snapshot.preparation.root !== model.root) return false;

    if (snapshot.prepared) {
      reapplyStaticMeshSkinPreparation(snapshot.preparation);
      model.setSkeleton(snapshot.preparation.skeleton);
    } else {
      restoreStaticMeshSkinPreparation(snapshot.preparation);
      model.setSkeleton(undefined);
    }
    commitSkinEditState(cloneSkinEditState(snapshot.skinEditState));
    ui.setSelected(snapshot.selectedBoneName || 'Scene');
    return true;
  }, [commitSkinEditState, model, ui]);

  const applyAnimationWorkspaceSnapshot = useCallback((snapshot: AnimationWorkspaceHistorySnapshot): boolean => {
    const nextBaseClips = cloneAnimationClips(snapshot.baseClips);
    const editedClips = applyAnimationEditsToClips(nextBaseClips, snapshot.animationEditState);
    const activeClipName = getCurrentClipKey(editedClips, snapshot.currentClipName);
    const activeClip = editedClips.find((clip, index) => getClipKey(clip, index) === activeClipName) ?? editedClips[0];
    if (!activeClip) return false;

    const nextTime = Math.max(0, Math.min(snapshot.currentTime, activeClip.duration || 0));
    baseClipsRef.current = nextBaseClips;
    commitAnimationEditState(snapshot.animationEditState);
    playbackRef.current.setCurrentClipName(activeClipName);
    playbackRef.current.setDuration(activeClip.duration);
    playbackRef.current.setCurrentTime(nextTime);
    return true;
  }, [commitAnimationEditState, playbackRef]);

  const pushEditorHistoryEntry = useCallback((entry: EditorHistoryEntry<EditorHistorySnapshot>) => {
    const previousEvictions = editorHistoryRef.current.evictionCount;
    editorHistoryRef.current = pushEditorHistory(editorHistoryRef.current, entry);
    if (editorHistoryRef.current.evictionCount > previousEvictions) {
      ui.setStatus('Editor history budget reached; the oldest undo entries were evicted.');
    }
    refreshEditorHistoryAvailability();
  }, [refreshEditorHistoryAvailability, ui]);

  const pushPoseHistory = useCallback((
    label: string,
    before: PoseHistorySnapshot,
    after: PoseHistorySnapshot,
  ) => {
    if (samePoseSnapshot(before, after)) return false;

    pushEditorHistoryEntry({
      id: `pose-${editorHistoryIdRef.current += 1}`,
      label,
      domain: 'pose',
      before: { kind: 'pose', value: before },
      after: { kind: 'pose', value: after },
      order: allocateHistoryOrder(),
    });
    return true;
  }, [allocateHistoryOrder, pushEditorHistoryEntry]);

  const pushRigHistory = useCallback((
    label: string,
    before: RigHistorySnapshot | null,
    after: RigHistorySnapshot | null,
  ) => {
    if (!before || !after) return false;

    const nextMetadata = normalizeRigMetadata(after.metadata, model.root, model.skeleton);
    for (const previous of before.bones) {
      const current = after.bones.find(item => item.bone === previous.bone);
      if (current?.name === previous.name) continue;
      if (current && before.metadata?.bones[previous.name]) {
        nextMetadata.bones[current.name] = { ...before.metadata.bones[previous.name] };
      }
      delete nextMetadata.bones[previous.name];
    }
    after.metadata = normalizeRigMetadata(nextMetadata, model.root, model.skeleton);
    if (model.root) writeRigMetadata(model.root, after.metadata);
    setRigMetadata(cloneRigMetadata(after.metadata));

    pushEditorHistoryEntry({
      id: `rig-${editorHistoryIdRef.current += 1}`,
      label,
      domain: 'rig',
      before: { kind: 'rig', value: before },
      after: { kind: 'rig', value: after },
      order: allocateHistoryOrder(),
    });
    return true;
  }, [allocateHistoryOrder, model.root, model.skeleton, pushEditorHistoryEntry]);

  const pushAnimationHistory = useCallback((
    label: string,
    before: AnimationEditState,
    after: AnimationEditState,
  ) => {
    if (sameAnimationEditState(before, after)) return false;

    pushEditorHistoryEntry({
      id: `animation-${editorHistoryIdRef.current += 1}`,
      label,
      domain: 'animation',
      before: { kind: 'animation', value: cloneAnimationEditState(before) },
      after: { kind: 'animation', value: cloneAnimationEditState(after) },
      order: allocateHistoryOrder(),
    });
    return true;
  }, [allocateHistoryOrder, pushEditorHistoryEntry]);

  const pushAnimationWorkspaceHistory = useCallback((
    label: string,
    before: AnimationWorkspaceHistorySnapshot,
    after: AnimationWorkspaceHistorySnapshot,
  ) => {
    if (sameAnimationWorkspaceSnapshot(before, after)) return false;

    pushEditorHistoryEntry({
      id: `animation-workspace-${editorHistoryIdRef.current += 1}`,
      label,
      domain: 'animation',
      before: { kind: 'animation-workspace', value: cloneAnimationWorkspaceSnapshot(before) },
      after: { kind: 'animation-workspace', value: cloneAnimationWorkspaceSnapshot(after) },
      order: allocateHistoryOrder(),
    });
    return true;
  }, [allocateHistoryOrder, pushEditorHistoryEntry]);

  const undoEditorHistory = useCallback(() => {
    const result = popUndo(editorHistoryRef.current, allocateHistoryOrder());
    editorHistoryRef.current = result.state;
    refreshEditorHistoryAvailability();

    if (!result.entry) {
      ui.setStatus('No editor undo available.');
      return;
    }

    if (result.entry.domain === 'pose' && result.entry.before.kind === 'pose') {
      if (!applyPoseSnapshot(result.entry.before.value)) {
        ui.setStatus(`Undo skipped: ${result.entry.label} target bone is missing.`);
        return;
      }
      rigIkLastResultRef.current = null;
      setRigIkLastResult(null);
    } else if (result.entry.domain === 'animation' && result.entry.before.kind === 'animation') {
      commitAnimationEditState(result.entry.before.value);
    } else if (result.entry.domain === 'animation' && result.entry.before.kind === 'animation-workspace') {
      if (!applyAnimationWorkspaceSnapshot(result.entry.before.value)) {
        ui.setStatus(`Undo skipped: ${result.entry.label} animation clip target is missing.`);
        return;
      }
    } else if (result.entry.domain === 'rig' && result.entry.before.kind === 'rig') {
      if (!applyRigSnapshot(result.entry.before.value)) {
        ui.setStatus(`Undo skipped: ${result.entry.label} rig target is missing.`);
        return;
      }
    } else if (result.entry.domain === 'rig' && result.entry.before.kind === 'static-skin-preparation') {
      if (!applyStaticMeshSkinPreparationSnapshot(result.entry.before.value)) {
        ui.setStatus(`Undo skipped: ${result.entry.label} model target is missing.`);
        return;
      }
    } else {
      ui.setStatus(`Undo skipped: ${result.entry.domain} history payload is invalid.`);
      return;
    }

    ui.setStatus(`Undid ${result.entry.label}.`);
  }, [allocateHistoryOrder, applyAnimationWorkspaceSnapshot, applyPoseSnapshot, applyRigSnapshot, applyStaticMeshSkinPreparationSnapshot, commitAnimationEditState, refreshEditorHistoryAvailability, ui]);

  const redoEditorHistory = useCallback(() => {
    const result = popRedo(editorHistoryRef.current, allocateHistoryOrder());
    editorHistoryRef.current = result.state;
    refreshEditorHistoryAvailability();

    if (!result.entry) {
      ui.setStatus('No editor redo available.');
      return;
    }

    if (result.entry.domain === 'pose' && result.entry.after.kind === 'pose') {
      if (!applyPoseSnapshot(result.entry.after.value)) {
        ui.setStatus(`Redo skipped: ${result.entry.label} target bone is missing.`);
        return;
      }
      rigIkLastResultRef.current = null;
      setRigIkLastResult(null);
    } else if (result.entry.domain === 'animation' && result.entry.after.kind === 'animation') {
      commitAnimationEditState(result.entry.after.value);
    } else if (result.entry.domain === 'animation' && result.entry.after.kind === 'animation-workspace') {
      if (!applyAnimationWorkspaceSnapshot(result.entry.after.value)) {
        ui.setStatus(`Redo skipped: ${result.entry.label} animation clip target is missing.`);
        return;
      }
    } else if (result.entry.domain === 'rig' && result.entry.after.kind === 'rig') {
      if (!applyRigSnapshot(result.entry.after.value)) {
        ui.setStatus(`Redo skipped: ${result.entry.label} rig target is missing.`);
        return;
      }
    } else if (result.entry.domain === 'rig' && result.entry.after.kind === 'static-skin-preparation') {
      if (!applyStaticMeshSkinPreparationSnapshot(result.entry.after.value)) {
        ui.setStatus(`Redo skipped: ${result.entry.label} model target is missing.`);
        return;
      }
    } else {
      ui.setStatus(`Redo skipped: ${result.entry.domain} history payload is invalid.`);
      return;
    }

    ui.setStatus(`Redid ${result.entry.label}.`);
  }, [allocateHistoryOrder, applyAnimationWorkspaceSnapshot, applyPoseSnapshot, applyRigSnapshot, applyStaticMeshSkinPreparationSnapshot, commitAnimationEditState, refreshEditorHistoryAvailability, ui]);

  const clearLoadedModel = useCallback(() => {
    lastSmfDataRef.current = null;
    lastSourceFormatRef.current = '';
    baseClipsRef.current = [];
    animationRestPoseRef.current = null;
    setSourceFormat('');
    commitSkinEditState(makeSkinEditState('', ''));
    clearSkinHistory();
    clearEditorHistory();
    const emptyAnimationState = makeAnimationEditState();
    setAnimationEditState(emptyAnimationState);
    animationEditStateRef.current = emptyAnimationState;
    poseEditsRef.current = {};
    setPoseEditHasDirtyState(false);
    rigIkLastResultRef.current = null;
    setRigIkLastResult(null);
    rigIkLastTargetRef.current = null;
    setRigMetadata(createRigMetadata(null, null));
    setRestPoseSnapshot(null);
    setSmfRoundtripReport(null);
    model.clear();
    ui.setSelected('Scene');
    ui.clearError();
    ui.setEditorMode('view');
    ui.setViewportLayout('single');
    setShowWeightPreview(false);
    setTransformMode('translate');
    setShowBoneLabels(false);
    ui.setPerspectiveEnabled(true);
    ui.setShaderEnabled(false);
    ui.setModelOpacity(1);
    const pb = playbackRef.current;
    pb.setIsPlaying(false);
    pb.setCurrentTime(0);
    pb.setDuration(0);
    pb.setCurrentClipName('');
    pb.setPlaybackSpeed(1);
  }, [model, ui, playbackRef, clearSkinHistory, clearEditorHistory, commitSkinEditState]);

  const loadModel = useCallback(async (res: OpenResult, loadSeq: number) => {
    const loadSeqGuard = loadSeqGuardRef.current;
    const isCurrentLoad = () => loadSeqGuard.isCurrent(loadSeq);
    if (!isCurrentLoad()) return;
    ui.setIsLoading(true);
    ui.clearError();
    ui.setStatus('Loading model...');

    try {
      let loaded: LoadedModelResult;
      let importedSmf: ImportedSmf | null = null;
      let smfCodecExecution: SmfCodecExecution | null = null;
      let resourceBundle: ModelResourceBundle | null = null;
      const name = res.name || res.path || '';

      if (res.error) {
        throw new Error(res.error);
      }

      let data: Uint8Array | undefined = res.data;

      // Record source format for export decision and mode surfaces (FBX path etc.).
      const detectedLoadFormat = detectModelFormat(name);
      const detectedSourceFormat = res.projectState ? 'glb' : detectedLoadFormat;
      if (!detectedLoadFormat) {
        throw new Error(`Unsupported model format. Supported formats: ${supportedModelFormatsLabel()}`);
      }
      // Single dynamic import for all Tauri client fns when on desktop .smf path.
      // Reduces redundancy (one module load) and keeps the codec as the single
      // structural SMF validation authority.
      let tauri: TauriClient | null = null;
      if (res.path) {
        tauri = await getTauriClient();
      }

      if (res.files && res.files.length > 0) {
        const entries = [...res.files];
        const missingNativePaths = entries
          .filter((entry) => !entry.data && entry.path)
          .map((entry) => entry.path as string);
        let nativeBytes: readonly Uint8Array[] = [];
        if (missingNativePaths.length > 0) {
          if (!tauri) throw new Error('Tauri client unavailable for native model resource bundle read.');
          ui.setStatus('Reading selected model resources from desktop...');
          nativeBytes = await tauri.readBinaryBundle(missingNativePaths);
          if (!isCurrentLoad()) return;
        }
        let nativeIndex = 0;
        const resourceFiles = entries.map((entry) => {
          const entryData = entry.data ?? nativeBytes[nativeIndex++];
          if (!entryData) throw new Error(`Could not obtain binary data for resource "${entry.name}".`);
          return { name: entry.name, data: entryData };
        });
        resourceBundle = createModelResourceBundle(resourceFiles[0], resourceFiles.slice(1));
        data = resourceBundle.primary.data;
      }

      if (!data && res.path) {
        ui.setStatus('Reading binary from desktop path...');
        if (!tauri) {
          throw new Error('Tauri client unavailable for binary desktop read.');
        }
        data = await tauri.readBinaryFile(res.path);
        if (!isCurrentLoad()) return;
      }

      if (data) {
        assertModelInputSize(name, data.byteLength);
      }

      if (detectedLoadFormat === 'smf') {
        if (!data) {
          throw new Error('Could not obtain binary data for .smf (browser provides via input; desktop uses read_file_binary)');
        }
        const imported = await importSmfInWorker(bytesToArrayBuffer(data), isCurrentLoad);
        if (!isCurrentLoad()) return;
        importedSmf = imported.value;
        smfCodecExecution = imported.execution;
        loaded = buildSmfScene(importedSmf);
      } else if (detectedLoadFormat === 'fbx') {
        const urlOrBuf: string | ArrayBuffer | ModelResourceBundle = resourceBundle || (data ? bytesToArrayBuffer(data) : (res.path || ''));
        loaded = await loadFBX(urlOrBuf);
      } else if (detectedLoadFormat === 'dae') {
        const urlOrBuf: string | ArrayBuffer | ModelResourceBundle = resourceBundle || (data ? bytesToArrayBuffer(data) : (res.path || ''));
        loaded = await loadDAE(urlOrBuf);
      } else if (detectedLoadFormat === 'obj') {
        const urlOrBuf: string | ArrayBuffer | ModelResourceBundle = resourceBundle || (data ? bytesToArrayBuffer(data) : (res.path || ''));
        loaded = await loadOBJ(urlOrBuf);
      } else {
        const urlOrBuf: string | ArrayBuffer | ModelResourceBundle = resourceBundle || (data ? bytesToArrayBuffer(data) : (res.path || ''));
        loaded = await loadGLB(urlOrBuf);
      }

      if (!isCurrentLoad()) {
        disposeThreeObject(loaded.root);
        return;
      }

      autosaveSeqGuardRef.current.next();
      pendingAutosaveTaskRef.current = null;
      const activeAutosave = activeAutosavePromiseRef.current;
      if (activeAutosave) await activeAutosave;
      if (!isCurrentLoad()) {
        disposeThreeObject(loaded.root);
        return;
      }

      clearLoadedModel();
      lastSmfDataRef.current = importedSmf;
      lastSourceFormatRef.current = detectedSourceFormat;
      setSourceFormat(detectedSourceFormat);
      commitSkinEditState(makeSkinEditState('', detectedSourceFormat));

      const root = loaded.root;
      const availableClips = loaded.clips || [];

      baseClipsRef.current = availableClips;
      animationRestPoseRef.current = captureAnimationPose(loaded.skeleton ?? null);
      setRestPoseSnapshot(animationRestPoseRef.current);
      model.setRoot(root);
      model.setSkeleton(loaded.skeleton);
      model.setClips(availableClips);
      const loadedRigMetadata = normalizeRigMetadata(
        res.projectState?.rigMetadata ?? readRigMetadata(root, loaded.skeleton),
        root,
        loaded.skeleton,
      );
      writeRigMetadata(root, loadedRigMetadata);
      setRigMetadata(loadedRigMetadata);

      if (availableClips.length > 0) {
        const first = availableClips[0];
        const pb = playbackRef.current;
        pb.setCurrentClipName(first.name || 'clip_0');
        pb.setDuration(first.duration);
        pb.setIsPlaying(true);
        pb.setCurrentTime(0);
      }

      if (res.projectState) {
        const restoredClip = availableClips.find((clip) => (clip.name || '') === res.projectState?.currentClipName)
          ?? availableClips[0];
        const pb = playbackRef.current;
        if (restoredClip) {
          pb.setCurrentClipName(restoredClip.name || 'clip_0');
          pb.setDuration(restoredClip.duration);
          pb.setCurrentTime(Math.min(res.projectState.currentTime, restoredClip.duration));
        } else {
          pb.setCurrentClipName('');
          pb.setDuration(0);
          pb.setCurrentTime(0);
        }
        pb.setPlaybackSpeed(res.projectState.playbackSpeed);
        pb.setIsPlaying(res.projectState.isPlaying);
      }

      const boneCount = loaded.skeleton?.bones?.length ?? 0;
      if (detectedSourceFormat === 'fbx' && 'summary' in loaded && loaded.summary) {
        const summary = loaded.summary;
        const parts = [
          `Loaded FBX: ${res.name || 'model'}`,
          `meshes: ${summary.meshCount}`,
          `verts: ${summary.vertexCount}`,
          `bones: ${summary.boneCount}`,
          `clips: ${summary.clipCount}`,
        ];
        if (summary.textureMapCount > 0) {
          parts.push(`textures: ${summary.textureMapCount}`);
        }
        if (summary.removedTextureMaps > 0) {
          parts.push(`textures skipped: ${summary.removedTextureMaps}`);
        }
        let status = parts.join(' | ');
        if (summary.notes.length > 0) {
          status = `${status} — ${summary.notes.join(' ')}`;
        }
        ui.setStatus(status);
      } else {
        let status = `Loaded: ${res.name || 'model'} | bones: ${boneCount} | clips: ${availableClips.length} | verts: ${loaded.skinnedMeshes?.[0]?.geometry?.attributes?.position?.count ?? '?'}`;
        if (smfCodecExecution === 'sync-fallback') {
          status = `${status} | SMF codec: synchronous fallback`;
        }
        if (resourceBundle) {
          status = `${status} | ${modelResourceBundleSummary(resourceBundle)}`;
        }
        if (detectedSourceFormat !== 'smf' && boneCount === 0) {
          status = `${status} — static mesh (no skeleton). Use Rig → Prepare root skeleton to enable weight painting.`;
        }
        ui.setStatus(status);
      }

      const primarySelection = loaded.skinnedMeshes?.[0]?.name
        || ('summary' in loaded && loaded.summary?.primaryMeshName)
        || 'root';
      ui.setSelected(res.projectState?.selected || primarySelection);

    } catch (e: unknown) {
      if (!isCurrentLoad()) return;
      if (e instanceof SmfCodecCancelledError) return;
      const msg = errorMessage(e);
      if (!msg.startsWith('Unsupported model format.')) {
        console.error(e);
      }
      ui.setErrorMsg(`Load error: ${msg}`);
      const separator = /[.!?]$/.test(msg) ? ' ' : '. ';
      ui.setStatus(`Load error: ${msg}${separator}Select one supported model with its required sidecars.`);
    } finally {
      if (isCurrentLoad()) ui.setIsLoading(false);
    }
  }, [ui, model, playbackRef, clearLoadedModel, commitSkinEditState, importSmfInWorker]);

  const handleOpen = useCallback(async () => {
    if (ui.isLoading) return;
    const loadSeqGuard = loadSeqGuardRef.current;
    const loadSeq = beginLoadRequest();
    ui.setStatus(`Opening file picker (${supportedModelFormatsLabel()} supported)...`);
    ui.setIsLoading(true);
    try {
      const res: OpenResult | null = await (await getTauriClient()).openFile();
      if (!loadSeqGuard.isCurrent(loadSeq)) return;
      if (!res) {
        ui.setStatus('No file selected.');
        return;
      }
      if (res.error) {
        ui.setErrorMsg(`Open error: ${res.error}`);
        ui.setStatus(`Open error: ${res.error}`);
        return;
      }
      const start = () => loadModel(res, loadSeq);
      if (queueOrStartReplacement(res.name || res.path || 'selected model', start)) {
        return;
      }
      await start();
    } catch (e: unknown) {
      if (!loadSeqGuard.isCurrent(loadSeq)) return;
      const msg = errorMessage(e);
      ui.setErrorMsg(`Open error: ${msg}`);
      ui.setStatus(`Open error: ${msg}`);
    } finally {
      if (loadSeqGuard.isCurrent(loadSeq)) {
        ui.setIsLoading(false);
      }
    }
  }, [ui, loadModel, beginLoadRequest, queueOrStartReplacement]);

  const buildVerifiedGlb = useCallback(async (
    root: THREE.Group,
    clips: THREE.AnimationClip[],
    isCurrentExport: () => boolean,
  ) => {
    ui.setStatus('Exporting current model as GLB...');
    const bytes = await exportGLB(root, clips);
    if (!isCurrentExport()) return null;
    ui.setStatus('Validating exported GLB round-trip...');
    const summary = await validateExportedGLB(bytes, root, clips);
    if (!isCurrentExport()) return null;
    return { bytes, summary };
  }, [ui]);

  const buildProjectBytes = useCallback(async (verify: boolean): Promise<Uint8Array> => {
    if (!model.root) throw new Error('No model is loaded for project save.');
    const assetBytes = await exportGLB(model.root, model.clips);
    if (verify) {
      ui.setStatus('Validating project snapshot asset...');
      await validateExportedGLB(assetBytes, model.root, model.clips);
    }
    const document = createProjectDocument({
      name: model.root.name || 'rustsmf-project',
      assetBytes,
      state: {
        selected: ui.selected,
        currentClipName: playbackRef.current.currentClipName,
        currentTime: playbackRef.current.currentTime,
        playbackSpeed: playbackRef.current.playbackSpeed,
        isPlaying: playbackRef.current.isPlaying,
        sourceFormat: sourceFormat as 'smf' | 'glb' | 'fbx' | 'dae' | 'obj' | '',
        rigMetadata: cloneRigMetadata(rigMetadata),
      },
    });
    return encodeProjectDocument(document);
  }, [model.clips, model.root, playbackRef, rigMetadata, sourceFormat, ui]);

  const drainPendingAutosave = useCallback((): Promise<void> => {
    if (activeAutosavePromiseRef.current) return activeAutosavePromiseRef.current;
    if (isExportingRef.current) return Promise.resolve();

    const drainPromise = (async () => {
      while (!isExportingRef.current) {
        const task = pendingAutosaveTaskRef.current;
        if (!task) break;
        pendingAutosaveTaskRef.current = null;
        try {
          await task();
        } catch (error: unknown) {
          ui.setErrorMsg(`Project autosave error: ${errorMessage(error)}`);
        }
      }
    })();
    activeAutosavePromiseRef.current = drainPromise;
    const clearActiveDrain = () => {
      if (activeAutosavePromiseRef.current === drainPromise) {
        activeAutosavePromiseRef.current = null;
      }
    };
    void drainPromise.then(clearActiveDrain, clearActiveDrain);
    return drainPromise;
  }, [ui]);

  const withExportBusy = useCallback(async (
    actionLabel: string,
    action: (isCurrentExport: () => boolean) => Promise<void>,
  ) => {
    if (isExportingRef.current) {
      ui.setStatus(`${actionLabel} already has another save in progress. Wait for it to finish.`);
      return;
    }

    const exportSeq = exportSeqGuardRef.current.next();
    const isCurrentExport = () => exportSeqGuardRef.current.isCurrent(exportSeq);

    isExportingRef.current = true;
    ui.setIsLoading(true);

    try {
      // Reserve the foreground save before draining background work so a click
      // during autosave completes without overlapping writes or requiring retry.
      await activeAutosavePromiseRef.current;
      if (!isCurrentExport()) return;
      await action(isCurrentExport);
    } catch (e: unknown) {
      if (!isCurrentExport()) return;
      if (e instanceof SmfCodecCancelledError) return;
      const msg = errorMessage(e);
      ui.setErrorMsg(`${actionLabel} error: ${msg}`);
      ui.setStatus(`${actionLabel} error: ${msg}`);
    } finally {
      isExportingRef.current = false;
      if (isCurrentExport()) ui.setIsLoading(false);
      await drainPendingAutosave();
    }
  }, [drainPendingAutosave, ui]);

  const handleSaveProject = useCallback(async () => {
    await withExportBusy('Save Project', async (isCurrentExport) => {
      try {
        const data = await buildProjectBytes(true);
        if (!isCurrentExport()) return;
        const ok = await (await getTauriClient()).saveProjectFile(data, `rustsmf-project${PROJECT_EXTENSION}`);
        if (!isCurrentExport()) return;
        ui.setStatus(ok ? 'Saved RustSMF project snapshot atomically.' : 'Project save canceled.');
      } catch (error: unknown) {
        if (!isCurrentExport()) return;
        const message = errorMessage(error);
        ui.setErrorMsg(`Project save error: ${message}`);
        ui.setStatus(`Project save error: ${message}`);
      }
    });
  }, [buildProjectBytes, ui, withExportBusy]);

  const handleAutosaveProject = useCallback(async () => {
    if (!model.root) {
      autosaveSeqGuardRef.current.next();
      pendingAutosaveTaskRef.current = null;
      return;
    }
    const autosaveSeqGuard = autosaveSeqGuardRef.current;
    const autosaveSeq = autosaveSeqGuard.next();
    const isCurrentAutosave = () => autosaveSeqGuard.isCurrent(autosaveSeq);
    pendingAutosaveTaskRef.current = async () => {
      try {
        if (!isCurrentAutosave()) return;
        const data = await buildProjectBytes(false);
        if (!isCurrentAutosave()) return;
        const saved = await (await getTauriClient()).autosaveProject(data);
        if (!isCurrentAutosave()) return;
        if (!saved) throw new Error('Recovery snapshot could not be stored. Use Save Project to keep your edits.');
        ui.setErrorMsg((message) => message.startsWith('Project autosave error:') ? '' : message);
      } catch (error: unknown) {
        if (isCurrentAutosave()) throw error;
      }
    };
    await drainPendingAutosave();
  }, [buildProjectBytes, drainPendingAutosave, model.root, ui]);

  const startProjectLoad = useCallback(async (
    bytes: Uint8Array,
    fallbackName: string,
    loadSeq: number,
  ): Promise<void> => {
    const document = decodeProjectDocument(bytes);
    const result: OpenResult = {
      name: `${document.name || fallbackName}.glb`,
      data: projectAssetBytes(document),
      projectState: document.state,
    };
    const start = () => loadModel(result, loadSeq);
    if (queueOrStartReplacement(`${document.name || fallbackName} project`, start)) return;
    await start();
  }, [loadModel, queueOrStartReplacement]);

  const handleOpenProject = useCallback(async () => {
    if (ui.isLoading) return;
    const loadSeqGuard = loadSeqGuardRef.current;
    const loadSeq = beginLoadRequest();
    ui.setStatus('Opening RustSMF project...');
    ui.setIsLoading(true);
    try {
      const bytes = await (await getTauriClient()).openProjectFile();
      if (!loadSeqGuard.isCurrent(loadSeq)) return;
      if (!bytes) {
        ui.setStatus('No project selected.');
        return;
      }
      await startProjectLoad(bytes, 'rustsmf-project', loadSeq);
    } catch (error: unknown) {
      if (!loadSeqGuard.isCurrent(loadSeq)) return;
      const message = errorMessage(error);
      ui.setErrorMsg(`Project open error: ${message}`);
      ui.setStatus(`Project open error: ${message}`);
    } finally {
      if (loadSeqGuard.isCurrent(loadSeq)) ui.setIsLoading(false);
    }
  }, [beginLoadRequest, startProjectLoad, ui]);

  const handleRecoverProject = useCallback(async () => {
    if (ui.isLoading) return;
    const loadSeqGuard = loadSeqGuardRef.current;
    const loadSeq = beginLoadRequest();
    ui.setStatus('Checking RustSMF project recovery generations...');
    ui.setIsLoading(true);
    try {
      const generations = await (await getTauriClient()).discoverProjectRecovery();
      const generation = generations[0];
      if (!generation) {
        ui.setStatus('No recoverable project generation was found.');
        return;
      }
      const bytes = await (await getTauriClient()).readProjectRecovery(generation);
      if (!loadSeqGuard.isCurrent(loadSeq)) return;
      await startProjectLoad(bytes, generation, loadSeq);
    } catch (error: unknown) {
      if (!loadSeqGuard.isCurrent(loadSeq)) return;
      const message = errorMessage(error);
      ui.setErrorMsg(`Project recovery error: ${message}`);
      ui.setStatus(`Project recovery error: ${message}`);
    } finally {
      if (loadSeqGuard.isCurrent(loadSeq)) ui.setIsLoading(false);
    }
  }, [beginLoadRequest, startProjectLoad, ui]);

  const saveFbxExport = useCallback(async (
    root: THREE.Group,
    clips: THREE.AnimationClip[],
    isCurrentExport: () => boolean,
  ) => {
    ui.setStatus('Exporting current model as binary FBX 7500...');
    const bytes = await exportFBX(root, clips);
    if (!isCurrentExport()) return;
    ui.setStatus('Validating exported FBX round-trip...');
    const summary = await validateExportedFBX(bytes, root, clips);
    if (!isCurrentExport()) return;
    const ok = await (await getTauriClient()).saveFile(bytes, 'exported_model.fbx');
    if (!isCurrentExport()) return;
    if (!ok) {
      ui.setStatus('Export canceled.');
      return;
    }
    ui.setStatus(`Exported .fbx (binary FBX 7500). Verified ${summary.boneCount} bones, ${summary.skinnedMeshCount} skinned meshes, and ${summary.clipCount} clips.`);
  }, [ui]);

  const buildCurrentSmfExportCandidate = useCallback((): ImportedSmf | null => {
    return buildSmfExportCandidate({
      sourceSmf: lastSmfDataRef.current,
      root: model.root,
      skeleton: model.skeleton ?? null,
      clips: model.clips,
      poseEdits: poseEditsRef.current,
      animationEdits: animationEditStateRef.current,
    });
  }, [model.clips, model.root, model.skeleton]);

  const handleExport = useCallback(async () => {
    const smfData = lastSmfDataRef.current;
    await withExportBusy('Export', async (isCurrentExport) => {
      try {
        if (smfData) {
          ui.setStatus('Exporting as SMF (fidelity path using imported data + coord transforms + live pose edits)...');
          const dataToExport = buildCurrentSmfExportCandidate();
          if (!dataToExport) return;

          const encoded = await exportSmfInWorker(dataToExport, isCurrentExport);
          if (!isCurrentExport()) return;
          const ok = await (await getTauriClient()).saveFile(encoded.value, 'exported_model.smf');
          if (!isCurrentExport()) return;
          if (!ok) {
            ui.setStatus('Export canceled.');
            return;
          }

          ui.setStatus(`Exported .smf (imported data + DQ handling + pose edits applied). Test roundtrip by re-importing!${encoded.execution === 'sync-fallback' ? ' SMF codec used synchronous fallback.' : ''}`);
          return;
        }

        const rootToExport = model.root;
        if (!rootToExport) {
          ui.setStatus('Nothing to export.');
          return;
        }

        const srcFmt = lastSourceFormatRef.current;
        const isFBXSource = srcFmt === 'fbx';
        let fallbackNote = '';

        if (isFBXSource) {
          ui.setStatus('Exporting FBX-loaded model to binary .fbx...');
          try {
            await saveFbxExport(rootToExport, model.clips, isCurrentExport);
            return;
          } catch (e: unknown) {
            if (!isCurrentExport()) return;
            fallbackNote = ` FBX fallback: ${errorMessage(e)}.`;
            ui.setStatus(`FBX export error: ${errorMessage(e)}. Falling back to generic GLB...`);
          }
        }

        if (srcFmt === 'dae') {
          ui.setStatus('Exporting DAE-loaded model to Collada .dae...');
          try {
            const bytes = await exportDAE(rootToExport, model.clips);
            if (!isCurrentExport()) return;
            const summary = await validateExportedDAE(bytes, rootToExport, model.clips);
            if (!isCurrentExport()) return;
            const ok = await (await getTauriClient()).saveFile(bytes, 'exported_model.dae');
            if (!isCurrentExport()) return;
            if (!ok) { ui.setStatus('Export canceled.'); return; }
            ui.setStatus(`Exported .dae (verified ${summary.boneCount} bones, ${summary.clipCount} clips).`);
            return;
          } catch (error: unknown) {
            if (!isCurrentExport()) return;
            fallbackNote = ` DAE fallback: ${errorMessage(error)}.`;
            ui.setStatus(`DAE export error: ${errorMessage(error)}. Falling back to generic GLB...`);
          }
        }

        const built = await buildVerifiedGlb(rootToExport, model.clips, isCurrentExport);
        if (!built) return;
        const { bytes, summary } = built;
        const ok = await (await getTauriClient()).saveFile(bytes, 'exported_model.glb');
        if (!isCurrentExport()) return;
        if (!ok) {
          ui.setStatus('Export canceled.');
          return;
        }
        ui.setStatus(fallbackNote
          ? `Exported .glb.${fallbackNote} Verified ${summary.boneCount} bones, ${summary.clipCount} clips.`
          : `Exported .glb (verified ${summary.boneCount} bones, ${summary.clipCount} clips).`);
      } catch (e: unknown) {
        if (!isCurrentExport()) return;
        if (e instanceof SmfCodecCancelledError) return;
        if (e instanceof SmfConversionError) {
          ui.setErrorMsg(`SMF export blocked: ${e.message}`);
          ui.setStatus(`SMF export blocked: ${e.message}`);
          return;
        }
        const msg = errorMessage(e);
        ui.setErrorMsg(`Export error: ${msg}`);
        ui.setStatus(`Export error: ${msg}`);
      }
    });
  }, [
    ui,
    model,
    withExportBusy,
    buildVerifiedGlb,
    saveFbxExport,
    exportSmfInWorker,
    buildCurrentSmfExportCandidate,
  ]);

  const handleExportGlb = useCallback(async () => {
    await withExportBusy('Export as GLB', async (isCurrentExport) => {
      try {
        const rootToExport = model.root;
        if (!rootToExport) {
          ui.setStatus('Nothing to export as GLB.');
          return;
        }

        const built = await buildVerifiedGlb(rootToExport, model.clips, isCurrentExport);
        if (!built) return;
        const { bytes, summary } = built;
        const ok = await (await getTauriClient()).saveFile(bytes, 'exported_model.glb');
        if (!isCurrentExport()) return;
        if (!ok) {
          ui.setStatus('Export canceled.');
          return;
        }
        ui.setStatus(`Exported .glb (verified ${summary.boneCount} bones, ${summary.clipCount} clips).`);
      } catch (e: unknown) {
        if (!isCurrentExport()) return;
        const msg = errorMessage(e);
        ui.setErrorMsg(`GLB export error: ${msg}`);
        ui.setStatus(`GLB export error: ${msg}`);
      }
    });
  }, [ui, model, withExportBusy, buildVerifiedGlb]);

  const handleExportFbx = useCallback(async () => {
    await withExportBusy('Export as FBX', async (isCurrentExport) => {
      try {
        const rootToExport = model.root;
        if (!rootToExport) {
          ui.setStatus('Nothing to export as FBX.');
          return;
        }

        await saveFbxExport(rootToExport, model.clips, isCurrentExport);
      } catch (e: unknown) {
        if (!isCurrentExport()) return;
        const msg = errorMessage(e);
        ui.setErrorMsg(`FBX export error: ${msg}`);
        ui.setStatus(`FBX export error: ${msg}`);
      }
    });
  }, [ui, model, withExportBusy, saveFbxExport]);

  const handleExportDae = useCallback(async () => {
    await withExportBusy('Export as DAE', async (isCurrentExport) => {
      try {
        if (!model.root) {
          ui.setStatus('Nothing to export as DAE.');
          return;
        }
        ui.setStatus('Exporting current model as Collada DAE...');
        const rootToExport = model.root;
        if (!rootToExport) { ui.setStatus('Nothing to export as DAE.'); return; }
        const bytes = await exportDAE(rootToExport, model.clips);
        if (!isCurrentExport()) return;
        ui.setStatus('Validating exported DAE round-trip...');
        const summary = await validateExportedDAE(bytes, rootToExport, model.clips);
        if (!isCurrentExport()) return;
        const ok = await (await getTauriClient()).saveFile(bytes, 'exported_model.dae');
        if (!isCurrentExport()) return;
        if (!ok) {
          ui.setStatus('Export canceled.');
          return;
        }
        ui.setStatus(`Exported .dae (verified ${summary.boneCount} bones, ${summary.clipCount} clips).`);
      } catch (error: unknown) {
        if (!isCurrentExport()) return;
        const message = errorMessage(error);
        ui.setErrorMsg(`DAE export error: ${message}`);
        ui.setStatus(`DAE export error: ${message}`);
      }
    });
  }, [model, ui, withExportBusy]);

  const handleRunSmfRoundtripCheck = useCallback(async () => {
    await withExportBusy('SMF roundtrip check', async (isCurrentExport) => {
      try {
        if (!isCurrentExport()) return;
        setSmfRoundtripReport(null);
        ui.clearError();
        ui.setStatus('Running SMF roundtrip check...');

        const candidate = buildCurrentSmfExportCandidate();
        if (!candidate) {
          ui.setStatus('No model loaded for SMF roundtrip check.');
          return;
        }

        const encoded = await exportSmfInWorker(candidate, isCurrentExport);
        if (!isCurrentExport()) return;
        const decoded = await importSmfInWorker(bytesToArrayBuffer(encoded.value), isCurrentExport);
        if (!isCurrentExport()) return;
        const report = compareSmfRoundtrip(candidate, decoded.value);
        setSmfRoundtripReport(report);

        if (report.ok) {
          const usedFallback = encoded.execution === 'sync-fallback' || decoded.execution === 'sync-fallback';
          ui.setStatus(`SMF roundtrip check passed: export summary matches reimport.${usedFallback ? ' SMF codec used synchronous fallback.' : ''}`);
        } else {
          ui.setErrorMsg(`SMF roundtrip mismatch: ${report.messages.join('; ')}`);
          ui.setStatus(`SMF roundtrip mismatch: ${report.messages.join('; ')}`);
        }
      } catch (e: unknown) {
        if (!isCurrentExport()) return;
        if (e instanceof SmfCodecCancelledError) return;
        if (e instanceof SmfConversionError) {
          ui.setErrorMsg(`SMF roundtrip blocked: ${e.message}`);
          ui.setStatus(`SMF roundtrip blocked: ${e.message}`);
          return;
        }
        const msg = errorMessage(e);
        ui.setErrorMsg(`SMF roundtrip check error: ${msg}`);
        ui.setStatus(`SMF roundtrip check error: ${msg}`);
      }
    });
  }, [buildCurrentSmfExportCandidate, ui, withExportBusy, exportSmfInWorker, importSmfInWorker]);

  const handleSaveSmfDiagnosticReport = useCallback(async () => {
    await withExportBusy('Save SMF diagnostic report', async (isCurrentExport) => {
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
        if (!isCurrentExport()) return;
        if (!ok) {
          ui.setStatus('SMF diagnostic report save canceled.');
          return;
        }
        ui.setStatus('Saved SMF diagnostic report.');
      } catch (e: unknown) {
        if (!isCurrentExport()) return;
        const msg = errorMessage(e);
        ui.setErrorMsg(`Save SMF diagnostic report error: ${msg}`);
        ui.setStatus(`Save SMF diagnostic report error: ${msg}`);
      }
    });
  }, [model.root, model.skeleton, smfDiagnosticReport, smfRoundtripReport, sourceFormat, ui, withExportBusy]);

  // Dedicated "Export as SMF" handler. SMF sources use the imported-data fidelity path;
  // non-SMF skinned sources use the validated Three-to-SMF converter.
  const handleExportSmf = useCallback(async () => {
    await withExportBusy('Export as SMF', async (isCurrentExport) => {
      try {
        const rootToExport = model.root;
        const smfData = lastSmfDataRef.current;
        const conversionSourceLabel = sourceFormat && sourceFormat !== 'smf'
          ? sourceFormat.toUpperCase()
          : 'non-SMF';
        if (smfData) {
          ui.setStatus('Exporting as SMF (fidelity path using imported data + coord transforms + live pose edits)...');
        } else if (!rootToExport) {
          ui.setStatus('No model loaded for SMF export. Load or prepare a compatible skinned model, or use GLB export.');
          return;
        } else {
          ui.setStatus('Exporting as SMF via validated converter (Three skinned -> ImportedSmf)...');
        }

        const imported = buildCurrentSmfExportCandidate();
        if (!imported) {
          ui.setStatus('No compatible skinned model is available for SMF export. Prepare a static root or use GLB export.');
          return;
        }

        const encoded = await exportSmfInWorker(imported, isCurrentExport);
        if (!isCurrentExport()) return;
        const ok = await (await getTauriClient()).saveFile(encoded.value, 'exported_model.smf');
        if (!isCurrentExport()) return;
        if (!ok) {
          ui.setStatus('Export canceled.');
          return;
        }
        ui.setStatus(smfData
          ? `Exported .smf (imported data + DQ handling + pose edits applied). Test roundtrip by re-importing!${encoded.execution === 'sync-fallback' ? ' SMF codec used synchronous fallback.' : ''}`
          : `Exported .smf (from ${conversionSourceLabel} via validated threeToSmf converter + live pose). Re-import to verify fidelity!${encoded.execution === 'sync-fallback' ? ' SMF codec used synchronous fallback.' : ''}`);
      } catch (e: unknown) {
        if (!isCurrentExport()) return;
        if (e instanceof SmfCodecCancelledError) return;
        if (e instanceof SmfConversionError) {
          ui.setErrorMsg(`SMF export blocked: ${e.message}`);
          ui.setStatus(`SMF export blocked: ${e.message}`);
          return;
        }
        const msg = errorMessage(e);
        ui.setErrorMsg(`SMF export error: ${msg}`);
        ui.setStatus(`SMF export error: ${msg}`);
      }
    });
  }, [
    ui,
    model.root,
    sourceFormat,
    withExportBusy,
    buildCurrentSmfExportCandidate,
    exportSmfInWorker,
  ]);
  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;
    const primaryName = files.find((file) => detectModelFormat(file.name) !== '')?.name || files[0].name;
    const loadSeqGuard = loadSeqGuardRef.current;
    const loadSeq = beginLoadRequest();
    const start = async (): Promise<void> => {
      ui.setStatus('Loading selected file...');
      ui.setIsLoading(true);
      try {
        const result = await (await getTauriClient()).readBrowserModelFiles(files);
        if (!loadSeqGuard.isCurrent(loadSeq)) return;
        await loadModel(result, loadSeq);
      } catch (err: unknown) {
        if (!loadSeqGuard.isCurrent(loadSeq)) return;
        const m = errorMessage(err);
        ui.setErrorMsg(`File load error: ${m}`);
        ui.setStatus(`File load error: ${m}`);
      } finally {
        input.value = '';
        if (loadSeqGuard.isCurrent(loadSeq)) ui.setIsLoading(false);
      }
    };
    if (queueOrStartReplacement(primaryName, start)) {
      input.value = '';
      return;
    }
    await start();
  }, [ui, loadModel, beginLoadRequest, queueOrStartReplacement]);

  // Keyboard handler (can be used in useEffect in App or moved)
  const setupKeyboard = useCallback((historyHandlers: KeyboardEditorHistoryHandlers = {}) => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const tagName = target?.tagName.toLowerCase();
      const isTextInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable === true;
      if (isTextInput) return;

      const key = e.key.toLowerCase();
      const commandKey = e.ctrlKey || e.metaKey;
      if (commandKey && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (!historyHandlers.redo?.()) {
            redoEditorHistory();
          }
        } else {
          if (!historyHandlers.undo?.()) {
            undoEditorHistory();
          }
        }
        return;
      }
      if (commandKey && key === 'y') {
        e.preventDefault();
        if (!historyHandlers.redo?.()) {
          redoEditorHistory();
        }
        return;
      }
      if (key === ' ') {
        if (target?.closest('button, a[href], summary, [role="button"], [role="tab"], [role="treeitem"]')) return;
        e.preventDefault();
        playbackRef.current.setIsPlaying(p => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playbackRef, redoEditorHistory, undoEditorHistory]);

  const togglePlay = useCallback(() => {
    playbackRef.current.toggle();
  }, [playbackRef]);

  const toggleWeightPreview = useCallback(() => {
    setShowWeightPreview(v => !v);
  }, []);

  const setTransformModeHandler = useCallback((mode: 'translate' | 'rotate' | 'scale') => {
    if (sourceFormat === 'smf' && mode === 'scale') {
      ui.setStatus(UNSUPPORTED_SMF_SCALE_EDIT_MESSAGE);
      return false;
    }
    setTransformMode(mode);
    return true;
  }, [sourceFormat, ui]);

  const toggleBoneLabels = useCallback(() => {
    setShowBoneLabels(v => !v);
  }, []);

  const changeClip = useCallback((clip: THREE.AnimationClip) => {
    playback.selectClip(clip.name || 'clip', clip.duration);
  }, [playback]);

  const setSpeed = useCallback((s: number) => {
    playback.setPlaybackSpeed(s);
  }, [playback]);

  const getSourceAnimationClipMetadata = useCallback((clipName: string): AnimationClipMetadata => {
    const sourceAnimation = lastSmfDataRef.current?.animations.find((animation, index) => (
      (animation.name || `clip_${index}`) === clipName
    ));
    return {
      loop: (sourceAnimation?.loop ?? 1) !== 0,
      sampleFrameMultiplier: sourceAnimation?.sampleFrameMultiplier ?? 1,
    };
  }, []);

  const getSourceAnimationLockedBoneNames = useCallback((clipName: string): readonly string[] => {
    const sourceAnimation = lastSmfDataRef.current?.animations.find((animation, index) => (
      (animation.name || `clip_${index}`) === clipName
    ));
    return (sourceAnimation?.lockedBones ?? []).map((index) => `SMF_Node_${index}`);
  }, []);

  const animationAuthoring = useMemo(() => createAnimationAuthoringController({
    baseClipsRef,
    animationEditStateRef,
    playbackRef,
    skeleton: model.skeleton ?? null,
    animationRestPoseRef,
    selectedBoneName: ui.selected ?? '',
    animationScope,
    setAnimationScope,
    animationSnapStep,
    setAnimationEditState,
    setAnimationSnapStep,
    commitAnimationEditState,
    captureAnimationWorkspaceSnapshot,
    applyAnimationWorkspaceSnapshot,
    pushAnimationHistory,
    pushAnimationWorkspaceHistory,
    getSourceAnimationClipMetadata,
    getSourceAnimationLockedBoneNames,
    setStatus: ui.setStatus,
  }), [
    animationScope,
    animationSnapStep,
    applyAnimationWorkspaceSnapshot,
    captureAnimationWorkspaceSnapshot,
    commitAnimationEditState,
    getSourceAnimationClipMetadata,
    getSourceAnimationLockedBoneNames,
    model.skeleton,
    pushAnimationHistory,
    pushAnimationWorkspaceHistory,
    setAnimationEditState,
    setAnimationSnapStep,
    setAnimationScope,
    ui.selected,
    ui.setStatus,
  ]);

  const {
    createAnimationFromPose,
    renameCurrentAnimationClip,
    duplicateCurrentAnimationClip,
    deleteCurrentAnimationClip,
    moveCurrentAnimationClipUp,
    moveCurrentAnimationClipDown,
    snapPlaybackTime,
    insertAnimationKeyframeAtTime,
    insertAnimationKeyframesForBonesAtTime,
    insertAnimationKeyframe,
    updateAnimationKeyframe,
    deleteSelectedAnimationKeyframe,
    copySelectedAnimationKeyframe,
    pasteAnimationKeyframe,
    selectAnimationKeyframeTime,
    moveSelectedAnimationKeyframe,
    changeAnimationInterpolation,
    changeAnimationSnapStep,
    changeAnimationScope,
    changeAnimationClipLoop,
    changeAnimationClipSampleFrameMultiplier,
    changeAnimationClipDuration,
    changeAnimationClipRetime,
    changeAnimationClipTrim,
    toggleAnimationBoneLock,
    applyAnimationEditState,
  } = animationAuthoring;

  const onScrub = useCallback((t: number) => {
    playbackRef.current.scrub(snapPlaybackTime(t));
  }, [playbackRef, snapPlaybackTime]);

  const animationAuthoredKeyTimes = animationAuthoring.getAnimationAuthoredKeyTimes();
  const animationClipMetadata = animationAuthoring.getAnimationClipMetadata();

  const pingRust = useCallback(async () => {
    try {
      const msg = await (await getTauriClient()).invokeCommand<string>('greet', { name: 'RustSMF' });
      ui.setStatus(msg + ' (real tauri invoke)');
    } catch (e: unknown) {
      ui.setStatus('Ping only works in Tauri desktop shell: ' + errorMessage(e));
    }
  }, [ui]);

  // Extracted for modularity: drop handler (mirrors handleFileInputChange but for DataTransfer)
  const handleDrop = useCallback(async (files: readonly File[]) => {
    if (files.length === 0) return;
    const primaryName = files.find((file) => detectModelFormat(file.name) !== '')?.name || files[0].name;
    const loadSeqGuard = loadSeqGuardRef.current;
    const loadSeq = beginLoadRequest();
    const start = async (): Promise<void> => {
      ui.setStatus('Loading dropped file...');
      ui.setIsLoading(true);
      try {
        const result = await (await getTauriClient()).readBrowserModelFiles(files);
        if (!loadSeqGuard.isCurrent(loadSeq)) return;
        await loadModel(result, loadSeq);
      } catch (err: unknown) {
        if (!loadSeqGuard.isCurrent(loadSeq)) return;
        const m = errorMessage(err);
        ui.setErrorMsg(`Drop load error: ${m}`);
        ui.setStatus(`Drop load error: ${m}`);
      } finally {
        if (loadSeqGuard.isCurrent(loadSeq)) ui.setIsLoading(false);
      }
    };
    if (!queueOrStartReplacement(primaryName, start)) await start();
  }, [ui, loadModel, beginLoadRequest, queueOrStartReplacement]);

  const loadStaticAppend = useCallback(async (file: File): Promise<THREE.Group | null> => {
    if (!model.root) {
      ui.setStatus('Load a base model before appending a static model.');
      return null;
    }
    const format = detectModelFormat(file.name);
    if (!['glb', 'gltf', 'obj', 'fbx', 'dae'].includes(format)) {
      ui.setStatus('Append supports only GLB/GLTF, OBJ, FBX, or DAE static assets.');
      return null;
    }
    const isCurrentOperation = beginModelOperation();
    ui.setIsLoading(true);
    ui.setStatus(`Reading static append ${file.name}...`);
    try {
      const result = await (await getTauriClient()).readBrowserModelFiles([file]);
      if (result.error) throw new Error(result.error);
      const bytes = result.data;
      if (!bytes) throw new Error('The selected static append has no readable bytes.');
      const loaded = format === 'fbx'
        ? await loadFBX(bytesToArrayBuffer(bytes))
        : format === 'dae'
          ? await loadDAE(bytesToArrayBuffer(bytes))
        : format === 'obj'
          ? await loadOBJ(bytesToArrayBuffer(bytes))
          : await loadGLB(bytesToArrayBuffer(bytes));
      if (!isCurrentOperation()) {
        disposeThreeObject(loaded.root);
        return null;
      }
      if (loaded.skeleton && loaded.skeleton.bones.length > 0) {
        disposeThreeObject(loaded.root);
        throw new Error('Static append rejected: animated/skinned assets must be opened as the primary model.');
      }
      return loaded.root;
    } catch (error: unknown) {
      if (!isCurrentOperation()) return null;
      ui.setErrorMsg(`Static append error: ${errorMessage(error)}`);
      ui.setStatus(`Static append error: ${errorMessage(error)}`);
      return null;
    } finally {
      if (isCurrentOperation()) ui.setIsLoading(false);
    }
  }, [beginModelOperation, model.root, ui]);

  const retargetAnimationsFromFiles = useCallback(async (files: readonly File[], profile?: RetargetProfile): Promise<void> => {
    const targetRoot = model.root;
    const targetSkeleton = model.skeleton;
    if (!targetRoot || !targetSkeleton || targetSkeleton.bones.length === 0) {
      ui.setStatus('Load a skinned target model before retargeting animation clips.');
      return;
    }
    if (files.length === 0) return;
    const isCurrentOperation = beginModelOperation();
    ui.setIsLoading(true);
    ui.setErrorMsg('');
    ui.setStatus('Reading source animation rig...');
    let loadedSource: Awaited<ReturnType<typeof loadFBX>> | Awaited<ReturnType<typeof loadDAE>> | Awaited<ReturnType<typeof loadGLB>> | null = null;
    try {
      const result = await (await getTauriClient()).readBrowserModelFiles(files);
      if (!isCurrentOperation()) return;
      if (result.error) throw new Error(result.error);
      const format = detectModelFormat(result.name || '');
      if (format !== 'fbx' && format !== 'dae' && format !== 'glb') {
        throw new Error('Animation retargeting accepts FBX, DAE, GLB, or GLTF source rigs.');
      }
      if (!result.files || result.files.length === 0) throw new Error('The selected animation source has no readable files.');
      const bundleFiles = result.files.map((file) => {
        if (!file.data) throw new Error(`Animation source file ${file.name} has no readable bytes.`);
        return { name: file.name, data: file.data };
      });
      const bundle = createModelResourceBundle(bundleFiles[0], bundleFiles.slice(1));
      loadedSource = format === 'fbx' ? await loadFBX(bundle) : format === 'dae' ? await loadDAE(bundle) : await loadGLB(bundle);
      if (!isCurrentOperation() || model.root !== targetRoot || model.skeleton !== targetSkeleton) {
        throw new Error('The target model changed before animation retargeting completed.');
      }
      if (!loadedSource.skeleton || loadedSource.skeleton.bones.length === 0) {
        throw new Error('The animation source has no skeleton.');
      }
      if (loadedSource.clips.length === 0) throw new Error('The animation source has no clips.');
      const mapping = buildRigMap(loadedSource.skeleton, targetSkeleton, {
        allowFuzzy: profile ? profile.retarget.allowFuzzy : true,
        manualMap: profile?.retarget.manualMap,
        requireManualForOpaqueNames: true,
      });
      if (!mapping.ok) {
        throw new Error(mapping.diagnostics.filter((item) => item.level === 'error').map((item) => item.message).join(' '));
      }
      const before = captureAnimationWorkspaceSnapshot();
      const targetClips = before.baseClips.map((clip) => {
        const name = profile?.targetClipNames[clip.name];
        if (!name || name === clip.name) return clip;
        const renamed = clip.clone(); renamed.name = name; return renamed;
      });
      const existingNames = new Set(targetClips.map((clip, index) => getClipKey(clip, index)));
      if (existingNames.size !== targetClips.length) throw new Error('Profile target clip names collide.');
      const selected = profile?.retarget.clips?.length
        ? loadedSource.clips.filter((clip) => profile.retarget.clips!.includes(clip.name)) : loadedSource.clips;
      if (!selected.length || (profile?.retarget.clips && selected.length !== profile.retarget.clips.length)) throw new Error('Profile selects missing source clips.');
      const retargetResults = selected.map((clip) => {
        const options = profile ? profileClipOptions(profile, clip, loadedSource!.clips, targetClips) : { clipName: clip.name || 'retargeted_clip' };
        return retargetAnimationClip(clip, loadedSource!.skeleton!, targetSkeleton, mapping, options);
      });
      const added=retargetResults.map(result=>result.clip);
      const rangeWarnings=retargetResults.flatMap(result=>result.report.poseRanges?.issues.length ? [poseRangeSummary(result.report.poseRanges)] : []);
      let replacementEdits = before.animationEditState;
      for (const name of profile?.retarget.replaceClips ?? []) {
        const originalName = before.baseClips.find(clip => (profile?.targetClipNames[clip.name] ?? clip.name) === name)?.name ?? name;
        if (getAnimationClipLockedBoneNames(before.animationEditState, originalName, getSourceAnimationLockedBoneNames(originalName)).length) {
          throw new Error(`Replacement clip ${name} contains locked bones; unlock it before replacing.`);
        }
        replacementEdits = deleteAnimationEditClip(replacementEdits, originalName);
      }
      const after: AnimationWorkspaceHistorySnapshot = {
        baseClips: mergeRetargetClips(targetClips, added, profile?.retarget.replaceClips),
        animationEditState: replacementEdits,
        currentClipName: added[0].name,
        currentTime: 0,
      };
      if (!applyAnimationWorkspaceSnapshot(after)) throw new Error('Retargeted clips could not be mounted in the animation workspace.');
      pushAnimationWorkspaceHistory(`retarget ${added.length} animation clip${added.length === 1 ? '' : 's'}`, before, after);
      const fuzzyCount = mapping.decisions.filter((decision) => decision.method === 'fuzzy').length;
      ui.setStatus(
        `Retargeted ${added.length} clip${added.length === 1 ? '' : 's'} across ${mapping.decisions.length} mapped bones${fuzzyCount > 0 ? `; review ${fuzzyCount} fuzzy match${fuzzyCount === 1 ? '' : 'es'}` : ''}${profile ? ' using the saved profile' : ''}.${rangeWarnings.length ? ` Review ${rangeWarnings.length} flagged clips. ${rangeWarnings.slice(0,3).join('; ')}` : ''}`,
      );
    } catch (error: unknown) {
      if (!isCurrentOperation()) return;
      const message = errorMessage(error);
      ui.setErrorMsg(`Animation retarget error: ${message}`);
      ui.setStatus(`Animation retarget error: ${message}`);
    } finally {
      if (loadedSource) {
        loadedSource.mixer.stopAllAction();
        disposeThreeObject(loadedSource.root);
      }
      if (isCurrentOperation()) ui.setIsLoading(false);
    }
  }, [
    applyAnimationWorkspaceSnapshot,
    beginModelOperation,
    captureAnimationWorkspaceSnapshot,
    getSourceAnimationLockedBoneNames,
    model.root,
    model.skeleton,
    pushAnimationWorkspaceHistory,
    ui,
  ]);

  // Extracted for modularity: bone selection updates UI state + status (used by Inspector + Viewport raycast)
  const handleSelectBone = useCallback((name: string) => {
    ui.setSelected(name);
    ui.setStatus(`Selected: ${name}`);
    commitSkinEditState({
      ...skinEditStateRef.current,
      selectedBoneName: name,
    });
  }, [ui, commitSkinEditState]);

  const changeRigToolMode = useCallback((next: RigToolMode) => {
    setRigToolMode(next);
    if (next === 'endpoint') {
      ui.setStatus('Rig endpoint tool active. Drag a cyan endpoint sphere; the completed drag is one pose transaction.');
      return;
    }
    if (next === 'add-child') {
      ui.setStatus('Rig add-child tool active. Click an empty Top/Front/Side pane to create a child under the selected bone.');
      return;
    }
    if (next === 'move') {
      ui.setStatus('Rig move tool active. Drag in a Top/Front/Side pane to move the selected bone.');
      return;
    }
    if (next === 'rotate') {
      ui.setStatus('Rig rotate tool active. Drag in a Top/Front/Side pane to rotate the selected bone.');
      return;
    }
    if (next === 'ik') {
      ui.setStatus('Rig IK pose tool active. Drag the labeled IK target; Escape or pointer cancel restores the whole chain.');
      return;
    }
    ui.setStatus('Rig select tool active.');
  }, [ui]);

  const changeRigSnapStep = useCallback((next: number) => {
    const normalized = normalizeRigSnapStep(next);
    setRigSnapStep(normalized);
    ui.setStatus(normalized > 0
      ? `Rig snap set to ${formatRigSnapStep(normalized)} units.`
      : 'Rig snap disabled.');
  }, [ui]);

  const changeRigIkSettings = useCallback((next: Partial<RigIkSettings>) => {
    setRigIkSettings((current) => normalizeRigIkSettings({ ...current, ...next }));
    setRigIkLastResult(null);
    rigIkLastResultRef.current = null;
  }, []);

  const renameSelectedBone = useCallback((requestedName: string) => {
    const skeleton = model.skeleton;
    const oldName = ui.selected;
    if (sourceFormat === 'smf') {
      ui.setStatus('SMF-source bone renames are blocked to preserve node-index export fidelity.');
      return;
    }

    const validation = validateBoneRename(skeleton, oldName, requestedName);
    if (!validation.ok) {
      ui.setStatus(validation.message);
      return;
    }

    const bone = findBoneByName(skeleton ?? null, oldName);
    if (!bone) {
      ui.setStatus('Selected item is not an editable rig bone.');
      return;
    }

    const before = captureRigSnapshot();
    bone.name = validation.name;
    bone.updateMatrixWorld(true);
    skeleton?.update();

    baseClipsRef.current = retargetAnimationClipBoneNames(baseClipsRef.current, oldName, validation.name);
    const renamedAnimationState = renameAnimationEditBone(animationEditStateRef.current, oldName, validation.name);
    animationEditStateRef.current = renamedAnimationState;
    setAnimationEditState(renamedAnimationState);
    model.setClips(applyAnimationEditsToClips(baseClipsRef.current, renamedAnimationState));

    if (poseEditsRef.current[oldName]) {
      poseEditsRef.current = {
        ...poseEditsRef.current,
        [validation.name]: poseEditsRef.current[oldName],
      };
      delete poseEditsRef.current[oldName];
    }

    commitSkinEditState({
      ...skinEditStateRef.current,
      selectedBoneName: validation.name,
    });
    ui.setSelected(validation.name);
    pushRigHistory(
      `rename rig bone ${oldName} to ${validation.name}`,
      before,
      setRigSnapshotSelection(captureRigSnapshot(), validation.name),
    );
    ui.setStatus(`Renamed bone ${oldName} to ${validation.name}.`);
  }, [captureRigSnapshot, commitSkinEditState, model, pushRigHistory, sourceFormat, ui]);

  const reparentSelectedBone = useCallback((parentName: string) => {
    const skeleton = model.skeleton;
    const boneName = ui.selected;
    if (sourceFormat === 'smf') {
      ui.setStatus('SMF-source reparenting is blocked until head-node compatibility editing is explicit.');
      return;
    }
    if (!skeleton) {
      ui.setStatus('Load a skinned model before reparenting bones.');
      return;
    }

    const before = captureRigSnapshot();
    const result = reparentBonePreserveWorldTransform(skeleton, boneName, parentName);
    if (!result.ok) {
      ui.setStatus(result.message);
      return;
    }

    pushRigHistory(
      `reparent rig bone ${boneName} under ${parentName}`,
      before,
      setRigSnapshotSelection(captureRigSnapshot(), boneName),
    );
    ui.setStatus(`Reparented ${boneName} under ${parentName}.`);
  }, [captureRigSnapshot, model.skeleton, pushRigHistory, sourceFormat, ui]);

  const prepareRootSkeletonForStaticMeshes = useCallback(() => {
    if (sourceFormat === 'smf') {
      ui.setStatus('SMF sources already carry their own skeleton contract.');
      return;
    }
    if (!model.root) {
      ui.setStatus('Load a model before preparing a root skeleton.');
      return;
    }
    if ((model.skeleton?.bones.length ?? 0) > 0) {
      ui.setStatus('This model already has a skeleton. Use Rig tools to edit bones.');
      return;
    }

    const selectedBefore = ui.selected;
    const skinStateBefore = cloneSkinEditState(skinEditStateRef.current);
    const result = prepareStaticMeshesForSkinning(model.root);
    if (!result.ok) {
      ui.setStatus(result.message);
      return;
    }

    model.setSkeleton(result.skeleton);
    const skinStateAfter = {
      ...skinEditStateRef.current,
      selectedBoneName: result.rootBoneName,
    };
    commitSkinEditState(skinStateAfter);
    ui.setSelected(result.rootBoneName);
    pushEditorHistoryEntry({
      id: `rig-${editorHistoryIdRef.current += 1}`,
      label: 'prepare root skeleton for static meshes',
      domain: 'rig',
      before: {
        kind: 'static-skin-preparation',
        value: {
          preparation: result.preparation,
          prepared: false,
          selectedBoneName: selectedBefore,
          skinEditState: skinStateBefore,
        },
      },
      after: {
        kind: 'static-skin-preparation',
        value: {
          preparation: result.preparation,
          prepared: true,
          selectedBoneName: result.rootBoneName,
          skinEditState: cloneSkinEditState(skinStateAfter),
        },
      },
      order: allocateHistoryOrder(),
    });
    ui.setStatus(
      `Prepared root skeleton "${result.rootBoneName}" on ${result.convertedCount} mesh${result.convertedCount === 1 ? '' : 'es'}. Add child bones, then weight-paint or auto-skin.`,
    );
  }, [allocateHistoryOrder, commitSkinEditState, model, pushEditorHistoryEntry, sourceFormat, ui]);

  const canPrepareRootSkeleton = useMemo(() => {
    if (sourceFormat === 'smf') return false;
    if (!model.root) return false;
    if ((model.skeleton?.bones.length ?? 0) > 0) return false;
    return countStaticMeshes(model.root) > 0;
  }, [model.root, model.skeleton, sourceFormat]);

  const createChildForSelectedBone = useCallback((requestedName: string) => {
    const skeleton = model.skeleton;
    const parentName = ui.selected;
    if (sourceFormat === 'smf') {
      ui.setStatus('SMF-source child creation is blocked until head-node compatibility editing is explicit.');
      return;
    }
    if (!skeleton) {
      ui.setStatus(
        canPrepareRootSkeleton
          ? 'Static mesh has no skeleton yet. Use Prepare root skeleton first.'
          : 'Load a skinned model before creating child bones.',
      );
      return;
    }

    const before = captureRigSnapshot();
    const result = createChildBone(skeleton, parentName, requestedName);
    if (!result.ok) {
      ui.setStatus(result.message);
      return;
    }

    commitSkinEditState({
      ...skinEditStateRef.current,
      selectedBoneName: result.bone.name,
    });
    ui.setSelected(result.bone.name);
    pushRigHistory(
      `create rig bone ${result.bone.name}`,
      before,
      setRigSnapshotSelection(captureRigSnapshot(), result.bone.name),
    );
    ui.setStatus(`Created child bone ${result.bone.name} under ${parentName}.`);
  }, [canPrepareRootSkeleton, captureRigSnapshot, commitSkinEditState, model.skeleton, pushRigHistory, sourceFormat, ui]);

  const createChildForSelectedBoneAtWorld = useCallback((event: {
    worldPosition: THREE.Vector3;
    paneRole: ViewportRole;
  }): boolean => {
    const skeleton = model.skeleton;
    const parentName = ui.selected;
    if (sourceFormat === 'smf') {
      ui.setStatus('SMF-source child creation is blocked until head-node compatibility editing is explicit.');
      return false;
    }
    if (!skeleton) {
      ui.setStatus('Load a skinned model before creating child bones.');
      return false;
    }
    if (!parentName || parentName === 'Scene') {
      ui.setStatus('Select a parent bone before creating a child.');
      return false;
    }

    const before = captureRigSnapshot();
    const childName = makeUniqueChildBoneName(skeleton, parentName, model.root);
    const worldPosition = snapRigWorldPosition(event.worldPosition, rigSnapStep);
    const result = createChildBone(skeleton, parentName, childName, { worldPosition });
    if (!result.ok) {
      ui.setStatus(result.message);
      return false;
    }

    commitSkinEditState({
      ...skinEditStateRef.current,
      selectedBoneName: result.bone.name,
    });
    ui.setSelected(result.bone.name);
    pushRigHistory(
      `create rig bone ${result.bone.name}`,
      before,
      setRigSnapshotSelection(captureRigSnapshot(), result.bone.name),
    );
    ui.setStatus(`Created child bone ${result.bone.name} under ${parentName} from ${event.paneRole} pane${rigSnapStep > 0 ? ` with ${formatRigSnapStep(rigSnapStep)} snap` : ''}.`);
    return true;
  }, [captureRigSnapshot, commitSkinEditState, model.root, model.skeleton, pushRigHistory, rigSnapStep, sourceFormat, ui]);

  const moveRigBoneToWorld = useCallback((event: RigMoveEditEvent): boolean => {
    const skeleton = model.skeleton;
    if (sourceFormat === 'smf') {
      activeRigMoveHistoryRef.current = null;
      ui.setStatus('SMF-source rig moving is blocked until head-node compatibility editing is explicit.');
      return false;
    }
    if (!skeleton) {
      activeRigMoveHistoryRef.current = null;
      ui.setStatus('Load a skinned model before moving bones.');
      return false;
    }
    if (!event.boneName || event.boneName === 'Scene') {
      activeRigMoveHistoryRef.current = null;
      ui.setStatus('Select a rig bone before moving.');
      return false;
    }

    if (event.phase === 'start') {
      activeRigMoveHistoryRef.current = {
        boneName: event.boneName,
        before: captureRigSnapshot(),
      };
      ui.setSelected(event.boneName);
      return true;
    }

    const worldPosition = snapRigWorldPosition(event.worldPosition, rigSnapStep);
    const result = moveBoneToWorldPosition(skeleton, event.boneName, worldPosition);
    if (!result.ok) {
      if (event.phase === 'end') {
        activeRigMoveHistoryRef.current = null;
      }
      ui.setStatus(result.message);
      return false;
    }

    commitSkinEditState({
      ...skinEditStateRef.current,
      selectedBoneName: result.bone.name,
    });
    ui.setSelected(result.bone.name);

    if (event.phase === 'change') {
      return true;
    }

    const active = activeRigMoveHistoryRef.current;
    const before = active?.boneName === event.boneName ? active.before : captureRigSnapshot();
    const after = setRigSnapshotSelection(captureRigSnapshot(), result.bone.name);
    if (sameRigBoneTransformSnapshot(before, after, result.bone.name)) {
      activeRigMoveHistoryRef.current = null;
      ui.setStatus(`Rig bone ${result.bone.name} move was unchanged.`);
      return true;
    }
    const pushed = pushRigHistory(
      `move rig bone ${result.bone.name}`,
      before,
      after,
    );
    activeRigMoveHistoryRef.current = null;
    ui.setStatus(pushed
      ? `Moved rig bone ${result.bone.name} from ${event.paneRole} pane${rigSnapStep > 0 ? ` with ${formatRigSnapStep(rigSnapStep)} snap` : ''}.`
      : `Rig bone ${result.bone.name} move was unchanged.`);
    return true;
  }, [captureRigSnapshot, commitSkinEditState, model.skeleton, pushRigHistory, rigSnapStep, sourceFormat, ui]);

  const rotateRigBoneAroundAxis = useCallback((event: RigRotateEditEvent): boolean => {
    const skeleton = model.skeleton;
    if (sourceFormat === 'smf') {
      activeRigRotateHistoryRef.current = null;
      ui.setStatus('SMF-source rig rotation is blocked until head-node compatibility editing is explicit.');
      return false;
    }
    if (!skeleton) {
      activeRigRotateHistoryRef.current = null;
      ui.setStatus('Load a skinned model before rotating bones.');
      return false;
    }
    if (!event.boneName || event.boneName === 'Scene') {
      activeRigRotateHistoryRef.current = null;
      ui.setStatus('Select a rig bone before rotating.');
      return false;
    }

    if (event.phase === 'start') {
      activeRigRotateHistoryRef.current = {
        boneName: event.boneName,
        paneRole: event.paneRole,
        before: captureRigSnapshot(),
      };
      ui.setSelected(event.boneName);
      return true;
    }

    if (event.phase === 'change') {
      const result = rotateBoneAroundWorldAxis(skeleton, event.boneName, event.worldAxis, event.angleRadians);
      if (!result.ok) {
        ui.setStatus(result.message);
        return false;
      }
      commitSkinEditState({
        ...skinEditStateRef.current,
        selectedBoneName: result.bone.name,
      });
      ui.setSelected(result.bone.name);
      return true;
    }

    const active = activeRigRotateHistoryRef.current;
    const boneName = active?.boneName === event.boneName ? active.boneName : event.boneName;
    const before = active?.boneName === event.boneName ? active.before : captureRigSnapshot();
    const after = setRigSnapshotSelection(captureRigSnapshot(), boneName);
    if (sameRigBoneTransformSnapshot(before, after, boneName)) {
      activeRigRotateHistoryRef.current = null;
      ui.setStatus(`Rig bone ${boneName} rotation was unchanged.`);
      return true;
    }
    const pushed = pushRigHistory(
      `rotate rig bone ${boneName}`,
      before,
      after,
    );
    activeRigRotateHistoryRef.current = null;
    ui.setStatus(pushed
      ? `Rotated rig bone ${boneName} from ${event.paneRole} pane.`
      : `Rig bone ${boneName} rotation was unchanged.`);
    return true;
  }, [captureRigSnapshot, commitSkinEditState, model.skeleton, pushRigHistory, sourceFormat, ui]);

  const setSelectedBoneDetached = useCallback((detached: boolean) => {
    const skeleton = model.skeleton;
    const boneName = ui.selected;
    if (sourceFormat === 'smf') {
      ui.setStatus('SMF-source detach/connect is blocked until head-node compatibility editing is explicit.');
      return;
    }
    if (!skeleton || !model.root) {
      ui.setStatus('Load a skinned model before changing rig detach state.');
      return;
    }
    if (!boneName || boneName === 'Scene') {
      ui.setStatus('Select a rig bone before changing detach state.');
      return;
    }

    const before = captureRigSnapshot();
    const result = setBoneDetached(skeleton, boneName, detached, collectSkinnedMeshes(model.root));
    if (!result.ok) {
      ui.setStatus(result.message);
      return;
    }

    commitSkinEditState({
      ...skinEditStateRef.current,
      selectedBoneName: result.detached ? '' : result.bone.name,
    });
    ui.setSelected(result.bone.name);
    pushRigHistory(
      `${result.detached ? 'detach' : 'connect'} rig bone ${result.bone.name}`,
      before,
      setRigSnapshotSelection(captureRigSnapshot(), result.bone.name),
    );
    ui.setStatus(result.detached
      ? `Detached ${result.bone.name} from the deform skeleton.`
      : `Connected ${result.bone.name} to the deform skeleton.`);
  }, [captureRigSnapshot, commitSkinEditState, model.root, model.skeleton, pushRigHistory, sourceFormat, ui]);

  const spinRigAroundAxis = useCallback((axis: RigSpinAxis) => {
    const skeleton = model.skeleton;
    if (sourceFormat === 'smf') {
      ui.setStatus('SMF-source rig spin is blocked until head-node compatibility editing is explicit.');
      return;
    }
    if (!skeleton) {
      ui.setStatus('Load a skinned model before spinning the rig.');
      return;
    }

    const before = captureRigSnapshot();
    const result = spinRig(skeleton, axis);
    if (!result.ok) {
      ui.setStatus(result.message);
      return;
    }

    pushRigHistory(
      `spin rig ${result.axis.toUpperCase()}`,
      before,
      setRigSnapshotSelection(captureRigSnapshot(), ui.selected),
    );
    ui.setStatus(`Spun rig ${result.axis.toUpperCase()} 90 degrees.`);
  }, [captureRigSnapshot, model.skeleton, pushRigHistory, sourceFormat, ui]);

  const deleteSelectedBone = useCallback(() => {
    const skeleton = model.skeleton;
    const boneName = ui.selected;
    if (sourceFormat === 'smf') {
      ui.setStatus('SMF-source bone deletion is blocked until head-node compatibility editing is explicit.');
      return;
    }
    if (!skeleton || !model.root) {
      ui.setStatus('Load a skinned model before deleting bones.');
      return;
    }

    const bone = findBoneByName(skeleton, boneName);
    const parentName = isThreeBone(bone?.parent) ? bone.parent.name : 'Scene';
    const before = captureRigSnapshot();
    const result = deleteBoneBranch(skeleton, boneName, collectSkinnedMeshes(model.root));
    if (!result.ok) {
      ui.setStatus(result.message);
      return;
    }

    baseClipsRef.current = removeAnimationClipBoneNames(baseClipsRef.current, result.deletedNames);
    const nextAnimationState = deleteAnimationEditBones(animationEditStateRef.current, result.deletedNames);
    animationEditStateRef.current = nextAnimationState;
    setAnimationEditState(nextAnimationState);
    model.setClips(applyAnimationEditsToClips(baseClipsRef.current, nextAnimationState));

    const nextPoseEdits = { ...poseEditsRef.current };
    for (const deletedName of result.deletedNames) {
      delete nextPoseEdits[deletedName];
    }
    poseEditsRef.current = nextPoseEdits;
    setPoseEditHasDirtyState(hasPoseEdits(nextPoseEdits));

    commitSkinEditState({
      ...skinEditStateRef.current,
      selectedBoneName: parentName === 'Scene' ? '' : parentName,
    });
    ui.setSelected(parentName);
    pushRigHistory(
      `delete rig bone ${boneName}`,
      before,
      setRigSnapshotSelection(captureRigSnapshot(), parentName),
    );
    ui.setStatus(`Deleted bone ${boneName}.`);
  }, [captureRigSnapshot, commitSkinEditState, model, pushRigHistory, sourceFormat, ui]);

  const recordPoseBoneEdit = useCallback((boneName: string, hasScale = false) => {
    const previous = poseEditsRef.current[boneName] ?? emptyPoseEdit();
    poseEditsRef.current = {
      ...poseEditsRef.current,
      [boneName]: markPoseBoneEdited(previous, { hasScale }),
    };
    setPoseEditHasDirtyState(hasPoseEdits(poseEditsRef.current));
  }, []);

  const onRigMetadataChange = useCallback((patch: Partial<RigBoneMetadata>) => {
    const root = model.root;
    const skeleton = model.skeleton;
    const boneName = ui.selected;
    if (!root || !skeleton || !boneName || boneName === 'Scene' || !findBoneByName(skeleton, boneName)) {
      ui.setStatus('Select a skeleton bone before changing rig metadata.');
      return;
    }
    const before = captureRigSnapshot();
    const next = updateRigBoneMetadata(rigMetadata, boneName, patch);
    writeRigMetadata(root, next);
    setRigMetadata(next);
    const after = captureRigSnapshot();
    if (after) after.metadata = cloneRigMetadata(next);
    const pushed = pushRigHistory(`update rig metadata for ${boneName}`, before, after);
    ui.setStatus(pushed ? `Updated rig metadata for ${boneName}.` : `Rig metadata for ${boneName} was unchanged.`);
  }, [captureRigSnapshot, model.root, model.skeleton, pushRigHistory, rigMetadata, ui]);

  const saveRigMetadata = useCallback(async () => {
    if (!model.root || !model.skeleton) {
      ui.setStatus('Load a rig before saving rig metadata.');
      return;
    }
    try {
      const ok = await (await getTauriClient()).saveFile(
        serializeRigMetadata(rigMetadata),
        `${model.root.name || 'rig'}.rig.json`,
      );
      ui.setStatus(ok ? 'Saved rig metadata.' : 'Rig metadata save canceled.');
    } catch (error: unknown) {
      ui.setErrorMsg(`Rig metadata save error: ${errorMessage(error)}`);
      ui.setStatus(`Rig metadata save error: ${errorMessage(error)}`);
    }
  }, [model.root, model.skeleton, rigMetadata, ui]);

  const loadRigMetadata = useCallback(async (file: File) => {
    const root = model.root;
    const skeleton = model.skeleton;
    if (!root || !skeleton) {
      ui.setStatus('Load a rig before importing rig metadata.');
      return;
    }
    if (file.size > 1024 * 1024) {
      ui.setStatus('Rig metadata import was rejected because the file exceeds 1 MiB.');
      return;
    }
    try {
      const parsed = parseRigMetadata(new Uint8Array(await file.arrayBuffer()));
      const before = captureRigSnapshot();
      const next = normalizeRigMetadata(parsed, root, skeleton);
      writeRigMetadata(root, next);
      setRigMetadata(next);
      const after = captureRigSnapshot();
      if (after) after.metadata = cloneRigMetadata(next);
      const pushed = pushRigHistory('load rig metadata', before, after);
      ui.setStatus(pushed ? 'Loaded rig metadata.' : 'Rig metadata was unchanged.');
    } catch (error: unknown) {
      ui.setErrorMsg(`Rig metadata load error: ${errorMessage(error)}`);
      ui.setStatus(`Rig metadata load error: ${errorMessage(error)}`);
    }
  }, [captureRigSnapshot, model.root, model.skeleton, pushRigHistory, ui]);

  const clearRigMetadata = useCallback(() => {
    const root = model.root;
    const skeleton = model.skeleton;
    if (!root || !skeleton) {
      ui.setStatus('Load a rig before clearing rig metadata.');
      return;
    }
    const before = captureRigSnapshot();
    const next = createRigMetadata(root, skeleton);
    writeRigMetadata(root, next);
    setRigMetadata(next);
    const after = captureRigSnapshot();
    if (after) after.metadata = cloneRigMetadata(next);
    const pushed = pushRigHistory('clear rig metadata', before, after);
    ui.setStatus(pushed ? 'Cleared rig metadata.' : 'Rig metadata was already clear.');
  }, [captureRigSnapshot, model.root, model.skeleton, pushRigHistory, ui]);

  const solveRigIkPose = useCallback((event: RigIkEditEvent): RigIkSolveResult | boolean => {
    const skeleton = model.skeleton;
    if (!skeleton) {
      activeRigIkHistoryRef.current = null;
      ui.setStatus('Load a skinned model before using IK.');
      return false;
    }

    if (event.phase === 'start') {
      const previous = activeRigIkHistoryRef.current;
      if (previous) {
        applyPoseSnapshot(previous.before);
      }
      const created = createRigIkSession(skeleton, event.boneName, rigIkSettings.chainLength);
      if (!created.ok) {
        activeRigIkHistoryRef.current = null;
        ui.setStatus(created.message);
        return false;
      }
      const chainNames = created.session.chain.map((bone) => bone.name);
      activeRigIkHistoryRef.current = {
        boneName: event.boneName,
        chainNames,
        session: created.session,
        before: capturePoseSnapshot(chainNames),
      };
      rigIkLastResultRef.current = null;
      rigIkLastTargetRef.current = null;
      setRigIkLastResult(null);
      ui.setSelected(event.boneName);
      return true;
    }

    const active = activeRigIkHistoryRef.current;
    if (!active || active.boneName !== event.boneName) {
      ui.setStatus('IK drag expired because the selected chain changed. Start a new IK drag.');
      return false;
    }

    if (event.phase === 'cancel') {
      applyPoseSnapshot(active.before);
      activeRigIkHistoryRef.current = null;
      rigIkLastResultRef.current = null;
      rigIkLastTargetRef.current = null;
      setRigIkLastResult(null);
      ui.setStatus(`Canceled IK pose for ${event.boneName}; restored the full chain.`);
      return true;
    }

    if (event.phase === 'change') {
      rigIkLastTargetRef.current = event.targetWorld.clone();
      const result = solveRigIk(skeleton, active.session, event.targetWorld, {
        ...rigIkSettings,
        lockedBoneNames: lockedRigBoneNames(rigMetadata),
        pinnedBoneNames: Object.entries(rigMetadata.bones)
          .filter(([, metadata]) => metadata.pinned)
          .map(([name]) => name),
      });
      model.root?.updateMatrixWorld(true);
      rigIkLastResultRef.current = result;
      setRigIkLastResult((current) => current?.status === result.status ? current : result);
      if (result.status === 'stale-chain' || result.status === 'invalid-target') {
        applyPoseSnapshot(active.before);
        ui.setStatus(result.status === 'stale-chain'
          ? 'IK canceled because the rig hierarchy changed during the drag.'
          : 'IK ignored a non-finite target and restored the chain.');
        activeRigIkHistoryRef.current = null;
        return false;
      }
      return result;
    }

    const beforeDirty = active.before;
    const afterBeforeDirty = capturePoseSnapshot(active.chainNames);
    const changedNames = active.chainNames.filter((name) => (
      !samePoseBoneSnapshot(beforeDirty.bones[name], afterBeforeDirty.bones[name])
    ));
    if (changedNames.length === 0) {
      activeRigIkHistoryRef.current = null;
      setRigIkLastResult(rigIkLastResultRef.current);
      ui.setStatus(`IK pose for ${event.boneName} was unchanged.`);
      return true;
    }

    changedNames.forEach((name) => recordPoseBoneEdit(name));
    const after = capturePoseSnapshot(active.chainNames);
    const pushed = pushPoseHistory(`IK pose ${event.boneName}`, beforeDirty, after);
    const result = rigIkLastResultRef.current;
    setRigIkLastResult(result);
    activeRigIkHistoryRef.current = null;
    const outcome = result?.status === 'unreachable'
      ? 'at maximum reach'
      : result?.status === 'constrained'
        ? 'within joint constraints'
        : 'at the target';
    ui.setStatus(pushed
      ? `Recorded IK pose for ${event.boneName} as one ${active.chainNames.length}-bone transaction ${outcome}.`
      : `IK pose for ${event.boneName} was unchanged.`);
    return true;
  }, [
    applyPoseSnapshot,
    capturePoseSnapshot,
    model.root,
    model.skeleton,
    pushPoseHistory,
    recordPoseBoneEdit,
    rigIkSettings,
    rigMetadata,
    ui,
  ]);

  const bakeRigIk = useCallback(() => {
    const skeleton = model.skeleton;
    const target = rigIkLastTargetRef.current;
    const endEffectorName = ui.selected;
    if (!skeleton || !endEffectorName || endEffectorName === 'Scene') {
      ui.setStatus('Select an IK end effector before baking.');
      return;
    }
    if (!target) {
      ui.setStatus('Pose the selected end effector with IK before baking its target.');
      return;
    }
    const created = createRigIkSession(skeleton, endEffectorName, rigIkSettings.chainLength);
    if (!created.ok) {
      ui.setStatus(created.message);
      return;
    }
    const result = solveRigIk(skeleton, created.session, target, {
      ...rigIkSettings,
      lockedBoneNames: lockedRigBoneNames(rigMetadata),
      pinnedBoneNames: Object.entries(rigMetadata.bones)
        .filter(([, metadata]) => metadata.pinned)
        .map(([name]) => name),
    });
    if (result.status === 'stale-chain' || result.status === 'invalid-target') {
      ui.setStatus(`IK bake was rejected: ${result.status.replace('-', ' ')}.`);
      return;
    }
    insertAnimationKeyframesForBonesAtTime(result.changedBoneNames, playbackRef.current.currentTime);
    setRigIkLastResult(result);
  }, [insertAnimationKeyframesForBonesAtTime, model.skeleton, playbackRef, rigIkSettings, rigMetadata, ui]);

  // Route bone nudge buttons through pose-edit layer so edits are captured at export time.
  // Applies the delta to the Three.js bone for immediate visual feedback, and records the
  // cumulative edit in poseEditsRef for use by handleExport.
  const onNudgeBone = useCallback((boneName: string, delta: BoneNudgeDelta) => {
    const skeleton = model.skeleton;
    if (!skeleton) return;
    const bone = findBoneByName(skeleton, boneName);
    if (!bone) return;

    const before = capturePoseSnapshot([boneName]);
    if (delta.reset) {
      const reset = resetBoneToBindPose(skeleton, boneName);
      if (!reset.ok) {
        ui.setStatus(reset.message);
        return;
      }

      const nextPoseEdits = { ...poseEditsRef.current };
      delete nextPoseEdits[boneName];
      poseEditsRef.current = nextPoseEdits;
      setPoseEditHasDirtyState(hasPoseEdits(nextPoseEdits));
      const after = capturePoseSnapshot([boneName]);
      const pushed = pushPoseHistory(`Reset bind pose ${boneName}`, before, after);
      ui.setStatus(pushed
        ? `Reset ${boneName} to its bind pose.`
        : `${boneName} is already at its bind pose.`);
      return;
    }

    const prev = poseEditsRef.current[boneName] ?? emptyPoseEdit();
    const next = applyNudgeDelta(prev, delta);
    poseEditsRef.current = { ...poseEditsRef.current, [boneName]: next };
    setPoseEditHasDirtyState(hasPoseEdits(poseEditsRef.current));

    if (delta.x !== undefined) bone.position.x += delta.x;
    if (delta.y !== undefined) bone.position.y += delta.y;
    if (delta.rotX !== undefined) bone.rotation.x += delta.rotX;
    if (delta.rotY !== undefined) bone.rotation.y += delta.rotY;
    if (delta.rotZ !== undefined) bone.rotation.z += delta.rotZ;
    bone.updateMatrix();
    skeleton.update();
    const after = capturePoseSnapshot([boneName]);
    pushPoseHistory(`Nudge ${boneName}`, before, after);
    const changes = [
      delta.x !== undefined ? `X ${delta.x >= 0 ? '+' : ''}${delta.x.toFixed(2)}` : '',
      delta.y !== undefined ? `Y ${delta.y >= 0 ? '+' : ''}${delta.y.toFixed(2)}` : '',
      delta.rotX !== undefined
        ? `X rotation ${delta.rotX >= 0 ? '+' : ''}${(delta.rotX * 180 / Math.PI).toFixed(1)}°`
        : '',
      delta.rotY !== undefined
        ? `Y rotation ${delta.rotY >= 0 ? '+' : ''}${(delta.rotY * 180 / Math.PI).toFixed(1)}°`
        : '',
      delta.rotZ !== undefined
        ? `Z rotation ${delta.rotZ >= 0 ? '+' : ''}${(delta.rotZ * 180 / Math.PI).toFixed(1)}°`
        : '',
    ].filter(Boolean);
    ui.setStatus(`Posed ${boneName}: ${changes.join(', ')}.`);
  }, [capturePoseSnapshot, model.skeleton, pushPoseHistory, ui]);

  const handleBoneTransformEdit = useCallback((event: BoneTransformEditEvent) => {
    if (event.owner === 'disabled') return;

    if (event.phase === 'cancel') {
      if (event.owner === 'animation') {
        activeAnimationTransformHistoryRef.current = null;
        ui.setStatus(`Canceled viewport animation transform for ${event.boneName}.`);
        return;
      }

      const active = activePoseTransformHistoryRef.current;
      if (active?.boneName === event.boneName && active.source === event.source) {
        applyPoseSnapshot(active.before);
      }
      activePoseTransformHistoryRef.current = null;
      ui.setStatus(`Canceled ${event.source === 'endpoint-drag' ? 'endpoint drag' : 'transform'} for ${event.boneName}; restored the prior pose.`);
      return;
    }

    if (event.owner === 'animation') {
      if (event.phase === 'start') {
        activeAnimationTransformHistoryRef.current = {
          source: event.source,
          boneName: event.boneName,
          before: cloneAnimationEditState(animationEditStateRef.current),
        };
        return;
      }

      if (event.phase === 'change') return;

      const skeleton = model.skeleton;
      if (!skeleton || baseClipsRef.current.length === 0) {
        activeAnimationTransformHistoryRef.current = null;
        ui.setStatus('Load a skinned animated model before editing keyframes.');
        return;
      }

      const bone = findBoneByName(skeleton, event.boneName);
      if (!bone) {
        activeAnimationTransformHistoryRef.current = null;
        ui.setStatus('Selected item is not an editable animation bone.');
        return;
      }

      const clipName = getCurrentClipKey(baseClipsRef.current, playbackRef.current.currentClipName);
      if (!clipName) {
        activeAnimationTransformHistoryRef.current = null;
        ui.setStatus('No animation clip is active for keyframe editing.');
        return;
      }

      if (getAnimationClipLockedBoneNames(
        animationEditStateRef.current,
        clipName,
        getSourceAnimationLockedBoneNames(clipName),
      ).includes(event.boneName)) {
        activeAnimationTransformHistoryRef.current = null;
        ui.setStatus(`Viewport animation editing is blocked for locked bone ${event.boneName}.`);
        return;
      }

      const active = activeAnimationTransformHistoryRef.current;
      const before = active?.boneName === event.boneName && active.source === event.source
        ? active.before
        : cloneAnimationEditState(animationEditStateRef.current);
      const state = animationEditStateRef.current;
      const key = makeKeyframeFromBone(bone, snapPlaybackTime(playbackRef.current.currentTime), state.interpolation);
      const next = upsertAnimationKeyframe(state, clipName, event.boneName, key);
      const label = `viewport animation keyframe for ${event.boneName} at ${key.time.toFixed(2)}s`;
      const pushed = pushAnimationHistory(label, before, next);
      applyAnimationEditState(next, pushed
        ? `Recorded viewport animation keyframe for ${event.boneName} at ${key.time.toFixed(2)}s.`
        : `Viewport animation keyframe for ${event.boneName} was unchanged.`);
      activeAnimationTransformHistoryRef.current = null;
      return;
    }

    if (event.phase === 'start') {
      activePoseTransformHistoryRef.current = {
        source: event.source,
        boneName: event.boneName,
        before: capturePoseSnapshot([event.boneName]),
      };
      return;
    }

    const hasScale = hasNonIdentityScale(event.scale);
    if (event.phase === 'change') {
      recordPoseBoneEdit(event.boneName, hasScale);
    }

    const shouldWarnUnsupportedScale = sourceFormat === 'smf' && hasScale;
    if (shouldWarnUnsupportedScale) {
      ui.setStatus(UNSUPPORTED_SMF_SCALE_EDIT_MESSAGE);
    }

    if (event.phase === 'end') {
      const active = activePoseTransformHistoryRef.current;
      const before = active?.boneName === event.boneName && active.source === event.source
        ? active.before
        : capturePoseSnapshot([event.boneName]);
      const afterBeforeDirtyCheck = capturePoseSnapshot([event.boneName]);

      if (!samePoseSnapshot(before, afterBeforeDirtyCheck)) {
        recordPoseBoneEdit(event.boneName, hasScale);
      }

      const after = capturePoseSnapshot([event.boneName]);
      const label = `${event.source === 'endpoint-drag' ? 'Endpoint drag' : 'Transform'} ${event.boneName}`;
      const pushed = pushPoseHistory(label, before, after);
      activePoseTransformHistoryRef.current = null;

      if (!shouldWarnUnsupportedScale && pushed) {
        ui.setStatus(`Recorded ${event.source === 'endpoint-drag' ? 'endpoint drag' : 'transform'} pose edit for ${event.boneName}.`);
      }
    }
  }, [
    applyAnimationEditState,
    applyPoseSnapshot,
    capturePoseSnapshot,
    model.skeleton,
    playbackRef,
    pushAnimationHistory,
    snapPlaybackTime,
    pushPoseHistory,
    recordPoseBoneEdit,
    sourceFormat,
    getSourceAnimationLockedBoneNames,
    ui,
  ]);

  const beginSkinPaintStroke = useCallback(() => {
    if (activeSkinStrokeRef.current) return;
    activeSkinStrokeRef.current = {
      beforeState: cloneSkinEditState(skinEditStateRef.current),
      beforeSnapshots: new Map(),
    };
  }, []);

  const endSkinPaintStroke = useCallback(() => {
    const draft = activeSkinStrokeRef.current;
    activeSkinStrokeRef.current = null;
    if (!draft || !model.root) return;

    const before = Array.from(draft.beforeSnapshots.values());
    if (before.length === 0) return;

    const after = before.flatMap((snapshot) => {
      const mesh = collectSkinnedMeshById(model.root, snapshot.meshId);
      const nextSnapshot = mesh ? captureSkinVertexSnapshot(mesh, snapshot.vertexIndex) : null;
      return nextSnapshot ? [nextSnapshot] : [];
    });
    const afterByKey = indexSkinVertexSnapshots(after);

    const changed = before.some((snapshot) => {
      const nextSnapshot = afterByKey.get(getSkinVertexSnapshotKey(snapshot.meshId, snapshot.vertexIndex));
      return !!nextSnapshot && !sameVertexSkinWeights(snapshot.vertex, nextSnapshot.vertex);
    });

    if (!changed || after.length === 0) return;

    const entry: SkinEditHistoryEntry = {
      beforeState: cloneSkinEditState(draft.beforeState),
      afterState: cloneSkinEditState(skinEditStateRef.current),
      before,
      after,
      order: allocateHistoryOrder(),
    };

    appendSkinHistory('undo', entry);
    skinRedoStackRef.current = [];
    refreshSkinHistoryAvailability();
  }, [allocateHistoryOrder, appendSkinHistory, model.root, refreshSkinHistoryAvailability]);

  const undoSkinPaint = useCallback(() => {
    if (activeSkinStrokeRef.current) {
      endSkinPaintStroke();
    }
    const entry = skinUndoStackRef.current.at(-1);
    if (!entry || !model.root) {
      ui.setStatus('No skin edit undo available.');
      return;
    }

    const restored = restoreSkinVertexSnapshots(model.root, entry.before);
    if (restored <= 0) {
      ui.setStatus('Skin edit undo could not find the edited mesh vertices.');
      return;
    }

    skinUndoStackRef.current = skinUndoStackRef.current.slice(0, -1);
    appendSkinHistory('redo', { ...entry, redoOrder: allocateHistoryOrder() });
    commitSkinEditState(cloneSkinEditState(entry.beforeState));
    model.skeleton?.update();
    refreshSkinHistoryAvailability();
    ui.setStatus(`Undid skin edit (${restored} vertices restored).`);
  }, [allocateHistoryOrder, appendSkinHistory, model.root, model.skeleton, ui, endSkinPaintStroke, commitSkinEditState, refreshSkinHistoryAvailability]);

  const redoSkinPaint = useCallback(() => {
    if (activeSkinStrokeRef.current) {
      endSkinPaintStroke();
    }
    const entry = skinRedoStackRef.current.at(-1);
    if (!entry || !model.root) {
      ui.setStatus('No skin edit redo available.');
      return;
    }

    const restored = restoreSkinVertexSnapshots(model.root, entry.after);
    if (restored <= 0) {
      ui.setStatus('Skin edit redo could not find the edited mesh vertices.');
      return;
    }

    skinRedoStackRef.current = skinRedoStackRef.current.slice(0, -1);
    appendSkinHistory('undo', { ...entry, order: allocateHistoryOrder(), redoOrder: undefined });
    commitSkinEditState(cloneSkinEditState(entry.afterState));
    model.skeleton?.update();
    refreshSkinHistoryAvailability();
    ui.setStatus(`Redid skin edit (${restored} vertices restored).`);
  }, [allocateHistoryOrder, appendSkinHistory, model.root, model.skeleton, ui, endSkinPaintStroke, commitSkinEditState, refreshSkinHistoryAvailability]);

  const captureAllSkinSnapshots = useCallback((meshes: THREE.SkinnedMesh[]) => {
    return meshes.flatMap((mesh) => {
      const position = mesh.geometry.getAttribute('position');
      if (!position) return [];
      const snapshots = [];
      for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
        const snapshot = captureSkinVertexSnapshot(mesh, vertexIndex);
        if (snapshot) snapshots.push(snapshot);
      }
      return snapshots;
    });
  }, []);

  const commitSkinBatchEdit = useCallback((
    beforeState: SkinEditState,
    before: NonNullable<ReturnType<typeof captureSkinVertexSnapshot>>[],
    statusLabel: string,
  ) => {
    if (!model.root) return 0;
    const after = before.flatMap((snapshot) => {
      const mesh = collectSkinnedMeshById(model.root, snapshot.meshId);
      const nextSnapshot = mesh ? captureSkinVertexSnapshot(mesh, snapshot.vertexIndex) : null;
      return nextSnapshot ? [nextSnapshot] : [];
    });
    const afterByKey = indexSkinVertexSnapshots(after);

    let nextState = skinEditStateRef.current;
    let changed = 0;
    for (const snapshot of before) {
      const nextSnapshot = afterByKey.get(getSkinVertexSnapshotKey(snapshot.meshId, snapshot.vertexIndex));
      if (nextSnapshot && !sameVertexSkinWeights(snapshot.vertex, nextSnapshot.vertex, 1e-5)) {
        nextState = markSkinEdit(nextState, snapshot.meshId, snapshot.vertexIndex);
        changed += 1;
      }
    }

    if (changed <= 0 || after.length === 0) {
      ui.setStatus(`${statusLabel} kept equivalent skin weights.`);
      return 0;
    }

    commitSkinEditState(nextState);
    const entry: SkinEditHistoryEntry = {
      beforeState: cloneSkinEditState(beforeState),
      afterState: cloneSkinEditState(nextState),
      before,
      after,
      order: allocateHistoryOrder(),
    };
    appendSkinHistory('undo', entry);
    skinRedoStackRef.current = [];
    model.skeleton?.update();
    refreshSkinHistoryAvailability();
    return changed;
  }, [allocateHistoryOrder, appendSkinHistory, commitSkinEditState, model.root, model.skeleton, refreshSkinHistoryAvailability, ui]);

  const normalizeSkinWeights = useCallback(() => {
    if (activeSkinStrokeRef.current) {
      endSkinPaintStroke();
    }
    if (!model.root) {
      ui.setStatus('Load a skinned model before normalizing skin weights.');
      return;
    }

    const meshes = collectSkinnedMeshes(model.root);
    if (meshes.length === 0) {
      ui.setStatus('No skinned meshes are available to normalize.');
      return;
    }

    const beforeState = cloneSkinEditState(skinEditStateRef.current);
    const before = captureAllSkinSnapshots(meshes);
    const summary = meshes.reduce((acc, mesh) => {
      const result = normalizeSkinnedMeshWeights(mesh);
      acc.touchedVertices += result.touchedVertices;
      acc.changedVertices += result.changedVertices;
      return acc;
    }, { touchedVertices: 0, changedVertices: 0 });
    const changed = commitSkinBatchEdit(beforeState, before, 'Normalize skin weights');
    if (changed > 0) {
      ui.setStatus(`Normalized ${changed} skin vertices across ${meshes.length} skinned mesh${meshes.length === 1 ? '' : 'es'}.`);
    } else if (summary.touchedVertices === 0) {
      ui.setStatus('No editable skin vertices were found to normalize.');
    }
  }, [captureAllSkinSnapshots, commitSkinBatchEdit, endSkinPaintStroke, model.root, ui]);

  const autoSkinWeights = useCallback(() => {
    if (activeSkinStrokeRef.current) {
      endSkinPaintStroke();
    }
    const skeleton = model.skeleton;
    if (!model.root || !skeleton) {
      ui.setStatus('Load a skinned model before auto skinning.');
      return;
    }

    const meshes = collectSkinnedMeshes(model.root);
    if (meshes.length === 0) {
      ui.setStatus('No skinned meshes are available to auto skin.');
      return;
    }

    const beforeState = cloneSkinEditState(skinEditStateRef.current);
    const before = captureAllSkinSnapshots(meshes);
    const selectedBoneName = skinEditStateRef.current.selectedBoneName || ui.selected;
    const restrictToBoneIndices = skinAutoWeightAlgorithm === 'selected-branch'
      ? collectBoneBranchIndices(skeleton, selectedBoneName)
      : undefined;
    if (skinAutoWeightAlgorithm === 'selected-branch' && (!restrictToBoneIndices || restrictToBoneIndices.size === 0)) {
      ui.setStatus('Select a bone before using selected branch auto skin.');
      return;
    }
    const autoWeightOptions = resolveSkinAutoWeightOptions({
      algorithm: skinAutoWeightAlgorithm,
      power: skinAutoWeightPower,
      normalWeighting: skinAutoWeightNormalWeighting,
      maxInfluences: skinAutoWeightMaxInfluences,
      restrictToBoneIndices,
    });
    const summary = meshes.reduce((acc, mesh) => {
      const result = autoSkinSkinnedMeshWeights(mesh, skeleton, autoWeightOptions);
      acc.touchedVertices += result.touchedVertices;
      acc.changedVertices += result.changedVertices;
      return acc;
    }, { touchedVertices: 0, changedVertices: 0 });
    const changed = commitSkinBatchEdit(beforeState, before, 'Auto skin');
    if (changed > 0) {
      const optionText = ['segment-inverse-distance', 'segment-distance-normal', 'selected-branch'].includes(autoWeightOptions.algorithm)
        ? `${SKIN_AUTO_WEIGHT_ALGORITHM_LABELS[autoWeightOptions.algorithm]}, power ${autoWeightOptions.power}, normal ${autoWeightOptions.normalWeighting}, max ${autoWeightOptions.maxInfluences}`
        : SKIN_AUTO_WEIGHT_ALGORITHM_LABELS[autoWeightOptions.algorithm];
      ui.setStatus(`Auto skinned ${changed} vertices across ${meshes.length} skinned mesh${meshes.length === 1 ? '' : 'es'} (${optionText}).`);
    } else if (summary.touchedVertices === 0) {
      ui.setStatus('No editable skin vertices were found to auto skin.');
    }
  }, [
    captureAllSkinSnapshots,
    commitSkinBatchEdit,
    endSkinPaintStroke,
    model.root,
    model.skeleton,
    skinAutoWeightAlgorithm,
    skinAutoWeightMaxInfluences,
    skinAutoWeightNormalWeighting,
    skinAutoWeightPower,
    ui,
  ]);

  const applySkinPaint = useCallback((
    paintVertices: Array<{
      meshId: string;
      vertexIndex: number;
      amount: number;
    }>,
  ) => {
    if (!model.root || !model.skeleton) {
      ui.setStatus('Load a skinned model before painting skin weights.');
      return;
    }
    const source = skinEditStateRef.current;
    const mode = skinPaintMode;
    const selectedBoneName = source.selectedBoneName || ui.selected;
    if (mode !== 'smooth' && (!selectedBoneName || selectedBoneName === 'Scene')) {
      ui.setStatus('Select a bone to paint skin weights.');
      return;
    }

    const skeleton = model.skeleton;
    const boneIndex = mode === 'smooth' ? -1 : getBoneIndex(skeleton, selectedBoneName);
    if (mode !== 'smooth' && boneIndex < 0) {
      ui.setStatus('Selected bone is not in current skeleton.');
      return;
    }

    const restrictToBoneIndices = mode === 'auto' && skinAutoWeightAlgorithm === 'selected-branch'
      ? collectBoneBranchIndices(skeleton, selectedBoneName)
      : undefined;
    if (mode === 'auto' && skinAutoWeightAlgorithm === 'selected-branch' && (!restrictToBoneIndices || restrictToBoneIndices.size === 0)) {
      ui.setStatus('Select a bone before using selected branch auto paint.');
      return;
    }
    const autoWeightOptions = mode === 'auto'
      ? resolveSkinAutoWeightOptions({
        algorithm: skinAutoWeightAlgorithm,
        power: skinAutoWeightPower,
        normalWeighting: skinAutoWeightNormalWeighting,
        maxInfluences: skinAutoWeightMaxInfluences,
        restrictToBoneIndices,
      })
      : null;
    const unique = new Map<string, { mesh: string; index: number; amount: number }>();

    for (const paint of paintVertices) {
      if (!Number.isInteger(paint.vertexIndex) || paint.vertexIndex < 0) continue;
      const clampedAmount = clamp01(paint.amount);
      if (clampedAmount <= 0) continue;
      const key = `${paint.meshId}:${paint.vertexIndex}`;
      if (!unique.has(key)) {
        unique.set(key, { mesh: paint.meshId, index: paint.vertexIndex, amount: clampedAmount });
      }
    }

    if (unique.size === 0) {
      ui.setStatus('No editable skin vertices in brush area.');
      return;
    }

    const meshById = new Map(
      collectSkinnedMeshes(model.root).map((mesh) => [mesh.uuid, mesh]),
    );
    const smoothCurrentByKey = new Map<string, VertexSkinWeights>();
    const smoothSourcesByMesh = new Map<string, VertexSkinWeights[]>();
    if (mode === 'smooth') {
      unique.forEach(({ mesh, index }, key) => {
        const meshObj = meshById.get(mesh);
        const attributes = meshObj ? getSkinAttributes(meshObj.geometry) : null;
        const current = attributes ? readVertexSkinWeights(attributes, index) : null;
        if (!current) return;
        smoothCurrentByKey.set(key, current);
        const sources = smoothSourcesByMesh.get(mesh) ?? [];
        sources.push(current);
        smoothSourcesByMesh.set(mesh, sources);
      });
    }
    const smoothTargetByMesh = new Map(
      [...smoothSourcesByMesh].flatMap(([meshId, vertices]) => {
        const target = averageVertexSkinWeights(vertices);
        return target ? [[meshId, target] as const] : [];
      }),
    );

    let changed = 0;
    let touched = 0;
    let nextState = source;
    let implicitStroke = false;
    if (!activeSkinStrokeRef.current) {
      beginSkinPaintStroke();
      implicitStroke = true;
    }
    unique.forEach(({ mesh, index, amount }, key) => {
      const meshObj = meshById.get(mesh);
      if (!meshObj) return;
      const snapshotKey = `${mesh}:${index}`;
      const activeStroke = activeSkinStrokeRef.current;
      if (activeStroke && !activeStroke.beforeSnapshots.has(snapshotKey)) {
        const snapshot = captureSkinVertexSnapshot(meshObj, index);
        if (snapshot) {
          activeStroke.beforeSnapshots.set(snapshotKey, snapshot);
        }
      }
      const smoothCurrent = smoothCurrentByKey.get(key);
      const smoothTarget = smoothTargetByMesh.get(mesh);
      const smoothAttributes = mode === 'smooth' ? getSkinAttributes(meshObj.geometry) : null;
      const smoothNext = smoothCurrent && smoothTarget
        ? blendVertexSkinWeights(smoothCurrent, smoothTarget, amount, 4)
        : null;
      const result = mode === 'smooth'
        ? smoothAttributes && smoothCurrent && smoothNext
          ? {
            ok: true as const,
            vertex: smoothNext,
            slot: 0,
            changed: !sameVertexSkinWeights(smoothCurrent, smoothNext, 1e-5),
          }
          : { ok: false as const, reason: 'invalid-vertex' as const }
        : mode === 'auto' && autoWeightOptions
          ? autoSkinSkinnedMeshVertexWeights(meshObj, skeleton, index, {
            ...autoWeightOptions,
            blendAmount: amount,
          })
          : editVertexBoneWeight(
            meshObj,
            index,
            boneIndex,
            mode,
            amount,
            mode === 'set' ? skinPaintTargetWeight : undefined,
          );
      if (!result.ok) return;
      if (mode === 'smooth' && smoothAttributes && result.changed) {
        writeVertexSkinWeights(smoothAttributes, index, result.vertex);
      }
      touched += 1;
      if (result.changed) {
        nextState = markSkinEdit(nextState, mesh, index);
        changed += 1;
      }
    });

    if (touched > 0) {
      commitSkinEditState(nextState);
      const modeLabel = mode === 'auto'
        ? `auto ${SKIN_AUTO_WEIGHT_ALGORITHM_LABELS[skinAutoWeightAlgorithm]}`
        : mode;
      const targetLabel = mode === 'smooth' ? 'across the brush region' : `on ${selectedBoneName}`;
      if (changed > 0) {
        ui.setStatus(`${mode === 'smooth' ? 'Smoothed' : 'Painted'} ${changed} skin vertices ${targetLabel} (${modeLabel} mode).`);
      } else {
        ui.setStatus(`Paint stroke touched ${touched} vertices ${targetLabel} (${modeLabel} mode) but kept equivalent weights.`);
      }
    } else {
      ui.setStatus('No skin vertices changed during paint stroke.');
    }
    if (implicitStroke) {
      endSkinPaintStroke();
    }
  }, [
    model,
    ui,
    skinPaintMode,
    skinPaintTargetWeight,
    skinAutoWeightAlgorithm,
    skinAutoWeightMaxInfluences,
    skinAutoWeightNormalWeighting,
    skinAutoWeightPower,
    beginSkinPaintStroke,
    endSkinPaintStroke,
    commitSkinEditState,
  ]);

  const onSkinPaintModeChange = useCallback((next: SkinWeightEditMode) => {
    setSkinPaintMode(next);
  }, []);

  const onSkinPaintPoseChange = useCallback((next: SkinPaintPoseMode) => {
    setSkinPaintPose(next);
    ui.setStatus(next === 'live'
      ? 'Skin painting uses Live Animation. Switch to Frozen Current for repeatable brush sampling.'
      : next === 'rest'
        ? 'Skin painting uses Rest / Bind pose coordinates.'
        : 'Skin painting uses a captured Frozen Current pose until the mode changes.');
  }, [ui]);

  const onInspectSkinVertex = useCallback((selection: { meshId: string; vertexIndex: number }) => {
    if (!model.root || !collectSkinnedMeshById(model.root, selection.meshId)) return;
    setSelectedSkinVertex((previous) => (
      previous?.meshId === selection.meshId && previous.vertexIndex === selection.vertexIndex
        ? previous
        : selection
    ));
  }, [model.root]);

  const onSkinPaintTargetModeChange = useCallback((next: 'vertex' | 'triangle') => {
    setSkinPaintTargetMode(next === 'triangle' ? 'triangle' : 'vertex');
  }, []);

  const onSkinPaintRadiusChange = useCallback((next: number) => {
    setSkinPaintRadius(clampPositive(next, 0.01, 4));
  }, []);

  const onSkinPaintStrengthChange = useCallback((next: number) => {
    setSkinPaintStrength(clamp01(next));
  }, []);

  const onSkinPaintTargetWeightChange = useCallback((next: number) => {
    setSkinPaintTargetWeight(clamp01(next));
  }, []);

  const onSkinPaintFalloffChange = useCallback((next: number) => {
    setSkinPaintFalloff(clampPositive(next, 0.1, 4));
  }, []);

  const onSkinAutoWeightAlgorithmChange = useCallback((next: SkinAutoWeightAlgorithm) => {
    setSkinAutoWeightAlgorithm(resolveSkinAutoWeightOptions({ algorithm: next }).algorithm);
  }, []);

  const onSkinAutoWeightPowerChange = useCallback((next: number) => {
    setSkinAutoWeightPower(resolveSkinAutoWeightOptions({ power: next }).power);
  }, []);

  const onSkinAutoWeightNormalWeightingChange = useCallback((next: number) => {
    setSkinAutoWeightNormalWeighting(resolveSkinAutoWeightOptions({ normalWeighting: next }).normalWeighting);
  }, []);

  const onSkinAutoWeightMaxInfluencesChange = useCallback((next: number) => {
    setSkinAutoWeightMaxInfluences(resolveSkinAutoWeightOptions({ maxInfluences: next }).maxInfluences);
  }, []);

  return {
    ui,
    model,
    playback,
    lastSmfDataRef,
    loadModel,
    clearLoadedModel,
    handleOpen,
    loadStaticAppend,
    handleOpenProject,
    handleRecoverProject,
    handleSaveProject,
    handleAutosaveProject,
    pendingReplacement,
    cancelPendingReplacement,
    confirmPendingReplacement,
    handleExport,
    handleExportGlb,
    handleExportFbx,
    handleExportDae,
    handleExportSmf,
    handleRunSmfRoundtripCheck,
    handleSaveSmfDiagnosticReport,
    handleFileInputChange,
    handleDrop,
    beginModelOperation,
    readModelResourceFiles,
    retargetAnimationsFromFiles,
    handleSelectBone,
    renameSelectedBone,
    reparentSelectedBone,
    canPrepareRootSkeleton,
    prepareRootSkeletonForStaticMeshes,
    createChildForSelectedBone,
    createChildForSelectedBoneAtWorld,
    moveRigBoneToWorld,
    rotateRigBoneAroundAxis,
    setSelectedBoneDetached,
    spinRigAroundAxis,
    deleteSelectedBone,
    rigToolMode,
    setRigToolMode: changeRigToolMode,
    rigSnapStep,
    setRigSnapStep: changeRigSnapStep,
    rigIkSettings,
    setRigIkSettings: changeRigIkSettings,
    rigIkLastResult,
    solveRigIkPose,
    rigMetadata,
    onRigMetadataChange,
    saveRigMetadata,
    loadRigMetadata,
    clearRigMetadata,
    bakeRigIk,
    handleBoneTransformEdit,
    onNudgeBone,
    undoEditorHistory,
    redoEditorHistory,
    editorUndoAvailable,
    editorRedoAvailable,
    editorUndoOrder,
    editorRedoOrder,
    setupKeyboard,
    togglePlay,
    changeClip,
    createAnimationFromPose,
    renameCurrentAnimationClip,
    duplicateCurrentAnimationClip,
    deleteCurrentAnimationClip,
    moveCurrentAnimationClipUp,
    moveCurrentAnimationClipDown,
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
    materialTextureSummaries,
    geometryDiagnostics,
    restPoseSnapshot,
    restPoseGhostEnabled,
    setRestPoseGhostEnabled,
    motionTrailsEnabled,
    setMotionTrailsEnabled,
    onionSkinEnabled,
    setOnionSkinEnabled,
    smfRoundtripReport,
    smfCodecActivity,
    sourceFormat,
    skinEditHasDirtyState,
    skinEditBlockReason,
    skinPaintMode,
    skinPaintPose,
    onSkinPaintPoseChange,
    skinPaintTargetMode,
    skinPaintRadius,
    skinPaintStrength,
    skinPaintTargetWeight,
    skinPaintFalloff,
    skinAutoWeightAlgorithm,
    skinAutoWeightPower,
    skinAutoWeightNormalWeighting,
    skinAutoWeightMaxInfluences,
    onSkinPaintModeChange,
    onInspectSkinVertex,
    skinDiagnostics,
    skinSelectedVertexDiagnostic,
    onSkinPaintTargetModeChange,
    onSkinPaintRadiusChange,
    onSkinPaintStrengthChange,
    onSkinPaintTargetWeightChange,
    onSkinPaintFalloffChange,
    onSkinAutoWeightAlgorithmChange,
    onSkinAutoWeightPowerChange,
    onSkinAutoWeightNormalWeightingChange,
    onSkinAutoWeightMaxInfluencesChange,
    applySkinPaint,
    beginSkinPaintStroke,
    endSkinPaintStroke,
    undoSkinPaint,
    redoSkinPaint,
    normalizeSkinWeights,
    autoSkinWeights,
    skinUndoAvailable,
    skinRedoAvailable,
    skinUndoOrder,
    skinRedoOrder,
    poseEditHasDirtyState,
    animationEditHasDirtyState,
    animationSelectedKeyTime: animationEditState.selectedKeyTime,
    animationAuthoredKeyTimes,
    animationClipboardHasKeyframe: !!animationEditState.clipboard,
    animationInterpolation: animationEditState.interpolation,
    animationSnapStep,
    animationScope,
    animationClipMetadata,
    animationLockedBoneNames: animationAuthoring.getAnimationLockedBoneNames(),
    insertAnimationKeyframe,
    insertAnimationKeyframeAtTime,
    updateAnimationKeyframe,
    deleteSelectedAnimationKeyframe,
    copySelectedAnimationKeyframe,
    pasteAnimationKeyframe,
    selectAnimationKeyframeTime,
    moveSelectedAnimationKeyframe,
    changeAnimationInterpolation,
    changeAnimationSnapStep,
    changeAnimationScope,
    changeAnimationClipLoop,
    changeAnimationClipSampleFrameMultiplier,
    changeAnimationClipDuration,
    changeAnimationClipRetime,
    changeAnimationClipTrim,
    toggleAnimationBoneLock,
    viewportLayout: ui.viewportLayout,
    setViewportLayout: ui.setViewportLayout,
    gridEnabled: ui.gridEnabled,
    setGridEnabled: ui.setGridEnabled,
    axesEnabled: ui.axesEnabled,
    setAxesEnabled: ui.setAxesEnabled,
    textureEnabled: ui.textureEnabled,
    setTextureEnabled: ui.setTextureEnabled,
    textureRepeatPreviewEnabled: ui.textureRepeatPreviewEnabled,
    setTextureRepeatPreviewEnabled: ui.setTextureRepeatPreviewEnabled,
    textureFilterPreview: ui.textureFilterPreview,
    setTextureFilterPreview: ui.setTextureFilterPreview,
    boneIndexLabelsEnabled: ui.boneIndexLabelsEnabled,
    setBoneIndexLabelsEnabled: ui.setBoneIndexLabelsEnabled,
    rigOpacity: ui.rigOpacity,
    setRigOpacity: ui.setRigOpacity,
    rigThicknessScale: ui.rigThicknessScale,
    setRigThicknessScale: ui.setRigThicknessScale,
    skinPointOverlayEnabled: ui.skinPointOverlayEnabled,
    setSkinPointOverlayEnabled: ui.setSkinPointOverlayEnabled,
    shaderEnabled: ui.shaderEnabled,
    setShaderEnabled: ui.setShaderEnabled,
    perspectiveEnabled: ui.perspectiveEnabled,
    setPerspectiveEnabled: ui.setPerspectiveEnabled,
    modelOpacity: ui.modelOpacity,
    setModelOpacity: ui.setModelOpacity,
    editorMode: ui.editorMode,
    setEditorMode: ui.setEditorMode,
  };
}
