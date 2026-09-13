import { installFileReaderTestPolyfill } from '../src/test/installFileReaderTestPolyfill';

export function installNodeThreeRuntime(): void {
  installFileReaderTestPolyfill();
  if (typeof globalThis.ProgressEvent === 'undefined') {
    class NodeProgressEvent {
      readonly type: string;
      readonly lengthComputable: boolean;
      readonly loaded: number;
      readonly total: number;
      constructor(type: string, init: { lengthComputable?: boolean; loaded?: number; total?: number } = {}) {
        this.type = type;
        this.lengthComputable = init.lengthComputable ?? false;
        this.loaded = init.loaded ?? 0;
        this.total = init.total ?? 0;
      }
    }
    Reflect.set(globalThis, 'ProgressEvent', NodeProgressEvent);
  }
  if (typeof globalThis.createImageBitmap === 'undefined') {
    Reflect.set(globalThis, 'createImageBitmap', async () => ({ width: 1, height: 1, close() {} }));
  }
  if (!Reflect.has(globalThis, 'self')) Reflect.set(globalThis, 'self', globalThis);
}
