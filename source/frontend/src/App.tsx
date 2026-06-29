import { useCallback, useEffect, useMemo, useState } from 'react'
import ThreeViewport from './components/ThreeViewport'
import Timeline from './components/Timeline'
import Outliner from './components/Outliner'
import Inspector from './components/Inspector'
import Toolbar from './components/Toolbar'
import SkinPanel from './components/SkinPanel';
import AnimatePanel from './components/AnimatePanel';
import ExportPanel from './components/ExportPanel';
import { useLoadModel } from './hooks/useLoadModel'
import type { EditorMode } from './store'
import { supportedModelFormatsLabel } from './utils/modelFormat'
import { collectModelOutlinerItems } from './utils/modelOutliner'
import { getClipByName, summarizeAnimationTimeline } from './utils/animationTimeline'

type WorkspaceProfile = {
  showTimeline: boolean;
  showClipList: boolean;
  showBonePanel: boolean;
  showTransformControls: boolean;
  showWeightSection: boolean;
  boneLabelsEnabledByDefault: boolean;
};

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
    setTransformMode,
    showBoneLabels,
    toggleBoneLabels,
    smfDiagnosticReport,
    smfRoundtripReport,
    skinEditHasDirtyState,
    skinEditBlockReason,
    skinPaintMode,
    skinPaintRadius,
    skinPaintStrength,
    skinPaintTarget,
    onSkinPaintModeChange,
    onSkinPaintRadiusChange,
    onSkinPaintStrengthChange,
    onSkinPaintTargetChange,
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
  const [selectedOutlinerId, setSelectedOutlinerId] = useState('');

  const workspace = WORKSPACE_BY_MODE[editorMode];
  const shouldShowBoneLabels = showBoneLabels || workspace.boneLabelsEnabledByDefault;
  const hasModel = !!model.root;
  const hasSkinnedModel = !!model.skeleton && model.skeleton.bones.length > 0;
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
  const timelineKeyframeTimes = animationTimelineSummary.selectedKeyframeTimes.length > 0
    ? animationTimelineSummary.selectedKeyframeTimes
    : animationTimelineSummary.keyframeTimes;
  const outlinerItems = useMemo(
    () => collectModelOutlinerItems(model.root),
    [model.root, outlinerRevision],
  );
  const handleSelectScene = useCallback(() => {
    ui.setSelected('Scene');
    setSelectedOutlinerId('');
    ui.setStatus('Selected: Scene');
  }, [ui]);
  const handleSelectOutlinerItem = useCallback((id: string) => {
    const item = outlinerItems.find((candidate) => candidate.id === id);
    if (!item) return;
    setSelectedOutlinerId(id);
    ui.setStatus(`Selected submodel: ${item.name}`);
  }, [outlinerItems, ui]);
  const handleToggleOutlinerVisibility = useCallback((id: string) => {
    const object = model.root?.getObjectByProperty('uuid', id);
    if (!object) return;
    object.visible = !object.visible;
    setOutlinerRevision((value) => value + 1);
    const name = object.name || object.type || 'submodel';
    ui.setStatus(`${object.visible ? 'Shown' : 'Hidden'} submodel: ${name}`);
  }, [model.root, ui]);
  const modeWorkspacePanel = (() => {
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
          skinPaintRadius={skinPaintRadius}
          skinPaintStrength={skinPaintStrength}
          skinPaintTarget={skinPaintTarget}
          onSkinPaintModeChange={onSkinPaintModeChange}
          onSkinPaintRadiusChange={onSkinPaintRadiusChange}
          onSkinPaintStrengthChange={onSkinPaintStrengthChange}
          onSkinPaintTargetChange={onSkinPaintTargetChange}
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
    const cleanup = setupKeyboard();
    return cleanup;
  }, [setupKeyboard]);

  useEffect(() => {
    if (!hasModel && viewportLayout !== 'single') {
      setViewportLayout('single');
    }
  }, [hasModel, setViewportLayout, viewportLayout]);

  useEffect(() => {
    setOutlinerRevision((value) => value + 1);
    setSelectedOutlinerId('');
  }, [model.root]);

  return (
    <div className="app-shell">
      <Toolbar
        onOpen={handleOpen}
        onExport={handleExport}
        onExportSmf={handleExportSmf}
        onPing={pingRust}
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
          selectedItemId={selectedOutlinerId}
          onSelectScene={handleSelectScene}
          onSelectItem={handleSelectOutlinerItem}
          onToggleVisibility={handleToggleOutlinerVisibility}
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
            selectedBoneName={ui.selected}
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
            shaderEnabled={shaderEnabled}
            perspectiveEnabled={perspectiveEnabled}
            modelOpacity={modelOpacity}
            onPaintSkinVertices={applySkinPaint}
            onSkinPaintStrokeStart={beginSkinPaintStroke}
            onSkinPaintStrokeEnd={endSkinPaintStroke}
            skinPaintMode={skinPaintMode}
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
