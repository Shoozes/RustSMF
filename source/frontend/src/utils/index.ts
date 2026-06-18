// Utils barrel. Reusable three helpers, math, file, without pulling in heavy UI or store logic.
// Keep lean; no new runtime deps.

export { SimpleOrbit } from './SimpleOrbit';
export { disposeThreeObject } from './threeDisposal';
export { restoreWeightPreview, applyWeightPreviewForBone } from './weightPreview';
export { findClosestBone, DEFAULT_MAX_BONE_PICK_DIST, findBoneByName } from './bonePicker';
export { makeBoneLabel } from './boneLabels';
export { useBoneLabels, useBoneLabelsWithScale } from './useBoneLabels';
export { makeBoneHighlightMarker, makeBoneHoverMarker, updateHighlightPosition, makeBoneEndpointHandle, updateEndpointHandle } from './boneHighlight';
export {
  DEFAULT_VIEWPORT_BOUNDS,
  getMouseForViewport,
  getViewportAt,
  refreshOrthoCameras,
  refreshViewportSpecs,
} from './viewportLayout';
export type { ModelBounds, ViewportSpec, ViewportRole } from './viewportLayout';
export { createSeqGuard } from './seqGuard';
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
