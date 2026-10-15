import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExportQueue, exportBasename, MAX_EXPORT_QUEUE_BYTES, MAX_EXPORT_RESULT_BYTES, type ExportQueueRunner, type ExportPreset } from './exportQueue';

const preset = { format: 'glb', includeAnimation: true } as const;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function setup() {
  let released = 0;
  const queue = new ExportQueue<{ bytes: number; value: number; dispose(): void }>();
  const add = (value = 1, bytes = 16) => queue.add(preset, `item-${value}`, () => ({ bytes, value, dispose() { released++; } }));
  const writes: number[] = [];
  const runner: ExportQueueRunner<{ value: number }> = {
    isCurrent: () => true, prepare: async snapshot => new Uint8Array([snapshot.value]),
    save: async bytes => { writes.push(bytes[0]); return 'saved'; },
  };
  return { queue, add, runner, writes, released: () => released };
}

test('safe basenames never supply paths, reserved Windows names, or a different extension', () => {
  assert.equal(exportBasename('../cat.fbx', 'glb'), '_cat.glb');
  assert.equal(exportBasename('CON', 'fbx'), '_CON.fbx');
  assert.equal(exportBasename(' . ', 'smf'), 'rustsmf-model.smf');
  assert.equal(exportBasename('cat\u202eexe.png', 'dae'), 'cat_exe.png.dae');
  assert.equal(exportBasename('a'.repeat(79) + ' .end', 'glb'), `${'a'.repeat(79)}.glb`);
});
test('runs in insertion order once, releases successes, and copies preset options', async () => {
  const s = setup(); const mutable: ExportPreset = { ...preset };
  s.queue.add(mutable, 'first', () => ({ bytes: 1, value: 8, dispose() {} }));
  mutable.includeAnimation = false;
  s.add(2); await s.queue.run(s.runner); s.queue.retry(); await s.queue.run(s.runner);
  assert.deepEqual(s.writes, [8, 2]); assert.equal(s.queue.getState().bytes, 0);
  assert.equal(s.queue.getState().items[0].preset.includeAnimation, true);
});
test('failed items retry their captured input without repeating completed writes', async () => {
  const s = setup(); s.add(1); s.add(2); let failing = true;
  const runner = { ...s.runner, prepare: async (snapshot: { value: number }) => {
    if (snapshot.value === 1 && failing) throw new Error('format refused'); return new Uint8Array([snapshot.value]);
  } };
  await s.queue.run(runner);
  assert.equal(s.queue.getState().items[0].message, 'format refused');
  assert.deepEqual(s.writes, [2]); failing = false; s.queue.retry(); await s.queue.run(runner);
  assert.deepEqual(s.writes, [2, 1]); assert.equal(s.released(), 2);
});
test('destination cancellation stops following dialogs and remains retryable', async () => {
  const s = setup(); s.add(1); s.add(2); let calls = 0;
  await s.queue.run({ ...s.runner, save: async () => { calls++; return 'canceled'; } });
  assert.equal(calls, 1); assert.deepEqual(s.queue.getState().items.map(item => item.status), ['canceled', 'canceled']);
  s.queue.retry(); await s.queue.run(s.runner); assert.deepEqual(s.writes, [1, 2]);
});
test('cancel during preparation prevents save and retains inputs for retry', async () => {
  const s = setup(); s.add(); s.add(2); const gate = deferred<Uint8Array>(); let signal: AbortSignal | undefined;
  const running = s.queue.run({ ...s.runner, prepare: async (_snapshot, _preset, current) => { signal = current; return gate.promise; } });
  s.queue.cancel(); assert.equal(signal?.aborted, true); gate.resolve(new Uint8Array([1])); await running;
  assert.deepEqual(s.writes, []); assert.equal(s.released(), 0); s.queue.retry(); await s.queue.run(s.runner);
  assert.deepEqual(s.writes, [1, 2]);
});
test('cancel after save issuance records the real success and stops pending items', async () => {
  const s = setup(); s.add(); s.add(2); const gate = deferred<'saved'>();
  const running = s.queue.run({ ...s.runner, save: async () => gate.promise });
  await Promise.resolve(); assert.equal(s.queue.getState().items[0].status, 'saving');
  s.queue.cancel(); gate.resolve('saved'); await running;
  assert.deepEqual(s.queue.getState().items.map(item => item.status), ['saved', 'canceled']); assert.equal(s.released(), 1);
});
test('a failed issued save remains a failure even after cancellation', async () => {
  const s = setup(); s.add(); const gate = deferred<void>();
  const running = s.queue.run({ ...s.runner, save: async () => { await gate.promise; throw new Error('disk full'); } });
  await Promise.resolve(); s.queue.cancel(); gate.resolve(); await running;
  assert.equal(s.queue.getState().items[0].status, 'failed'); assert.equal(s.queue.getState().items[0].message, 'disk full');
});
test('stale completions never issue a save and cancel remaining work', async () => {
  const s = setup(); s.add(); s.add(2); let current = true; const gate = deferred<Uint8Array>();
  const running = s.queue.run({ ...s.runner, isCurrent: () => current, prepare: async () => gate.promise });
  current = false; gate.resolve(new Uint8Array([1])); await running;
  assert.deepEqual(s.writes, []); assert.deepEqual(s.queue.getState().items.map(item => item.status), ['canceled', 'canceled']);
});
test('one active runner reserves its order; adding/removing/clearing cannot interfere', async () => {
  const s = setup(); s.add(); const gate = deferred<Uint8Array>();
  const running = s.queue.run({ ...s.runner, prepare: async () => gate.promise });
  await s.queue.run(s.runner); assert.throws(() => s.add(), /stop/); s.queue.remove(1); s.queue.clear();
  assert.equal(s.queue.getState().items.length, 1); gate.resolve(new Uint8Array([1])); await running; assert.deepEqual(s.writes, [1]);
});
test('count and byte bounds reject before excess captures survive', () => {
  const s = setup(); for (let i = 0; i < 8; i++) s.add(i);
  let captured = false;
  assert.throws(() => s.queue.add(preset, 'over', () => { captured = true; return { bytes: 1, value: 1, dispose() {} }; }), /full/);
  assert.equal(captured, false); s.queue.clear(); assert.equal(s.released(), 8);
  assert.throws(() => s.add(9, MAX_EXPORT_QUEUE_BYTES + 1), /128 MiB/); assert.equal(s.released(), 9);
  assert.equal(s.queue.getState().bytes, 0);
});
test('result size guard does not issue oversized data', async () => {
  const s = setup(); s.add();
  // The guard only needs byteLength; do not allocate a 256 MiB test artifact.
  await s.queue.run({ ...s.runner, prepare: async () => ({ byteLength: MAX_EXPORT_RESULT_BYTES + 1 } as Uint8Array) });
  assert.deepEqual(s.writes, []); assert.match(s.queue.getState().items[0].message, /256 MiB/); s.queue.dispose();
});
test('disposal defers active resource release until preparation settles and silences late results', async () => {
  const s = setup(); s.add(); s.add(2); const gate = deferred<Uint8Array>(); let updates = 0;
  s.queue.subscribe(() => updates++);
  const running = s.queue.run({ ...s.runner, prepare: async () => gate.promise });
  s.queue.dispose(); const before = updates; assert.equal(s.released(), 1);
  gate.resolve(new Uint8Array([1])); await running; assert.equal(s.released(), 2); assert.equal(updates, before);
  assert.deepEqual(s.writes, []); assert.throws(() => s.add(), /stop/);
});
test('disposal during an issued download retains its real receipt and releases once', async () => {
  const s = setup(); s.add(); const gate = deferred<'downloaded'>();
  const running = s.queue.run({ ...s.runner, save: async () => gate.promise });
  await Promise.resolve(); s.queue.dispose(); assert.equal(s.released(), 0); gate.resolve('downloaded'); await running;
  assert.equal(s.released(), 1); assert.equal(s.queue.getState().items[0].status, 'downloaded'); s.queue.dispose(); assert.equal(s.released(), 1);
});
