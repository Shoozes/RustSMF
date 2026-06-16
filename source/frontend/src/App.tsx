import { useEffect } from 'react'
import ThreeViewport from './components/ThreeViewport'
import Timeline from './components/Timeline'
import Outliner from './components/Outliner'
import Inspector from './components/Inspector'
import Toolbar from './components/Toolbar'
import { useLoadModel } from './hooks/useLoadModel'

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
    editorMode,
    setEditorMode,
  } = useLoadModel();

  // Setup keyboard once
  useEffect(() => {
    const cleanup = setupKeyboard();
    return cleanup;
  }, [setupKeyboard]);

  return (
    <div className="app-shell">
      <Toolbar
        onOpen={handleOpen}
        onExport={handleExport}
        onExportSmf={handleExportSmf}
        onPing={pingRust}
        isLoading={ui.isLoading}
        onFileChange={handleFileInputChange}
        editorMode={editorMode}
        setEditorMode={setEditorMode}
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
          onSelectScene={() => ui.setSelected('Scene')}
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
            boneLabelsEnabled={showBoneLabels}
            editorMode={editorMode}
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
          <div className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded bg-black/40 text-slate-400 pointer-events-none">Drop .smf/.glb/.fbx/.obj here</div>
        </div>

        <Inspector
          selected={ui.selected}
          clips={model.clips}
          currentClipName={playback.currentClipName}
          onChangeClip={changeClip}
          skeleton={model.skeleton}
          onSelectBone={handleSelectBone}
          showWeightPreview={showWeightPreview}
          onToggleWeightPreview={toggleWeightPreview}
          transformMode={transformMode}
          onSetTransformMode={setTransformMode}
          onNudgeBone={onNudgeBone}
          showBoneLabels={showBoneLabels}
          onToggleBoneLabels={toggleBoneLabels}
          editorMode={editorMode}
        />
      </div>

      <Timeline
        isPlaying={playback.isPlaying}
        currentTime={playback.currentTime}
        duration={playback.duration}
        onTogglePlay={togglePlay}
        onReset={() => playback.setCurrentTime(0)}
        onScrub={onScrub}
        onSpeedChange={setSpeed}
        disabled={model.clips.length === 0}
      />
    </div>
  )
}
