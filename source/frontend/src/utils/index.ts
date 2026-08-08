// Stable lightweight utility surface for shared helpers and contract tests; keep UI/store modules out.

export { SimpleOrbit } from './SimpleOrbit';
export { disposeThreeObject } from './threeDisposal';
export { restoreWeightPreview, applyWeightPreviewForBone } from './weightPreview';
export { findClosestBone, DEFAULT_MAX_BONE_PICK_DIST, findBoneByName } from './bonePicker';
export { makeBoneLabel } from './boneLabels';
export { useBoneLabels, useBoneLabelsWithScale } from './useBoneLabels';
export { makeBoneHighlightMarker, makeBoneHoverMarker, updateHighlightPosition, makeBoneEndpointHandle, updateEndpointHandle } from './boneHighlight';
export { ModernSkeletonHelper, findBoneNameFromSkeletonHelperHit } from './modernSkeletonHelper';
export type { DisposableSkeletonHelper, ModernSkeletonHelperOptions } from './modernSkeletonHelper';
export {
  DEFAULT_VIEWPORT_BOUNDS,
  getMouseForViewport,
  getModelOrbitDistance,
  getOrthographicPanDelta,
  getViewportAt,
  refreshOrthoCameras,
  refreshViewportSpecs,
} from './viewportLayout';
export type { ModelBounds, ViewportSpec, ViewportRole } from './viewportLayout';
export { createSeqGuard } from './seqGuard';
export {
  createThemeViewportGrids,
  disposeThemeViewportGrids,
  updateThemeViewportGridVisibility,
} from './themeViewportGrid';
export type { ThemeViewportGrids } from './themeViewportGrid';
export {
  MODEL_FORMAT_EXTENSIONS,
  SUPPORTED_MODEL_ACCEPT,
  SUPPORTED_MODEL_EXTENSIONS,
  detectModelFormat,
  getModelExtension,
  isSupportedModelFormat,
  supportedModelFormatsLabel,
} from './modelFormat';
export type { ModelSourceFormat } from './modelFormat';
