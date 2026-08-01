import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPlaybackDisplayThrottle,
  PLAYBACK_DISPLAY_INTERVAL_MS,
} from './playbackDisplayThrottle';

test('playback display throttle publishes immediately, then at its cadence', () => {
  const throttle = createPlaybackDisplayThrottle();
  assert.equal(throttle.shouldPublish(0), true);
  throttle.markPublished(0);
  assert.equal(throttle.shouldPublish(PLAYBACK_DISPLAY_INTERVAL_MS - 1), false);
  assert.equal(throttle.shouldPublish(PLAYBACK_DISPLAY_INTERVAL_MS), true);
  throttle.markPublished(PLAYBACK_DISPLAY_INTERVAL_MS);
  assert.equal(throttle.shouldPublish(PLAYBACK_DISPLAY_INTERVAL_MS + 1), false);
});

test('playback display throttle recovers if the clock moves backwards', () => {
  const throttle = createPlaybackDisplayThrottle(10);
  throttle.markPublished(100);
  assert.equal(throttle.shouldPublish(50), true);
});
