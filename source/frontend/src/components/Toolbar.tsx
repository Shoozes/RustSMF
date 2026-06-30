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
  skinPointOverlayEnabled: boolean;
  setSkinPointOverlayEnabled: (enabled: boolean) => void;
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
  skinPointOverlayEnabled,
  setSkinPointOverlayEnabled,
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
  const displayControls = [
    {
      testId: 'viewport-wireframe-toggle',
      label: 'Wire',
      title: 'Toggle viewport wireframe',
      active: wireframeEnabled,
      onClick: () => setWireframeEnabled(!wireframeEnabled),
    },
    {
      testId: 'viewport-grid-toggle',
      label: 'Grid',
      title: 'Toggle viewport grid',
      active: gridEnabled,
      onClick: () => setGridEnabled(!gridEnabled),
    },
    {
      testId: 'viewport-axes-toggle',
      label: 'Axes',
      title: 'Toggle viewport axes helper',
      active: axesEnabled,
      onClick: () => setAxesEnabled(!axesEnabled),
    },
    {
      testId: 'viewport-texture-toggle',
      label: 'Tex',
      title: 'Toggle texture maps',
      active: textureEnabled,
      onClick: () => setTextureEnabled(!textureEnabled),
    },
    {
      testId: 'viewport-shader-toggle',
      label: 'Legacy',
      title: 'Toggle legacy SMF-lit viewport material',
      active: shaderEnabled,
      onClick: () => setShaderEnabled(!shaderEnabled),
    },
    {
      testId: 'viewport-bone-index-toggle',
      label: 'Index',
      title: 'Toggle bone index overlay text',
      active: boneIndexLabelsEnabled,
      onClick: () => setBoneIndexLabelsEnabled(!boneIndexLabelsEnabled),
    },
    {
      testId: 'viewport-rig-opacity-toggle',
      label: 'Rig fade',
      title: 'Toggle rig opacity',
      active: rigOpacity < 1,
      onClick: () => setRigOpacity(rigOpacity < 1 ? 1 : 0.35),
    },
    {
      testId: 'viewport-model-opacity-toggle',
      label: 'Mesh fade',
      title: 'Toggle model mesh opacity',
      active: modelOpacity < 1,
      onClick: () => setModelOpacity(modelOpacity < 1 ? 1 : 0.35),
    },
    {
      testId: 'viewport-rig-thickness-toggle',
      label: 'Thin rig',
      title: 'Toggle rig thickness',
      active: rigThicknessScale !== 1,
      onClick: () => setRigThicknessScale(rigThicknessScale === 1 ? 0.45 : 1),
    },
    {
      testId: 'viewport-skin-points-toggle',
      label: 'Skin pts',
      title: 'Toggle skinned vertex point overlay',
      active: skinPointOverlayEnabled,
      onClick: () => setSkinPointOverlayEnabled(!skinPointOverlayEnabled),
    },
  ];
  const viewportControlsDisabled = isLoading || !hasModel;

  return (
    <div className="toolbar">
      <div className="toolbar-primary">
        <div className="toolbar-brand">RustSMF</div>
        <div className="toolbar-action-group" aria-label="File actions">
          <button className="toolbar-action" data-testid="open-model-btn" onClick={onOpen} disabled={isLoading}>
            Open
          </button>
          <button className="toolbar-action" data-testid="export-btn" onClick={onExport} disabled={isLoading}>
            Export
          </button>
          <button className="toolbar-action" data-testid="export-smf-btn" onClick={onExportSmf} disabled={isLoading}>
            SMF
          </button>
          <button className="toolbar-action toolbar-action-muted" data-testid="ping-rust-btn" onClick={onPing} disabled={isLoading}>
            Ping
          </button>
        </div>
      </div>

      <div className="toolbar-workspace">
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

      <div className="toolbar-viewport">
        <div
          role="group"
          aria-label="Viewport layout"
          className="control-group layout-switch"
        >
          <span className="control-label">Layout</span>
          <button
            type="button"
            role="button"
            data-testid="viewport-layout-single"
            className={`layout-btn ${viewportLayout === 'single' ? 'layout-btn-active' : ''}`}
            onClick={() => setViewportLayout('single')}
            disabled={viewportControlsDisabled}
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
            disabled={viewportControlsDisabled}
            aria-pressed={viewportLayout === 'quad'}
          >
            Quad
          </button>
        </div>
        <div
          role="group"
          aria-label="Camera mode"
          className="control-group camera-switch"
        >
          <span className="control-label">Camera</span>
          <button
            type="button"
            data-testid="viewport-perspective-toggle"
            className={`layout-btn camera-btn ${perspectiveEnabled ? 'layout-btn-active' : ''}`}
            onClick={() => setPerspectiveEnabled(!perspectiveEnabled)}
            disabled={viewportControlsDisabled}
            aria-pressed={perspectiveEnabled}
            title="Switch single-view camera between 3D perspective and orthographic front view"
          >
            {perspectiveEnabled ? '3D' : 'Ortho'}
          </button>
        </div>
        <details className="toolbar-menu viewport-display-menu">
          <summary
            className="toolbar-menu-summary"
            data-testid="viewport-display-menu-button"
            aria-label="Viewport display controls"
          >
            Display
          </summary>
          <div
            className="toolbar-menu-panel"
            data-testid="viewport-display-menu-panel"
            role="group"
            aria-label="Viewport display toggles"
          >
            {displayControls.map((control) => (
              <button
                key={control.testId}
                type="button"
                data-testid={control.testId}
                className={`layout-btn display-toggle ${control.active ? 'layout-btn-active' : ''}`}
                onClick={control.onClick}
                disabled={viewportControlsDisabled}
                aria-pressed={control.active}
                title={control.title}
              >
                {control.label}
              </button>
            ))}
          </div>
        </details>
      </div>

      {/* Persistent hidden file input for reliable e2e file simulation (Playwright setInputFiles) */}
      <input
        type="file"
        data-testid="model-file-input"
        style={{ display: 'none' }}
        accept={SUPPORTED_MODEL_ACCEPT}
        onChange={onFileChange}
      />
    </div>
  );
};

export default Toolbar;
