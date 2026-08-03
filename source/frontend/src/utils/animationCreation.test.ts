import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  captureAnimationPose,
  createAnimationClipFromPose,
  normalizeAnimationDuration,
} from './animationCreation';

function makeSkeleton(): THREE.Skeleton {
  const root = new THREE.Bone();
  root.name = 'Root';
  root.position.set(1, 2, 3);
  const child = new THREE.Bone();
  child.name = 'Child';
  child.position.x = 4;
  root.add(child);
  return new THREE.Skeleton([root, child]);
}

test('animation creation captures named bone local transforms and creates stable endpoint keys', () => {
  const skeleton = makeSkeleton();
  const pose = captureAnimationPose(skeleton);
  const clip = createAnimationClipFromPose(skeleton, 'Rest', 2.3456, pose);

  assert.ok(clip);
  assert.equal(clip.name, 'Rest');
  assert.equal(clip.duration, 2.346);
  assert.equal(clip.tracks.length, 4);

  const rootPosition = clip.tracks.find((track) => track.name === 'Root.position');
  assert.ok(rootPosition);
  assert.equal(rootPosition!.times[0], 0);
  assert.ok(Math.abs(rootPosition!.times[1] - 2.346) < 1e-5);
  assert.deepEqual(Array.from(rootPosition!.values), [1, 2, 3, 1, 2, 3]);
});

test('animation creation falls back to the live bone pose for missing snapshot entries', () => {
  const skeleton = makeSkeleton();
  const clip = createAnimationClipFromPose(skeleton, 'Current', 1, {});

  assert.ok(clip);
  const childPosition = clip.tracks.find((track) => track.name === 'Child.position');
  assert.ok(childPosition);
  assert.deepEqual(Array.from(childPosition!.values), [4, 0, 0, 4, 0, 0]);
});

test('animation duration normalization rejects invalid values and bounds extreme input', () => {
  assert.equal(normalizeAnimationDuration(Number.NaN), 1);
  assert.equal(normalizeAnimationDuration(-5), 0.01);
  assert.equal(normalizeAnimationDuration(99999), 3600);
  assert.equal(normalizeAnimationDuration(1.23456), 1.235);
});
