import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  createChildBone,
  reparentBonePreserveWorldTransform,
  retargetAnimationClipBoneNames,
  validateCreateChildBone,
  validateBoneReparent,
  validateBoneRename,
} from './rigEdits';

function makeSkeleton(): THREE.Skeleton {
  const root = new THREE.Bone();
  root.name = 'Root';
  const tip = new THREE.Bone();
  tip.name = 'Tip';
  root.add(tip);
  return new THREE.Skeleton([root, tip]);
}

describe('rigEdits', () => {
  it('validates selected-bone rename requests', () => {
    const skeleton = makeSkeleton();

    assert.deepEqual(validateBoneRename(skeleton, 'Root', 'Spine'), { ok: true, name: 'Spine' });
    assert.equal(validateBoneRename(skeleton, '', 'Spine').ok, false);
    assert.equal(validateBoneRename(skeleton, 'Root', 'Tip').ok, false);
    assert.equal(validateBoneRename(skeleton, 'Root', 'Root').ok, false);
    assert.equal(validateBoneRename(skeleton, 'Root', 'bad name').ok, false);
  });

  it('retargets animation tracks that reference a renamed bone', () => {
    const clip = new THREE.AnimationClip('Move', 1, [
      new THREE.VectorKeyframeTrack('Root.position', [0, 1], [0, 0, 0, 1, 0, 0]),
      new THREE.QuaternionKeyframeTrack('Root.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
      new THREE.VectorKeyframeTrack('Arm.position', [0, 1], [0, 0, 0, 0, 1, 0]),
    ]);

    const [renamed] = retargetAnimationClipBoneNames([clip], 'Root', 'Spine');

    assert.notEqual(renamed, clip);
    assert.deepEqual(renamed.tracks.map((track) => track.name), [
      'Spine.position',
      'Spine.quaternion',
      'Arm.position',
    ]);
    assert.deepEqual(clip.tracks.map((track) => track.name), [
      'Root.position',
      'Root.quaternion',
      'Arm.position',
    ]);
  });

  it('validates reparent requests without allowing cycles', () => {
    const skeleton = makeSkeleton();

    assert.equal(validateBoneReparent(skeleton, 'Tip', 'Root').ok, true);
    assert.equal(validateBoneReparent(skeleton, 'Root', 'Tip').ok, false);
    assert.equal(validateBoneReparent(skeleton, 'Root', 'Root').ok, false);
    assert.equal(validateBoneReparent(skeleton, 'Missing', 'Root').ok, false);
    assert.equal(validateBoneReparent(skeleton, 'Tip', 'Missing').ok, false);
  });

  it('reparents a bone while preserving its world transform', () => {
    const root = new THREE.Bone();
    root.name = 'Root';
    root.position.set(1, 0, 0);
    const middle = new THREE.Bone();
    middle.name = 'Middle';
    middle.position.set(0, 2, 0);
    const tip = new THREE.Bone();
    tip.name = 'Tip';
    tip.position.set(0, 0, 3);
    root.add(middle);
    root.add(tip);
    const skeleton = new THREE.Skeleton([root, middle, tip]);
    root.updateMatrixWorld(true);
    const before = tip.getWorldPosition(new THREE.Vector3());

    const result = reparentBonePreserveWorldTransform(skeleton, 'Tip', 'Middle');
    const after = tip.getWorldPosition(new THREE.Vector3());

    assert.equal(result.ok, true);
    assert.equal(tip.parent, middle);
    assert.ok(before.distanceTo(after) < 1e-6);
  });

  it('validates child bone creation names and parents', () => {
    const skeleton = makeSkeleton();

    assert.deepEqual(validateCreateChildBone(skeleton, 'Root', 'Hand'), {
      ok: true,
      name: 'Hand',
      parent: skeleton.bones[0],
    });
    assert.equal(validateCreateChildBone(skeleton, 'Scene', 'Hand').ok, false);
    assert.equal(validateCreateChildBone(skeleton, 'Missing', 'Hand').ok, false);
    assert.equal(validateCreateChildBone(skeleton, 'Root', '').ok, false);
    assert.equal(validateCreateChildBone(skeleton, 'Root', 'Tip').ok, false);
    assert.equal(validateCreateChildBone(skeleton, 'Root', 'bad name').ok, false);
  });

  it('creates a child bone with inverse bind data and resized skeleton buffers', () => {
    const skeleton = makeSkeleton();
    const root = skeleton.bones[0];
    assert.ok(skeleton.boneMatrices);
    const originalMatrixLength = skeleton.boneMatrices.length;

    const result = createChildBone(skeleton, 'Root', 'Hand');

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.bone.name, 'Hand');
    assert.equal(result.bone.parent, root);
    assert.equal(skeleton.bones.at(-1), result.bone);
    assert.equal(skeleton.boneInverses.length, 3);
    assert.ok(skeleton.boneMatrices);
    assert.equal(skeleton.boneMatrices.length, originalMatrixLength + 16);
    assert.equal(root.children.includes(result.bone), true);
    assert.equal(Number.isFinite(skeleton.boneMatrices[32]), true);
  });
});
