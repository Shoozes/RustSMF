import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bytesToArrayBuffer, exportSMFToBuffer, type ImportedSmf } from '../loaders';
import {
  SmfCodecCancelledError,
  SmfCodecProtocolError,
  SmfCodecWorkerError,
  runSmfExport,
  runSmfImport,
  type SmfCodecWorkerPort,
} from './smfCodecClient';
import {
  isImportedSmfPayload,
  isSmfCodecRequest,
  isSmfCodecResponse,
  readSmfCodecOperation,
  serializeSmfCodecError,
  type SmfCodecRequest,
} from './smfCodecProtocol';
import { executeSmfCodecRequest } from './smfCodecRuntime';

function makeImportedSmf(): ImportedSmf {
  return {
    meshes: [{
      name: 'worker-mesh',
      verts: 3,
      triangles: [[0, 1, 2]],
      texIdx: 0,
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
      tangents: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]),
      skinIndices: new Uint16Array(12),
      skinWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
      visible: 1,
    }],
    textures: [{
      name: 'worker-texture',
      width: 1,
      height: 1,
      pixels: new Uint8Array([10, 20, 30, 255]),
    }],
    bones: [{
      index: 0,
      parent: 0,
      isBone: 1,
      dq: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]),
      axis: [0, 1, 0],
    }],
    animations: [{
      name: 'worker-clip',
      duration: 1,
      times: [0],
      frames: [[new Float32Array([0, 0, 0, 1, 0, 0, 0, 0])]],
      nodeCount: 1,
      loop: 1,
      interpolation: 1,
      sampleFrameMultiplier: 1,
      lockedBones: [],
    }],
  };
}

class RuntimeWorker implements SmfCodecWorkerPort {
  messageHandler: ((event: MessageEvent<unknown>) => void) | null = null;
  errorHandler: ((event: ErrorEvent) => void) | null = null;
  postedTransfers: Transferable[][] = [];
  terminated = false;

  postMessage(message: SmfCodecRequest, transferables: Transferable[]): void {
    this.postedTransfers.push(transferables);
    queueMicrotask(() => {
      try {
        const result = executeSmfCodecRequest(message, (progress) => {
          this.messageHandler?.(new MessageEvent('message', { data: progress }));
        });
        this.messageHandler?.(new MessageEvent('message', { data: result.response }));
      } catch (error: unknown) {
        this.messageHandler?.(new MessageEvent('message', {
          data: {
            type: 'error',
            requestId: message.requestId,
            operation: message.operation,
            error: serializeSmfCodecError(error),
          },
        }));
      }
    });
  }

  terminate(): void {
    this.terminated = true;
  }

  setMessageHandler(handler: ((event: MessageEvent<unknown>) => void) | null): void {
    this.messageHandler = handler;
  }

  setErrorHandler(handler: ((event: ErrorEvent) => void) | null): void {
    this.errorHandler = handler;
  }
}

class DeferredWorker implements SmfCodecWorkerPort {
  messageHandler: ((event: MessageEvent<unknown>) => void) | null = null;
  errorHandler: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  postMessage(_message: SmfCodecRequest, _transferables: Transferable[]): void {}

  terminate(): void {
    this.terminated = true;
  }

  setMessageHandler(handler: ((event: MessageEvent<unknown>) => void) | null): void {
    this.messageHandler = handler;
  }

  setErrorHandler(handler: ((event: ErrorEvent) => void) | null): void {
    this.errorHandler = handler;
  }
}

class AbortDuringSetupWorker extends DeferredWorker {
  postCount = 0;

  constructor(private readonly controller: AbortController) {
    super();
  }

  override postMessage(_message: SmfCodecRequest, _transferables: Transferable[]): void {
    this.postCount += 1;
  }

  override setMessageHandler(handler: ((event: MessageEvent<unknown>) => void) | null): void {
    super.setMessageHandler(handler);
    if (handler) this.controller.abort();
  }
}

