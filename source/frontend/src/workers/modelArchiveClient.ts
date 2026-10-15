import type { ModelResourceFile } from '../utils/modelResourceBundle';

export class ArchiveCancelledError extends Error {
  constructor() { super('ZIP import canceled.'); this.name = 'ArchiveCancelledError'; }
}

export type ArchiveReply =
  | { type: 'progress'; completed: number; total: number }
  | { type: 'result'; files: ModelResourceFile[] }
  | { type: 'error'; message: string };

export interface ArchiveWorker {
  onmessage: ((event: MessageEvent<ArchiveReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (message: { input: Blob | Uint8Array }, transfer: Transferable[]) => void;
  terminate: () => void;
}

/** One worker owns one import. Completion, failure, timeout and cancellation release it. */
export function runModelArchive(
  input: Blob | Uint8Array | Promise<Blob | Uint8Array>,
  options: {
    signal: AbortSignal;
    onProgress?: (completed: number, total: number) => void;
    timeoutMs?: number;
    transferInput?: boolean; // only for newly read, caller-owned native bytes
    workerFactory?: () => ArchiveWorker;
  },
): Promise<ModelResourceFile[]> {
  return new Promise((resolve, reject) => {
    let worker: ArchiveWorker | undefined;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('ZIP import timed out. Try a smaller archive.')), options.timeoutMs ?? 120_000);
    const finish = (error?: Error, files?: ModelResourceFile[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal.removeEventListener('abort', cancel);
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        worker.terminate();
      }
      if (error) reject(error); else resolve(files!);
    };
    const cancel = () => finish(new ArchiveCancelledError());
    // Attach to a pending native read even if canceled before it settles.
    const ready = Promise.resolve(input);
    ready.catch(() => {});
    if (options.signal.aborted) { cancel(); return; }
    options.signal.addEventListener('abort', cancel, { once: true });
    try {
      worker = options.workerFactory?.() ?? new Worker(new URL('./modelArchive.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (settled) return;
        if (data.type === 'progress') options.onProgress?.(data.completed, data.total);
        else if (data.type === 'result') finish(undefined, data.files);
        else if (data.type === 'error') finish(new Error(data.message));
        else finish(new Error('ZIP worker returned an invalid response. Reopen the archive.'));
      };
      worker.onerror = event => { event.preventDefault(); finish(new Error('ZIP worker failed. Reopen the archive or extract it outside RustSMF.')); };
      worker.onmessageerror = () => finish(new Error('ZIP worker response could not be read. Reopen the archive.'));
      void ready.then(value => {
        if (settled) return;
        // Canonical caller buffers are copied; a fresh native archive read can transfer ownership.
        const owned = value instanceof Uint8Array && !options.transferInput ? new Uint8Array(value) : value;
        worker!.postMessage({ input: owned }, owned instanceof Uint8Array ? [owned.buffer] : []);
      }).catch(error => finish(error instanceof Error ? error : new Error(String(error))));
    } catch {
      finish(new Error('ZIP background processing is unavailable. Update your browser/WebView2 or extract the archive before opening its model.'));
    }
  });
}
