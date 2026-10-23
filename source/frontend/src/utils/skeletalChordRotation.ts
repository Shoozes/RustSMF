import * as THREE from 'three';
import { restoreTrackInterpolation, trackInterpolation } from './animationTrackInterpolation';

export const CONDITIONING_NLERP_MODE = 'continuous-60hz-locomotion-root-nlerp' as const;

export function chordRotationTrack(name: string, times: readonly number[], values: readonly number[]): THREE.QuaternionKeyframeTrack {
  const keys = new Float32Array(values), storedTimes = new Float32Array(times);
  for (let key = 1; key < storedTimes.length; key++) {
    let dot = 0;
    for (let c = 0; c < 4; c++) dot += keys[(key - 1) * 4 + c] * keys[key * 4 + c];
    if (dot < 0) for (let c = 0; c < 4; c++) keys[key * 4 + c] *= -1;
  }
  const cubic = new Float32Array(storedTimes.length * 12);
  for (let key = 0; key < storedTimes.length; key++) cubic.set(keys.subarray(key * 4, key * 4 + 4), key * 12 + 4);
  for (let key = 0; key < storedTimes.length - 1; key++) {
    const span = storedTimes[key + 1] - storedTimes[key];
    for (let c = 0; c < 4; c++) {
      const slope = Math.fround((keys[(key + 1) * 4 + c] - keys[key * 4 + c]) / span);
      cubic[key * 12 + 8 + c] = slope;
      cubic[(key + 1) * 12 + c] = slope;
    }
  }
  const track = new THREE.QuaternionKeyframeTrack(name, storedTimes, cubic);
  restoreTrackInterpolation(track, 'gltf-cubic-spline');
  return track;
}

/** Only the generated float32 tick grid and exact chord slopes are representable by v1. */
export function validateChordRotation(track: THREE.KeyframeTrack, durationTicks: number): void {
  const bad = (): never => { throw new Error(`Track ${track.name} is not a canonical conditioned NLERP chord rotation.`); };
  if (trackInterpolation(track) !== 'gltf-cubic-spline' || track.ValueTypeName !== 'quaternion'
    || !(track.times instanceof Float32Array) || !(track.values instanceof Float32Array)
    || track.times.length < 2 || track.values.length !== track.times.length * 12) bad();
  const { times, values } = track;
  if (times[0] !== 0 || times[times.length - 1] !== Math.fround(durationTicks / 60)
    || [...times, ...values].some(value => !Number.isFinite(value))) bad();
  const constant = times.length === 2 && [0, 1, 2, 3].every(c => values[4 + c] === values[16 + c]);
  if (!constant && (times.length !== durationTicks + 1 || times.some((time, key) => time !== Math.fround(key / 60)))) bad();
  for (let key = 0; key < times.length; key++) {
    if (Math.abs(Math.hypot(...values.slice(key * 12 + 4, key * 12 + 8)) - 1) > 1e-6) bad();
    for (let c = 0; c < 4; c++) if ((key === 0 && values[c] !== 0)
      || (key === times.length - 1 && values[key * 12 + 8 + c] !== 0)) bad();
    if (key === times.length - 1) continue;
    const span = times[key + 1] - times[key];
    if (!(span > 0)) bad();
    let dot = 0;
    for (let c = 0; c < 4; c++) {
      const left = values[key * 12 + 4 + c], right = values[(key + 1) * 12 + 4 + c];
      dot += left * right;
      const slope = Math.fround((right - left) / span);
      if (values[key * 12 + 8 + c] !== slope || values[(key + 1) * 12 + c] !== slope) bad();
    }
    if (dot < 0) bad();
  }
}
