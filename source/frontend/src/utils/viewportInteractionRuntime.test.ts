import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachViewportInteractionRuntime,
  type ViewportInteractionHandlers,
} from './viewportInteractionRuntime';

test('viewport interaction runtime owns listener attachment and idempotent disposal', () => {
  const canvasTarget = new EventTarget();
  const globalTarget = new EventTarget();
  const calls = {
    pointerDown: 0,
    pointerLeave: 0,
    keyDown: 0,
    disposed: 0,
  };
  const handlers: ViewportInteractionHandlers = {
    onKeyDown: () => { calls.keyDown += 1; },
    onPointerDown: () => { calls.pointerDown += 1; },
    onPointerUp: () => {},
    onPointerMove: () => {},
    onPointerLeave: () => { calls.pointerLeave += 1; },
    onContextMenu: () => {},
    onWindowPointerUp: () => {},
    onWindowPointerCancel: () => {},
    onDisposeActiveInteractions: () => { calls.disposed += 1; },
  };
  const runtime = attachViewportInteractionRuntime(
    canvasTarget as HTMLCanvasElement,
    globalTarget as Window,
    handlers,
  );

  canvasTarget.dispatchEvent(new Event('pointerdown'));
  canvasTarget.dispatchEvent(new Event('pointerleave'));
  globalTarget.dispatchEvent(new Event('keydown'));
  assert.deepEqual(calls, { pointerDown: 1, pointerLeave: 1, keyDown: 1, disposed: 0 });

  runtime.dispose();
  runtime.dispose();
  canvasTarget.dispatchEvent(new Event('pointerdown'));
  canvasTarget.dispatchEvent(new Event('pointerleave'));
  globalTarget.dispatchEvent(new Event('keydown'));
  assert.deepEqual(calls, { pointerDown: 1, pointerLeave: 1, keyDown: 1, disposed: 1 });
});
