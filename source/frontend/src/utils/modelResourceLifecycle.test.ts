import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createModelResourceLifecycle } from './modelResourceLifecycle';

test('resource settlement sees starts made before wait and waits for every item', async () => {
  const manager = new THREE.LoadingManager();
  const original = manager.itemStart;
  const lifecycle = createModelResourceLifecycle(manager, 'OBJ', 100);
  manager.itemStart('one'); manager.itemStart('two');
  let settled = false;
  const done = lifecycle.wait().then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false);
  manager.itemEnd('one'); await Promise.resolve(); assert.equal(settled, false);
  manager.itemEnd('two'); await done;
  assert.equal(settled, true);
  lifecycle.dispose(); lifecycle.dispose();
  assert.equal(manager.itemStart, original);
});

test('failure, bounded timeout and disposal reject required resource loading', async () => {
  for (const mode of ['failure', 'timeout', 'dispose'] as const) {
    const manager = new THREE.LoadingManager();
    const lifecycle = createModelResourceLifecycle(manager, 'DAE', 5);
    manager.itemStart('texture');
    const result = assert.rejects(lifecycle.wait(), mode === 'failure' ? /failed to load/ : mode === 'timeout' ? /timed out/ : /canceled/);
    if (mode === 'failure') manager.itemError('texture');
    if (mode === 'dispose') lifecycle.dispose();
    await result;
    lifecycle.dispose();
    manager.itemEnd('texture');
  }
});

test('optional resources settle before a caller removes unavailable maps', async () => {
  const manager = new THREE.LoadingManager();
  const lifecycle = createModelResourceLifecycle(manager, 'DAE', 100);
  manager.itemStart('optional'); manager.itemError('optional');
  let settled = false;
  const done = lifecycle.wait(false).then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false);
  manager.itemEnd('optional'); await done; lifecycle.dispose();
});
