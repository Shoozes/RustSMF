import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import * as THREE from 'three'
import ThreeViewport from './components/ThreeViewport'
import Timeline from './components/Timeline'
import Outliner from './components/Outliner'
import Inspector from './components/Inspector'
import Toolbar from './components/Toolbar'
import ViewportControls, { type ViewportControlsProps } from './components/ViewportControls'
import { ListBullets, SlidersHorizontal, X } from '@phosphor-icons/react'
import SkinPanel from './components/SkinPanel';
import ModernSkinWorkspace, { type ModernSkinTool } from './components/ModernSkinWorkspace';
import RigPanel from './components/RigPanel';
import AnimatePanel from './components/AnimatePanel';
import ExportPanel from './components/ExportPanel';
import { useAppTheme } from './hooks/useAppTheme'
import { useLoadModel } from './hooks/useLoadModel'
import type { EditorMode } from './store'
import { getAppTheme, type AppThemeId } from './theme'
import type { BoneTransformOwner, ViewportObjectSelectEvent } from './types/viewportEditorEvents'
import { supportedModelFormatsLabel } from './utils/modelFormat'
import { collectModelOutlinerItems } from './utils/modelOutliner'
import {
  applyModelOutlinerSnapshot,
  attachLoadedStaticModel,
  captureModelOutlinerSnapshot,
  deleteModelObject,
  duplicateModelObject,
  getModelObjectAuthoringDisabledReason,
  getModelObjectReorderAvailability,
  renameModelObject,
  reorderModelObject,
  sameModelOutlinerSnapshot,
  supportsModelObjectAuthoring,
  type ModelStructuralOperation,
  type ModelObjectReorderDirection,
  type ModelOutlinerSnapshot,
} from './utils/modelAuthoring'
import {
  assignStaticModelMaterial,
  flipStaticModelWinding,
  prepareStaticModelGeometry,
  transformStaticModelObject,
  type ModelTransformPatch,
} from './utils/modelSurfaceAuthoring'
import { getClipByName, summarizeAnimationTimeline } from './utils/animationTimeline'
import { resolveAnimationScope } from './utils/animationScope'
import { validateRig } from './utils/rigValidation'
import { collectRigDeformBoneNames, collectRigHierarchyBones } from './utils/rigHierarchy'
import {
  makeEditorHistory,
  popRedo,
  popUndo,
  pushEditorHistory,
  selectLatestHistoryDomain,
  type EditorHistoryState,
} from './utils/editorHistory'
import { disposeThreeObject } from './utils/threeDisposal'
import type { SkinWeightEditMode } from './utils/skinWeights'

type WorkspaceProfile = {
  showTimeline: boolean;
  showClipList: boolean;
  showBonePanel: boolean;
  showTransformControls: boolean;
  showWeightSection: boolean;
  boneLabelsEnabledByDefault: boolean;
};

type ModernPanel = 'scene' | 'properties' | null;

const WORKSPACE_BY_MODE: Record<EditorMode, WorkspaceProfile> = {
  view: {
    showTimeline: true,
    showClipList: true,
    showBonePanel: true,
    showTransformControls: false,
    showWeightSection: true,
    boneLabelsEnabledByDefault: false,
  },
  rig: {
    showTimeline: true,
    showClipList: false,
    showBonePanel: true,
    showTransformControls: true,
    showWeightSection: false,
    boneLabelsEnabledByDefault: true,
  },
  skin: {
    showTimeline: true,
    showClipList: false,
    showBonePanel: true,
    showTransformControls: true,
    showWeightSection: true,
    boneLabelsEnabledByDefault: true,
  },
  animate: {
    showTimeline: true,
    showClipList: true,
    showBonePanel: true,
    showTransformControls: true,
    showWeightSection: false,
    boneLabelsEnabledByDefault: false,
  },
  export: {
    showTimeline: false,
    showClipList: false,
    showBonePanel: false,
    showTransformControls: false,
    showWeightSection: false,
    boneLabelsEnabledByDefault: false,
  },
};

