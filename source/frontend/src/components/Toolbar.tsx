import React from 'react';
import type { EditorMode, ViewportLayout } from '../store';

interface ToolbarProps {
  onOpen: () => void;
  onExport: () => void;
  onExportSmf: () => void;
  onPing: () => void;
  isLoading: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  editorMode: EditorMode;
  setEditorMode: (mode: EditorMode) => void;
  viewportLayout: ViewportLayout;
  setViewportLayout: (layout: ViewportLayout) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  onOpen,
  onExport,
  onExportSmf,
  onPing,
  isLoading,
  onFileChange,
  editorMode,
  setEditorMode,
  viewportLayout,
  setViewportLayout,
}) => {
  const modes: EditorMode[] = ['view', 'rig', 'skin', 'animate', 'export'];
  const modeLabels: Record<EditorMode, string> = {
    view: 'Model',
    rig: 'Rig',
    skin: 'Skin',
    animate: 'Animate',
    export: 'Export',
  };

  return (
    <div className="toolbar">
      <div className="font-semibold tracking-wide">RustSMF</div>
      <button data-testid="open-model-btn" onClick={onOpen} disabled={isLoading}>
        Open Model
      </button>
      <button data-testid="export-btn" onClick={onExport} disabled={isLoading}>
        Export
      </button>
      <button data-testid="export-smf-btn" onClick={onExportSmf} disabled={isLoading}>
        Export as SMF
      </button>
      <button data-testid="ping-rust-btn" onClick={onPing} disabled={isLoading}>
        Ping Rust
      </button>
      <div
        role="tablist"
        aria-label="Editor workspace mode"
        className="mode-tablist"
      >
        {modes.map((mode) => {
          const label = modeLabels[mode];
          const selected = editorMode === mode;
          return (
            <button
              key={mode}
              role="tab"
              aria-selected={selected}
              data-testid={`mode-tab-${mode}`}
              className={`mode-tab ${selected ? 'mode-tab-active' : ''}`}
              onClick={() => setEditorMode(mode)}
              disabled={isLoading}
              type="button"
            >
              {label}
            </button>
          );
        })}
      </div>
      {/* Keep select for existing selectors and accessibility fallback paths. */}
      <select
        data-testid="editor-mode-select"
        value={editorMode}
        onChange={(e) => setEditorMode(e.target.value as EditorMode)}
        disabled={isLoading}
        className="sr-only"
        title="Editor mode (foundation for quad/mode-specific tools)"
      >
        {modes.map((mode) => (
          <option key={mode} value={mode}>
            {modeLabels[mode]}
          </option>
        ))}
      </select>
      <div
        role="group"
        aria-label="Viewport layout"
        className="layout-switch"
      >
        <button
          type="button"
          role="button"
          data-testid="viewport-layout-single"
          className={`layout-btn ${viewportLayout === 'single' ? 'layout-btn-active' : ''}`}
          onClick={() => setViewportLayout('single')}
          disabled={isLoading}
          aria-pressed={viewportLayout === 'single'}
        >
          Single
        </button>
        <button
          type="button"
          role="button"
          data-testid="viewport-layout-quad"
          className={`layout-btn ${viewportLayout === 'quad' ? 'layout-btn-active' : ''}`}
          onClick={() => setViewportLayout('quad')}
          disabled={isLoading}
          aria-pressed={viewportLayout === 'quad'}
        >
          Quad
        </button>
      </div>
      {/* Persistent hidden file input for reliable e2e file simulation (Playwright setInputFiles) */}
      <input
        type="file"
        data-testid="model-file-input"
        style={{ display: 'none' }}
        accept=".smf,.glb,.gltf,.fbx,.obj"
        onChange={onFileChange}
      />
      <div className="text-xs text-slate-400 ml-auto pr-2">
        Drag rotate • Right-drag pan • Wheel zoom • R reset • Space play/pause
      </div>
    </div>
  );
};

export default Toolbar;
