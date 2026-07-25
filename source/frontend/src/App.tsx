import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ThreeViewport from './components/ThreeViewport'
import Timeline from './components/Timeline'
import Outliner from './components/Outliner'
import Inspector from './components/Inspector'
import Toolbar from './components/Toolbar'
import SkinPanel from './components/SkinPanel';
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
import { getClipByName, summarizeAnimationTimeline } from './utils/animationTimeline'
import { validateRig } from './utils/rigValidation'
import { collectRigDeformBoneNames, collectRigHierarchyBones } from './utils/rigHierarchy'
import {
  makeEditorHistory,
  popRedo,
  popUndo,
  pushEditorHistory,
  type EditorHistoryState,
} from './utils/editorHistory'

type WorkspaceProfile = {
  showTimeline: boolean;
  showClipList: boolean;
  showBonePanel: boolean;
  showTransformControls: boolean;
  showWeightSection: boolean;
  boneLabelsEnabledByDefault: boolean;
};

interface OutlinerVisibilitySnapshot {
  visibleById: Record<string, boolean>;
  selectedIds: string[];
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameOutlinerVisibilitySnapshot(
  left: OutlinerVisibilitySnapshot,
  right: OutlinerVisibilitySnapshot,
): boolean {
  const leftIds = Object.keys(left.visibleById).sort();
  const rightIds = Object.keys(right.visibleById).sort();
  return sameStringList(leftIds, rightIds)
    && leftIds.every((id) => left.visibleById[id] === right.visibleById[id])
    && sameStringList(left.selectedIds, right.selectedIds);
}

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
    showBonePanel: false,
    showTransformControls: false,
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
    smfRoundtripReport,
    smfCodecActivity,
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
    animationClipMetadata,
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
    changeAnimationClipLoop,
    changeAnimationClipSampleFrameMultiplier,
  } = useLoadModel({ allocateHistoryOrder });

  const [outlinerRevision, setOutlinerRevision] = useState(0);
  const [selectedOutlinerIds, setSelectedOutlinerIds] = useState<string[]>([]);
  const outlinerHistoryRef = useRef<EditorHistoryState<OutlinerVisibilitySnapshot>>(makeEditorHistory());
  const outlinerHistoryIdRef = useRef(0);
  const [outlinerUndoAvailable, setOutlinerUndoAvailable] = useState(false);
  const [outlinerRedoAvailable, setOutlinerRedoAvailable] = useState(false);
  const [outlinerUndoOrder, setOutlinerUndoOrder] = useState(0);
  const [outlinerRedoOrder, setOutlinerRedoOrder] = useState(0);

  const workspace = WORKSPACE_BY_MODE[editorMode];
  const boneTransformOwner: BoneTransformOwner =
    editorMode === 'rig'
      ? 'pose'
      : editorMode === 'animate'
        ? 'animation'
        : 'disabled';
  const shouldShowBoneLabels = showBoneLabels || workspace.boneLabelsEnabledByDefault;
  const hasModel = !!model.root;
  const handleThemeChange = useCallback((nextThemeId: AppThemeId) => {
    const nextTheme = getAppTheme(nextThemeId);
    setThemeId(nextThemeId);
    if (hasModel && viewportLayout === theme.preferredViewportLayout) {
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
  const currentClip = useMemo(
    () => getClipByName(model.clips, playback.currentClipName),
    [model.clips, playback.currentClipName],
  );
  const animationTimelineSummary = useMemo(
    () => summarizeAnimationTimeline(currentClip, selectedBoneName),
    [currentClip, selectedBoneName],
  );
  const rigValidationReport = validateRig(model.skeleton, model.root);
  const timelineKeyframeTimes = animationTimelineSummary.selectedKeyframeTimes.length > 0
    ? animationTimelineSummary.selectedKeyframeTimes
    : animationTimelineSummary.keyframeTimes;
  const outlinerItems = useMemo(
    () => collectModelOutlinerItems(model.root),
    // Visibility changes mutate the retained Three root; this revision is the invalidation token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model.root, outlinerRevision],
  );
  const getOutlinerItemName = useCallback((id: string): string => {
    const item = outlinerItems.find((candidate) => candidate.id === id);
    return item?.name ?? 'submodel';
  }, [outlinerItems]);
  const refreshOutlinerHistoryAvailability = useCallback(() => {
    setOutlinerUndoAvailable(outlinerHistoryRef.current.undo.length > 0);
    setOutlinerRedoAvailable(outlinerHistoryRef.current.redo.length > 0);
    setOutlinerUndoOrder(outlinerHistoryRef.current.undo.at(-1)?.order ?? 0);
    setOutlinerRedoOrder(outlinerHistoryRef.current.redo.at(-1)?.redoOrder ?? 0);
  }, []);
  const captureOutlinerVisibilitySnapshot = useCallback((): OutlinerVisibilitySnapshot => {
    const visibleById: Record<string, boolean> = {};
    const knownIds = new Set<string>();
    for (const item of outlinerItems) {
      knownIds.add(item.id);
      const object = model.root?.getObjectByProperty('uuid', item.id);
      visibleById[item.id] = object ? object.visible : item.visible;
    }

    return {
      visibleById,
      selectedIds: selectedOutlinerIds.filter((id) => knownIds.has(id)),
    };
  }, [model.root, outlinerItems, selectedOutlinerIds]);
  const applyOutlinerVisibilitySnapshot = useCallback((snapshot: OutlinerVisibilitySnapshot): number => {
    let changed = 0;
    for (const [id, visible] of Object.entries(snapshot.visibleById)) {
      const object = model.root?.getObjectByProperty('uuid', id);
      if (object && object.visible !== visible) {
        object.visible = visible;
        changed += 1;
      }
    }

    const validSelection = snapshot.selectedIds.filter((id) => (
      outlinerItems.some((item) => item.id === id)
    ));
    setSelectedOutlinerIds(validSelection);
    setOutlinerRevision((value) => value + 1);
    return changed;
  }, [model.root, outlinerItems]);
  const pushOutlinerVisibilityHistory = useCallback((
    label: string,
    before: OutlinerVisibilitySnapshot,
    after: OutlinerVisibilitySnapshot,
  ): boolean => {
    if (sameOutlinerVisibilitySnapshot(before, after)) return false;

    outlinerHistoryRef.current = pushEditorHistory(outlinerHistoryRef.current, {
      id: `outliner-${outlinerHistoryIdRef.current += 1}`,
      label,
      domain: 'outliner',
      before,
      after,
      order: allocateHistoryOrder(),
    });
    refreshOutlinerHistoryAvailability();
    return true;
  }, [allocateHistoryOrder, refreshOutlinerHistoryAvailability]);
  const undoOutlinerVisibility = useCallback((): boolean => {
    const result = popUndo(outlinerHistoryRef.current, allocateHistoryOrder());
    if (!result.entry) return false;

    outlinerHistoryRef.current = result.state;
    const changed = applyOutlinerVisibilitySnapshot(result.entry.before);
    refreshOutlinerHistoryAvailability();
    ui.setStatus(`Undid ${result.entry.label}${changed > 0 ? ` (${changed} visibility change${changed === 1 ? '' : 's'})` : ''}.`);
    return true;
  }, [allocateHistoryOrder, applyOutlinerVisibilitySnapshot, refreshOutlinerHistoryAvailability, ui]);
  const redoOutlinerVisibility = useCallback((): boolean => {
    const result = popRedo(outlinerHistoryRef.current, allocateHistoryOrder());
    if (!result.entry) return false;

    outlinerHistoryRef.current = result.state;
    const changed = applyOutlinerVisibilitySnapshot(result.entry.after);
    refreshOutlinerHistoryAvailability();
    ui.setStatus(`Redid ${result.entry.label}${changed > 0 ? ` (${changed} visibility change${changed === 1 ? '' : 's'})` : ''}.`);
    return true;
  }, [allocateHistoryOrder, applyOutlinerVisibilitySnapshot, refreshOutlinerHistoryAvailability, ui]);
  const handleEditorUndo = useCallback((): boolean => {
    const candidates = [
      editorUndoAvailable ? { domain: 'editor' as const, order: editorUndoOrder } : null,
      skinUndoAvailable ? { domain: 'skin' as const, order: skinUndoOrder } : null,
      outlinerUndoAvailable ? { domain: 'outliner' as const, order: outlinerUndoOrder } : null,
    ].filter((candidate): candidate is { domain: 'editor' | 'skin' | 'outliner'; order: number } => !!candidate);
    const latest = candidates.reduce<{ domain: 'editor' | 'skin' | 'outliner'; order: number } | null>((best, candidate) => (
      !best || candidate.order > best.order ? candidate : best
    ), null);

    if (latest?.domain === 'editor') {
      undoEditorHistory();
      return true;
    } else if (latest?.domain === 'skin') {
      undoSkinPaint();
      return true;
    } else if (latest?.domain === 'outliner') {
      undoOutlinerVisibility();
      return true;
    } else {
      undoEditorHistory();
      return true;
    }
  }, [
    editorUndoAvailable,
    editorUndoOrder,
    outlinerUndoAvailable,
    outlinerUndoOrder,
    skinUndoAvailable,
    skinUndoOrder,
    undoEditorHistory,
    undoOutlinerVisibility,
    undoSkinPaint,
  ]);
  const handleEditorRedo = useCallback((): boolean => {
    const candidates = [
      editorRedoAvailable ? { domain: 'editor' as const, order: editorRedoOrder } : null,
      skinRedoAvailable ? { domain: 'skin' as const, order: skinRedoOrder } : null,
      outlinerRedoAvailable ? { domain: 'outliner' as const, order: outlinerRedoOrder } : null,
    ].filter((candidate): candidate is { domain: 'editor' | 'skin' | 'outliner'; order: number } => !!candidate);
    const latest = candidates.reduce<{ domain: 'editor' | 'skin' | 'outliner'; order: number } | null>((best, candidate) => (
      !best || candidate.order > best.order ? candidate : best
    ), null);

    if (latest?.domain === 'editor') {
      redoEditorHistory();
      return true;
    } else if (latest?.domain === 'skin') {
      redoSkinPaint();
      return true;
    } else if (latest?.domain === 'outliner') {
      redoOutlinerVisibility();
      return true;
    } else {
      redoEditorHistory();
      return true;
    }
  }, [
    editorRedoAvailable,
    editorRedoOrder,
    outlinerRedoAvailable,
    outlinerRedoOrder,
    redoEditorHistory,
    redoOutlinerVisibility,
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
  const handleToggleOutlinerVisibility = useCallback((id: string) => {
    const object = model.root?.getObjectByProperty('uuid', id);
    if (!object) return;
    const before = captureOutlinerVisibilitySnapshot();
    object.visible = !object.visible;
    const after = captureOutlinerVisibilitySnapshot();
    pushOutlinerVisibilityHistory('outliner visibility toggle', before, after);
    setOutlinerRevision((value) => value + 1);
    const name = object.name || object.type || 'submodel';
    ui.setStatus(`${object.visible ? 'Shown' : 'Hidden'} submodel: ${name}`);
  }, [captureOutlinerVisibilitySnapshot, model.root, pushOutlinerVisibilityHistory, ui]);
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
    const before = captureOutlinerVisibilitySnapshot();
    let changed = 0;
    for (const id of selectedOutlinerIds) {
      const object = model.root?.getObjectByProperty('uuid', id);
      if (object && object.visible) {
        object.visible = false;
        changed += 1;
      }
    }
    const after = captureOutlinerVisibilitySnapshot();
    pushOutlinerVisibilityHistory('hide selected submodels', before, after);
    if (changed > 0) {
      setOutlinerRevision((value) => value + 1);
    }
    ui.setStatus(`Hidden ${changed} selected submodel${changed === 1 ? '' : 's'}.`);
  }, [captureOutlinerVisibilitySnapshot, model.root, pushOutlinerVisibilityHistory, selectedOutlinerIds, ui]);
  const handleHideUnselectedOutlinerItems = useCallback(() => {
    if (selectedOutlinerIds.length === 0) {
      ui.setStatus('Select submodels before hiding unselected items.');
      return;
    }
    const selected = new Set(selectedOutlinerIds);
    const before = captureOutlinerVisibilitySnapshot();
    let changed = 0;
    for (const item of outlinerItems) {
      if (selected.has(item.id)) continue;
      const object = model.root?.getObjectByProperty('uuid', item.id);
      if (object && object.visible) {
        object.visible = false;
        changed += 1;
      }
    }
    const after = captureOutlinerVisibilitySnapshot();
    pushOutlinerVisibilityHistory('hide unselected submodels', before, after);
    if (changed > 0) {
      setOutlinerRevision((value) => value + 1);
    }
    ui.setStatus(`Hidden ${changed} unselected submodel${changed === 1 ? '' : 's'}.`);
  }, [captureOutlinerVisibilitySnapshot, model.root, outlinerItems, pushOutlinerVisibilityHistory, selectedOutlinerIds, ui]);
  const handleUnhideAllOutlinerItems = useCallback(() => {
    const before = captureOutlinerVisibilitySnapshot();
    let changed = 0;
    for (const item of outlinerItems) {
      const object = model.root?.getObjectByProperty('uuid', item.id);
      if (object && !object.visible) {
        object.visible = true;
        changed += 1;
      }
    }
    const after = captureOutlinerVisibilitySnapshot();
    pushOutlinerVisibilityHistory('show all submodels', before, after);
    if (changed > 0) {
      setOutlinerRevision((value) => value + 1);
    }
    ui.setStatus(`Shown ${changed} submodel${changed === 1 ? '' : 's'}.`);
  }, [captureOutlinerVisibilitySnapshot, model.root, outlinerItems, pushOutlinerVisibilityHistory, ui]);
  const modeWorkspacePanel = (() => {
    if (editorMode === 'rig') {
      return (
        <RigPanel
          selected={ui.selected}
          deformBoneNames={rigDeformBoneNames}
          selectedIsDeformBone={selectedIsDeformBone}
          report={rigValidationReport}
          sourceFormat={sourceFormat}
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
          editorMode={editorMode}
        />
      );
    }
    if (editorMode === 'skin') {
      return (
        <SkinPanel
          selected={ui.selected}
          skeleton={model.skeleton}
          sourceFormat={sourceFormat}
          showWeightPreview={showWeightPreview}
          onToggleWeightPreview={workspace.showWeightSection ? toggleWeightPreview : undefined}
          showBoneLabels={shouldShowBoneLabels}
          onToggleBoneLabels={toggleBoneLabels}
          skinEditHasDirtyState={skinEditHasDirtyState}
          skinEditBlockReason={skinEditBlockReason}
          skinPaintMode={skinPaintMode}
          skinPaintTargetMode={skinPaintTargetMode}
          skinPaintRadius={skinPaintRadius}
          skinPaintStrength={skinPaintStrength}
          skinPaintTarget={skinPaintTarget}
          skinAutoWeightAlgorithm={skinAutoWeightAlgorithm}
          skinAutoWeightPower={skinAutoWeightPower}
          skinAutoWeightNormalWeighting={skinAutoWeightNormalWeighting}
          skinAutoWeightMaxInfluences={skinAutoWeightMaxInfluences}
          onSkinPaintModeChange={onSkinPaintModeChange}
          onSkinPaintTargetModeChange={onSkinPaintTargetModeChange}
          onSkinPaintRadiusChange={onSkinPaintRadiusChange}
          onSkinPaintStrengthChange={onSkinPaintStrengthChange}
          onSkinPaintTargetChange={onSkinPaintTargetChange}
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
          editorMode={editorMode}
        />
      );
    }
    if (editorMode === 'animate') {
      return (
        <AnimatePanel
          clips={model.clips}
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
          clipMetadata={animationClipMetadata}
          onInsertKeyframe={insertAnimationKeyframe}
          onUpdateKeyframe={updateAnimationKeyframe}
          onDeleteKeyframe={deleteSelectedAnimationKeyframe}
          onCopyKeyframe={copySelectedAnimationKeyframe}
          onPasteKeyframe={pasteAnimationKeyframe}
          onInterpolationChange={changeAnimationInterpolation}
          onSnapStepChange={changeAnimationSnapStep}
          onClipLoopChange={changeAnimationClipLoop}
          onClipSampleFrameMultiplierChange={changeAnimationClipSampleFrameMultiplier}
          onRenameClip={renameCurrentAnimationClip}
          onDuplicateClip={duplicateCurrentAnimationClip}
          onDeleteClip={deleteCurrentAnimationClip}
          onMoveClipUp={moveCurrentAnimationClipUp}
          onMoveClipDown={moveCurrentAnimationClipDown}
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
          smfRoundtripReport={smfRoundtripReport}
          onRunSmfRoundtripCheck={handleRunSmfRoundtripCheck}
          onSaveSmfDiagnosticReport={handleSaveSmfDiagnosticReport}
        />
      );
    }
    return null;
  })();

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
    if (!hasModel && viewportLayout !== 'single') {
      setViewportLayout('single');
    }
  }, [hasModel, setViewportLayout, viewportLayout]);

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
    outlinerHistoryRef.current = makeEditorHistory();
    refreshOutlinerHistoryAvailability();
  }, [model.root, refreshOutlinerHistoryAvailability]);

  return (
    <div
      className="app-shell"
      data-testid="app-shell"
      data-theme={themeId}
      data-editor-mode={editorMode}
    >
      <Toolbar
        onOpen={handleOpen}
        onExport={handleExport}
        onExportGlb={handleExportGlb}
        onExportFbx={handleExportFbx}
        onExportSmf={handleExportSmf}
        onPing={pingRust}
        onUndo={handleEditorUndo}
        onRedo={handleEditorRedo}
        undoAvailable={editorUndoAvailable || outlinerUndoAvailable || skinUndoAvailable}
        redoAvailable={editorRedoAvailable || outlinerRedoAvailable || skinRedoAvailable}
        isLoading={ui.isLoading}
        onFileChange={handleFileInputChange}
        hasModel={hasModel}
        editorMode={editorMode}
        setEditorMode={setEditorMode}
        viewportLayout={viewportLayout}
        setViewportLayout={setViewportLayout}
        wireframeEnabled={ui.wireframeEnabled}
        setWireframeEnabled={ui.setWireframeEnabled}
        gridEnabled={gridEnabled}
        setGridEnabled={setGridEnabled}
        axesEnabled={axesEnabled}
        setAxesEnabled={setAxesEnabled}
        textureEnabled={textureEnabled}
        setTextureEnabled={setTextureEnabled}
        textureRepeatPreviewEnabled={textureRepeatPreviewEnabled}
        setTextureRepeatPreviewEnabled={setTextureRepeatPreviewEnabled}
        textureFilterPreview={textureFilterPreview}
        setTextureFilterPreview={setTextureFilterPreview}
        boneIndexLabelsEnabled={boneIndexLabelsEnabled}
        setBoneIndexLabelsEnabled={setBoneIndexLabelsEnabled}
        rigOpacity={rigOpacity}
        setRigOpacity={setRigOpacity}
        rigThicknessScale={rigThicknessScale}
        setRigThicknessScale={setRigThicknessScale}
        skinPointOverlayEnabled={skinPointOverlayEnabled}
        setSkinPointOverlayEnabled={setSkinPointOverlayEnabled}
        shaderEnabled={shaderEnabled}
        setShaderEnabled={setShaderEnabled}
        perspectiveEnabled={perspectiveEnabled}
        setPerspectiveEnabled={setPerspectiveEnabled}
        modelOpacity={modelOpacity}
        setModelOpacity={setModelOpacity}
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
          onHideSelected={handleHideSelectedOutlinerItems}
          onHideUnselected={handleHideUnselectedOutlinerItems}
          onUnhideAll={handleUnhideAllOutlinerItems}
        />

        <div
          data-testid="viewport-container"
          className="viewport-container relative"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files?.[0]
            if (file) handleDrop(file)
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
            onTimeUpdate={playback.setCurrentTime}
            onSelectBone={handleSelectBone}
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
            themeId={themeId}
            onPaintSkinVertices={applySkinPaint}
            onSkinPaintStrokeStart={beginSkinPaintStroke}
            onSkinPaintStrokeEnd={endSkinPaintStroke}
            skinPaintMode={skinPaintMode}
            skinPaintTargetMode={skinPaintTargetMode}
            skinPaintRadius={skinPaintRadius}
            skinPaintStrength={skinPaintStrength}
            skinPaintTarget={skinPaintTarget}
          />
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

        <div className="inspector-stack">
          <Inspector
          title={theme.panelTitles.inspector}
          selected={ui.selected}
          clips={model.clips}
          currentClipName={playback.currentClipName}
          onChangeClip={changeClip}
          skeleton={model.skeleton}
          displayBones={rigHierarchyBones}
          onSelectBone={handleSelectBone}
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
      </div>

      {workspace.showTimeline && (
        <Timeline
          isPlaying={playback.isPlaying}
          currentTime={playback.currentTime}
          duration={playback.duration}
          onTogglePlay={togglePlay}
          onReset={() => playback.setCurrentTime(0)}
          onScrub={onScrub}
          onSpeedChange={setSpeed}
          playbackSpeed={playback.playbackSpeed}
          keyframeTimes={timelineKeyframeTimes}
          draggableKeyframeTimes={animationAuthoredKeyTimes}
          selectedKeyTime={animationSelectedKeyTime}
          onSelectKeyframe={selectAnimationKeyframeTime}
          onInsertKeyframeAtTime={insertAnimationKeyframeAtTime}
          onMoveKeyframe={moveSelectedAnimationKeyframe}
          disabled={model.clips.length === 0}
        />
      )}
    </div>
  )
}
