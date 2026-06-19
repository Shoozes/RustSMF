import React from 'react';
import type { EditorMode, ViewportLayout } from '../store';
import { SUPPORTED_MODEL_ACCEPT } from '../utils/modelFormat';

interface ToolbarProps {
  onOpen: () => void;
  onExport: () => void;
  onExportSmf: () => void;
  onPing: () => void;
  isLoading: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  hasModel: boolean;
  editorMode: EditorMode;
  setEditorMode: (mode: EditorMode) => void;
  viewportLayout: ViewportLayout;
  setViewportLayout: (layout: ViewportLayout) => void;
  wireframeEnabled: boolean;
  setWireframeEnabled: (enabled: boolean) => void;
  gridEnabled: boolean;
  setGridEnabled: (enabled: boolean) => void;
  axesEnabled: boolean;
  setAxesEnabled: (enabled: boolean) => void;
  textureEnabled: boolean;
  setTextureEnabled: (enabled: boolean) => void;
  boneIndexLabelsEnabled: boolean;
  setBoneIndexLabelsEnabled: (enabled: boolean) => void;
  rigOpacity: number;
  setRigOpacity: (opacity: number) => void;
  rigThicknessScale: number;
  setRigThicknessScale: (scale: number) => void;
  shaderEnabled: boolean;
  setShaderEnabled: (enabled: boolean) => void;
  perspectiveEnabled: boolean;
  setPerspectiveEnabled: (enabled: boolean) => void;
  modelOpacity: number;
  setModelOpacity: (opacity: number) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  onOpen,
  onExport,
  onExportSmf,
  onPing,
  isLoading,
  onFileChange,
  hasModel,
  editorMode,
  setEditorMode,
  viewportLayout,
  setViewportLayout,
  wireframeEnabled,
  setWireframeEnabled,
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
          disabled={isLoading || !hasModel}
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
          disabled={isLoading || !hasModel}
          aria-pressed={viewportLayout === 'quad'}
        >
          Quad
        </button>
      </div>
      <button
        type="button"
        data-testid="viewport-wireframe-toggle"
        className={`layout-btn ${wireframeEnabled ? 'layout-btn-active' : ''}`}
        onClick={() => setWireframeEnabled(!wireframeEnabled)}
        disabled={isLoading || !hasModel}
        aria-pressed={wireframeEnabled}
        title="Toggle viewport wireframe"
      >
        Wireframe
      </button>
      <button
        type="button"
        data-testid="viewport-grid-toggle"
        className={`layout-btn ${gridEnabled ? 'layout-btn-active' : ''}`}
        onClick={() => setGridEnabled(!gridEnabled)}
        disabled={isLoading || !hasModel}
        aria-pressed={gridEnabled}
        title="Toggle viewport grid"
      >
        Grid
      </button>
      <button
        type="button"
        data-testid="viewport-axes-toggle"
        className={`layout-btn ${axesEnabled ? 'layout-btn-active' : ''}`}
        onClick={() => setAxesEnabled(!axesEnabled)}
        disabled={isLoading || !hasModel}
        aria-pressed={axesEnabled}
        title="Toggle viewport axes helper"
      >
        Axes
      </button>
      <button
        type="button"
        data-testid="viewport-texture-toggle"
        className={`layout-btn ${textureEnabled ? 'layout-btn-active' : ''}`}
        onClick={() => setTextureEnabled(!textureEnabled)}
        disabled={isLoading || !hasModel}
        aria-pressed={textureEnabled}
        title="Toggle texture maps"
      >
        Textures
      </button>
      <button
        type="button"
        data-testid="viewport-shader-toggle"
        className={`layout-btn ${shaderEnabled ? 'layout-btn-active' : ''}`}
        onClick={() => setShaderEnabled(!shaderEnabled)}
        disabled={isLoading || !hasModel}
        aria-pressed={shaderEnabled}
        title="Toggle flat-shaded viewport shader"
      >
        Shader
      </button>
      <button
        type="button"
        data-testid="viewport-bone-index-toggle"
        className={`layout-btn ${boneIndexLabelsEnabled ? 'layout-btn-active' : ''}`}
        onClick={() => setBoneIndexLabelsEnabled(!boneIndexLabelsEnabled)}
        disabled={isLoading || !hasModel}
        aria-pressed={boneIndexLabelsEnabled}
        title="Toggle bone index overlay text"
      >
        Node indices
      </button>
      <button
        type="button"
        data-testid="viewport-rig-opacity-toggle"
        className={`layout-btn ${rigOpacity < 1 ? 'layout-btn-active' : ''}`}
        onClick={() => setRigOpacity(rigOpacity < 1 ? 1 : 0.35)}
        disabled={isLoading || !hasModel}
        aria-pressed={rigOpacity < 1}
        title="Toggle rig opacity"
      >
        Rig opacity
      </button>
      <button
        type="button"
        data-testid="viewport-perspective-toggle"
        className={`layout-btn ${perspectiveEnabled ? 'layout-btn-active' : ''}`}
        onClick={() => setPerspectiveEnabled(!perspectiveEnabled)}
        disabled={isLoading || !hasModel}
        aria-pressed={perspectiveEnabled}
        title="Toggle single-view perspective camera mode"
      >
        Perspective
      </button>
      <button
        type="button"
        data-testid="viewport-model-opacity-toggle"
        className={`layout-btn ${modelOpacity < 1 ? 'layout-btn-active' : ''}`}
        onClick={() => setModelOpacity(modelOpacity < 1 ? 1 : 0.35)}
        disabled={isLoading || !hasModel}
        aria-pressed={modelOpacity < 1}
        title="Toggle model mesh opacity"
      >
        Model opacity
      </button>
      <button
        type="button"
        data-testid="viewport-rig-thickness-toggle"
        className={`layout-btn ${rigThicknessScale !== 1 ? 'layout-btn-active' : ''}`}
        onClick={() => setRigThicknessScale(rigThicknessScale === 1 ? 0.45 : 1)}
        disabled={isLoading || !hasModel}
        aria-pressed={rigThicknessScale !== 1}
        title="Toggle rig thickness"
      >
        Rig thick
      </button>
      {/* Persistent hidden file input for reliable e2e file simulation (Playwright setInputFiles) */}
      <input
        type="file"
        data-testid="model-file-input"
        style={{ display: 'none' }}
        accept={SUPPORTED_MODEL_ACCEPT}
        onChange={onFileChange}
      />
      <div className="toolbar-hint text-xs text-slate-400 pr-2">
        Drag rotate • Right-drag pan • Wheel zoom • R reset • Space play/pause
      </div>
    </div>
  );
};

export default Toolbar;
