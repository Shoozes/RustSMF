import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import type * as THREE from 'three';
import type { OpenResult, SmfDesktopInfo, TauriClient } from '../backend-client/tauri';
import { importSMF, buildThreeScene as buildSmfScene, exportSMFToBuffer, loadGLB, loadFBX, loadOBJ, exportGLB, exportFBX, bytesToArrayBuffer, buildImportedSmfFromThree, SmfConversionError, collectSkinnedMeshes, compareSmfRoundtrip, inspectThreeToSmfSource, makeDiagnosticReport } from '../loaders';
import { applyLiveSkinEditsToImportedSmf } from '../loaders/threeToSmf';
import type { ImportedSmf, SmfDiagnosticReport, SmfRoundtripReport } from '../loaders';
import { useUiSlice, useModelSlice, usePlaybackSlice } from '../store';
import {
  type BoneNudgeDelta,
  type PoseEditMap,
  hasPoseEdits,
  hasUnsupportedPoseScaleEdits,
  applyNudgeDelta,
  emptyPoseEdit,
  markPoseBoneEdited,
  clonePoseEditMap,
  applyPoseEditsToSmf,
} from './poseEdits';
import type { BoneTransformEditEvent } from '../components/ThreeViewport';
import { findBoneByName } from '../utils/bonePicker';
import { createSeqGuard } from '../utils/seqGuard';
import { detectModelFormat, supportedModelFormatsLabel, type ModelSourceFormat } from '../utils/modelFormat';
import {
  makeSkinEditState,
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
  resolveSkinAutoWeightOptions,
  SKIN_AUTO_WEIGHT_ALGORITHM_LABELS,
} from '../utils/skinWeights';
import {
  makeEditorHistory,
  popRedo,
  popUndo,
  pushEditorHistory,
  type EditorHistoryState,
} from '../utils/editorHistory';
import {
  applyAnimationEditsToClips,
  applyAnimationEditsToImportedSmf,
  cloneAnimationEditState,
  copyAnimationKeyframe,
  deleteAnimationEditClip,
  deleteAnimationEditBones,
  deleteAnimationKeyframe,
  duplicateAnimationEditClip,
  getClipKey,
  getCurrentClipKey,
  getEditedKeyframe,
  hasDirtyAnimationEdits,
  makeAnimationEditState,
  makeUniqueAnimationClipName,
  makeKeyframeFromBone,
  moveAnimationKeyframe,
  renameAnimationEditClip,
  renameAnimationEditBone,
  sameAnimationEditState,
  selectAnimationKeyframe,
  setAnimationInterpolation,
  upsertAnimationKeyframe,
  type AnimationEditState,
  type AnimationInterpolation,
  type EditableBoneKeyframe,
} from '../utils/animationEdits';
import { createChildBone, deleteBoneBranch, reparentBonePreserveWorldTransform, removeAnimationClipBoneNames, retargetAnimationClipBoneNames, validateBoneRename } from '../utils/rigEdits';

type LoadedModelResult =
  | Awaited<ReturnType<typeof buildSmfScene>>
  | Awaited<ReturnType<typeof loadGLB>>
  | Awaited<ReturnType<typeof loadFBX>>
  | Awaited<ReturnType<typeof loadOBJ>>;

interface KeyboardEditorHistoryHandlers {
  undo?: () => boolean;
  redo?: () => boolean;
}

interface UseLoadModelOptions {
  allocateHistoryOrder?: () => number;
}

let cachedTauriClient: TauriClient | null = null;
const getTauriClient = async (): Promise<TauriClient> => {
  if (cachedTauriClient) return cachedTauriClient;
  const clientMod = await import('../backend-client/tauri');
  const client: TauriClient = {
    openFile: clientMod.openFile,
    saveFile: clientMod.saveFile,
    readBinaryFile: clientMod.readBinaryFile,
    invokeCommand: clientMod.invokeCommand,
    peekSmfHeader: clientMod.peekSmfHeader,
    validateSmf: clientMod.validateSmf,
    peekSmfRigBasic: clientMod.peekSmfRigBasic,
    peekSmfAnimBasic: clientMod.peekSmfAnimBasic,
    peekSmfModelBasic: clientMod.peekSmfModelBasic,
    getSmfDesktopInfo: clientMod.getSmfDesktopInfo,
  };
  cachedTauriClient = client;
  return client;
};

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

const unsupportedSmfScaleEditMessage = 'SMF export does not support scale edits. Reset bone scale or export GLB.';

const clampPositive = (value: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number => {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
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

interface PoseBoneSnapshot {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
}

interface PoseHistorySnapshot {
  selectedBoneName: string;
  poseEdits: PoseEditMap;
  bones: Record<string, PoseBoneSnapshot>;
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

interface AnimationWorkspaceHistorySnapshot {
  baseClips: THREE.AnimationClip[];
  animationEditState: AnimationEditState;
  currentClipName: string;
  currentTime: number;
}

interface RigBoneHistorySnapshot {
  bone: THREE.Bone;
  name: string;
  parent: THREE.Object3D | null;
  parentBone: THREE.Bone | null;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
}

interface RigSkinIndexHistorySnapshot {
  mesh: THREE.SkinnedMesh;
  count: number;
  itemSize: number;
  values: number[];
}

interface RigHistorySnapshot {
  selectedBoneName: string;
  bones: RigBoneHistorySnapshot[];
  boneInverses: THREE.Matrix4[];
  baseClips: THREE.AnimationClip[];
  animationEditState: AnimationEditState;
  poseEdits: PoseEditMap;
  skinEditState: SkinEditState;
  skinIndices: RigSkinIndexHistorySnapshot[];
}

type EditorHistorySnapshot =
  | { kind: 'pose'; value: PoseHistorySnapshot }
  | { kind: 'animation'; value: AnimationEditState }
  | { kind: 'animation-workspace'; value: AnimationWorkspaceHistorySnapshot }
  | { kind: 'rig'; value: RigHistorySnapshot };

const POSE_HISTORY_EPSILON = 1e-6;

const sameNumberArray = (
  left: readonly number[],
  right: readonly number[],
  epsilon = POSE_HISTORY_EPSILON,
): boolean => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => Math.abs(value - right[index]) <= epsilon);
};

const samePoseEditMap = (left: PoseEditMap, right: PoseEditMap): boolean => {
  const names = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const name of names) {
    const leftEdit = left[name] ?? emptyPoseEdit();
    const rightEdit = right[name] ?? emptyPoseEdit();
    if (
      Math.abs(leftEdit.dx - rightEdit.dx) > POSE_HISTORY_EPSILON
      || Math.abs(leftEdit.dy - rightEdit.dy) > POSE_HISTORY_EPSILON
      || Math.abs(leftEdit.dRotZ - rightEdit.dRotZ) > POSE_HISTORY_EPSILON
      || (leftEdit.dirty ?? false) !== (rightEdit.dirty ?? false)
      || (leftEdit.hasScale ?? false) !== (rightEdit.hasScale ?? false)
    ) {
      return false;
    }
  }
  return true;
};

