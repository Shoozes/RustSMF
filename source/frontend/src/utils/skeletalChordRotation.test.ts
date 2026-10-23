import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrackInterpolant } from './animationTrackInterpolation';
import { chordRotationTrack, validateChordRotation } from './skeletalChordRotation';

test('stored chord-cubic rotations agree with shortest-arc NLERP on a float32 tick grid', () => {
  const times = [0, Math.fround(1 / 60), Math.fround(2 / 60)];
  const a = new THREE.Quaternion().setFromEuler(new THREE.Euler(.2, -.4, .8));
  const b = new THREE.Quaternion().setFromEuler(new THREE.Euler(2.8, .6, -.9));
  const track = chordRotationTrack('Joint.quaternion', times, [...a.toArray(), ...b.toArray().map(v => -v), ...a.toArray()]);
  validateChordRotation(track, 2);
  const interpolant = createTrackInterpolant(track);
  for (let segment = 0; segment < 2; segment++) for (const phase of [.001, .125, .25, .5, .875, .999]) {
    const q0 = Array.from(track.values.slice(segment * 12 + 4, segment * 12 + 8));
    const q1 = Array.from(track.values.slice((segment + 1) * 12 + 4, (segment + 1) * 12 + 8));
    const expected = new THREE.Quaternion().fromArray(q0.map((v, c) => v * (1 - phase) + q1[c] * phase)).normalize();
    const result = Array.from(interpolant.evaluate(times[segment] + phase * (times[segment + 1] - times[segment])) as Float32Array);
    assert.ok(result.every((v, c) => Math.abs(v - expected.toArray()[c]) < 2e-7));
  }
  for (const mutation of ['tangent', 'hemisphere', 'endpoint', 'time', 'shape']) {
    const bad = track.clone();
    if (mutation === 'tangent') bad.values[8] += .01;
    if (mutation === 'hemisphere') for (let c = 0; c < 4; c++) bad.values[16 + c] *= -1;
    if (mutation === 'endpoint') bad.values[0] = .1;
    if (mutation === 'time') bad.times[1] += .001;
    if (mutation === 'shape') bad.values = bad.values.slice(0, -1);
    assert.throws(() => validateChordRotation(bad, 2), /canonical conditioned NLERP/);
  }
  const forged = new THREE.QuaternionKeyframeTrack('Joint.quaternion', [0, 1 / 60], [0, 0, 0, 1, 0, 0, 0, 1]);
  const runtime = forged as THREE.KeyframeTrack & { createInterpolant: { isInterpolantFactoryMethodGLTFCubicSpline?: boolean } };
  runtime.createInterpolant = Object.assign(() => createTrackInterpolant(track), { isInterpolantFactoryMethodGLTFCubicSpline: true });
  assert.throws(() => validateChordRotation(forged, 1), /canonical conditioned NLERP/);
});
