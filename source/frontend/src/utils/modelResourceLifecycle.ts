import type * as THREE from 'three';
import { MODEL_TEXTURE_IMAGE_WAIT_MS } from './textureImageReadiness';

/** Install before parsing/preloading: onStart alone misses already pending items. */
export function createModelResourceLifecycle(manager: THREE.LoadingManager, format: string, timeoutMs = MODEL_TEXTURE_IMAGE_WAIT_MS) {
  const original = { start: manager.itemStart, end: manager.itemEnd, error: manager.itemError };
  let pending = 0, failed = false, disposed = false;
  let notify = () => {};
  const start = (url: string) => { pending++; original.start.call(manager, url); };
  const end = (url: string) => { original.end.call(manager, url); pending = Math.max(0, pending - 1); notify(); };
  const error = (url: string) => { failed = true; original.error.call(manager, url); notify(); };
  manager.itemStart = start; manager.itemEnd = end; manager.itemError = error;
  let finish: (() => void) | undefined;
  return {
    wait(strict = true): Promise<void> {
      return new Promise((resolve, reject) => {
        let settled = false;
        const settle = (failure?: string) => {
          if (settled) return;
          settled = true; clearTimeout(timer); notify = () => {};
          if (failure && strict) reject(new Error(failure)); else resolve();
        };
        const timer = setTimeout(() => settle(`${format} resources timed out. Try again.`), timeoutMs);
        finish = () => settle(`${format} resource loading was canceled.`);
        notify = () => {
          if (failed && strict) settle(`${format} resource failed to load. Check the selected files.`);
          else if (pending === 0) settle();
        };
        if (disposed) finish(); else notify();
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true; finish?.(); notify = () => {};
      if (manager.itemStart === start) manager.itemStart = original.start;
      if (manager.itemEnd === end) manager.itemEnd = original.end;
      if (manager.itemError === error) manager.itemError = original.error;
    },
  };
}