const samePoseSnapshot = (left: PoseHistorySnapshot, right: PoseHistorySnapshot): boolean => {
  if (left.selectedBoneName !== right.selectedBoneName) return false;
  if (!samePoseEditMap(left.poseEdits, right.poseEdits)) return false;

  const names = new Set([...Object.keys(left.bones), ...Object.keys(right.bones)]);
  for (const name of names) {
    const leftBone = left.bones[name];
    const rightBone = right.bones[name];
    if (!leftBone || !rightBone) return false;
    if (
      !sameNumberArray(leftBone.position, rightBone.position)
      || !sameNumberArray(leftBone.quaternion, rightBone.quaternion)
      || !sameNumberArray(leftBone.scale, rightBone.scale)
    ) {
      return false;
    }
  }

  return true;
};

const cloneAnimationClips = (clips: THREE.AnimationClip[]): THREE.AnimationClip[] => clips.map((clip) => clip.clone());

const sameAnimationClip = (left: THREE.AnimationClip, right: THREE.AnimationClip, index: number): boolean => {
  if (getClipKey(left, index) !== getClipKey(right, index)) return false;
  if (Math.abs(left.duration - right.duration) > POSE_HISTORY_EPSILON) return false;
  if (left.tracks.length !== right.tracks.length) return false;

  return left.tracks.every((track, trackIndex) => {
    const other = right.tracks[trackIndex];
    return !!other
      && track.name === other.name
      && sameNumberArray(Array.from(track.times), Array.from(other.times))
      && sameNumberArray(Array.from(track.values), Array.from(other.values));
  });
};

const sameAnimationWorkspaceSnapshot = (
  left: AnimationWorkspaceHistorySnapshot,
  right: AnimationWorkspaceHistorySnapshot,
): boolean => {
  if (left.currentClipName !== right.currentClipName) return false;
  if (Math.abs(left.currentTime - right.currentTime) > POSE_HISTORY_EPSILON) return false;
  if (!sameAnimationEditState(left.animationEditState, right.animationEditState)) return false;
  if (left.baseClips.length !== right.baseClips.length) return false;
  return left.baseClips.every((clip, index) => sameAnimationClip(clip, right.baseClips[index], index));
};

const cloneAnimationWorkspaceSnapshot = (
  snapshot: AnimationWorkspaceHistorySnapshot,
): AnimationWorkspaceHistorySnapshot => ({
  baseClips: cloneAnimationClips(snapshot.baseClips),
  animationEditState: cloneAnimationEditState(snapshot.animationEditState),
  currentClipName: snapshot.currentClipName,
  currentTime: snapshot.currentTime,
});

const getAttributeComponent = (
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertexIndex: number,
  slot: number,
): number => {
  if (slot === 0) return attribute.getX(vertexIndex);
  if (slot === 1) return attribute.getY(vertexIndex);
  if (slot === 2) return attribute.getZ(vertexIndex);
  return attribute.getW(vertexIndex);
};

const setAttributeComponent = (
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertexIndex: number,
  slot: number,
  value: number,
): void => {
  if (slot === 0) attribute.setX(vertexIndex, value);
  else if (slot === 1) attribute.setY(vertexIndex, value);
  else if (slot === 2) attribute.setZ(vertexIndex, value);
  else attribute.setW(vertexIndex, value);
};

const captureRigSkinIndexSnapshots = (root: THREE.Object3D | null): RigSkinIndexHistorySnapshot[] => {
  if (!root) return [];

  return collectSkinnedMeshes(root).flatMap((mesh) => {
    const attribute = mesh.geometry.getAttribute('skinIndex');
    if (!attribute) return [];

    const itemSize = Math.min(attribute.itemSize, 4);
    const values: number[] = [];
    for (let vertexIndex = 0; vertexIndex < attribute.count; vertexIndex += 1) {
      for (let slot = 0; slot < itemSize; slot += 1) {
        values.push(getAttributeComponent(attribute, vertexIndex, slot));
      }
    }

    return [{ mesh, count: attribute.count, itemSize, values }];
  });
};

const restoreRigSkinIndexSnapshots = (snapshots: RigSkinIndexHistorySnapshot[]): void => {
  for (const snapshot of snapshots) {
    const attribute = snapshot.mesh.geometry.getAttribute('skinIndex');
    if (!attribute) continue;

    const count = Math.min(attribute.count, snapshot.count);
    const itemSize = Math.min(attribute.itemSize, snapshot.itemSize, 4);
    for (let vertexIndex = 0; vertexIndex < count; vertexIndex += 1) {
      for (let slot = 0; slot < itemSize; slot += 1) {
        const value = snapshot.values[(vertexIndex * snapshot.itemSize) + slot];
        if (Number.isFinite(value)) {
          setAttributeComponent(attribute, vertexIndex, slot, value);
        }
      }
    }
    attribute.needsUpdate = true;
  }
};

const setRigSnapshotSelection = (
  snapshot: RigHistorySnapshot | null,
  selectedBoneName: string,
): RigHistorySnapshot | null => {
  if (snapshot) {
    snapshot.selectedBoneName = selectedBoneName;
    snapshot.skinEditState = {
      ...snapshot.skinEditState,
      selectedBoneName: selectedBoneName && selectedBoneName !== 'Scene' ? selectedBoneName : '',
    };
  }
  return snapshot;
};

const getBoneIndex = (skeleton: THREE.Skeleton | null, boneName: string): number => {
  if (!skeleton || !boneName) return -1;
  const index = skeleton.bones.findIndex((bone) => bone.name === boneName);
  return index;
};

