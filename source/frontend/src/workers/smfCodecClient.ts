import {
  exportSMFToBuffer,
  importSMF,
  type ImportedSmf,
  type SmfCodecProgress,
} from '../loaders';
import {
  cloneImportedSmf,
  collectImportedSmfTransferables,
} from '../loaders/smfData';
import {
  isSmfCodecResponse,
  readSmfCodecRequestId,
  type SmfCodecOperation,
  type SmfCodecRequest,
  type SmfCodecResponse,
} from './smfCodecProtocol';

const DEFAULT_WORKER_TIMEOUT_MS = 120_000;

export type SmfCodecExecution = 'worker' | 'sync-fallback';

export interface SmfCodecRunResult<T> {
  value: T;
  execution: SmfCodecExecution;
  fallbackReason?: string;
}

export interface SmfCodecWorkerPort {
  postMessage(message: SmfCodecRequest, transferables: Transferable[]): void;
  terminate(): void;
  setMessageHandler(handler: ((event: MessageEvent<unknown>) => void) | null): void;
  setErrorHandler(handler: ((event: ErrorEvent) => void) | null): void;
}

export type SmfCodecWorkerFactory = () => SmfCodecWorkerPort;

export interface SmfCodecRunOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  workerFactory?: SmfCodecWorkerFactory;
  onProgress?: (progress: SmfCodecProgress) => void;
  onFallback?: (reason: string) => void;
}

export class SmfCodecCancelledError extends Error {
  constructor() {
    super('SMF codec task canceled.');
    this.name = 'SmfCodecCancelledError';
  }
}

export class SmfCodecWorkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmfCodecWorkerError';
  }
}

export class SmfCodecProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmfCodecProtocolError';
  }
}

let nextRequestId = 0;

