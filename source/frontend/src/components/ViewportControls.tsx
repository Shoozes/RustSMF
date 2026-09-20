import React from 'react';
import { Camera, Eye, SquaresFour } from '@phosphor-icons/react';
import type { ViewportLayout } from '../store';
import type { TextureFilterPreview } from '../utils/materialPreview';

export interface ViewportControlsProps {
  hasModel: boolean;
  isLoading: boolean;
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
  textureRepeatPreviewEnabled: boolean;
  setTextureRepeatPreviewEnabled: (enabled: boolean) => void;
  textureFilterPreview: TextureFilterPreview;
  setTextureFilterPreview: (filter: TextureFilterPreview) => void;
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
  variant?: 'toolbar' | 'overlay';
}

const ViewportControls: React.FC<ViewportControlsProps> = ({
  hasModel,
  isLoading,
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
  variant = 'toolbar',
}) => {
  const nextTextureFilter: Record<TextureFilterPreview, TextureFilterPreview> = {
    source: 'nearest',
    nearest: 'linear',
    linear: 'source',
  };
  const controlsDisabled = isLoading || !hasModel;
  const displayControls = [
    { testId: 'viewport-wireframe-toggle', label: 'Wire', title: 'Toggle viewport wireframe', active: wireframeEnabled, onClick: () => setWireframeEnabled(!wireframeEnabled) },
    { testId: 'viewport-grid-toggle', label: 'Grid', title: 'Toggle viewport grid', active: gridEnabled, onClick: () => setGridEnabled(!gridEnabled) },
    { testId: 'viewport-axes-toggle', label: 'Axes', title: 'Toggle viewport axes helper', active: axesEnabled, onClick: () => setAxesEnabled(!axesEnabled) },
    { testId: 'viewport-texture-toggle', label: 'Texture', title: 'Toggle texture maps in the viewport only', active: textureEnabled, onClick: () => setTextureEnabled(!textureEnabled) },
    { testId: 'viewport-texture-repeat-toggle', label: textureRepeatPreviewEnabled ? 'Wrap repeat' : 'Wrap source', title: 'Toggle repeat wrapping preview; export always uses the source sampler', active: textureRepeatPreviewEnabled, onClick: () => setTextureRepeatPreviewEnabled(!textureRepeatPreviewEnabled) },
    { testId: 'viewport-texture-filter-toggle', label: `Filter ${textureFilterPreview}`, title: 'Cycle source, nearest, and linear filtering previews; export always uses the source sampler', active: textureFilterPreview !== 'source', onClick: () => setTextureFilterPreview(nextTextureFilter[textureFilterPreview]) },
    { testId: 'viewport-shader-toggle', label: 'Legacy light', title: 'Toggle legacy SMF-lit viewport material', active: shaderEnabled, onClick: () => setShaderEnabled(!shaderEnabled) },
    { testId: 'viewport-bone-index-toggle', label: 'Bone index', title: 'Toggle bone index overlay text', active: boneIndexLabelsEnabled, onClick: () => setBoneIndexLabelsEnabled(!boneIndexLabelsEnabled) },
    { testId: 'viewport-rig-opacity-toggle', label: 'Rig fade', title: 'Toggle rig opacity', active: rigOpacity > 0 && rigOpacity < 1, onClick: () => setRigOpacity(rigOpacity < 1 ? 1 : 0.35) },
    { testId: 'viewport-rig-visibility-toggle', label: rigOpacity === 0 ? 'Show rig' : 'Hide rig', title: rigOpacity === 0 ? 'Show rig helpers' : 'Hide rig helpers for mesh inspection', active: rigOpacity === 0, onClick: () => setRigOpacity(rigOpacity === 0 ? 1 : 0) },
    { testId: 'viewport-model-opacity-toggle', label: 'Mesh fade', title: 'Toggle model mesh opacity', active: modelOpacity < 1, onClick: () => setModelOpacity(modelOpacity < 1 ? 1 : 0.35) },
    { testId: 'viewport-rig-thickness-toggle', label: 'Thin rig', title: 'Toggle rig thickness', active: rigThicknessScale !== 1, onClick: () => setRigThicknessScale(rigThicknessScale === 1 ? 0.45 : 1) },
    { testId: 'viewport-skin-points-toggle', label: 'Skin points', title: 'Toggle skinned vertex point overlay', active: skinPointOverlayEnabled, onClick: () => setSkinPointOverlayEnabled(!skinPointOverlayEnabled) },
  ];

  return (
    <div className={`toolbar-viewport viewport-controls-${variant}`} data-testid={`viewport-controls-${variant}`}>
      <div role="group" aria-label="Viewport layout" className="control-group layout-switch">
        <SquaresFour size={16} aria-hidden="true" />
        <span className="control-label">Layout</span>
        <button type="button" data-testid="viewport-layout-single" className={`layout-btn ${viewportLayout === 'single' ? 'layout-btn-active' : ''}`} onClick={() => setViewportLayout('single')} disabled={controlsDisabled} aria-pressed={viewportLayout === 'single'}>
          Single
        </button>
        <button type="button" data-testid="viewport-layout-quad" className={`layout-btn ${viewportLayout === 'quad' ? 'layout-btn-active' : ''}`} onClick={() => setViewportLayout('quad')} disabled={controlsDisabled} aria-pressed={viewportLayout === 'quad'}>
          Quad
        </button>
      </div>
      <div role="group" aria-label="Camera mode" className="control-group camera-switch">
        <Camera size={16} aria-hidden="true" />
        <span className="control-label">Camera</span>
        <button type="button" data-testid="viewport-perspective-toggle" className={`layout-btn camera-btn ${perspectiveEnabled ? 'layout-btn-active' : ''}`} onClick={() => setPerspectiveEnabled(!perspectiveEnabled)} disabled={controlsDisabled} aria-pressed={perspectiveEnabled} title="Switch single-view camera between 3D perspective and orthographic front view">
          {perspectiveEnabled ? '3D' : 'Ortho'}
        </button>
      </div>
      <details className="toolbar-menu viewport-display-menu">
        <summary className="toolbar-menu-summary" data-testid="viewport-display-menu-button" aria-label="Viewport display controls">
          <Eye size={16} aria-hidden="true" />
          <span>Display</span>
        </summary>
        <div className="toolbar-menu-panel" data-testid="viewport-display-menu-panel" role="group" aria-label="Viewport display toggles">
          {displayControls.map((control) => (
            <button key={control.testId} type="button" data-testid={control.testId} className={`layout-btn display-toggle ${control.active ? 'layout-btn-active' : ''}`} onClick={control.onClick} disabled={controlsDisabled} aria-pressed={control.active} title={control.title}>
              {control.label}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
};

export default ViewportControls;