const getBoneBranchIndices = (skeleton: THREE.Skeleton, boneName: string): Set<number> => {
  const root = skeleton.bones.find((bone) => bone.name === boneName);
  if (!root) return new Set();
  const branch = new Set<number>();
  const visit = (bone: THREE.Bone): void => {
    const index = skeleton.bones.indexOf(bone);
    if (index >= 0) branch.add(index);
    bone.children.forEach((child) => {
      if ((child as THREE.Bone).isBone === true) {
        visit(child as THREE.Bone);
      }
    });
  };
  visit(root);
  return branch;
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
  const [editorUndoAvailable, setEditorUndoAvailable] = useState(false);
  const [editorRedoAvailable, setEditorRedoAvailable] = useState(false);
  const [editorUndoOrder, setEditorUndoOrder] = useState(0);
  const [editorRedoOrder, setEditorRedoOrder] = useState(0);
  const baseClipsRef = useRef<THREE.AnimationClip[]>([]);
  const [animationEditState, setAnimationEditState] = useState<AnimationEditState>(() => makeAnimationEditState());
  const animationEditStateRef = useRef<AnimationEditState>(animationEditState);

  // Selected-bone weight preview toggle.
  const [showWeightPreview, setShowWeightPreview] = useState(false);

  // Transform mode for the gizmo; Inspector buttons select translate/rotate/scale.
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');

  // Bone labels toggle (3D name sprites in viewport for debug/selection aid). Off by default for perf.
  const [showBoneLabels, setShowBoneLabels] = useState(false);
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
  const [skinPaintTargetMode, setSkinPaintTargetMode] = useState<'vertex' | 'triangle'>('vertex');
  const [skinPaintRadius, setSkinPaintRadius] = useState(0.2);
  const [skinPaintStrength, setSkinPaintStrength] = useState(0.2);
  const [skinPaintTarget, setSkinPaintTarget] = useState(1);
  const [skinAutoWeightAlgorithm, setSkinAutoWeightAlgorithm] = useState<SkinAutoWeightAlgorithm>('segment-inverse-distance');
  const [skinAutoWeightPower, setSkinAutoWeightPower] = useState(2);
  const [skinAutoWeightNormalWeighting, setSkinAutoWeightNormalWeighting] = useState(0);
  const [skinAutoWeightMaxInfluences, setSkinAutoWeightMaxInfluences] = useState(4);

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

  useEffect(() => {
    skinEditStateRef.current = skinEditState;
  }, [skinEditState]);

  useEffect(() => {
    animationEditStateRef.current = animationEditState;
  }, [animationEditState]);

  const skinEditHasDirtyState = useMemo(() => hasDirtySkinEdits(skinEditState), [skinEditState]);
  const skinEditBlockReason = useMemo(() => getDirtySkinExportBlockReason(skinEditState), [skinEditState]);
  const animationEditHasDirtyState = useMemo(() => hasDirtyAnimationEdits(animationEditState), [animationEditState]);

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
    } catch (e: unknown) {
      if (!isCurrentExport()) return;
      const msg = errorMessage(e);
      ui.setErrorMsg(`${actionLabel} error: ${msg}`);
      ui.setStatus(`${actionLabel} error: ${msg}`);
    } finally {
      if (!isCurrentExport()) return;
      isExportingRef.current = false;
      ui.setIsLoading(false);
    }
  }, [ui]);

  const refreshSkinHistoryAvailability = useCallback(() => {
    setSkinUndoAvailable(skinUndoStackRef.current.length > 0);
    setSkinRedoAvailable(skinRedoStackRef.current.length > 0);
    setSkinUndoOrder(skinUndoStackRef.current.at(-1)?.order ?? 0);
    setSkinRedoOrder(skinRedoStackRef.current.at(-1)?.redoOrder ?? 0);
  }, []);

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
    refreshEditorHistoryAvailability();
  }, [refreshEditorHistoryAvailability]);

  const captureRigSnapshot = useCallback((): RigHistorySnapshot | null => {
    const skeleton = model.skeleton;
    if (!skeleton || !model.root) return null;

    return {
      selectedBoneName: ui.selected,
      bones: skeleton.bones.map((bone) => ({
        bone,
        name: bone.name,
        parent: bone.parent,
        parentBone: bone.parent && (bone.parent as THREE.Bone).isBone === true
          ? bone.parent as THREE.Bone
          : null,
        position: [bone.position.x, bone.position.y, bone.position.z],
        quaternion: [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w],
        scale: [bone.scale.x, bone.scale.y, bone.scale.z],
      })),
      boneInverses: skeleton.boneInverses.map((inverse) => inverse.clone()),
      baseClips: cloneAnimationClips(baseClipsRef.current),
      animationEditState: cloneAnimationEditState(animationEditStateRef.current),
      poseEdits: clonePoseEditMap(poseEditsRef.current),
      skinEditState: cloneSkinEditState(skinEditStateRef.current),
      skinIndices: captureRigSkinIndexSnapshots(model.root),
    };
  }, [model.root, model.skeleton, ui.selected]);

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
    for (const bone of [...skeleton.bones]) {
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
      bone.updateMatrix();
    }

    for (const boneSnapshot of snapshot.bones) {
      const desiredParent = boneSnapshot.parentBone ?? boneSnapshot.parent ?? root;
      if (boneSnapshot.bone.parent !== desiredParent) {
        desiredParent.add(boneSnapshot.bone);
      }
    }

    root.updateMatrixWorld(true);
    skeleton.bones = snapshot.bones.map((boneSnapshot) => boneSnapshot.bone);
    skeleton.boneInverses = snapshot.boneInverses.map((inverse) => inverse.clone());
    skeleton.init();
    skeleton.update();
    restoreRigSkinIndexSnapshots(snapshot.skinIndices);

    baseClipsRef.current = cloneAnimationClips(snapshot.baseClips);
    commitAnimationEditState(snapshot.animationEditState);
    poseEditsRef.current = clonePoseEditMap(snapshot.poseEdits);
    setPoseEditHasDirtyState(hasPoseEdits(poseEditsRef.current));
    commitSkinEditState(cloneSkinEditState(snapshot.skinEditState));
    ui.setSelected(snapshot.selectedBoneName || 'Scene');
    return true;
  }, [commitAnimationEditState, commitSkinEditState, model.root, model.skeleton, ui]);

  const applyAnimationWorkspaceSnapshot = useCallback((snapshot: AnimationWorkspaceHistorySnapshot): boolean => {
    baseClipsRef.current = cloneAnimationClips(snapshot.baseClips);
    commitAnimationEditState(snapshot.animationEditState);
    const editedClips = applyAnimationEditsToClips(baseClipsRef.current, snapshot.animationEditState);
    const activeClipName = getCurrentClipKey(editedClips, snapshot.currentClipName);
    const activeClip = editedClips.find((clip, index) => getClipKey(clip, index) === activeClipName) ?? editedClips[0];
    if (!activeClip) return false;

    const nextTime = Math.max(0, Math.min(snapshot.currentTime, activeClip.duration || 0));
    playbackRef.current.setCurrentClipName(activeClipName);
    playbackRef.current.setDuration(activeClip.duration);
    playbackRef.current.setCurrentTime(nextTime);
    return true;
  }, [commitAnimationEditState, playbackRef]);

  const pushPoseHistory = useCallback((
    label: string,
    before: PoseHistorySnapshot,
    after: PoseHistorySnapshot,
  ) => {
    if (samePoseSnapshot(before, after)) return false;

    editorHistoryRef.current = pushEditorHistory(editorHistoryRef.current, {
      id: `pose-${editorHistoryIdRef.current += 1}`,
      label,
      domain: 'pose',
      before: { kind: 'pose', value: before },
      after: { kind: 'pose', value: after },
      order: allocateHistoryOrder(),
    });
    refreshEditorHistoryAvailability();
    return true;
  }, [allocateHistoryOrder, refreshEditorHistoryAvailability]);

  const pushRigHistory = useCallback((
    label: string,
    before: RigHistorySnapshot | null,
    after: RigHistorySnapshot | null,
  ) => {
    if (!before || !after) return false;

    editorHistoryRef.current = pushEditorHistory(editorHistoryRef.current, {
      id: `rig-${editorHistoryIdRef.current += 1}`,
      label,
      domain: 'rig',
      before: { kind: 'rig', value: before },
      after: { kind: 'rig', value: after },
      order: allocateHistoryOrder(),
    });
    refreshEditorHistoryAvailability();
    return true;
  }, [allocateHistoryOrder, refreshEditorHistoryAvailability]);

  const pushAnimationHistory = useCallback((
    label: string,
    before: AnimationEditState,
    after: AnimationEditState,
  ) => {
    if (sameAnimationEditState(before, after)) return false;

    editorHistoryRef.current = pushEditorHistory(editorHistoryRef.current, {
      id: `animation-${editorHistoryIdRef.current += 1}`,
      label,
      domain: 'animation',
      before: { kind: 'animation', value: cloneAnimationEditState(before) },
      after: { kind: 'animation', value: cloneAnimationEditState(after) },
      order: allocateHistoryOrder(),
    });
    refreshEditorHistoryAvailability();
    return true;
  }, [allocateHistoryOrder, refreshEditorHistoryAvailability]);

  const pushAnimationWorkspaceHistory = useCallback((
    label: string,
    before: AnimationWorkspaceHistorySnapshot,
    after: AnimationWorkspaceHistorySnapshot,
  ) => {
    if (sameAnimationWorkspaceSnapshot(before, after)) return false;

    editorHistoryRef.current = pushEditorHistory(editorHistoryRef.current, {
      id: `animation-workspace-${editorHistoryIdRef.current += 1}`,
      label,
      domain: 'animation',
      before: { kind: 'animation-workspace', value: cloneAnimationWorkspaceSnapshot(before) },
      after: { kind: 'animation-workspace', value: cloneAnimationWorkspaceSnapshot(after) },
      order: allocateHistoryOrder(),
    });
    refreshEditorHistoryAvailability();
    return true;
  }, [allocateHistoryOrder, refreshEditorHistoryAvailability]);

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
    } else {
      ui.setStatus(`Undo skipped: ${result.entry.domain} history payload is invalid.`);
      return;
    }

    ui.setStatus(`Undid ${result.entry.label}.`);
  }, [allocateHistoryOrder, applyAnimationWorkspaceSnapshot, applyPoseSnapshot, applyRigSnapshot, commitAnimationEditState, refreshEditorHistoryAvailability, ui]);

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
    } else {
      ui.setStatus(`Redo skipped: ${result.entry.domain} history payload is invalid.`);
      return;
    }

    ui.setStatus(`Redid ${result.entry.label}.`);
  }, [allocateHistoryOrder, applyAnimationWorkspaceSnapshot, applyPoseSnapshot, applyRigSnapshot, commitAnimationEditState, refreshEditorHistoryAvailability, ui]);

  const clearLoadedModel = useCallback(() => {
    lastSmfDataRef.current = null;
    lastSourceFormatRef.current = '';
    baseClipsRef.current = [];
    setSourceFormat('');
    commitSkinEditState(makeSkinEditState('', ''));
    clearSkinHistory();
    clearEditorHistory();
    const emptyAnimationState = makeAnimationEditState();
    setAnimationEditState(emptyAnimationState);
    animationEditStateRef.current = emptyAnimationState;
    poseEditsRef.current = {};
    setPoseEditHasDirtyState(false);
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
      commitSkinEditState(makeSkinEditState('', detectedSourceFormat));

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
        if (!tauri) {
          throw new Error('Tauri client unavailable for binary desktop read.');
        }
        data = await tauri.readBinaryFile(res.path);
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

      baseClipsRef.current = availableClips;
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

    } catch (e: unknown) {
      if (!isCurrentLoad()) return;
      const msg = errorMessage(e);
      if (!msg.startsWith('Unsupported model format.')) {
        console.error(e);
      }
      ui.setErrorMsg(`Load error: ${msg}`);
      ui.setStatus(`Load error: ${msg}. Try ${supportedModelFormatsLabel()} from docs/references/old-src/datafiles/SMF/.`);
    } finally {
      if (isCurrentLoad()) ui.setIsLoading(false);
    }
  }, [ui, model, playbackRef, clearLoadedModel, formatSmfDesktopInfo, commitSkinEditState]);

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
    } catch (e: unknown) {
      if (!openSeqGuard.isCurrent(openSeq)) return;
      const msg = errorMessage(e);
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
          if (hasUnsupportedPoseScaleEdits(poseEditsRef.current)) {
            ui.setStatus(unsupportedSmfScaleEditMessage);
            ui.setErrorMsg(`SMF export blocked: ${unsupportedSmfScaleEditMessage}`);
            return;
          }
          ui.setStatus('Exporting as SMF (fidelity path using imported data + coord transforms + live pose edits)...');
          const skeleton = model.skeleton;
          let dataToExport = skeleton
            ? applyPoseEditsToSmf(smfData, poseEditsRef.current, skeleton)
            : smfData;
          dataToExport = applyAnimationEditsToImportedSmf(
            dataToExport,
            model.clips,
            animationEditStateRef.current,
          );
          if (model.root) {
            dataToExport = applyLiveSkinEditsToImportedSmf(dataToExport, collectSkinnedMeshes(model.root));
          }

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
          ui.setStatus('Exporting FBX-loaded model to binary .fbx...');
          try {
            const buf = await exportFBX(rootToExport, model.clips);
            const ok = await (await getTauriClient()).saveFile(buf, 'exported_model.fbx');
            if (!ok) {
              ui.setStatus('Export canceled.');
              return;
            }
            ui.setStatus('Exported .fbx (binary FBX 7500). Re-import to verify fidelity.');
            return;
          } catch (e: unknown) {
            ui.setStatus(`FBX export error: ${errorMessage(e)}. Falling back to generic GLB...`);
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
      } catch (e: unknown) {
        const msg = errorMessage(e);
        ui.setErrorMsg(`Export error: ${msg}`);
        ui.setStatus(`Export error: ${msg}`);
      }
    });
  }, [ui, model, withExportBusy]);

  const buildCurrentSmfExportCandidate = useCallback((): ImportedSmf | null => {
    const smfData = lastSmfDataRef.current;
    const skeleton = model.skeleton;

    if (hasUnsupportedPoseScaleEdits(poseEditsRef.current)) {
      throw new SmfConversionError(unsupportedSmfScaleEditMessage);
    }

    if (smfData) {
      let dataToExport = skeleton
        ? applyPoseEditsToSmf(smfData, poseEditsRef.current, skeleton)
        : smfData;
      dataToExport = applyAnimationEditsToImportedSmf(
        dataToExport,
        model.clips,
        animationEditStateRef.current,
      );
      if (model.root) {
        dataToExport = applyLiveSkinEditsToImportedSmf(dataToExport, collectSkinnedMeshes(model.root));
      }
      return dataToExport;
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
      } catch (e: unknown) {
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
      } catch (e: unknown) {
        const msg = errorMessage(e);
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
          if (hasUnsupportedPoseScaleEdits(poseEditsRef.current)) {
            ui.setStatus(unsupportedSmfScaleEditMessage);
            ui.setErrorMsg(`SMF export blocked: ${unsupportedSmfScaleEditMessage}`);
            return;
          }
          ui.setStatus('Exporting as SMF (fidelity path using imported data + coord transforms + live pose edits)...');
          let dataToExport = skeleton
            ? applyPoseEditsToSmf(smfData, poseEditsRef.current, skeleton)
            : smfData;
          dataToExport = applyAnimationEditsToImportedSmf(
            dataToExport,
            model.clips,
            animationEditStateRef.current,
          );
          if (rootToExport) {
            dataToExport = applyLiveSkinEditsToImportedSmf(dataToExport, collectSkinnedMeshes(rootToExport));
          }
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
      } catch (e: unknown) {
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
    } catch (err: unknown) {
      if (!fileReadSeqGuard.isCurrent(readSeq)) return;
      const m = errorMessage(err);
      ui.setErrorMsg(`File load error: ${m}`);
      ui.setStatus(`File load error: ${m}`);
    } finally {
      (e.target as HTMLInputElement).value = '';
    }
  }, [ui, loadModel]);

  // Keyboard handler (can be used in useEffect in App or moved)
  const setupKeyboard = useCallback((historyHandlers: KeyboardEditorHistoryHandlers = {}) => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
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
      ui.setStatus(unsupportedSmfScaleEditMessage);
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

  const renameCurrentAnimationClip = useCallback((requestedName: string) => {
    const clips = baseClipsRef.current;
    if (clips.length === 0) {
      ui.setStatus('Load an animated model before renaming clips.');
      return;
    }

    const currentClipName = getCurrentClipKey(clips, playbackRef.current.currentClipName);
    const clipIndex = clips.findIndex((clip, index) => getClipKey(clip, index) === currentClipName);
    if (clipIndex < 0) {
      ui.setStatus('No animation clip is active for rename.');
      return;
    }

    const nextName = makeUniqueAnimationClipName(clips, requestedName, currentClipName);
    if (nextName === currentClipName) {
      ui.setStatus('Animation clip name is unchanged.');
      return;
    }

    const before = captureAnimationWorkspaceSnapshot();
    const nextBaseClips = cloneAnimationClips(clips);
    nextBaseClips[clipIndex].name = nextName;
    const nextAnimationState = renameAnimationEditClip(animationEditStateRef.current, currentClipName, nextName);
    const after: AnimationWorkspaceHistorySnapshot = {
      baseClips: nextBaseClips,
      animationEditState: nextAnimationState,
      currentClipName: nextName,
      currentTime: playbackRef.current.currentTime,
    };
    pushAnimationWorkspaceHistory(`rename animation clip ${currentClipName} to ${nextName}`, before, after);
    applyAnimationWorkspaceSnapshot(after);
    ui.setStatus(`Renamed animation clip ${currentClipName} to ${nextName}.`);
  }, [applyAnimationWorkspaceSnapshot, captureAnimationWorkspaceSnapshot, playbackRef, pushAnimationWorkspaceHistory, ui]);

  const duplicateCurrentAnimationClip = useCallback(() => {
    const clips = baseClipsRef.current;
    if (clips.length === 0) {
      ui.setStatus('Load an animated model before duplicating clips.');
      return;
    }

    const currentClipName = getCurrentClipKey(clips, playbackRef.current.currentClipName);
    const clipIndex = clips.findIndex((clip, index) => getClipKey(clip, index) === currentClipName);
    const sourceClip = clips[clipIndex];
    if (!sourceClip) {
      ui.setStatus('No animation clip is active for duplicate.');
      return;
    }

    const nextName = makeUniqueAnimationClipName(clips, `${currentClipName} Copy`);
    const before = captureAnimationWorkspaceSnapshot();
    const duplicatedClip = sourceClip.clone();
    duplicatedClip.name = nextName;
    const nextBaseClips = cloneAnimationClips(clips);
    nextBaseClips.splice(clipIndex + 1, 0, duplicatedClip);
    const nextAnimationState = duplicateAnimationEditClip(animationEditStateRef.current, currentClipName, nextName);
    const after: AnimationWorkspaceHistorySnapshot = {
      baseClips: nextBaseClips,
      animationEditState: nextAnimationState,
      currentClipName: nextName,
      currentTime: playbackRef.current.currentTime,
    };
    pushAnimationWorkspaceHistory(`duplicate animation clip ${currentClipName}`, before, after);
    applyAnimationWorkspaceSnapshot(after);
    ui.setStatus(`Duplicated animation clip ${currentClipName} as ${nextName}.`);
  }, [applyAnimationWorkspaceSnapshot, captureAnimationWorkspaceSnapshot, playbackRef, pushAnimationWorkspaceHistory, ui]);

  const deleteCurrentAnimationClip = useCallback(() => {
    const clips = baseClipsRef.current;
    if (clips.length === 0) {
      ui.setStatus('Load an animated model before deleting clips.');
      return;
    }
    if (clips.length === 1) {
      ui.setStatus('Cannot delete the last animation clip.');
      return;
    }

    const currentClipName = getCurrentClipKey(clips, playbackRef.current.currentClipName);
    const clipIndex = clips.findIndex((clip, index) => getClipKey(clip, index) === currentClipName);
    if (clipIndex < 0) {
      ui.setStatus('No animation clip is active for delete.');
      return;
    }

    const before = captureAnimationWorkspaceSnapshot();
    const nextBaseClips = cloneAnimationClips(clips);
    nextBaseClips.splice(clipIndex, 1);
    const fallbackIndex = Math.min(clipIndex, nextBaseClips.length - 1);
    const fallbackClipName = getClipKey(nextBaseClips[fallbackIndex], fallbackIndex);
    const nextAnimationState = deleteAnimationEditClip(animationEditStateRef.current, currentClipName);
    const after: AnimationWorkspaceHistorySnapshot = {
      baseClips: nextBaseClips,
      animationEditState: nextAnimationState,
      currentClipName: fallbackClipName,
      currentTime: playbackRef.current.currentTime,
    };
    pushAnimationWorkspaceHistory(`delete animation clip ${currentClipName}`, before, after);
    applyAnimationWorkspaceSnapshot(after);
    ui.setStatus(`Deleted animation clip ${currentClipName}.`);
  }, [applyAnimationWorkspaceSnapshot, captureAnimationWorkspaceSnapshot, playbackRef, pushAnimationWorkspaceHistory, ui]);

  const clampPlaybackTime = useCallback((t: number) => (
    Math.max(0, Math.min(t, playbackRef.current.duration || 0))
  ), [playbackRef]);

  const onScrub = useCallback((t: number) => {
    playbackRef.current.scrub(clampPlaybackTime(t));
  }, [clampPlaybackTime, playbackRef]);

  const setSpeed = useCallback((s: number) => {
    playback.setPlaybackSpeed(s);
  }, [playback]);

  const getActiveAnimationEditContext = useCallback((): {
    clipName: string;
    boneName: string;
    bone: THREE.Bone;
  } | null => {
    const skeleton = model.skeleton;
    if (!skeleton || baseClipsRef.current.length === 0) {
      ui.setStatus('Load a skinned animated model before editing keyframes.');
      return null;
    }
    const boneName = ui.selected;
    if (!boneName || boneName === 'Scene') {
      ui.setStatus('Select a bone before editing keyframes.');
      return null;
    }
    const bone = findBoneByName(skeleton, boneName);
    if (!bone) {
      ui.setStatus('Selected item is not an editable animation bone.');
      return null;
    }
    const clipName = getCurrentClipKey(baseClipsRef.current, playbackRef.current.currentClipName);
    if (!clipName) {
      ui.setStatus('No animation clip is active for keyframe editing.');
      return null;
    }
    return { clipName, boneName, bone };
  }, [model.skeleton, playbackRef, ui]);

  const applyAnimationEditState = useCallback((next: AnimationEditState, status?: string) => {
    commitAnimationEditState(next);
    if (status) {
      ui.setStatus(status);
    }
  }, [commitAnimationEditState, ui]);

  const insertAnimationKeyframeAtTime = useCallback((time: number) => {
    const context = getActiveAnimationEditContext();
    if (!context) return;
    const state = animationEditStateRef.current;
    const before = cloneAnimationEditState(state);
    const keyTime = clampPlaybackTime(time);
    const key = makeKeyframeFromBone(
      context.bone,
      keyTime,
      state.interpolation,
    );
    const next = upsertAnimationKeyframe(state, context.clipName, context.boneName, key);
    pushAnimationHistory(
      `insert animation keyframe for ${context.boneName} at ${key.time.toFixed(2)}s`,
      before,
      next,
    );
    playbackRef.current.scrub(keyTime);
    applyAnimationEditState(next, `Inserted animation keyframe for ${context.boneName} at ${key.time.toFixed(2)}s.`);
  }, [applyAnimationEditState, clampPlaybackTime, getActiveAnimationEditContext, playbackRef, pushAnimationHistory]);

  const insertAnimationKeyframe = useCallback(() => {
    insertAnimationKeyframeAtTime(playbackRef.current.currentTime);
  }, [insertAnimationKeyframeAtTime, playbackRef]);

  const updateAnimationKeyframe = useCallback(() => {
    const context = getActiveAnimationEditContext();
    if (!context) return;
    const state = animationEditStateRef.current;
    const before = cloneAnimationEditState(state);
    const time = state.selectedKeyTime ?? playbackRef.current.currentTime;
    const key = makeKeyframeFromBone(context.bone, time, state.interpolation);
    const next = upsertAnimationKeyframe(state, context.clipName, context.boneName, key);
    pushAnimationHistory(
      `update animation keyframe for ${context.boneName} at ${key.time.toFixed(2)}s`,
      before,
      next,
    );
    applyAnimationEditState(next, `Updated animation keyframe for ${context.boneName} at ${key.time.toFixed(2)}s.`);
  }, [applyAnimationEditState, getActiveAnimationEditContext, playbackRef, pushAnimationHistory]);

  const deleteSelectedAnimationKeyframe = useCallback(() => {
    const context = getActiveAnimationEditContext();
    if (!context) return;
    const state = animationEditStateRef.current;
    const before = cloneAnimationEditState(state);
    const time = state.selectedKeyTime ?? playbackRef.current.currentTime;
    const next = deleteAnimationKeyframe(state, context.clipName, context.boneName, time);
    pushAnimationHistory(
      `delete animation keyframe for ${context.boneName} near ${time.toFixed(2)}s`,
      before,
      next,
    );
    applyAnimationEditState(next, `Deleted animation keyframe for ${context.boneName} near ${time.toFixed(2)}s.`);
  }, [applyAnimationEditState, getActiveAnimationEditContext, playbackRef, pushAnimationHistory]);

  const copySelectedAnimationKeyframe = useCallback(() => {
    const context = getActiveAnimationEditContext();
    if (!context) return;
    const state = animationEditStateRef.current;
    const time = state.selectedKeyTime ?? playbackRef.current.currentTime;
    const edited = getEditedKeyframe(state, context.clipName, context.boneName, time);
    const key: EditableBoneKeyframe = edited ?? makeKeyframeFromBone(context.bone, time, state.interpolation);
    const next = copyAnimationKeyframe(state, key);
    animationEditStateRef.current = next;
    setAnimationEditState(next);
    ui.setStatus(`Copied animation keyframe for ${context.boneName} at ${key.time.toFixed(2)}s.`);
  }, [getActiveAnimationEditContext, playbackRef, ui]);

  const pasteAnimationKeyframe = useCallback(() => {
    const context = getActiveAnimationEditContext();
    if (!context) return;
    const state = animationEditStateRef.current;
    if (!state.clipboard) {
      ui.setStatus('No copied animation keyframe to paste.');
      return;
    }
    const before = cloneAnimationEditState(state);
    const time = playbackRef.current.currentTime;
    const key: EditableBoneKeyframe = {
      ...state.clipboard,
      time,
    };
    const next = upsertAnimationKeyframe(state, context.clipName, context.boneName, key);
    pushAnimationHistory(
      `paste animation keyframe for ${context.boneName} at ${key.time.toFixed(2)}s`,
      before,
      next,
    );
    applyAnimationEditState(next, `Pasted animation keyframe for ${context.boneName} at ${key.time.toFixed(2)}s.`);
  }, [applyAnimationEditState, getActiveAnimationEditContext, playbackRef, pushAnimationHistory, ui]);

  const selectAnimationKeyframeTime = useCallback((time: number | null) => {
    const next = selectAnimationKeyframe(animationEditStateRef.current, time);
    animationEditStateRef.current = next;
    setAnimationEditState(next);
  }, []);

  const moveSelectedAnimationKeyframe = useCallback((fromTime: number, toTime: number) => {
    const context = getActiveAnimationEditContext();
    if (!context) return;
    const state = animationEditStateRef.current;
    const source = getEditedKeyframe(state, context.clipName, context.boneName, fromTime);
    if (!source) {
      ui.setStatus('Only authored animation keyframes can be dragged. Insert or update a keyframe first.');
      return;
    }

    const before = cloneAnimationEditState(state);
    const nextTime = clampPlaybackTime(toTime);
    const next = moveAnimationKeyframe(state, context.clipName, context.boneName, fromTime, nextTime);
    const moved = pushAnimationHistory(
      `move animation keyframe for ${context.boneName} to ${nextTime.toFixed(2)}s`,
      before,
      next,
    );
    if (!moved) {
      playbackRef.current.scrub(nextTime);
      return;
    }

    playbackRef.current.scrub(nextTime);
    applyAnimationEditState(next, `Moved animation keyframe for ${context.boneName} to ${nextTime.toFixed(2)}s.`);
  }, [
    applyAnimationEditState,
    clampPlaybackTime,
    getActiveAnimationEditContext,
    playbackRef,
    pushAnimationHistory,
    ui,
  ]);

  const changeAnimationInterpolation = useCallback((interpolation: AnimationInterpolation) => {
    const context = getActiveAnimationEditContext();
    const before = cloneAnimationEditState(animationEditStateRef.current);
    const next = context
      ? setAnimationInterpolation(animationEditStateRef.current, interpolation, context.clipName, context.boneName)
      : setAnimationInterpolation(animationEditStateRef.current, interpolation);
    pushAnimationHistory(
      `set animation interpolation to ${interpolation}`,
      before,
      next,
    );
    applyAnimationEditState(next, `Animation interpolation set to ${interpolation}.`);
  }, [applyAnimationEditState, getActiveAnimationEditContext, pushAnimationHistory]);

  const animationAuthoredKeyTimes = useMemo(() => {
    const boneName = ui.selected;
    if (!boneName || boneName === 'Scene') return [];
    const clipName = getCurrentClipKey(baseClipsRef.current, playback.currentClipName);
    if (!clipName) return [];
    return (animationEditState.editsByClip[clipName]?.[boneName] ?? []).map((key) => key.time);
  }, [animationEditState, playback.currentClipName, ui.selected]);

  const pingRust = useCallback(async () => {
    try {
      const msg = await (await getTauriClient()).invokeCommand<string>('greet', { name: 'RustSMF' });
      ui.setStatus(msg + ' (real tauri invoke)');
    } catch (e: unknown) {
      ui.setStatus('Ping only works in Tauri desktop shell: ' + errorMessage(e));
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
    } catch (err: unknown) {
      if (!fileReadSeqGuard.isCurrent(readSeq)) return;
      const m = errorMessage(err);
      ui.setErrorMsg(`Drop load error: ${m}`);
      ui.setStatus(`Drop load error: ${m}`);
    }
  }, [ui, loadModel]);

  // Extracted for modularity: bone selection updates UI state + status (used by Inspector + Viewport raycast)
  const handleSelectBone = useCallback((name: string) => {
    ui.setSelected(name);
    ui.setStatus(`Selected: ${name}`);
    commitSkinEditState({
      ...skinEditStateRef.current,
      selectedBoneName: name,
    });
  }, [ui, commitSkinEditState]);

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

  const createChildForSelectedBone = useCallback((requestedName: string) => {
    const skeleton = model.skeleton;
    const parentName = ui.selected;
    if (sourceFormat === 'smf') {
      ui.setStatus('SMF-source child creation is blocked until head-node compatibility editing is explicit.');
      return;
    }
    if (!skeleton) {
      ui.setStatus('Load a skinned model before creating child bones.');
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
  }, [captureRigSnapshot, commitSkinEditState, model.skeleton, pushRigHistory, sourceFormat, ui]);

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
    const parentName = bone?.parent && (bone.parent as THREE.Bone).isBone === true
      ? (bone.parent as THREE.Bone).name
      : 'Scene';
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

  // Route bone nudge buttons through pose-edit layer so edits are captured at export time.
  // Applies the delta to the Three.js bone for immediate visual feedback, and records the
  // cumulative edit in poseEditsRef for use by handleExport.
  const onNudgeBone = useCallback((boneName: string, delta: BoneNudgeDelta) => {
    const skeleton = model.skeleton;
    if (!skeleton) return;
    const bone = findBoneByName(skeleton, boneName);
    if (!bone) return;

    const before = capturePoseSnapshot([boneName]);
    const prev = poseEditsRef.current[boneName] ?? emptyPoseEdit();
    const next = applyNudgeDelta(prev, delta);
    poseEditsRef.current = { ...poseEditsRef.current, [boneName]: next };
    setPoseEditHasDirtyState(hasPoseEdits(poseEditsRef.current));

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
    const after = capturePoseSnapshot([boneName]);
    pushPoseHistory(delta.reset ? `Reset pose ${boneName}` : `Nudge ${boneName}`, before, after);
  }, [capturePoseSnapshot, model.skeleton, pushPoseHistory]);

  const handleBoneTransformEdit = useCallback((event: BoneTransformEditEvent) => {
    if (event.owner === 'disabled') return;

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

      const active = activeAnimationTransformHistoryRef.current;
      const before = active?.boneName === event.boneName && active.source === event.source
        ? active.before
        : cloneAnimationEditState(animationEditStateRef.current);
      const state = animationEditStateRef.current;
      const key = makeKeyframeFromBone(bone, playbackRef.current.currentTime, state.interpolation);
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
      ui.setStatus(unsupportedSmfScaleEditMessage);
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
    capturePoseSnapshot,
    model.skeleton,
    playbackRef,
    pushAnimationHistory,
    pushPoseHistory,
    recordPoseBoneEdit,
    sourceFormat,
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

    const changed = before.some((snapshot) => {
      const nextSnapshot = after.find((candidate) => (
        candidate.meshId === snapshot.meshId && candidate.vertexIndex === snapshot.vertexIndex
      ));
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

    skinUndoStackRef.current = [...skinUndoStackRef.current.slice(-49), entry];
    skinRedoStackRef.current = [];
    refreshSkinHistoryAvailability();
  }, [allocateHistoryOrder, model.root, refreshSkinHistoryAvailability]);

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
    skinRedoStackRef.current = [
      ...skinRedoStackRef.current.slice(-49),
      { ...entry, redoOrder: allocateHistoryOrder() },
    ];
    commitSkinEditState(cloneSkinEditState(entry.beforeState));
    model.skeleton?.update();
    refreshSkinHistoryAvailability();
    ui.setStatus(`Undid skin edit (${restored} vertices restored).`);
  }, [allocateHistoryOrder, model.root, model.skeleton, ui, endSkinPaintStroke, commitSkinEditState, refreshSkinHistoryAvailability]);

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
    skinUndoStackRef.current = [
      ...skinUndoStackRef.current.slice(-49),
      { ...entry, order: allocateHistoryOrder(), redoOrder: undefined },
    ];
    commitSkinEditState(cloneSkinEditState(entry.afterState));
    model.skeleton?.update();
    refreshSkinHistoryAvailability();
    ui.setStatus(`Redid skin edit (${restored} vertices restored).`);
  }, [allocateHistoryOrder, model.root, model.skeleton, ui, endSkinPaintStroke, commitSkinEditState, refreshSkinHistoryAvailability]);

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

    let nextState = skinEditStateRef.current;
    let changed = 0;
    for (const snapshot of before) {
      const nextSnapshot = after.find((candidate) => (
        candidate.meshId === snapshot.meshId && candidate.vertexIndex === snapshot.vertexIndex
      ));
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
    skinUndoStackRef.current = [...skinUndoStackRef.current.slice(-49), entry];
    skinRedoStackRef.current = [];
    model.skeleton?.update();
    refreshSkinHistoryAvailability();
    return changed;
  }, [allocateHistoryOrder, commitSkinEditState, model.root, model.skeleton, refreshSkinHistoryAvailability, ui]);

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
      ? getBoneBranchIndices(skeleton, selectedBoneName)
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
    const selectedBoneName = source.selectedBoneName || ui.selected;
    if (!selectedBoneName || selectedBoneName === 'Scene') {
      ui.setStatus('Select a bone to paint skin weights.');
      return;
    }

    const skeleton = model.skeleton;
    const boneIndex = getBoneIndex(skeleton, selectedBoneName);
    if (boneIndex < 0) {
      ui.setStatus('Selected bone is not in current skeleton.');
      return;
    }

    const mode = skinPaintMode;
    const restrictToBoneIndices = mode === 'auto' && skinAutoWeightAlgorithm === 'selected-branch'
      ? getBoneBranchIndices(skeleton, selectedBoneName)
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

    let changed = 0;
    let touched = 0;
    let nextState = source;
    let implicitStroke = false;
    if (!activeSkinStrokeRef.current) {
      beginSkinPaintStroke();
      implicitStroke = true;
    }
    unique.forEach(({ mesh, index, amount }) => {
      const meshObj = collectSkinnedMeshById(model.root, mesh);
      if (!meshObj) return;
      const snapshotKey = `${mesh}:${index}`;
      const activeStroke = activeSkinStrokeRef.current;
      if (activeStroke && !activeStroke.beforeSnapshots.has(snapshotKey)) {
        const snapshot = captureSkinVertexSnapshot(meshObj, index);
        if (snapshot) {
          activeStroke.beforeSnapshots.set(snapshotKey, snapshot);
        }
      }
      const result = mode === 'auto' && autoWeightOptions
        ? autoSkinSkinnedMeshVertexWeights(meshObj, skeleton, index, {
          ...autoWeightOptions,
          blendAmount: amount,
        })
        : editVertexBoneWeight(meshObj, index, boneIndex, mode, amount);
      if (!result.ok) return;
      touched += 1;
      if (result.changed) {
        nextState = markSkinEdit(nextState, mesh, index);
        changed += 1;
      }
    });

    if (touched > 0) {
      commitSkinEditState(nextState);
      if (changed > 0) {
        const modeLabel = mode === 'auto'
          ? `auto ${SKIN_AUTO_WEIGHT_ALGORITHM_LABELS[skinAutoWeightAlgorithm]}`
          : mode;
        ui.setStatus(`Painted ${changed} skin vertices on ${selectedBoneName} (${modeLabel} mode).`);
      } else {
        ui.setStatus(`Paint stroke touched ${touched} vertices on ${selectedBoneName} but kept equivalent weights.`);
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

  const onSkinPaintTargetModeChange = useCallback((next: 'vertex' | 'triangle') => {
    setSkinPaintTargetMode(next === 'triangle' ? 'triangle' : 'vertex');
  }, []);

  const onSkinPaintRadiusChange = useCallback((next: number) => {
    setSkinPaintRadius(clampPositive(next, 0.01, 4));
  }, []);

  const onSkinPaintStrengthChange = useCallback((next: number) => {
    setSkinPaintStrength(clamp01(next));
  }, []);

  const onSkinPaintTargetChange = useCallback((next: number) => {
    setSkinPaintTarget(Math.max(1, Math.round(clampPositive(next, 1, 4))));
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
    handleExport,
    handleExportSmf,
    handleRunSmfRoundtripCheck,
    handleSaveSmfDiagnosticReport,
    handleFileInputChange,
    handleDrop,
    handleSelectBone,
    renameSelectedBone,
    reparentSelectedBone,
    createChildForSelectedBone,
    deleteSelectedBone,
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
    renameCurrentAnimationClip,
    duplicateCurrentAnimationClip,
    deleteCurrentAnimationClip,
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
    skinEditHasDirtyState,
    skinEditBlockReason,
    skinPaintMode,
    skinPaintTargetMode,
    skinPaintRadius,
    skinPaintStrength,
    skinPaintTarget,
    skinAutoWeightAlgorithm,
    skinAutoWeightPower,
    skinAutoWeightNormalWeighting,
    skinAutoWeightMaxInfluences,
    onSkinPaintModeChange,
    onSkinPaintTargetModeChange,
    onSkinPaintRadiusChange,
    onSkinPaintStrengthChange,
    onSkinPaintTargetChange,
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
    insertAnimationKeyframe,
    insertAnimationKeyframeAtTime,
    updateAnimationKeyframe,
    deleteSelectedAnimationKeyframe,
    copySelectedAnimationKeyframe,
    pasteAnimationKeyframe,
    selectAnimationKeyframeTime,
    moveSelectedAnimationKeyframe,
    changeAnimationInterpolation,
    viewportLayout: ui.viewportLayout,
    setViewportLayout: ui.setViewportLayout,
    gridEnabled: ui.gridEnabled,
    setGridEnabled: ui.setGridEnabled,
    axesEnabled: ui.axesEnabled,
    setAxesEnabled: ui.setAxesEnabled,
    textureEnabled: ui.textureEnabled,
    setTextureEnabled: ui.setTextureEnabled,
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
