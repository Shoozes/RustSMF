export const FITTED_DURATION_TOLERANCE_FACTOR = 2 ** -22;
export const MAX_FITTED_GRID_FRAMES = 6_000;

export function fittedDurationTolerance(...durations: number[]): number {
  return Math.max(1, ...durations.map((duration) => Math.abs(duration))) * FITTED_DURATION_TOLERANCE_FACTOR;
}

export function buildFittedComparisonSchedule(duration: number, rate: number): number[] {
  if (!Number.isFinite(duration) || duration < 0 || !Number.isInteger(rate) || rate < 1 || rate > 240
    || duration * rate > MAX_FITTED_GRID_FRAMES) {
    throw new Error(`Fitted verification requires a finite duration and at most ${MAX_FITTED_GRID_FRAMES} regular frames`);
  }
  const lastGridFrame = Math.floor(duration * rate);
  const times = Array.from({ length: lastGridFrame + 1 }, (_, frame) => frame / rate);
  if (times[times.length - 1] !== duration) times.push(duration);
  return times;
}

export function boundedFloat32SampleTime(time: number, duration: number): number {
  return Math.min(duration, Math.max(0, Math.fround(time)));
}

export function boundedRequestedSampleTime(time: number, duration: number): number {
  return Math.min(duration, Math.max(0, time));
}
