export const PLAYBACK_DISPLAY_INTERVAL_MS = 50;

export interface PlaybackDisplayThrottle {
  shouldPublish: (nowMs: number) => boolean;
  markPublished: (nowMs: number) => void;
}

export function createPlaybackDisplayThrottle(
  intervalMs = PLAYBACK_DISPLAY_INTERVAL_MS,
): PlaybackDisplayThrottle {
  let lastPublishedAt = Number.NEGATIVE_INFINITY;
  return {
    shouldPublish: (nowMs: number) => (
      !Number.isFinite(lastPublishedAt)
      || !Number.isFinite(nowMs)
      || nowMs < lastPublishedAt
      || nowMs - lastPublishedAt >= intervalMs
    ),
    markPublished: (nowMs: number) => {
      lastPublishedAt = nowMs;
    },
  };
}
