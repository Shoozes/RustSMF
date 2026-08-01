import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cancelPendingAnimationFrame } from './animationFrame';

describe('animationFrame', () => {
  it('cancels a zero-valued frame handle and clears it', () => {
    const canceled: number[] = [];

    const next = cancelPendingAnimationFrame(0, (handle) => canceled.push(handle));

    assert.equal(next, null);
    assert.deepEqual(canceled, [0]);
  });

  it('does not call the scheduler for an empty handle', () => {
    let cancelCount = 0;

    const next = cancelPendingAnimationFrame(null, () => {
      cancelCount += 1;
    });

    assert.equal(next, null);
    assert.equal(cancelCount, 0);
  });
});
