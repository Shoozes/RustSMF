import type { EditorMode } from '../store';

export type ViewportInteractionOwner =
  | 'none'
  | 'orbit'
  | 'model-select'
  | 'rig-select'
  | 'rig-endpoint-drag'
  | 'skin-paint'
  | 'animate-select';

export interface ViewportInteractionContext {
  editorMode: EditorMode;
  button: number;
  hasModel: boolean;
  hasSkeleton: boolean;
  hasSelectedBone: boolean;
  isPrecisionMode: boolean;
  isPickingViewport: boolean;
  hitEndpointHandle: boolean;
}

export interface ViewportPointerDownSnapshot {
  x: number;
  y: number;
  time: number;
  button: number;
  owner: ViewportInteractionOwner;
}

export interface ViewportPointerUpContext {
  x: number;
  y: number;
  time: number;
  button: number;
  isPickingViewport: boolean;
  maxMovePx?: number;
  maxElapsedMs?: number;
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
    return ctx.hasSkeleton ? 'animate-select' : 'none';
  }

  if (ctx.editorMode === 'view') {
    return 'model-select';
  }

  return 'none';
}

export function resolvePointerClickOwner(
  down: ViewportPointerDownSnapshot | null,
  up: ViewportPointerUpContext,
): ViewportInteractionOwner | null {
  if (!down) return null;
  if (down.button !== 0 || up.button !== 0) return null;
  if (down.button !== up.button) return null;
  if (!up.isPickingViewport) return null;

  const maxMovePx = up.maxMovePx ?? 6;
  const maxElapsedMs = up.maxElapsedMs ?? 350;
  const movedPx = Math.hypot(up.x - down.x, up.y - down.y);
  const elapsedMs = Math.max(0, up.time - down.time);

  if (movedPx > maxMovePx) return null;
  if (elapsedMs > maxElapsedMs) return null;

  return down.owner;
}
