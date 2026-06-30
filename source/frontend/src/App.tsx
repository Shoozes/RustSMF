import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ThreeViewport, { type ViewportObjectSelectEvent } from './components/ThreeViewport'
import Timeline from './components/Timeline'
import Outliner from './components/Outliner'
import Inspector from './components/Inspector'
import Toolbar from './components/Toolbar'
import SkinPanel from './components/SkinPanel';
import RigPanel from './components/RigPanel';
import AnimatePanel from './components/AnimatePanel';
import ExportPanel from './components/ExportPanel';
import { useLoadModel } from './hooks/useLoadModel'
import type { EditorMode } from './store'
import { supportedModelFormatsLabel } from './utils/modelFormat'
import { collectModelOutlinerItems } from './utils/modelOutliner'
import { getClipByName, summarizeAnimationTimeline } from './utils/animationTimeline'
import { validateRig } from './utils/rigValidation'
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
    showTransformControls: true,
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
  const {
    ui,
    model,
    playback,
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
    setupKeyboard,
    togglePlay,
    changeClip,
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
    smfRoundtripReport,
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
    animationClipboardHasKeyframe,
    animationInterpolation,
    insertAnimationKeyframe,
    updateAnimationKeyframe,
    deleteSelectedAnimationKeyframe,
    copySelectedAnimationKeyframe,
    pasteAnimationKeyframe,
    selectAnimationKeyframeTime,
    changeAnimationInterpolation,
  } = useLoadModel();

  const [outlinerRevision, setOutlinerRevision] = useState(0);
  const [selectedOutlinerIds, setSelectedOutlinerIds] = useState<string[]>([]);
  const outlinerHistoryRef = useRef<EditorHistoryState<OutlinerVisibilitySnapshot>>(makeEditorHistory());
  const outlinerHistoryIdRef = useRef(0);
  const [outlinerUndoAvailable, setOutlinerUndoAvailable] = useState(false);
  const [outlinerRedoAvailable, setOutlinerRedoAvailable] = useState(false);

  const workspace = WORKSPACE_BY_MODE[editorMode];
  const shouldShowBoneLabels = showBoneLabels || workspace.boneLabelsEnabledByDefault;
  const hasModel = !!model.root;
  const hasSkinnedModel = !!model.skeleton && model.skeleton.bones.length > 0;
  const rigBoneNames = model.skeleton?.bones.map((bone) => bone.name).filter(Boolean) ?? [];
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
    [model.root, outlinerRevision],
  );
  const getOutlinerItemName = useCallback((id: string): string => {
    const item = outlinerItems.find((candidate) => candidate.id === id);
    return item?.name ?? 'submodel';
  }, [outlinerItems]);
  const refreshOutlinerHistoryAvailability = useCallback(() => {
    setOutlinerUndoAvailable(outlinerHistoryRef.current.undo.length > 0);
    setOutlinerRedoAvailable(outlinerHistoryRef.current.redo.length > 0);
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
    });
    refreshOutlinerHistoryAvailability();
    return true;
  }, [refreshOutlinerHistoryAvailability]);
  const undoOutlinerVisibility = useCallback((): boolean => {
    const result = popUndo(outlinerHistoryRef.current);
    if (!result.entry) return false;

    outlinerHistoryRef.current = result.state;
    const changed = applyOutlinerVisibilitySnapshot(result.entry.before);
    refreshOutlinerHistoryAvailability();
    ui.setStatus(`Undid ${result.entry.label}${changed > 0 ? ` (${changed} visibility change${changed === 1 ? '' : 's'})` : ''}.`);
    return true;
  }, [applyOutlinerVisibilitySnapshot, refreshOutlinerHistoryAvailability, ui]);
  const redoOutlinerVisibility = useCallback((): boolean => {
    const result = popRedo(outlinerHistoryRef.current);
    if (!result.entry) return false;

    outlinerHistoryRef.current = result.state;
    const changed = applyOutlinerVisibilitySnapshot(result.entry.after);
    refreshOutlinerHistoryAvailability();
    ui.setStatus(`Redid ${result.entry.label}${changed > 0 ? ` (${changed} visibility change${changed === 1 ? '' : 's'})` : ''}.`);
    return true;
  }, [applyOutlinerVisibilitySnapshot, refreshOutlinerHistoryAvailability, ui]);
  const undoSkinEditorHistory = useCallback((): boolean => {
    if (editorMode !== 'skin' || !skinUndoAvailable) return false;
    undoSkinPaint();
    return true;
  }, [editorMode, skinUndoAvailable, undoSkinPaint]);
  const redoSkinEditorHistory = useCallback((): boolean => {
    if (editorMode !== 'skin' || !skinRedoAvailable) return false;
    redoSkinPaint();
    return true;
  }, [editorMode, redoSkinPaint, skinRedoAvailable]);
  const undoRigAnimateEditorHistory = useCallback((): boolean => {
    if ((editorMode !== 'rig' && editorMode !== 'animate') || !editorUndoAvailable) return false;
    undoEditorHistory();
    return true;
  }, [editorMode, editorUndoAvailable, undoEditorHistory]);
  const redoRigAnimateEditorHistory = useCallback((): boolean => {
    if ((editorMode !== 'rig' && editorMode !== 'animate') || !editorRedoAvailable) return false;
    redoEditorHistory();
    return true;
  }, [editorMode, editorRedoAvailable, redoEditorHistory]);
  const handleEditorUndo = useCallback(() => {
    if (!undoSkinEditorHistory() && !undoRigAnimateEditorHistory() && !undoOutlinerVisibility()) {
      undoEditorHistory();
    }
  }, [undoEditorHistory, undoOutlinerVisibility, undoRigAnimateEditorHistory, undoSkinEditorHistory]);
  const handleEditorRedo = useCallback(() => {
    if (!redoSkinEditorHistory() && !redoRigAnimateEditorHistory() && !redoOutlinerVisibility()) {
      redoEditorHistory();
    }
  }, [redoEditorHistory, redoOutlinerVisibility, redoRigAnimateEditorHistory, redoSkinEditorHistory]);
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
          boneNames={rigBoneNames}
          report={rigValidationReport}
          sourceFormat={sourceFormat}
          onRenameSelectedBone={renameSelectedBone}
          onReparentSelectedBone={reparentSelectedBone}
          onCreateChildBone={createChildForSelectedBone}
          onDeleteSelectedBone={deleteSelectedBone}
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
          onInsertKeyframe={insertAnimationKeyframe}
          onUpdateKeyframe={updateAnimationKeyframe}
          onDeleteKeyframe={deleteSelectedAnimationKeyframe}
          onCopyKeyframe={copySelectedAnimationKeyframe}
          onPasteKeyframe={pasteAnimationKeyframe}
          onInterpolationChange={changeAnimationInterpolation}
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
      undo: () => undoSkinEditorHistory() || undoRigAnimateEditorHistory() || undoOutlinerVisibility(),
      redo: () => redoSkinEditorHistory() || redoRigAnimateEditorHistory() || redoOutlinerVisibility(),
    });
    return cleanup;
  }, [
    redoOutlinerVisibility,
    redoRigAnimateEditorHistory,
    redoSkinEditorHistory,
    setupKeyboard,
    undoOutlinerVisibility,
    undoRigAnimateEditorHistory,
    undoSkinEditorHistory,
  ]);

  useEffect(() => {
    if (!hasModel && viewportLayout !== 'single') {
      setViewportLayout('single');
    }
  }, [hasModel, setViewportLayout, viewportLayout]);

  useEffect(() => {
    setOutlinerRevision((value) => value + 1);
    setSelectedOutlinerIds([]);
    outlinerHistoryRef.current = makeEditorHistory();
    refreshOutlinerHistoryAvailability();
  }, [model.root, refreshOutlinerHistoryAvailability]);

  return (
    <div className="app-shell">
      <Toolbar
        onOpen={handleOpen}
        onExport={handleExport}
        onExportSmf={handleExportSmf}
        onPing={pingRust}
        onUndo={handleEditorUndo}
        onRedo={handleEditorRedo}
        undoAvailable={editorUndoAvailable || outlinerUndoAvailable || (editorMode === 'skin' && skinUndoAvailable)}
        redoAvailable={editorRedoAvailable || outlinerRedoAvailable || (editorMode === 'skin' && skinRedoAvailable)}
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
      />

      {/* Simple pure error banner (no extra deps) - always in DOM even when not shown (for e2e), hidden via style when no error */}
      <div
        data-testid="error-banner"
        className="bg-red-900/80 text-red-200 text-xs px-3 py-1 flex items-center gap-2"
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
            selectedBoneName={ui.selected}
            selectedObjectIds={selectedOutlinerIds}
            selectionOverlayRevision={outlinerRevision}
            weightPreviewEnabled={showWeightPreview}
            transformMode={transformMode}
            onSetTransformMode={setTransformMode}
            boneLabelsEnabled={shouldShowBoneLabels}
            editorMode={editorMode}
            viewportLayout={viewportLayout}
            wireframeEnabled={ui.wireframeEnabled}
            gridEnabled={gridEnabled}
            axesEnabled={axesEnabled}
            textureEnabled={textureEnabled}
            boneIndexLabelsEnabled={boneIndexLabelsEnabled}
            rigOpacity={rigOpacity}
            rigThicknessScale={rigThicknessScale}
            skinPointOverlayEnabled={skinPointOverlayEnabled}
            shaderEnabled={shaderEnabled}
            perspectiveEnabled={perspectiveEnabled}
            modelOpacity={modelOpacity}
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
            <div data-testid="loading-overlay" className="absolute inset-0 bg-slate-950/60 flex items-center justify-center text-sm text-slate-200 pointer-events-none">
              Loading model…
            </div>
          )}
          <div data-testid="status-text" className={`absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded pointer-events-none ${ui.isLoading ? 'bg-amber-900/70 text-amber-200' : 'bg-black/50 text-slate-300'}`}>
            {ui.status}
            {ui.isLoading && ' …'}
          </div>
          <div className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded bg-black/40 text-slate-400 pointer-events-none">Drop {supportedModelFormatsLabel()} here</div>
        </div>

        <div className="inspector-stack">
          <Inspector
          selected={ui.selected}
          clips={model.clips}
          currentClipName={playback.currentClipName}
          onChangeClip={changeClip}
          skeleton={model.skeleton}
          onSelectBone={handleSelectBone}
          showWeightPreview={workspace.showWeightSection ? showWeightPreview : false}
          onToggleWeightPreview={workspace.showWeightSection ? toggleWeightPreview : undefined}
          transformMode={transformMode}
          onSetTransformMode={workspace.showTransformControls ? setTransformMode : undefined}
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
          selectedKeyTime={animationSelectedKeyTime}
          onSelectKeyframe={selectAnimationKeyframeTime}
          disabled={model.clips.length === 0}
        />
      )}
    </div>
  )
}