function createBrowserWorker(): SmfCodecWorkerPort {
  if (typeof Worker === 'undefined') {
    throw new Error('Web Workers are unavailable in this environment.');
  }

  const worker = new Worker(new URL('./modelWorker.ts', import.meta.url), {
    type: 'module',
    name: 'rustsmf-codec',
  });

  return {
    postMessage: (message, transferables) => worker.postMessage(message, transferables),
    terminate: () => worker.terminate(),
    setMessageHandler: (handler) => {
      worker.onmessage = handler;
    },
    setErrorHandler: (handler) => {
      worker.onerror = handler;
    },
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new SmfCodecCancelledError();
}

async function runSynchronousFallback<T>(
  reason: string,
  options: SmfCodecRunOptions,
  run: (onProgress?: (progress: SmfCodecProgress) => void) => T,
): Promise<SmfCodecRunResult<T>> {
  options.onFallback?.(reason);
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  throwIfAborted(options.signal);
  return {
    value: run(options.onProgress),
    execution: 'sync-fallback',
    fallbackReason: reason,
  };
}

interface SmfCodecInvocation<T> {
  operation: SmfCodecOperation;
  makeRequest: (requestId: number) => {
    request: SmfCodecRequest;
    transferables: Transferable[];
  };
  readSuccess: (response: Extract<SmfCodecResponse, { type: 'success' }>) => T;
  canFallbackAfterPostFailure: () => boolean;
  runSynchronously: (onProgress?: (progress: SmfCodecProgress) => void) => T;
}

async function runSmfCodecInvocation<T>(
  invocation: SmfCodecInvocation<T>,
  options: SmfCodecRunOptions,
): Promise<SmfCodecRunResult<T>> {
  throwIfAborted(options.signal);

  const workerFactory = options.workerFactory ?? createBrowserWorker;
  let worker: SmfCodecWorkerPort;
  try {
    worker = workerFactory();
  } catch (error: unknown) {
    return runSynchronousFallback(
      `SMF ${invocation.operation} worker could not start: ${errorMessage(error)}`,
      options,
      invocation.runSynchronously,
    );
  }

  nextRequestId += 1;
  const requestId = nextRequestId;
  let request: SmfCodecRequest;
  let transferables: Transferable[];
  try {
    ({ request, transferables } = invocation.makeRequest(requestId));
  } catch (error: unknown) {
    worker.terminate();
    throw error;
  }

  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS);
  let postFailed = false;
  const workerResult = new Promise<T>((resolve, reject) => {
    let settled = false;
    let lastProgress = -1;
    const cleanup = (): void => {
      globalThis.clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', onAbort);
      worker.setMessageHandler(null);
      worker.setErrorHandler(null);
      worker.terminate();
    };

    const settle = (action: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };

    const onAbort = (): void => {
      settle(() => reject(new SmfCodecCancelledError()));
    };

    worker.setMessageHandler((event) => {
      const responseId = readSmfCodecRequestId(event.data);
      if (!isSmfCodecResponse(event.data)) {
        if (responseId === requestId) {
          settle(() => reject(new SmfCodecProtocolError(
            `SMF ${invocation.operation} worker returned an invalid response.`,
          )));
        }
        return;
      }

      const response = event.data;
      if (response.requestId !== requestId) return;
      if (response.operation !== invocation.operation) {
        settle(() => reject(new SmfCodecProtocolError(
          `SMF worker response operation ${response.operation} did not match ${invocation.operation}.`,
        )));
        return;
      }

      if (response.type === 'progress') {
        if (response.progress.percent < lastProgress) {
          settle(() => reject(new SmfCodecProtocolError(
            `SMF ${invocation.operation} worker progress regressed from ${lastProgress} to ${response.progress.percent}.`,
          )));
          return;
        }
        lastProgress = response.progress.percent;
        options.onProgress?.(response.progress);
        return;
      }

      if (response.type === 'error') {
        settle(() => reject(new SmfCodecWorkerError(
          `${response.error.name}: ${response.error.message}`,
        )));
        return;
      }

      settle(() => {
        try {
          resolve(invocation.readSuccess(response));
        } catch (error: unknown) {
          reject(error);
        }
      });
    });

    worker.setErrorHandler((event) => {
      settle(() => reject(new SmfCodecWorkerError(
        event.message || `SMF ${invocation.operation} worker failed.`,
      )));
    });

    options.signal?.addEventListener('abort', onAbort, { once: true });
    const timeoutId = globalThis.setTimeout(() => {
      settle(() => reject(new SmfCodecWorkerError(
        `SMF ${invocation.operation} worker timed out after ${timeoutMs}ms.`,
      )));
    }, timeoutMs);

    try {
      worker.postMessage(request, transferables);
    } catch (error: unknown) {
      postFailed = true;
      settle(() => reject(error));
    }
  });

  try {
    return {
      value: await workerResult,
      execution: 'worker',
    };
  } catch (error: unknown) {
    if (postFailed && invocation.canFallbackAfterPostFailure()) {
      return runSynchronousFallback(
        `SMF ${invocation.operation} worker could not accept the task: ${errorMessage(error)}`,
        options,
        invocation.runSynchronously,
      );
    }
    throw error;
  }
}

export function runSmfImport(
  buffer: ArrayBuffer,
  options: SmfCodecRunOptions = {},
): Promise<SmfCodecRunResult<ImportedSmf>> {
  return runSmfCodecInvocation({
    operation: 'import',
    makeRequest: (requestId) => ({
      request: {
        type: 'request',
        requestId,
        operation: 'import',
        buffer,
      },
      transferables: [buffer],
    }),
    readSuccess: (response) => {
      if (response.operation !== 'import') {
        throw new SmfCodecProtocolError('SMF import worker returned a non-import success payload.');
      }
      return response.data;
    },
    canFallbackAfterPostFailure: () => buffer.byteLength > 0,
    runSynchronously: (onProgress) => importSMF(buffer, onProgress),
  }, options);
}

export function runSmfExport(
  source: ImportedSmf,
  options: SmfCodecRunOptions = {},
): Promise<SmfCodecRunResult<Uint8Array>> {
  return runSmfCodecInvocation({
    operation: 'export',
    makeRequest: (requestId) => {
      const data = cloneImportedSmf(source);
      return {
        request: {
          type: 'request',
          requestId,
          operation: 'export',
          data,
        },
        transferables: collectImportedSmfTransferables(data),
      };
    },
    readSuccess: (response) => {
      if (response.operation !== 'export') {
        throw new SmfCodecProtocolError('SMF export worker returned a non-export success payload.');
      }
      return new Uint8Array(response.buffer);
    },
    canFallbackAfterPostFailure: () => true,
    runSynchronously: (onProgress) => exportSMFToBuffer(source, onProgress),
  }, options);
}
