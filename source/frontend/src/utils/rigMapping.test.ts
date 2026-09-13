import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildRigMap, resolveLogicalAttachments } from './rigMapping';

function skeleton(names: readonly string[]): THREE.Skeleton {
  const bones = names.map((name) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.y = 0.1;
    return bone;
  });
  for (let index = 1; index < bones.length; index += 1) bones[0].add(bones[index]);
  bones[0].updateWorldMatrix(true, true);
  return new THREE.Skeleton(bones);
}

test('canonical Mixamo names map with exact confidence', () => {
  const source = skeleton(['mixamorigHips', 'mixamorigSpine2', 'mixamorigHead', 'mixamorigLeftHand']);
  const target = skeleton(['Hips', 'Spine2', 'Head', 'LeftHand']);
  const result = buildRigMap(source, target);
  assert.equal(result.ok, true);
  assert.equal(result.map.mixamorigHips, 'Hips');
  assert.equal(result.map.mixamorigLeftHand, 'LeftHand');
  assert.ok(result.decisions.every((decision) => decision.method === 'canonical' && decision.confidence === 1));
});

test('numeric rigs require a manual semantic map but retain unmapped helpers', () => {
  const source = skeleton(['joint-4', 'joint-5', 'joint-6']);
  const target = skeleton(['mixamorigHips', 'mixamorigSpine2', 'mixamorigHead']);
  const rejected = buildRigMap(source, target);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.diagnostics.some((item) => item.code === 'RIG_MAP_OPAQUE_REQUIRES_MANUAL'));

  const accepted = buildRigMap(source, target, {
    manualMap: {
      'joint-5': 'mixamorigHips',
      'joint-6': 'mixamorigHead',
    },
  });
  assert.equal(accepted.ok, true);
  assert.ok(accepted.diagnostics.some((item) => item.code === 'RIG_MAP_OPAQUE_UNMAPPED' && item.sourceBone === 'joint-4'));
});

test('logical attachments resolve exact target bone names and rest transforms', () => {
  const result = resolveLogicalAttachments(skeleton([
    'mixamorigHips',
    'mixamorigSpine2',
    'mixamorigHead',
    'mixamorigRightHand',
    'mixamorigLeftHand',
    'mixamorigRightFoot',
    'mixamorigLeftFoot',
  ]));
  assert.equal(result.root.bone, 'mixamorigHips');
  assert.equal(result.torso.bone, 'mixamorigSpine2');
  assert.equal(result.rightHand.bone, 'mixamorigRightHand');
  assert.deepEqual(result.leftFoot.localScale, [1, 1, 1]);
});

test('orientation correction aligns anatomical sides as well as up', () => {
  const make = (source: boolean): THREE.Skeleton => {
    const hips = new THREE.Bone();
    hips.name = source ? 'joint-5' : 'mixamorigHips';
    const head = new THREE.Bone();
    head.name = source ? 'joint-12' : 'mixamorigHead';
    head.position.y = 2;
    const right = new THREE.Bone();
    right.name = source ? 'joint-10' : 'mixamorigRightHand';
    right.position.x = source ? 1 : -1;
    right.position.y = 1;
    const left = new THREE.Bone();
    left.name = source ? 'joint-16' : 'mixamorigLeftHand';
    left.position.x = source ? -1 : 1;
    left.position.y = 1;
    hips.add(head, right, left);
    hips.updateWorldMatrix(true, true);
    return new THREE.Skeleton([hips, head, right, left]);
  };
  const result = buildRigMap(make(true), make(false), {
    manualMap: {
      'joint-5': 'mixamorigHips',
      'joint-12': 'mixamorigHead',
      'joint-10': 'mixamorigRightHand',
      'joint-16': 'mixamorigLeftHand',
    },
  });
  assert.equal(result.ok, true);
  assert.ok(result.orientationCorrection);
  const correctedRight = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(new THREE.Quaternion().fromArray(result.orientationCorrection!));
  assert.ok(correctedRight.distanceTo(new THREE.Vector3(-1, 0, 0)) < 1e-6);
  assert.ok(result.diagnostics.some((item) => item.code === 'RIG_MAP_LATERAL_TWIST'));
});