// Main application: thin UI shell / orchestrator.
// Logic extracted to useLoadModel hook (load/export/handlers + tauri lazy) + store slices + focused components.
// Drop and bone selection handlers now provided by hook for further modularity.
export default function App() {
  const historyOrderRef = useRef(0);
  const hadModelRef = useRef(false);
  const outlinerHistoryRef = useRef<EditorHistoryState<ModelOutlinerSnapshot>>(makeEditorHistory());
  const outlinerHistoryIdRef = useRef(0);
  const outlinerDirtyRef = useRef(false);
  const [outlinerUndoAvailable, setOutlinerUndoAvailable] = useState(false);
  const [outlinerRedoAvailable, setOutlinerRedoAvailable] = useState(false);
  const [outlinerUndoOrder, setOutlinerUndoOrder] = useState(0);
  const [outlinerRedoOrder, setOutlinerRedoOrder] = useState(0);
  const [outlinerRevision, setOutlinerRevision] = useState(0);
  const [selectedOutlinerIds, setSelectedOutlinerIds] = useState<string[]>([]);
  const [modernPanel, setModernPanel] = useState<ModernPanel>('scene');
  const [modernSkinTool, setModernSkinTool] = useState<ModernSkinTool>('pick');
  const modernPanelRef = useRef<HTMLDivElement | null>(null);
  const modernPanelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { theme, themeId, setThemeId } = useAppTheme();
  const allocateHistoryOrder = useCallback(() => {
    historyOrderRef.current += 1;
    return historyOrderRef.current;
  }, []);
  const {
    ui,
    model,
    playback,
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
    handleExportSmf,
    handleRunSmfRoundtripCheck,
    handleSaveSmfDiagnosticReport,
    handleFileInputChange,
    handleDrop,
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
    setRigToolMode,
    rigSnapStep,
    setRigSnapStep,
    rigIkSettings,
    setRigIkSettings,
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
    setTransformMode,
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
    editorMode,
    setEditorMode,
    viewportLayout,
    setViewportLayout,
    gridEnabled,
    setGridEnabled,
    axesEnabled,
    setAxesEnabled,
    textureEnabled,
    setTextureEnabled,
    textureRepeatPreviewEnabled,
    setTextureRepeatPreviewEnabled,
    textureFilterPreview,
    setTextureFilterPreview,
    boneIndexLabelsEnabled,
    setBoneIndexLabelsEnabled,
    rigOpacity,
    setRigOpacity,
    rigThicknessScale,
    setRigThicknessScale,
    skinPointOverlayEnabled,
    setSkinPointOverlayEnabled,
    shaderEnabled,
    setShaderEnabled,
    perspectiveEnabled,
    setPerspectiveEnabled,
    modelOpacity,
    setModelOpacity,
    sourceFormat,
    poseEditHasDirtyState,
    animationEditHasDirtyState,
    animationSelectedKeyTime,
    animationAuthoredKeyTimes,
    animationClipboardHasKeyframe,
    animationInterpolation,
    animationSnapStep,
    animationScope,
    animationClipMetadata,
    animationLockedBoneNames,
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
  } = useLoadModel({ allocateHistoryOrder, externalDirtyRef: outlinerDirtyRef });

  const workspace = WORKSPACE_BY_MODE[editorMode];
  const boneTransformOwner: BoneTransformOwner =
    editorMode === 'rig'
      ? 'pose'
      : editorMode === 'animate'
        ? 'animation'
        : 'disabled';
  const shouldShowBoneLabels = showBoneLabels
    || (theme.shellVariant === 'original' && workspace.boneLabelsEnabledByDefault);
  const hasModel = !!model.root;
  const modelRootRef = useRef(model.root);
  modelRootRef.current = model.root;
  const autosaveProjectRef = useRef(handleAutosaveProject);
  useEffect(() => {
    autosaveProjectRef.current = handleAutosaveProject;
  }, [handleAutosaveProject]);
  useEffect(() => {
    if (!hasModel) return;
    const timer = window.setTimeout(() => {
      void autosaveProjectRef.current();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [hasModel, model.root, editorUndoOrder, outlinerRevision, skinUndoOrder]);
  const handleThemeChange = useCallback((nextThemeId: AppThemeId) => {
    const nextTheme = getAppTheme(nextThemeId);
    setThemeId(nextThemeId);
    if (!hasModel || viewportLayout === theme.preferredViewportLayout) {
      setViewportLayout(nextTheme.preferredViewportLayout);
    }
  }, [
    hasModel,
    setThemeId,
    setViewportLayout,
    theme.preferredViewportLayout,
    viewportLayout,
  ]);
  const hasSkinnedModel = !!model.skeleton && model.skeleton.bones.length > 0;
  const rigHierarchyBones = collectRigHierarchyBones(model.root, model.skeleton);
  const rigDeformBoneNames = collectRigDeformBoneNames(model.skeleton);
  const selectedIsDeformBone = rigDeformBoneNames.includes(ui.selected);
  const selectedBoneName = useMemo(() => {
    return model.skeleton?.bones.some((bone) => bone.name === ui.selected) ? ui.selected : '';
  }, [model.skeleton, ui.selected]);
  const animationScopeNames = useMemo(() => {
    const resolved = resolveAnimationScope(model.skeleton, selectedBoneName, animationScope);
    return resolved.ok ? resolved.names : (selectedBoneName ? [selectedBoneName] : []);
  }, [animationScope, model.skeleton, selectedBoneName]);
  const currentClip = useMemo(
    () => getClipByName(model.clips, playback.currentClipName),
    [model.clips, playback.currentClipName],
  );
  const animationTimelineSummary = useMemo(
    () => summarizeAnimationTimeline(currentClip, animationScopeNames),
    [animationScopeNames, currentClip],
  );
  const rigValidationReport = validateRig(model.skeleton, model.root);
  const timelineKeyframeTimes = animationTimelineSummary.selectedKeyframeTimes.length > 0
    ? animationTimelineSummary.selectedKeyframeTimes
    : animationTimelineSummary.keyframeTimes;
  const outlinerItems = useMemo(
    () => collectModelOutlinerItems(model.root),
    // Name/visibility/order changes mutate the retained Three root; this revision is the invalidation token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model.root, outlinerRevision],
  );
  const modelObjectAuthoringEnabled = supportsModelObjectAuthoring(sourceFormat);
  const modelObjectAuthoringDisabledReason = getModelObjectAuthoringDisabledReason(sourceFormat);
  const selectedOutlinerReorder = (
    selectedOutlinerIds.length === 1
      ? getModelObjectReorderAvailability(model.root, selectedOutlinerIds[0])
      : { canMoveEarlier: false, canMoveLater: false }
  );
  const handleSkinPaintModeChange = useCallback((next: SkinWeightEditMode) => {
    onSkinPaintModeChange(next);
    if (theme.shellVariant !== 'modern' || editorMode !== 'skin') return;
    setModernSkinTool(next === 'smooth' ? 'smooth' : next === 'subtract' ? 'erase' : 'paint');
  }, [editorMode, onSkinPaintModeChange, theme.shellVariant]);
  const getOutlinerItemName = useCallback((id: string): string => {
    const item = outlinerItems.find((candidate) => candidate.id === id);
    return item?.name ?? 'submodel';
  }, [outlinerItems]);
  const refreshOutlinerHistoryAvailability = useCallback(() => {
    outlinerDirtyRef.current = outlinerHistoryRef.current.undo.length > 0 || outlinerHistoryRef.current.redo.length > 0;
    setOutlinerUndoAvailable(outlinerHistoryRef.current.undo.length > 0);
    setOutlinerRedoAvailable(outlinerHistoryRef.current.redo.length > 0);
    setOutlinerUndoOrder(outlinerHistoryRef.current.undo.at(-1)?.order ?? 0);
    setOutlinerRedoOrder(outlinerHistoryRef.current.redo.at(-1)?.redoOrder ?? 0);
  }, []);
  const releaseDetachedOutlinerHistoryObjects = useCallback((snapshots: readonly ModelOutlinerSnapshot[]): void => {
    const objects = new Set<THREE.Object3D>();
    for (const snapshot of snapshots) {
      const operation = snapshot.structuralOperation;
      if (operation?.disposeOnRelease) objects.add(operation.object);
    }
    for (const object of objects) {
      if (!object.parent) disposeThreeObject(object);
    }
  }, []);
  const captureOutlinerSnapshot = useCallback((
    orderedParentIds: Iterable<string> = [],
    selectedIds: Iterable<string> = selectedOutlinerIds,
    structuralOperation?: ModelStructuralOperation,
  ): ModelOutlinerSnapshot => (
    captureModelOutlinerSnapshot(
      model.root,
      collectModelOutlinerItems(model.root).map((item) => item.id),
      selectedIds,
      orderedParentIds,
      structuralOperation,
    )
  ), [model.root, selectedOutlinerIds]);
  const applyOutlinerSnapshot = useCallback((snapshot: ModelOutlinerSnapshot): number => {
    const result = applyModelOutlinerSnapshot(
      model.root,
      snapshot,
      collectModelOutlinerItems(model.root).map((item) => item.id),
    );
    setSelectedOutlinerIds(result.selectedIds);
    setOutlinerRevision((value) => value + 1);
    return result.changes;
  }, [model.root]);
  const pushOutlinerHistory = useCallback((
    label: string,
    before: ModelOutlinerSnapshot,
    after: ModelOutlinerSnapshot,
  ): boolean => {
    if (sameModelOutlinerSnapshot(before, after)) return false;

    const previousEntries = [...outlinerHistoryRef.current.undo, ...outlinerHistoryRef.current.redo];
    const nextHistory = pushEditorHistory(outlinerHistoryRef.current, {
      id: `outliner-${outlinerHistoryIdRef.current += 1}`,
      label,
      domain: 'outliner',
      before,
      after,
      order: allocateHistoryOrder(),
    });
    const retainedSnapshots = nextHistory.undo.flatMap((entry) => [entry.before, entry.after])
      .concat(nextHistory.redo.flatMap((entry) => [entry.before, entry.after]));
    const retainedObjects = new Set(
      retainedSnapshots.map((snapshot) => snapshot.structuralOperation?.object).filter((object): object is THREE.Object3D => !!object),
    );
    releaseDetachedOutlinerHistoryObjects(
      previousEntries
        .flatMap((entry) => [entry.before, entry.after])
        .filter((snapshot) => {
          const object = snapshot.structuralOperation?.object;
          return !!object && !retainedObjects.has(object);
        }),
    );
    outlinerHistoryRef.current = nextHistory;
    refreshOutlinerHistoryAvailability();
    return true;
  }, [allocateHistoryOrder, refreshOutlinerHistoryAvailability, releaseDetachedOutlinerHistoryObjects]);
  const undoOutlinerHistory = useCallback((): boolean => {
    const result = popUndo(outlinerHistoryRef.current, allocateHistoryOrder());
    if (!result.entry) return false;

    outlinerHistoryRef.current = result.state;
    const changed = applyOutlinerSnapshot(result.entry.before);
    refreshOutlinerHistoryAvailability();
    ui.setStatus(`Undid ${result.entry.label}${changed > 0 ? ` (${changed} object change${changed === 1 ? '' : 's'})` : ''}.`);
    return true;
  }, [allocateHistoryOrder, applyOutlinerSnapshot, refreshOutlinerHistoryAvailability, ui]);
  const redoOutlinerHistory = useCallback((): boolean => {
    const result = popRedo(outlinerHistoryRef.current, allocateHistoryOrder());
    if (!result.entry) return false;

    outlinerHistoryRef.current = result.state;
    const changed = applyOutlinerSnapshot(result.entry.after);
    refreshOutlinerHistoryAvailability();
    ui.setStatus(`Redid ${result.entry.label}${changed > 0 ? ` (${changed} object change${changed === 1 ? '' : 's'})` : ''}.`);
    return true;
  }, [allocateHistoryOrder, applyOutlinerSnapshot, refreshOutlinerHistoryAvailability, ui]);
  const handleEditorUndo = useCallback((): boolean => {
    const domain = selectLatestHistoryDomain([
      { domain: 'editor' as const, available: editorUndoAvailable, order: editorUndoOrder },
      { domain: 'skin' as const, available: skinUndoAvailable, order: skinUndoOrder },
      { domain: 'outliner' as const, available: outlinerUndoAvailable, order: outlinerUndoOrder },
    ], 'editor');
    ({ editor: undoEditorHistory, skin: undoSkinPaint, outliner: undoOutlinerHistory })[domain]();
    return true;
  }, [
    editorUndoAvailable,
    editorUndoOrder,
    outlinerUndoAvailable,
    outlinerUndoOrder,
    skinUndoAvailable,
    skinUndoOrder,
    undoEditorHistory,
    undoOutlinerHistory,
    undoSkinPaint,
  ]);
  const handleEditorRedo = useCallback((): boolean => {
    const domain = selectLatestHistoryDomain([
      { domain: 'editor' as const, available: editorRedoAvailable, order: editorRedoOrder },
      { domain: 'skin' as const, available: skinRedoAvailable, order: skinRedoOrder },
      { domain: 'outliner' as const, available: outlinerRedoAvailable, order: outlinerRedoOrder },
    ], 'editor');
    ({ editor: redoEditorHistory, skin: redoSkinPaint, outliner: redoOutlinerHistory })[domain]();
    return true;
  }, [
    editorRedoAvailable,
    editorRedoOrder,
    outlinerRedoAvailable,
    outlinerRedoOrder,
    redoEditorHistory,
    redoOutlinerHistory,
    redoSkinPaint,
    skinRedoAvailable,
    skinRedoOrder,
  ]);
  const applyOutlinerSelection = useCallback((
    id: string,
    options: { additive?: boolean; toggle?: boolean } = {},
  ): string[] => {
    if (!outlinerItems.some((item) => item.id === id)) return selectedOutlinerIds;

    if (options.toggle) {
      return selectedOutlinerIds.includes(id)
        ? selectedOutlinerIds.filter((selectedId) => selectedId !== id)
        : [...selectedOutlinerIds, id];
    }

    if (options.additive) {
      return selectedOutlinerIds.includes(id)
        ? selectedOutlinerIds
        : [...selectedOutlinerIds, id];
    }

    return [id];
  }, [outlinerItems, selectedOutlinerIds]);
  const handleSelectScene = useCallback(() => {
    ui.setSelected('Scene');
    setSelectedOutlinerIds([]);
    ui.setStatus('Selected: Scene');
  }, [ui]);
  const handleClearObjectSelection = useCallback(() => {
    setSelectedOutlinerIds([]);
    ui.setStatus('Cleared submodel selection.');
  }, [ui]);
  const handleSelectOutlinerItem = useCallback((id: string, options: { additive?: boolean; toggle?: boolean } = {}) => {
    const next = applyOutlinerSelection(id, options);
    setSelectedOutlinerIds(next);
    ui.setStatus(next.length > 1
      ? `Selected ${next.length} submodels.`
      : `Selected submodel: ${getOutlinerItemName(next[0] ?? id)}`);
  }, [applyOutlinerSelection, getOutlinerItemName, ui]);
  const handleSelectViewportObject = useCallback((event: ViewportObjectSelectEvent) => {
    const next = applyOutlinerSelection(event.objectId, {
      additive: event.additive,
      toggle: event.toggle,
    });
    setSelectedOutlinerIds(next);
    ui.setStatus(next.length > 1
      ? `Selected ${next.length} submodels.`
      : `Selected submodel: ${getOutlinerItemName(next[0] ?? event.objectId)}`);
  }, [applyOutlinerSelection, getOutlinerItemName, ui]);
  const handleViewportObjectContextMenu = useCallback((event: ViewportObjectSelectEvent) => {
    const isSelected = selectedOutlinerIds.includes(event.objectId);
    if (!isSelected) {
      setSelectedOutlinerIds([event.objectId]);
    }
    ui.setStatus(`Submodel context actions ready for ${getOutlinerItemName(event.objectId)}.`);
  }, [getOutlinerItemName, selectedOutlinerIds, ui]);
  const handleRenameSelectedOutlinerItem = useCallback((requestedName: string) => {
    if (selectedOutlinerIds.length !== 1) {
      ui.setStatus('Select exactly one submodel before renaming.');
      return;
    }
    const before = captureOutlinerSnapshot();
    const result = renameModelObject(
      model.root,
      selectedOutlinerIds[0],
      requestedName,
      model.clips,
      sourceFormat,
    );
    if (!result.ok) {
      ui.setStatus(result.message);
      return;
    }

    const after = captureOutlinerSnapshot();
    pushOutlinerHistory(`rename submodel ${result.previousName || 'unnamed'} to ${result.name}`, before, after);
    setOutlinerRevision((value) => value + 1);
    ui.setStatus(`Renamed submodel ${result.previousName || 'unnamed'} to ${result.name}.`);
  }, [captureOutlinerSnapshot, model.clips, model.root, pushOutlinerHistory, selectedOutlinerIds, sourceFormat, ui]);
  const handleDuplicateSelectedOutlinerItem = useCallback(() => {
    if (selectedOutlinerIds.length !== 1) {
      ui.setStatus('Select exactly one submodel before duplicating.');
      return;
    }
    const beforeState = captureOutlinerSnapshot();
    const result = duplicateModelObject(model.root, selectedOutlinerIds[0], model.clips, sourceFormat);
    if (!result.ok) {
      ui.setStatus(result.message);
      return;
    }
    const structural = {
      object: result.object,
      parentId: result.parentId,
      childIndex: result.childIndex,
      disposeOnRelease: true,
    } satisfies Omit<ModelStructuralOperation, 'kind'>;
    const before: ModelOutlinerSnapshot = {
      ...beforeState,
      structuralOperation: { ...structural, kind: 'remove' },
    };
    const after = captureOutlinerSnapshot([], [result.object.uuid], { ...structural, kind: 'insert' });
    pushOutlinerHistory(`duplicate submodel ${result.sourceObject.name || 'unnamed'}`, before, after);
    setSelectedOutlinerIds([result.object.uuid]);
    setOutlinerRevision((value) => value + 1);
    ui.setStatus(`Duplicated submodel ${result.sourceObject.name || 'unnamed'} as ${result.object.name}.`);
  }, [captureOutlinerSnapshot, model.clips, model.root, pushOutlinerHistory, selectedOutlinerIds, sourceFormat, ui]);
  const handleAppendStaticModel = useCallback(async (file: File) => {
    const expectedParent = modelRootRef.current;
    if (!expectedParent) {
      ui.setStatus('Load a primary model before appending a static model.');
      return;
    }
    const appendRoot = await loadStaticAppend(file);
    if (!appendRoot) return;
    appendRoot.name = appendRoot.name || file.name.replace(/\.[^.]+$/, '');
    const beforeState = captureOutlinerSnapshot();
    const attachment = attachLoadedStaticModel(expectedParent, modelRootRef.current, appendRoot);
    if (!attachment.ok) {
      disposeThreeObject(appendRoot);
      ui.setStatus(attachment.message);
      return;
    }
    const structural = {
      object: appendRoot,
      parentId: attachment.parentId,
      childIndex: attachment.childIndex,
      disposeOnRelease: true,
    } satisfies Omit<ModelStructuralOperation, 'kind'>;
    const before: ModelOutlinerSnapshot = {
      ...beforeState,
      structuralOperation: { ...structural, kind: 'remove' },
    };
    const after = captureOutlinerSnapshot([], [appendRoot.uuid], { ...structural, kind: 'insert' });
    pushOutlinerHistory(`append static model ${appendRoot.name}`, before, after);
    setSelectedOutlinerIds([appendRoot.uuid]);
    setOutlinerRevision((value) => value + 1);
    ui.setStatus(`Appended static model ${appendRoot.name}.`);
  }, [captureOutlinerSnapshot, loadStaticAppend, pushOutlinerHistory, ui]);
  const applySelectedSurfaceEdit = useCallback((
    label: string,
    operation: (objectId: string) => { ok: true; object: THREE.Object3D; message: string } | { ok: false; message: string },
  ) => {
    if (selectedOutlinerIds.length !== 1) {
      ui.setStatus('Select exactly one submodel before editing its surface.');
      return;
    }
    const before = captureOutlinerSnapshot();
    const result = operation(selectedOutlinerIds[0]);
    if (!result.ok) {
      ui.setStatus(result.message);
      return;
    }
    const after = captureOutlinerSnapshot();
    const pushed = pushOutlinerHistory(label, before, after);
    setOutlinerRevision((value) => value + 1);
    ui.setStatus(pushed ? result.message : `${result.message} No change was recorded.`);
  }, [captureOutlinerSnapshot, pushOutlinerHistory, selectedOutlinerIds, ui]);
  const handleTransformSelectedOutlinerItem = useCallback((patch: ModelTransformPatch) => {
    applySelectedSurfaceEdit('transform static submodel', (objectId) => transformStaticModelObject(model.root, objectId, patch, model.clips, sourceFormat));
  }, [applySelectedSurfaceEdit, model.clips, model.root, sourceFormat]);
  const handleAssignSelectedMaterial = useCallback((name: string) => {
    applySelectedSurfaceEdit(`assign material ${name}`, (objectId) => assignStaticModelMaterial(model.root, objectId, name, model.clips, sourceFormat));
  }, [applySelectedSurfaceEdit, model.clips, model.root, sourceFormat]);
  const handleFlipSelectedWinding = useCallback(() => {
    applySelectedSurfaceEdit('flip static submodel winding', (objectId) => flipStaticModelWinding(model.root, objectId, model.clips, sourceFormat));
  }, [applySelectedSurfaceEdit, model.clips, model.root, sourceFormat]);
  const handlePrepareSelectedGeometry = useCallback(() => {
    applySelectedSurfaceEdit('prepare static geometry attributes', (objectId) => prepareStaticModelGeometry(model.root, objectId, model.clips, sourceFormat));
  }, [applySelectedSurfaceEdit, model.clips, model.root, sourceFormat]);
  const handleDeleteSelectedOutlinerItem = useCallback(() => {
    if (selectedOutlinerIds.length !== 1) {
      ui.setStatus('Select exactly one submodel before deleting.');
      return;
    }
    const beforeState = captureOutlinerSnapshot();
    const result = deleteModelObject(model.root, selectedOutlinerIds[0], model.clips, sourceFormat);
    if (!result.ok) {
      ui.setStatus(result.message);
      return;
    }
    const structural = {
      object: result.object,
      parentId: result.parentId,
      childIndex: result.childIndex,
      disposeOnRelease: false,
    } satisfies Omit<ModelStructuralOperation, 'kind'>;
    const before: ModelOutlinerSnapshot = {
      ...beforeState,
      structuralOperation: { ...structural, kind: 'insert' },
    };
    const after = captureOutlinerSnapshot([], [], { ...structural, kind: 'remove' });
    pushOutlinerHistory(`delete submodel ${result.object.name || 'unnamed'}`, before, after);
    setSelectedOutlinerIds([]);
    setOutlinerRevision((value) => value + 1);
    ui.setStatus(`Deleted submodel ${result.object.name || 'unnamed'}.`);
  }, [captureOutlinerSnapshot, model.clips, model.root, pushOutlinerHistory, selectedOutlinerIds, sourceFormat, ui]);
  const handleMoveSelectedOutlinerItem = useCallback((direction: ModelObjectReorderDirection) => {
    if (selectedOutlinerIds.length !== 1) {
      ui.setStatus('Select exactly one submodel before reordering.');
      return;
    }
    const objectId = selectedOutlinerIds[0];
    const parentId = model.root?.getObjectByProperty('uuid', objectId)?.parent?.uuid;
    if (!parentId) {
      ui.setStatus('The selected submodel has no current parent.');
      return;
    }

    const before = captureOutlinerSnapshot([parentId]);
    const result = reorderModelObject(model.root, objectId, direction, sourceFormat);
    if (!result.ok) {
      ui.setStatus(result.message);
      return;
    }
    const after = captureOutlinerSnapshot([result.parentId]);
    const name = result.object.name || result.object.type || 'submodel';
    pushOutlinerHistory(`move submodel ${name} ${direction}`, before, after);
    setOutlinerRevision((value) => value + 1);
    ui.setStatus(`Moved submodel ${name} ${direction} among its siblings.`);
  }, [captureOutlinerSnapshot, model.root, pushOutlinerHistory, selectedOutlinerIds, sourceFormat, ui]);
  const handleToggleOutlinerVisibility = useCallback((id: string) => {
    const object = model.root?.getObjectByProperty('uuid', id);
    if (!object) return;
    const before = captureOutlinerSnapshot();
    object.visible = !object.visible;
    const after = captureOutlinerSnapshot();
    pushOutlinerHistory('outliner visibility toggle', before, after);
    setOutlinerRevision((value) => value + 1);
    const name = object.name || object.type || 'submodel';
    ui.setStatus(`${object.visible ? 'Shown' : 'Hidden'} submodel: ${name}`);
  }, [captureOutlinerSnapshot, model.root, pushOutlinerHistory, ui]);
  const handleSelectAllOutlinerItems = useCallback(() => {
    const ids = outlinerItems.map((item) => item.id);
    setSelectedOutlinerIds(ids);
    ui.setStatus(`Selected ${ids.length} submodels.`);
  }, [outlinerItems, ui]);
  const handleHideSelectedOutlinerItems = useCallback(() => {
    if (selectedOutlinerIds.length === 0) {
      ui.setStatus('No selected submodels to hide.');
      return;
    }
    const before = captureOutlinerSnapshot();
    let changed = 0;
    for (const id of selectedOutlinerIds) {
      const object = model.root?.getObjectByProperty('uuid', id);
      if (object && object.visible) {
        object.visible = false;
        changed += 1;
      }
    }
    const after = captureOutlinerSnapshot();
    pushOutlinerHistory('hide selected submodels', before, after);
    if (changed > 0) {
      setOutlinerRevision((value) => value + 1);
    }
    ui.setStatus(`Hidden ${changed} selected submodel${changed === 1 ? '' : 's'}.`);
  }, [captureOutlinerSnapshot, model.root, pushOutlinerHistory, selectedOutlinerIds, ui]);
  const handleHideUnselectedOutlinerItems = useCallback(() => {
    if (selectedOutlinerIds.length === 0) {
      ui.setStatus('Select submodels before hiding unselected items.');
      return;
    }
    const selected = new Set(selectedOutlinerIds);
    const before = captureOutlinerSnapshot();
    let changed = 0;
    for (const item of outlinerItems) {
      if (selected.has(item.id)) continue;
      const object = model.root?.getObjectByProperty('uuid', item.id);
      if (object && object.visible) {
        object.visible = false;
        changed += 1;
      }
    }
    const after = captureOutlinerSnapshot();
    pushOutlinerHistory('hide unselected submodels', before, after);
    if (changed > 0) {
      setOutlinerRevision((value) => value + 1);
    }
    ui.setStatus(`Hidden ${changed} unselected submodel${changed === 1 ? '' : 's'}.`);
  }, [captureOutlinerSnapshot, model.root, outlinerItems, pushOutlinerHistory, selectedOutlinerIds, ui]);
  const handleUnhideAllOutlinerItems = useCallback(() => {
    const before = captureOutlinerSnapshot();
    let changed = 0;
    for (const item of outlinerItems) {
      const object = model.root?.getObjectByProperty('uuid', item.id);
      if (object && !object.visible) {
        object.visible = true;
        changed += 1;
      }
    }
    const after = captureOutlinerSnapshot();
    pushOutlinerHistory('show all submodels', before, after);
    if (changed > 0) {
      setOutlinerRevision((value) => value + 1);
    }
    ui.setStatus(`Shown ${changed} submodel${changed === 1 ? '' : 's'}.`);
  }, [captureOutlinerSnapshot, model.root, outlinerItems, pushOutlinerHistory, ui]);
  const modeWorkspacePanel = (() => {
    if (editorMode === 'rig') {
      return (
        <RigPanel
          selected={ui.selected}
          deformBoneNames={rigDeformBoneNames}
          selectedIsDeformBone={selectedIsDeformBone}
          report={rigValidationReport}
          sourceFormat={sourceFormat}
          canPrepareRootSkeleton={canPrepareRootSkeleton}
          onPrepareRootSkeleton={prepareRootSkeletonForStaticMeshes}
          onRenameSelectedBone={renameSelectedBone}
          onReparentSelectedBone={reparentSelectedBone}
          onCreateChildBone={createChildForSelectedBone}
          onSetSelectedBoneDetached={setSelectedBoneDetached}
          onSpinRig={spinRigAroundAxis}
          onDeleteSelectedBone={deleteSelectedBone}
          rigToolMode={rigToolMode}
          onRigToolModeChange={setRigToolMode}
          rigSnapStep={rigSnapStep}
          onRigSnapStepChange={setRigSnapStep}
          rigIkSettings={rigIkSettings}
          onRigIkSettingsChange={setRigIkSettings}
          rigIkLastResult={rigIkLastResult}
          rigMetadata={rigMetadata}
          onRigMetadataChange={onRigMetadataChange}
          onSaveRigMetadata={saveRigMetadata}
          onLoadRigMetadata={loadRigMetadata}
          onClearRigMetadata={clearRigMetadata}
          onBakeRigIk={bakeRigIk}
          hasActiveClip={!!playback.currentClipName && model.clips.length > 0}
          editorMode={editorMode}
        />
      );
    }
    if (editorMode === 'skin') {
      return (
        <SkinPanel
          dataTestId={theme.shellVariant === 'modern' ? 'skin-advanced-panel' : 'skin-workspace-panel'}
          selected={ui.selected}
          skeleton={model.skeleton}
          sourceFormat={sourceFormat}
          showWeightPreview={showWeightPreview}
          onToggleWeightPreview={workspace.showWeightSection ? toggleWeightPreview : undefined}
          showBoneLabels={shouldShowBoneLabels}
          onToggleBoneLabels={toggleBoneLabels}
          showPaintVertices={skinPointOverlayEnabled}
          onTogglePaintVertices={() => setSkinPointOverlayEnabled(!skinPointOverlayEnabled)}
          skinEditHasDirtyState={skinEditHasDirtyState}
          skinEditBlockReason={skinEditBlockReason}
          skinPaintMode={skinPaintMode}
          skinPaintPose={skinPaintPose}
          skinPaintTargetMode={skinPaintTargetMode}
          skinPaintRadius={skinPaintRadius}
          skinPaintStrength={skinPaintStrength}
          skinPaintTargetWeight={skinPaintTargetWeight}
          skinPaintFalloff={skinPaintFalloff}
          skinAutoWeightAlgorithm={skinAutoWeightAlgorithm}
          skinAutoWeightPower={skinAutoWeightPower}
          skinAutoWeightNormalWeighting={skinAutoWeightNormalWeighting}
          skinAutoWeightMaxInfluences={skinAutoWeightMaxInfluences}
          onSkinPaintModeChange={handleSkinPaintModeChange}
          onSkinPaintPoseChange={onSkinPaintPoseChange}
          onSkinPaintTargetModeChange={onSkinPaintTargetModeChange}
          onSkinPaintRadiusChange={onSkinPaintRadiusChange}
          onSkinPaintStrengthChange={onSkinPaintStrengthChange}
          onSkinPaintTargetWeightChange={onSkinPaintTargetWeightChange}
          onSkinPaintFalloffChange={onSkinPaintFalloffChange}
          onSkinAutoWeightAlgorithmChange={onSkinAutoWeightAlgorithmChange}
          onSkinAutoWeightPowerChange={onSkinAutoWeightPowerChange}
          onSkinAutoWeightNormalWeightingChange={onSkinAutoWeightNormalWeightingChange}
          onSkinAutoWeightMaxInfluencesChange={onSkinAutoWeightMaxInfluencesChange}
          onUndoSkinPaint={undoSkinPaint}
          onRedoSkinPaint={redoSkinPaint}
          onNormalizeSkinWeights={normalizeSkinWeights}
          onAutoSkinWeights={autoSkinWeights}
          skinUndoAvailable={skinUndoAvailable}
          skinRedoAvailable={skinRedoAvailable}
          skinDiagnostics={skinDiagnostics}
          skinSelectedVertex={skinSelectedVertexDiagnostic}
          editorMode={editorMode}
        />
      );
    }
    if (editorMode === 'animate') {
      return (
        <AnimatePanel
          clips={model.clips}
          hasSkeleton={!!model.skeleton && model.skeleton.bones.length > 0}
          currentClipName={playback.currentClipName}
          isPlaying={playback.isPlaying}
          currentTime={playback.currentTime}
          duration={playback.duration}
          selectedBoneName={selectedBoneName}
          timelineSummary={animationTimelineSummary}
          poseEditHasDirtyState={poseEditHasDirtyState}
          animationEditHasDirtyState={animationEditHasDirtyState}
          selectedKeyTime={animationSelectedKeyTime}
          clipboardHasKeyframe={animationClipboardHasKeyframe}
          interpolation={animationInterpolation}
          snapStep={animationSnapStep}
          animationScope={animationScope}
          animationLockedBoneNames={animationLockedBoneNames}
          clipMetadata={animationClipMetadata}
          onInsertKeyframe={insertAnimationKeyframe}
          onUpdateKeyframe={updateAnimationKeyframe}
          onDeleteKeyframe={deleteSelectedAnimationKeyframe}
          onCopyKeyframe={copySelectedAnimationKeyframe}
          onPasteKeyframe={pasteAnimationKeyframe}
          onInterpolationChange={changeAnimationInterpolation}
          onSnapStepChange={changeAnimationSnapStep}
          onAnimationScopeChange={changeAnimationScope}
          onClipLoopChange={changeAnimationClipLoop}
          onClipSampleFrameMultiplierChange={changeAnimationClipSampleFrameMultiplier}
          onClipDurationChange={changeAnimationClipDuration}
          onClipRetimeChange={changeAnimationClipRetime}
          onClipTrimChange={changeAnimationClipTrim}
          onToggleAnimationBoneLock={toggleAnimationBoneLock}
          onRenameClip={renameCurrentAnimationClip}
          onDuplicateClip={duplicateCurrentAnimationClip}
          onDeleteClip={deleteCurrentAnimationClip}
          onMoveClipUp={moveCurrentAnimationClipUp}
          onMoveClipDown={moveCurrentAnimationClipDown}
          onCreateAnimation={createAnimationFromPose}
          editorMode={editorMode}
        />
      );
    }
    if (editorMode === 'export') {
      return (
        <ExportPanel
          sourceFormat={sourceFormat}
          hasSkeleton={hasSkinnedModel}
          editorMode={editorMode}
          smfDiagnosticReport={smfDiagnosticReport}
          materialTextures={materialTextureSummaries}
          geometryDiagnostics={geometryDiagnostics}
          restPoseGhostEnabled={restPoseGhostEnabled}
          onRestPoseGhostEnabledChange={setRestPoseGhostEnabled}
          motionTrailsEnabled={motionTrailsEnabled}
          onMotionTrailsEnabledChange={setMotionTrailsEnabled}
          onionSkinEnabled={onionSkinEnabled}
          onOnionSkinEnabledChange={setOnionSkinEnabled}
          smfRoundtripReport={smfRoundtripReport}
          onRunSmfRoundtripCheck={handleRunSmfRoundtripCheck}
          onSaveSmfDiagnosticReport={handleSaveSmfDiagnosticReport}
        />
      );
    }
    return null;
  })();

  const openModernPanel = useCallback((panel: Exclude<ModernPanel, null>, trigger: HTMLButtonElement) => {
    modernPanelTriggerRef.current = trigger;
    setModernPanel(panel);
    window.requestAnimationFrame(() => modernPanelRef.current?.focus());
  }, []);

  const closeModernPanel = useCallback(() => {
    setModernPanel(null);
    window.requestAnimationFrame(() => modernPanelTriggerRef.current?.focus());
  }, []);

  const handleModernPanelKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModernPanel();
      return;
    }
    if (event.key !== 'Tab') return;
    const panel = modernPanelRef.current;
    if (!panel) return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [closeModernPanel]);

  const handleEditorModeChange = useCallback((mode: EditorMode) => {
    if (mode === 'skin') setModernSkinTool('pick');
    setEditorMode(mode);
  }, [setEditorMode]);

  const handleViewportBoneSelect = useCallback((boneName: string) => {
    handleSelectBone(boneName);
    if (theme.shellVariant === 'modern' && editorMode === 'skin' && modernSkinTool === 'pick') {
      handleSkinPaintModeChange('set');
    }
  }, [editorMode, handleSelectBone, handleSkinPaintModeChange, modernSkinTool, theme.shellVariant]);

  useEffect(() => {
    if (theme.shellVariant !== 'modern' || editorMode !== 'skin') return;
    const onSkinShortcut = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const tagName = target?.tagName.toLowerCase();
      if (event.ctrlKey || event.metaKey || event.altKey || target?.isContentEditable || tagName === 'input' || tagName === 'select' || tagName === 'textarea') return;
      const shortcuts: Partial<Record<string, ModernSkinTool>> = {
        q: 'pick',
        p: 'paint',
        e: 'erase',
        s: 'smooth',
      };
      const tool = shortcuts[event.key.toLowerCase()];
      if (tool) {
        if (tool !== 'pick' && tool !== 'smooth' && !selectedBoneName) return;
        event.preventDefault();
        setModernSkinTool(tool);
        if (tool === 'paint') handleSkinPaintModeChange('set');
        if (tool === 'erase') handleSkinPaintModeChange('subtract');
        if (tool === 'smooth') handleSkinPaintModeChange('smooth');
        return;
      }
      if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        const delta = event.key === '[' ? -0.05 : 0.05;
        onSkinPaintRadiusChange(skinPaintRadius + delta);
      }
    };
    window.addEventListener('keydown', onSkinShortcut);
    return () => window.removeEventListener('keydown', onSkinShortcut);
  }, [editorMode, handleSkinPaintModeChange, onSkinPaintRadiusChange, selectedBoneName, skinPaintRadius, theme.shellVariant]);

  useEffect(() => {
    if (theme.shellVariant !== 'modern') return;
    const compactQuery = window.matchMedia('(max-width: 1100px)');
    const syncPanelForViewport = () => {
      setModernPanel(compactQuery.matches || editorMode === 'skin' ? null : editorMode === 'view' ? 'scene' : 'properties');
    };
    syncPanelForViewport();
    compactQuery.addEventListener('change', syncPanelForViewport);
    return () => compactQuery.removeEventListener('change', syncPanelForViewport);
  }, [editorMode, theme.shellVariant]);

  // Setup keyboard once
  useEffect(() => {
    const cleanup = setupKeyboard({
      undo: handleEditorUndo,
      redo: handleEditorRedo,
    });
    return cleanup;
  }, [
    handleEditorRedo,
    handleEditorUndo,
    setupKeyboard,
  ]);

  useEffect(() => {
    if (!hasModel && viewportLayout !== theme.preferredViewportLayout) {
      setViewportLayout(theme.preferredViewportLayout);
    }
  }, [
    hasModel,
    setViewportLayout,
    theme.preferredViewportLayout,
    viewportLayout,
  ]);

  useEffect(() => {
    const hadModel = hadModelRef.current;
    hadModelRef.current = hasModel;
    if (!hadModel && hasModel && viewportLayout !== theme.preferredViewportLayout) {
      setViewportLayout(theme.preferredViewportLayout);
    }
  }, [
    hasModel,
    setViewportLayout,
    theme.preferredViewportLayout,
    viewportLayout,
  ]);

  useEffect(() => {
    setOutlinerRevision((value) => value + 1);
    setSelectedOutlinerIds([]);
    releaseDetachedOutlinerHistoryObjects(
      [...outlinerHistoryRef.current.undo, ...outlinerHistoryRef.current.redo]
        .flatMap((entry) => [entry.before, entry.after]),
    );
    outlinerHistoryRef.current = makeEditorHistory();
    refreshOutlinerHistoryAvailability();
  }, [model.root, refreshOutlinerHistoryAvailability, releaseDetachedOutlinerHistoryObjects]);

  const viewportControlsProps: Omit<ViewportControlsProps, 'variant'> = {
    hasModel,
    isLoading: ui.isLoading,
    viewportLayout,
    setViewportLayout,
    wireframeEnabled: ui.wireframeEnabled,
    setWireframeEnabled: ui.setWireframeEnabled,
    gridEnabled,
    setGridEnabled,
    axesEnabled,
    setAxesEnabled,
    textureEnabled,
    setTextureEnabled,
    textureRepeatPreviewEnabled,
    setTextureRepeatPreviewEnabled,
    textureFilterPreview,
    setTextureFilterPreview,
    boneIndexLabelsEnabled,
    setBoneIndexLabelsEnabled,
    rigOpacity,
    setRigOpacity,
    rigThicknessScale,
    setRigThicknessScale,
    skinPointOverlayEnabled,
    setSkinPointOverlayEnabled,
    shaderEnabled,
    setShaderEnabled,
    perspectiveEnabled,
    setPerspectiveEnabled,
    modelOpacity,
    setModelOpacity,
  };

  const outlinerPanel = (
    <Outliner
      title={theme.panelTitles.outliner}
      clipsCount={model.clips.length}
      items={outlinerItems}
      selectedItemIds={selectedOutlinerIds}
      onSelectScene={handleSelectScene}
      onSelectItem={handleSelectOutlinerItem}
      onToggleVisibility={handleToggleOutlinerVisibility}
      onSelectAll={handleSelectAllOutlinerItems}
      onClearSelection={handleClearObjectSelection}
      onRenameSelected={handleRenameSelectedOutlinerItem}
      onDuplicateSelected={handleDuplicateSelectedOutlinerItem}
      onDeleteSelected={handleDeleteSelectedOutlinerItem}
      onMoveSelected={handleMoveSelectedOutlinerItem}
      objectEditingEnabled={modelObjectAuthoringEnabled}
      objectEditingDisabledReason={modelObjectAuthoringDisabledReason}
      canMoveSelectedEarlier={selectedOutlinerReorder.canMoveEarlier}
      canMoveSelectedLater={selectedOutlinerReorder.canMoveLater}
      onHideSelected={handleHideSelectedOutlinerItems}
      onHideUnselected={handleHideUnselectedOutlinerItems}
      onUnhideAll={handleUnhideAllOutlinerItems}
      onTransformSelected={handleTransformSelectedOutlinerItem}
      onAssignMaterial={handleAssignSelectedMaterial}
      onFlipWinding={handleFlipSelectedWinding}
      onPrepareGeometry={handlePrepareSelectedGeometry}
      onAppendStaticModel={handleAppendStaticModel}
    />
  );

  const propertiesPanel = (
    <div className="inspector-stack">
      <Inspector
        title={theme.panelTitles.inspector}
        selected={ui.selected}
        clips={model.clips}
        currentClipName={playback.currentClipName}
        onChangeClip={changeClip}
        skeleton={model.skeleton}
        displayBones={rigHierarchyBones}
        onSelectBone={handleViewportBoneSelect}
        showWeightPreview={workspace.showWeightSection ? showWeightPreview : false}
        onToggleWeightPreview={workspace.showWeightSection ? toggleWeightPreview : undefined}
        transformMode={transformMode}
        onSetTransformMode={boneTransformOwner !== 'disabled' ? setTransformMode : undefined}
        onNudgeBone={onNudgeBone}
        showBoneLabels={shouldShowBoneLabels}
        onToggleBoneLabels={toggleBoneLabels}
        showBonePanel={workspace.showBonePanel}
        showClipList={workspace.showClipList}
        showTransformControls={workspace.showTransformControls}
        editorMode={editorMode}
      />
      {modeWorkspacePanel}
    </div>
  );

  const showTimeline = theme.shellVariant === 'original' ? workspace.showTimeline : editorMode === 'animate';

  return (
    <div
      className="app-shell"
      data-testid="app-shell"
      data-theme={themeId}
      data-shell-variant={theme.shellVariant}
      data-editor-mode={editorMode}
    >
      <Toolbar
        onOpen={handleOpen}
        onOpenProject={handleOpenProject}
        onSaveProject={handleSaveProject}
        onRecoverProject={handleRecoverProject}
        onExport={handleExport}
        onExportGlb={handleExportGlb}
        onExportFbx={handleExportFbx}
        onExportSmf={handleExportSmf}
        smfExportEnabled={hasModel && smfDiagnosticReport.canExportSmf}
        onPing={pingRust}
        onUndo={handleEditorUndo}
        onRedo={handleEditorRedo}
        undoAvailable={editorUndoAvailable || outlinerUndoAvailable || skinUndoAvailable}
        redoAvailable={editorRedoAvailable || outlinerRedoAvailable || skinRedoAvailable}
        onFileChange={handleFileInputChange}
        editorMode={editorMode}
        setEditorMode={handleEditorModeChange}
        {...viewportControlsProps}
        theme={theme}
        themeId={themeId}
        setThemeId={handleThemeChange}
      />

      {/* Simple pure error banner (no extra deps) - always in DOM even when not shown (for e2e), hidden via style when no error */}
      <div
        data-testid="error-banner"
        className="error-banner bg-red-900/80 text-red-200 text-xs px-3 py-1 flex items-center gap-2"
        style={{ display: ui.errorMsg ? 'flex' : 'none' }}
      >
        {ui.errorMsg && (
          <>
            <span>{ui.errorMsg}</span>
            <button className="ml-auto underline" onClick={ui.clearError}>dismiss</button>
          </>
        )}
      </div>

      <div className="main-area">
        {theme.shellVariant === 'original' && outlinerPanel}
        {theme.shellVariant === 'modern' && hasModel && modernPanel && (
          <div
            ref={modernPanelRef}
            className={`modern-support-panel modern-support-panel-${modernPanel}`}
            data-testid="modern-support-panel"
            data-panel={modernPanel}
            role="dialog"
            aria-label={modernPanel === 'scene' ? 'Scene panel' : 'Properties panel'}
            tabIndex={-1}
            onKeyDown={handleModernPanelKeyDown}
          >
            <button type="button" className="modern-panel-close" data-testid="modern-panel-close" aria-label="Close supporting panel" onClick={closeModernPanel}>
              <X size={18} aria-hidden="true" />
            </button>
            {modernPanel === 'scene' ? outlinerPanel : propertiesPanel}
            <div className="modern-panel-switcher" role="group" aria-label="Supporting panel">
              <button type="button" className={modernPanel === 'scene' ? 'active' : ''} aria-pressed={modernPanel === 'scene'} data-testid="modern-panel-scene" onClick={(event) => openModernPanel('scene', event.currentTarget)}>
                <ListBullets size={17} aria-hidden="true" /><span>Scene</span>
              </button>
              <button type="button" className={modernPanel === 'properties' ? 'active' : ''} aria-pressed={modernPanel === 'properties'} data-testid="modern-panel-properties" onClick={(event) => openModernPanel('properties', event.currentTarget)}>
                <SlidersHorizontal size={17} aria-hidden="true" /><span>Properties</span>
              </button>
            </div>
          </div>
        )}

        <div
          data-testid="viewport-container"
          className="viewport-container relative"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const files = Array.from(e.dataTransfer.files ?? [])
            if (files.length > 0) handleDrop(files)
          }}
        >
          <ThreeViewport
            root={model.root}
            skeleton={model.skeleton}
            clips={model.clips}
            isPlaying={playback.isPlaying}
            currentTime={playback.currentTime}
            currentClipName={playback.currentClipName}
            playbackSpeed={playback.playbackSpeed}
            onTimeUpdate={playback.reportCurrentTime}
            onSelectBone={handleViewportBoneSelect}
            onSelectObject={handleSelectViewportObject}
            onClearObjectSelection={handleClearObjectSelection}
            onObjectContextMenu={handleViewportObjectContextMenu}
            onBoneTransformEdit={handleBoneTransformEdit}
            onCreateRigChildAtWorld={createChildForSelectedBoneAtWorld}
            onMoveRigBoneToWorld={moveRigBoneToWorld}
            onRotateRigBone={rotateRigBoneAroundAxis}
            onSolveRigIk={solveRigIkPose}
            selectedBoneName={ui.selected}
            selectedObjectIds={selectedOutlinerIds}
            selectionOverlayRevision={outlinerRevision}
            weightPreviewEnabled={showWeightPreview}
            transformMode={transformMode}
            onSetTransformMode={setTransformMode}
            boneTransformOwner={boneTransformOwner}
            boneLabelsEnabled={shouldShowBoneLabels}
            rigToolMode={rigToolMode}
            editorMode={editorMode}
            viewportLayout={viewportLayout}
            wireframeEnabled={ui.wireframeEnabled}
            gridEnabled={gridEnabled}
            axesEnabled={axesEnabled}
            textureEnabled={textureEnabled}
            textureRepeatPreviewEnabled={textureRepeatPreviewEnabled}
            textureFilterPreview={textureFilterPreview}
            boneIndexLabelsEnabled={boneIndexLabelsEnabled}
            rigOpacity={rigOpacity}
            rigThicknessScale={rigThicknessScale}
            skinPointOverlayEnabled={skinPointOverlayEnabled}
            shaderEnabled={shaderEnabled}
            perspectiveEnabled={perspectiveEnabled}
            modelOpacity={modelOpacity}
            restPoseSnapshot={restPoseSnapshot}
            restPoseGhostEnabled={restPoseGhostEnabled}
            motionTrailsEnabled={motionTrailsEnabled}
            onionSkinEnabled={onionSkinEnabled}
            themeId={themeId}
            onPaintSkinVertices={applySkinPaint}
            onSkinPaintStrokeStart={beginSkinPaintStroke}
            onSkinPaintStrokeEnd={endSkinPaintStroke}
            onInspectSkinVertex={onInspectSkinVertex}
            skinPaintMode={skinPaintMode}
            skinPaintPose={skinPaintPose}
            skinPaintTargetMode={skinPaintTargetMode}
            skinPaintRadius={skinPaintRadius}
            skinPaintStrength={skinPaintStrength}
            skinPaintTargetWeight={skinPaintTargetWeight}
            skinPaintFalloff={skinPaintFalloff}
            skinSelectionEnabled={theme.shellVariant === 'modern' && editorMode === 'skin' && modernSkinTool === 'pick'}
          />
          {theme.shellVariant === 'modern' && editorMode === 'skin' && hasModel && (
            <ModernSkinWorkspace
              selected={selectedBoneName}
              skeleton={model.skeleton}
              activeTool={modernSkinTool}
              radius={skinPaintRadius}
              strength={skinPaintStrength}
              dirty={skinEditHasDirtyState}
              blockReason={skinEditBlockReason}
              undoAvailable={skinUndoAvailable}
              redoAvailable={skinRedoAvailable}
              onToolChange={setModernSkinTool}
              onPaintModeChange={handleSkinPaintModeChange}
              onRadiusChange={onSkinPaintRadiusChange}
              onStrengthChange={onSkinPaintStrengthChange}
              onUndo={undoSkinPaint}
              onRedo={redoSkinPaint}
              onOpenAdvanced={(trigger) => openModernPanel('properties', trigger)}
            />
          )}
          {theme.shellVariant === 'modern' && (
            <ViewportControls {...viewportControlsProps} variant="overlay" />
          )}
          {theme.shellVariant === 'modern' && !hasModel && !ui.isLoading && (
            <div className="modern-empty-state" data-testid="modern-empty-state">
              <div className="modern-empty-eyebrow">Model workspace</div>
              <h1>Start with a model</h1>
              <p>Open or drop an SMF, GLB, GLTF, FBX, or OBJ asset to inspect it.</p>
              <button type="button" className="modern-empty-open" data-testid="modern-empty-open" onClick={handleOpen}>
                Open model
              </button>
            </div>
          )}
          {theme.shellVariant === 'modern' && hasModel && editorMode !== 'skin' && (
            <div className="modern-panel-triggers" aria-label="Supporting panels">
              <button type="button" aria-pressed={modernPanel === 'scene'} data-testid="modern-scene-trigger" onClick={(event) => openModernPanel('scene', event.currentTarget)}>
                <ListBullets size={17} aria-hidden="true" /><span>Scene</span>
              </button>
              <button type="button" aria-pressed={modernPanel === 'properties'} data-testid="modern-properties-trigger" onClick={(event) => openModernPanel('properties', event.currentTarget)}>
                <SlidersHorizontal size={17} aria-hidden="true" /><span>Properties</span>
              </button>
            </div>
          )}
          {/* Simple pure loading overlay (no deps) */}
          {ui.isLoading && (
            <div
              data-testid="loading-overlay"
              data-smf-codec-operation={smfCodecActivity?.operation ?? ''}
              data-smf-codec-execution={smfCodecActivity?.execution ?? ''}
              data-smf-codec-percent={smfCodecActivity?.percent ?? ''}
              className="absolute inset-0 bg-slate-950/60 flex items-center justify-center text-sm text-slate-200 pointer-events-none"
            >
              {smfCodecActivity ? (
                <div className="smf-codec-progress" data-testid="smf-codec-progress">
                  <span>
                    {smfCodecActivity.operation === 'import' ? 'Importing' : 'Exporting'} SMF
                    {' '}
                    {smfCodecActivity.percent}%
                  </span>
                  <progress
                    aria-label={`${smfCodecActivity.operation === 'import' ? 'Importing' : 'Exporting'} SMF`}
                    max={100}
                    value={smfCodecActivity.percent}
                  />
                  {smfCodecActivity.execution === 'sync-fallback' && (
                    <span className="smf-codec-fallback">Synchronous fallback</span>
                  )}
                </div>
              ) : (
                ui.status.startsWith('Export') ? 'Exporting model…' : 'Loading model…'
              )}
            </div>
          )}
          <div data-testid="status-text" className={`status-overlay absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded pointer-events-none ${ui.isLoading ? 'bg-amber-900/70 text-amber-200' : 'bg-black/50 text-slate-300'}`}>
            {ui.status}
            {ui.isLoading && ' …'}
          </div>
          <div className="viewport-drop-hint absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded bg-black/40 text-slate-400 pointer-events-none">Drop {supportedModelFormatsLabel()} here</div>
        </div>

        {theme.shellVariant === 'original' && propertiesPanel}
      </div>

      {showTimeline && (
        <Timeline
          isPlaying={playback.isPlaying}
          currentTime={playback.currentTime}
          duration={playback.duration}
          onTogglePlay={togglePlay}
          onReset={() => playback.setCurrentTime(0)}
          onScrub={onScrub}
          onSpeedChange={setSpeed}
          playbackSpeed={playback.playbackSpeed}
          sampleFrameMultiplier={animationClipMetadata.sampleFrameMultiplier}
          sampleFrameKeyCount={animationTimelineSummary.keyframeTimes.length}
          keyframeTimes={timelineKeyframeTimes}
          draggableKeyframeTimes={animationAuthoredKeyTimes}
          selectedKeyTime={animationSelectedKeyTime}
          onSelectKeyframe={selectAnimationKeyframeTime}
          onInsertKeyframeAtTime={insertAnimationKeyframeAtTime}
          onMoveKeyframe={moveSelectedAnimationKeyframe}
          disabled={model.clips.length === 0}
        />
      )}

      {pendingReplacement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          data-testid="replacement-dialog-backdrop"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="replacement-dialog-title"
            className="w-full max-w-md rounded border border-slate-600 bg-slate-900 p-4 text-slate-100 shadow-xl"
            data-testid="replacement-dialog"
          >
            <h2 id="replacement-dialog-title" className="text-sm font-semibold">Discard unsaved changes?</h2>
            <p className="mt-2 text-xs text-slate-300">
              Loading <span className="font-medium text-slate-100">{pendingReplacement}</span> will replace the current model and its authoring history.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" autoFocus className="toolbar-action" data-testid="cancel-model-replacement" onClick={cancelPendingReplacement}>
                Cancel
              </button>
              <button type="button" className="toolbar-action bg-red-700" data-testid="confirm-model-replacement" onClick={() => void confirmPendingReplacement()}>
                Discard and load
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
