import React, { useEffect } from 'react'
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
    handleFileInputChange,
    handleDrop,
    handleSelectBone,
    setupKeyboard,
    togglePlay,
    changeClip,
    onScrub,
    setSpeed,
    pingRust,
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
        onPing={pingRust}
        isLoading={ui.isLoading}
        onFileChange={handleFileInputChange}
      />

      {/* Simple pure error banner (no extra deps) - clear on load or dismiss */}
      {ui.errorMsg && (
        <div data-testid="error-banner" className="bg-red-900/80 text-red-200 text-xs px-3 py-1 flex items-center gap-2">
          <span>{ui.errorMsg}</span>
          <button className="ml-auto underline" onClick={ui.clearError}>dismiss</button>
        </div>
      )}

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
          <div className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded bg-black/40 text-slate-400 pointer-events-none">Drop .smf/.glb/.fbx here</div>
        </div>

        <Inspector
          selected={ui.selected}
          clips={model.clips}
          currentClipName={playback.currentClipName}
          onChangeClip={changeClip}
          skeleton={model.skeleton}
          onSelectBone={handleSelectBone}
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
