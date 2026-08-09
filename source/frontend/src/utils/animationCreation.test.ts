import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  captureAnimationPose,
  createAnimationClipFromPose,
  formatAnimationDuration,
  normalizeAnimationDuration,
  validateAnimationSkeleton,
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

test('animation creation rejects unnamed and duplicate bone names before emitting ambiguous tracks', () => {
  const unnamed = new THREE.Bone();
  const unnamedSkeleton = new THREE.Skeleton([unnamed]);
  assert.deepEqual(validateAnimationSkeleton(unnamedSkeleton), {
    ok: false,
    reason: 'unnamed-bone',
  });
  assert.equal(createAnimationClipFromPose(unnamedSkeleton, 'Invalid', 1, {}), null);

  const root = new THREE.Bone();
  root.name = 'Root';
  const duplicate = new THREE.Bone();
  duplicate.name = 'Root';
  const duplicateSkeleton = new THREE.Skeleton([root, duplicate]);
  assert.deepEqual(validateAnimationSkeleton(duplicateSkeleton), {
    ok: false,
    reason: 'duplicate-bone-name',
    boneName: 'Root',
  });
  assert.equal(createAnimationClipFromPose(duplicateSkeleton, 'Invalid', 1, {}), null);
});

test('animation pose capture treats hostile bone names as own snapshot keys', () => {
  const bone = new THREE.Bone();
  bone.name = '__proto__';
  const snapshot = captureAnimationPose(new THREE.Skeleton([bone]));

  assert.equal(Object.prototype.hasOwnProperty.call(snapshot, '__proto__'), true);
  assert.equal(snapshot['__proto__']?.quaternion[3], 1);
});

test('animation duration normalization rejects invalid values and bounds extreme input', () => {
  assert.equal(normalizeAnimationDuration(Number.NaN), 1);
  assert.equal(normalizeAnimationDuration(-5), 0.01);
  assert.equal(normalizeAnimationDuration(99999), 3600);
  assert.equal(normalizeAnimationDuration(1.23456), 1.235);
});

test('animation duration formatting removes floating-point display noise without changing the value', () => {
  const storedDuration = 0.1 + 0.2;

  assert.equal(formatAnimationDuration(storedDuration), '0.3');
  assert.equal(formatAnimationDuration(1.23456), '1.235');
  assert.equal(formatAnimationDuration(2), '2');
  assert.equal(storedDuration, 0.30000000000000004);
});
