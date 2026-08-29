export interface ViewportInteractionHandlers {
  onKeyDown: (event: KeyboardEvent) => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerLeave: (event: PointerEvent) => void;
  onContextMenu: (event: MouseEvent) => void;
  onWindowPointerUp: (event: PointerEvent) => void;
  onWindowPointerCancel: (event: PointerEvent) => void;
  onDisposeActiveInteractions: () => void;
}

export interface ViewportInteractionRuntime {
  dispose(): void;
}

export function attachViewportInteractionRuntime(
  canvas: HTMLCanvasElement,
  globalTarget: Window,
  handlers: ViewportInteractionHandlers,
): ViewportInteractionRuntime {
  canvas.addEventListener('pointerdown', handlers.onPointerDown);
  canvas.addEventListener('pointerup', handlers.onPointerUp);
  canvas.addEventListener('pointermove', handlers.onPointerMove);
  canvas.addEventListener('pointerleave', handlers.onPointerLeave);
  canvas.addEventListener('contextmenu', handlers.onContextMenu);
  globalTarget.addEventListener('keydown', handlers.onKeyDown);
  globalTarget.addEventListener('pointerup', handlers.onWindowPointerUp);
  globalTarget.addEventListener('pointercancel', handlers.onWindowPointerCancel);
  let disposed = false;

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('pointerdown', handlers.onPointerDown);
      canvas.removeEventListener('pointerup', handlers.onPointerUp);
      canvas.removeEventListener('pointermove', handlers.onPointerMove);
      canvas.removeEventListener('pointerleave', handlers.onPointerLeave);
      canvas.removeEventListener('contextmenu', handlers.onContextMenu);
      globalTarget.removeEventListener('keydown', handlers.onKeyDown);
      globalTarget.removeEventListener('pointerup', handlers.onWindowPointerUp);
      globalTarget.removeEventListener('pointercancel', handlers.onWindowPointerCancel);
      handlers.onDisposeActiveInteractions();
    },
  };
}
