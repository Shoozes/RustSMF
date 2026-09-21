import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLazyClientLoader } from './lazyClient';

describe('lazy client loader', () => {
  it('shares one in-flight client initialization across overlapping callers', async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = { invoke: 'shared' };
    const loadClient = createLazyClientLoader(async () => {
      calls += 1;
      await pending;
      return client;
    });

    const first = loadClient();
    const second = loadClient();
    assert.strictEqual(first, second);
    assert.equal(calls, 1);

    release?.();
    assert.strictEqual(await first, client);
    assert.strictEqual(await loadClient(), client);
    assert.equal(calls, 1);
  });

  it('clears a rejected initialization so the next caller can retry', async () => {
    let calls = 0;
    const loadClient = createLazyClientLoader(async () => {
      calls += 1;
      if (calls === 1) throw new Error('dynamic import failed');
      return { invoke: 'retried' };
    });

    await assert.rejects(loadClient(), /dynamic import failed/);
    assert.deepEqual(await loadClient(), { invoke: 'retried' });
    assert.equal(calls, 2);
  });
});
