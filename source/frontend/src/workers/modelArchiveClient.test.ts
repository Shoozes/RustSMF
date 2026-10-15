import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runModelArchive, ArchiveCancelledError, type ArchiveWorker } from './modelArchiveClient';

function fixture() {
  let terminated = 0;
  let posted: Blob | Uint8Array | undefined;
  const worker: ArchiveWorker = {
    onmessage: null, onerror: null, onmessageerror: null,
    postMessage: message => { posted = message.input; },
    terminate: () => { terminated++; },
  };
  const controller = new AbortController();
  return { worker, controller, factory: () => worker, terminated: () => terminated, posted: () => posted };
}

test('archive worker preserves caller buffers, reports progress and releases on success', async () => {
  const f = fixture(), bytes = new Uint8Array([1, 2, 3]);
  const progress: number[][] = [];
  const pending = runModelArchive(bytes, { signal: f.controller.signal, workerFactory: f.factory, onProgress: (a,b) => progress.push([a,b]) });
  await Promise.resolve();
  assert.notEqual(f.posted(), bytes);
  assert.deepEqual(f.posted(), bytes);
  f.worker.onmessage!({ data: { type: 'progress', completed: 1, total: 2 } } as MessageEvent);
  const files = [{ name: 'model.obj', data: bytes }];
  f.worker.onmessage!({ data: { type: 'result', files } } as MessageEvent);
  assert.deepEqual(await pending, files);
  assert.deepEqual(progress, [[1, 2]]);
  assert.equal(f.terminated(), 1);
  assert.equal(f.worker.onmessage, null);
  f.controller.abort();
  assert.equal(f.terminated(), 1);
});

test('cancel during native preparation ignores late bytes and late worker success', async () => {
  const f = fixture();
  let complete!: (value: Uint8Array) => void;
  const input = new Promise<Uint8Array>(resolve => { complete = resolve; });
  const pending = runModelArchive(input, { signal: f.controller.signal, workerFactory: f.factory });
  const late = f.worker.onmessage!;
  f.controller.abort();
  await assert.rejects(pending, ArchiveCancelledError);
  complete(new Uint8Array([1]));
  late({ data: { type: 'result', files: [] } } as MessageEvent);
  await Promise.resolve();
  assert.equal(f.posted(), undefined);
  assert.equal(f.terminated(), 1);
});

test('cancel during expansion terminates the worker and suppresses late progress', async () => {
  const f = fixture();
  let progress = 0;
  const pending = runModelArchive(new Uint8Array([1]), { signal: f.controller.signal, workerFactory: f.factory, onProgress: () => progress++ });
  await Promise.resolve();
  const late = f.worker.onmessage!;
  f.controller.abort();
  await assert.rejects(pending, ArchiveCancelledError);
  late({ data: { type: 'progress', completed: 1, total: 1 } } as MessageEvent);
  assert.equal(progress, 0);
  assert.equal(f.terminated(), 1);
});

test('archive timeout, worker errors, read errors and construction failures reject visibly', async () => {
  for (const mode of ['timeout', 'error', 'messageerror', 'read', 'construct'] as const) {
    const f = fixture();
    const pending = runModelArchive(mode === 'read' ? Promise.reject(new Error('read failed')) : new Uint8Array(), {
      signal: f.controller.signal, timeoutMs: 5,
      workerFactory: mode === 'construct' ? () => { throw new Error('denied'); } : f.factory,
    });
    if (mode === 'error') f.worker.onerror!({ preventDefault() {} } as ErrorEvent);
    if (mode === 'messageerror') f.worker.onmessageerror!({} as MessageEvent);
    await assert.rejects(pending, /timed out|worker failed|could not be read|read failed|unavailable/);
    assert.equal(f.terminated(), mode === 'construct' ? 0 : 1);
  }
});

test('pre-aborted archives do not start workers', async () => {
  const f = fixture();
  f.controller.abort();
  await assert.rejects(runModelArchive(new Uint8Array(), { signal: f.controller.signal, workerFactory: () => { throw new Error('must not run'); } }), ArchiveCancelledError);
  assert.equal(f.terminated(), 0);
});

test('fresh native archive bytes can transfer ownership without a duplicate', async () => {
  const f = fixture(), bytes = new Uint8Array([1,2,3]);
  const pending = runModelArchive(Promise.resolve(bytes), { signal: f.controller.signal, workerFactory: f.factory, transferInput: true });
  await Promise.resolve();
  assert.equal(f.posted(), bytes);
  f.controller.abort();
  await assert.rejects(pending, ArchiveCancelledError);
});
