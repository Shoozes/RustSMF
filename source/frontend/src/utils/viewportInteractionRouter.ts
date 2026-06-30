import type { EditorMode } from '../store';

export type ViewportInteractionOwner =
  | 'none'
  | 'orbit'
  | 'model-select'
  | 'rig-select'
  | 'rig-endpoint-drag'
  | 'skin-paint'
  | 'animate-select'
  | 'animate-transform';

export interface ViewportInteractionContext {
  editorMode: EditorMode;
  button: number;
  hasModel: boolean;
  hasSkeleton: boolean;
  hasSelectedBone: boolean;
  isPrecisionMode: boolean;
  isPickingViewport: boolean;
  hitEndpointHandle: boolean;
  hitTransformControl: boolean;
}

export function resolvePointerDownOwner(ctx: ViewportInteractionContext): ViewportInteractionOwner {
  if (!ctx.hasModel || !ctx.isPickingViewport) return 'none';
  if (ctx.button !== 0) return 'orbit';

  if (ctx.editorMode === 'skin') {
    return ctx.hasSelectedBone ? 'skin-paint' : 'rig-select';
  }

  if (ctx.editorMode === 'rig') {
    if (ctx.isPrecisionMode && ctx.hitEndpointHandle) return 'rig-endpoint-drag';
    return ctx.hasSkeleton ? 'rig-select' : 'none';
  }

  if (ctx.editorMode === 'animate') {
    if (ctx.hitTransformControl) return 'animate-transform';
    return ctx.hasSkeleton ? 'animate-select' : 'none';
  }

  if (ctx.editorMode === 'view') {
    return 'model-select';
  }

  return 'none';
}