describe('SMF codec worker client', () => {
  it('validates nested SMF payload shape without scanning vertex scalar buffers', () => {
    const valid = makeImportedSmf();
    assert.equal(isImportedSmfPayload(valid), true);
    assert.equal(isSmfCodecRequest({
      type: 'request',
      requestId: 1,
      operation: 'export',
      data: valid,
    }), true);

    const invalidMesh = makeImportedSmf();
    invalidMesh.meshes[0].positions = new Float32Array(1);
    assert.equal(isImportedSmfPayload(invalidMesh), false);

    const invalidTexture = makeImportedSmf();
    invalidTexture.textures[0].pixels = new Uint8Array(3);
    assert.equal(isImportedSmfPayload(invalidTexture), false);

    const invalidBone = makeImportedSmf();
    invalidBone.bones[0].dq = new Float32Array(7);
    assert.equal(isImportedSmfPayload(invalidBone), false);

    const invalidAnimation = makeImportedSmf();
    invalidAnimation.animations[0].frames[0][0] = new Float32Array(7);
    assert.equal(isImportedSmfPayload(invalidAnimation), false);

    const invalidTime = makeImportedSmf();
    invalidTime.animations[0].times[0] = Number.NaN;
    assert.equal(isImportedSmfPayload(invalidTime), false);
  });

  it('reads a valid operation independently for invalid-request error correlation', () => {
    assert.equal(readSmfCodecOperation({ operation: 'export', data: null }), 'export');
    assert.equal(readSmfCodecOperation({ operation: 'unknown' }), null);
  });

  it('roundtrips through the worker protocol with monotonic progress and owned transfers', async () => {
    const source = makeImportedSmf();
    const sourcePositionBuffer = source.meshes[0].positions.buffer;
    const exportWorker = new RuntimeWorker();
    const exportProgress: number[] = [];

    const exported = await runSmfExport(source, {
      workerFactory: () => exportWorker,
      onProgress: ({ percent }) => exportProgress.push(percent),
    });

    assert.equal(exported.execution, 'worker');
    assert.equal(exportProgress[0], 0);
    assert.equal(exportProgress.at(-1), 100);
    assert.ok(exportProgress.every((value, index) => index === 0 || value >= exportProgress[index - 1]));
    assert.ok(exportWorker.terminated);
    assert.ok(exportWorker.postedTransfers[0].length > 0);
    assert.ok(!exportWorker.postedTransfers[0].includes(sourcePositionBuffer));
    assert.equal(source.meshes[0].positions.byteLength, 9 * Float32Array.BYTES_PER_ELEMENT);

    const importBuffer = bytesToArrayBuffer(exported.value);
    const importWorker = new RuntimeWorker();
    const importProgress: number[] = [];
    const imported = await runSmfImport(importBuffer, {
      workerFactory: () => importWorker,
      onProgress: ({ percent }) => importProgress.push(percent),
    });

    assert.equal(imported.execution, 'worker');
    assert.equal(imported.value.meshes.length, 1);
    assert.equal(imported.value.animations[0].name, 'worker-clip');
    assert.deepEqual([...imported.value.textures[0].pixels], [10, 20, 30, 255]);
    assert.equal(importWorker.postedTransfers[0][0], importBuffer);
    assert.equal(importProgress[0], 0);
    assert.equal(importProgress.at(-1), 100);
  });

  it('uses an explicit synchronous fallback only when worker startup is unavailable', async () => {
    const source = makeImportedSmf();
    source.animations[0].frames[0][0] = new Float32Array([
      0,
      0,
      0,
      2,
      0.5,
      0,
      0,
      0,
    ]);
    const sourceFrameBeforeExport = [...source.animations[0].frames[0][0]];
    const exportFallbackReasons: string[] = [];
    const exported = await runSmfExport(source, {
      workerFactory: () => {
        throw new Error('worker blocked by policy');
      },
      onFallback: (reason) => exportFallbackReasons.push(reason),
    });

    assert.equal(exported.execution, 'sync-fallback');
    assert.equal(exportFallbackReasons.length, 1);
    assert.deepEqual([...source.animations[0].frames[0][0]], sourceFrameBeforeExport);

    const fallbackReasons: string[] = [];
    const progress: number[] = [];

    const imported = await runSmfImport(bytesToArrayBuffer(exported.value), {
      workerFactory: () => {
        throw new Error('worker blocked by policy');
      },
      onFallback: (reason) => fallbackReasons.push(reason),
      onProgress: ({ percent }) => progress.push(percent),
    });

    assert.equal(imported.execution, 'sync-fallback');
    assert.match(imported.fallbackReason ?? '', /worker blocked by policy/);
    assert.equal(fallbackReasons.length, 1);
    assert.equal(progress[0], 0);
    assert.equal(progress.at(-1), 100);
    assert.equal(imported.value.meshes[0].verts, 3);
  });

  it('terminates an aborted task and rejects late ownership with a cancellation error', async () => {
    const worker = new DeferredWorker();
    const controller = new AbortController();
    const task = runSmfImport(bytesToArrayBuffer(exportSMFToBuffer(makeImportedSmf())), {
      workerFactory: () => worker,
      signal: controller.signal,
    });

    controller.abort();

    await assert.rejects(task, SmfCodecCancelledError);
    assert.ok(worker.terminated);
    assert.equal(worker.messageHandler, null);
  });

  it('cancels if the signal aborts during worker setup before postMessage', async () => {
    const controller = new AbortController();
    const worker = new AbortDuringSetupWorker(controller);

    await assert.rejects(
      runSmfImport(bytesToArrayBuffer(exportSMFToBuffer(makeImportedSmf())), {
        workerFactory: () => worker,
        signal: controller.signal,
        timeoutMs: 20,
      }),
      SmfCodecCancelledError,
    );

    assert.equal(worker.postCount, 0);
    assert.ok(worker.terminated);
    assert.equal(worker.messageHandler, null);
  });

  it('times out a stalled worker and always releases its resources', async () => {
    const worker = new DeferredWorker();

    await assert.rejects(
      runSmfImport(bytesToArrayBuffer(exportSMFToBuffer(makeImportedSmf())), {
        workerFactory: () => worker,
        timeoutMs: 20,
      }),
      (error: unknown) => error instanceof SmfCodecWorkerError
        && /timed out after 20ms/.test(error.message),
    );
    assert.ok(worker.terminated);
    assert.equal(worker.messageHandler, null);
    assert.equal(worker.errorHandler, null);
  });

  it('rejects regressing worker progress instead of publishing misleading status', async () => {
    const worker = new DeferredWorker();
    worker.postMessage = (message): void => {
      queueMicrotask(() => {
        worker.messageHandler?.(new MessageEvent('message', {
          data: {
            type: 'progress',
            requestId: message.requestId,
            operation: message.operation,
            progress: { phase: 'meshes', percent: 60 },
          },
        }));
        worker.messageHandler?.(new MessageEvent('message', {
          data: {
            type: 'progress',
            requestId: message.requestId,
            operation: message.operation,
            progress: { phase: 'meshes', percent: 40 },
          },
        }));
      });
    };

    await assert.rejects(
      runSmfImport(bytesToArrayBuffer(exportSMFToBuffer(makeImportedSmf())), {
        workerFactory: () => worker,
      }),
      (error: unknown) => error instanceof SmfCodecProtocolError
        && /progress regressed from 60 to 40/.test(error.message),
    );
    assert.ok(worker.terminated);
  });

  it('rejects a top-level-valid nested-invalid success and terminates without fallback', async () => {
    const fallbackReasons: string[] = [];
    const worker = new DeferredWorker();
    worker.postMessage = (message): void => {
      const malformed = makeImportedSmf();
      malformed.meshes[0].skinWeights = new Float32Array(1);
      const response = {
        type: 'success',
        requestId: message.requestId,
        operation: 'import',
        data: malformed,
      };
      assert.equal(isSmfCodecResponse(response), false);
      queueMicrotask(() => {
        worker.messageHandler?.(new MessageEvent('message', { data: response }));
      });
    };

    await assert.rejects(
      runSmfImport(bytesToArrayBuffer(exportSMFToBuffer(makeImportedSmf())), {
        workerFactory: () => worker,
        onFallback: (reason) => fallbackReasons.push(reason),
      }),
      (error: unknown) => error instanceof SmfCodecProtocolError
        && /invalid response/.test(error.message),
    );
    assert.deepEqual(fallbackReasons, []);
    assert.ok(worker.terminated);
    assert.equal(worker.messageHandler, null);
    assert.equal(worker.errorHandler, null);
  });

  it('surfaces runtime worker errors without silently retrying on the UI thread', async () => {
    const fallbackReasons: string[] = [];
    const worker = new DeferredWorker();
    worker.postMessage = (message): void => {
      queueMicrotask(() => {
        worker.messageHandler?.(new MessageEvent('message', {
          data: {
            type: 'error',
            requestId: message.requestId,
            operation: message.operation,
            error: {
              name: 'WorkerFixtureError',
              message: 'runtime parse failed',
            },
          },
        }));
      });
    };

    await assert.rejects(
      runSmfImport(bytesToArrayBuffer(exportSMFToBuffer(makeImportedSmf())), {
        workerFactory: () => worker,
        onFallback: (reason) => fallbackReasons.push(reason),
      }),
      (error: unknown) => error instanceof SmfCodecWorkerError
        && /runtime parse failed/.test(error.message),
    );
    assert.deepEqual(fallbackReasons, []);
    assert.ok(worker.terminated);
  });
});
