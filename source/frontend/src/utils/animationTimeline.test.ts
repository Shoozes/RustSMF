import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { getClipByName, isTrackForBone, summarizeAnimationTimeline } from './animationTimeline';

test('summarizeAnimationTimeline collects sorted unique keyframe times', () => {
  const clip = new THREE.AnimationClip('walk', 2, [
    new THREE.VectorKeyframeTrack('BoneA.position', [0, 1, 2], [0, 0, 0, 1, 0, 0, 2, 0, 0]),
    new THREE.QuaternionKeyframeTrack('BoneA.quaternion', [0, 2], [0, 0, 0, 1, 0, 0, 0, 1]),
    new THREE.VectorKeyframeTrack('BoneB.position', [0.5, 2], [0, 0, 0, 1, 0, 0]),
  ]);

  const summary = summarizeAnimationTimeline(clip, 'BoneA');

  assert.equal(summary.trackCount, 3);
  assert.deepEqual(summary.keyframeTimes, [0, 0.5, 1, 2]);
  assert.equal(summary.selectedTrackCount, 2);
  assert.deepEqual(summary.selectedKeyframeTimes, [0, 1, 2]);
});

test('getClipByName falls back to the first clip', () => {
  const idle = new THREE.AnimationClip('idle', 1, []);
  const walk = new THREE.AnimationClip('walk', 1, []);

  assert.equal(getClipByName([idle, walk], 'walk'), walk);
  assert.equal(getClipByName([idle, walk], 'missing'), idle);
  assert.equal(getClipByName([], 'missing'), null);
});

test('isTrackForBone supports common Three track target formats', () => {
  assert.equal(isTrackForBone('SMF_Node_1.position', 'SMF_Node_1'), true);
  assert.equal(isTrackForBone('.bones[SMF_Node_1].quaternion', 'SMF_Node_1'), true);
  assert.equal(isTrackForBone('Armature.SMF_Node_1.position', 'SMF_Node_1'), true);
  assert.equal(isTrackForBone('SMF_Node_12.position', 'SMF_Node_1'), false);
});
