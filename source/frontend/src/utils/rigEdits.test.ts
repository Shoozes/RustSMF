import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  createChildBone,
  deleteBoneBranch,
  moveBoneToWorldPosition,
  normalizeRigSnapStep,
  reparentBonePreserveWorldTransform,
  removeAnimationClipBoneNames,
  rotateBoneAroundWorldAxis,
  setBoneDetached,
  spinRig,
  retargetAnimationClipBoneNames,
  snapRigWorldPosition,
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

function makeSkinnedMesh(indices: number[], weights: number[]): THREE.SkinnedMesh {
  const geometry = new THREE.BufferGeometry();
  const vertexCount = indices.length / 4;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Array(vertexCount * 3).fill(0), 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  return new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
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

  it('keeps detached hierarchy bone names reserved for rename and create validation', () => {
    const root = new THREE.Bone();
    root.name = 'Root';
    const middle = new THREE.Bone();
    middle.name = 'Middle';
    const tip = new THREE.Bone();
    tip.name = 'Tip';
    root.add(middle);
    middle.add(tip);
    const skeleton = new THREE.Skeleton([root, middle, tip]);

    const detached = setBoneDetached(skeleton, 'Middle', true);
    assert.equal(detached.ok, true);
    assert.deepEqual(skeleton.bones.map((bone) => bone.name), ['Root', 'Tip']);

    const rename = validateBoneRename(skeleton, 'Tip', 'Middle');
    assert.equal(rename.ok, false);
    if (rename.ok) assert.fail('Expected rename to detached hierarchy name to be rejected.');
    assert.equal(rename.reason, 'duplicate-name');

    const create = validateCreateChildBone(skeleton, 'Root', 'Middle');
    assert.equal(create.ok, false);
    if (create.ok) assert.fail('Expected create to detached hierarchy name to be rejected.');
    assert.equal(create.reason, 'duplicate-name');
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

  it('creates a child bone at a requested world position for ortho-pane add tools', () => {
    const skeleton = makeSkeleton();
    const root = skeleton.bones[0];
    root.position.set(2, 3, 4);
    root.updateMatrixWorld(true);
    const targetWorld = new THREE.Vector3(3, 5, 7);

    const result = createChildBone(skeleton, 'Root', 'Placed', { worldPosition: targetWorld });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    const actualWorld = result.bone.getWorldPosition(new THREE.Vector3());
    assert.ok(actualWorld.distanceTo(targetWorld) < 1e-6);
    assert.equal(result.bone.parent, root);
    assert.equal(skeleton.bones.at(-1), result.bone);
    assert.equal(skeleton.boneInverses.length, 3);
    assert.equal(Number.isFinite(skeleton.boneMatrices?.[32]), true);
  });

  it('normalizes rig snap steps and snaps world positions without mutating the source vector', () => {
    assert.equal(normalizeRigSnapStep(0), 0);
    assert.equal(normalizeRigSnapStep(0.25), 0.25);
    assert.equal(normalizeRigSnapStep(0.2), 0);
    assert.equal(normalizeRigSnapStep(Number.NaN), 0);

    const source = new THREE.Vector3(0.13, 0.37, -0.62);
    const snapped = snapRigWorldPosition(source, 0.25);

    assert.deepEqual(snapped.toArray(), [0.25, 0.25, -0.5]);
    assert.deepEqual(source.toArray(), [0.13, 0.37, -0.62]);
    assert.notEqual(snapRigWorldPosition(source, 0), source);
    assert.ok(snapRigWorldPosition(source, 0).distanceTo(source) < 1e-6);
  });

  it('moves a bone to a requested world position while preserving hierarchy and skin indices', () => {
    const root = new THREE.Bone();
    root.name = 'Root';
    root.position.set(2, 0, 0);
    const tip = new THREE.Bone();
    tip.name = 'Tip';
    tip.position.set(0, 1, 0);
    const leaf = new THREE.Bone();
    leaf.name = 'Leaf';
    leaf.position.set(0, 0.5, 0);
    root.add(tip);
    tip.add(leaf);
    const skeleton = new THREE.Skeleton([root, tip, leaf]);
    const mesh = makeSkinnedMesh(
      [0, 1, 2, 0],
      [0.25, 0.5, 0.25, 0],
    );
    root.updateMatrixWorld(true);
    const leafLocalBefore = leaf.position.clone();
    const targetWorld = new THREE.Vector3(3, 4, 5);

    const result = moveBoneToWorldPosition(skeleton, 'Tip', targetWorld);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.bone, tip);
    assert.equal(tip.parent, root);
    assert.equal(leaf.parent, tip);
    assert.ok(tip.getWorldPosition(new THREE.Vector3()).distanceTo(targetWorld) < 1e-6);
    assert.ok(leaf.position.distanceTo(leafLocalBefore) < 1e-6);
    assert.deepEqual(skeleton.bones.map((bone) => bone.name), ['Root', 'Tip', 'Leaf']);
    assert.equal(skeleton.boneInverses.length, 3);
    assert.equal(Number.isFinite(skeleton.boneMatrices?.[32]), true);
    const skinIndex = mesh.geometry.getAttribute('skinIndex');
    assert.equal(skinIndex.getX(0), 0);
    assert.equal(skinIndex.getY(0), 1);
    assert.equal(skinIndex.getZ(0), 2);
  });

  it('rejects invalid rig move requests without mutating the skeleton', () => {
    const skeleton = makeSkeleton();
    const tip = skeleton.bones[1];
    const before = tip.position.clone();

    assert.equal(moveBoneToWorldPosition(skeleton, 'Missing', new THREE.Vector3(1, 2, 3)).ok, false);
    assert.equal(moveBoneToWorldPosition(skeleton, 'Tip', new THREE.Vector3(NaN, 2, 3)).ok, false);
    assert.ok(tip.position.distanceTo(before) < 1e-6);
  });

  it('rotates a bone around a world axis while preserving skeleton buffers and skin indices', () => {
    const root = new THREE.Bone();
    root.name = 'Root';
    const tip = new THREE.Bone();
    tip.name = 'Tip';
    tip.position.set(0, 1, 0);
    root.add(tip);
    const skeleton = new THREE.Skeleton([root, tip]);
    const mesh = makeSkinnedMesh(
      [0, 1, 0, 0],
      [0.5, 0.5, 0, 0],
    );
    root.updateMatrixWorld(true);
    const quaternionBefore = tip.quaternion.clone();
    const positionBefore = tip.getWorldPosition(new THREE.Vector3());

    const result = rotateBoneAroundWorldAxis(skeleton, 'Tip', new THREE.Vector3(0, 0, 1), Math.PI / 2);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.bone, tip);
    assert.ok(tip.quaternion.angleTo(quaternionBefore) > 0.1);
    assert.ok(tip.getWorldPosition(new THREE.Vector3()).distanceTo(positionBefore) < 1e-6);
    assert.deepEqual(skeleton.bones.map((bone) => bone.name), ['Root', 'Tip']);
    assert.equal(skeleton.boneInverses.length, 2);
    assert.equal(Number.isFinite(skeleton.boneMatrices?.[16]), true);
    const skinIndex = mesh.geometry.getAttribute('skinIndex');
    assert.equal(skinIndex.getX(0), 0);
    assert.equal(skinIndex.getY(0), 1);
  });

  it('rejects invalid rig rotate requests without mutating the skeleton', () => {
    const skeleton = makeSkeleton();
    const tip = skeleton.bones[1];
    const before = tip.quaternion.clone();

    assert.equal(rotateBoneAroundWorldAxis(skeleton, 'Missing', new THREE.Vector3(0, 1, 0), 0.5).ok, false);
    assert.equal(rotateBoneAroundWorldAxis(skeleton, 'Tip', new THREE.Vector3(0, 0, 0), 0.5).ok, false);
    assert.equal(rotateBoneAroundWorldAxis(skeleton, 'Tip', new THREE.Vector3(0, 1, 0), Number.NaN).ok, false);
    assert.ok(tip.quaternion.angleTo(before) < 1e-6);
  });

  it('detaches and reconnects a bone while preserving hierarchy and remapping skin indices', () => {
    const root = new THREE.Bone();
    root.name = 'Root';
    const middle = new THREE.Bone();
    middle.name = 'Middle';
    const tip = new THREE.Bone();
    tip.name = 'Tip';
    root.add(middle);
    middle.add(tip);
    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton([root, middle, tip]);
    const mesh = makeSkinnedMesh(
      [0, 1, 2, 0],
      [0.1, 0.8, 0.1, 0],
    );

    const detached = setBoneDetached(skeleton, 'Middle', true, [mesh]);

    assert.equal(detached.ok, true);
    assert.deepEqual(skeleton.bones.map((bone) => bone.name), ['Root', 'Tip']);
    assert.equal(tip.parent, middle);
    assert.equal(middle.parent, root);
    assert.equal(middle.userData.rustsmfDetached, true);
    let skinIndex = mesh.geometry.getAttribute('skinIndex');
    assert.deepEqual([skinIndex.getX(0), skinIndex.getY(0), skinIndex.getZ(0), skinIndex.getW(0)], [0, 1, 1, 0]);
    assert.equal(skeleton.boneInverses.length, 2);
    assert.equal(Number.isFinite(skeleton.boneMatrices?.[16]), true);

    const reconnected = setBoneDetached(skeleton, 'Middle', false, [mesh]);

    assert.equal(reconnected.ok, true);
    assert.deepEqual(skeleton.bones.map((bone) => bone.name), ['Root', 'Middle', 'Tip']);
    assert.equal(tip.parent, middle);
    assert.equal(middle.userData.rustsmfDetached, false);
    skinIndex = mesh.geometry.getAttribute('skinIndex');
    assert.deepEqual([skinIndex.getX(0), skinIndex.getY(0), skinIndex.getZ(0), skinIndex.getW(0)], [0, 2, 2, 0]);
    assert.equal(skeleton.boneInverses.length, 3);
    assert.equal(Number.isFinite(skeleton.boneMatrices?.[32]), true);
  });

  it('rejects invalid detach/connect requests without mutating skeleton order', () => {
    const skeleton = makeSkeleton();
    const before = skeleton.bones.map((bone) => bone.name);

    assert.equal(setBoneDetached(skeleton, 'Root', true).ok, false);
    assert.equal(setBoneDetached(skeleton, 'Missing', true).ok, false);
    assert.equal(setBoneDetached(skeleton, 'Tip', false).ok, false);
    assert.deepEqual(skeleton.bones.map((bone) => bone.name), before);
  });

  it('spins a rig 90 degrees around the requested axis without changing skin indices', () => {
    const root = new THREE.Bone();
    root.name = 'Root';
    root.position.set(1, 2, 3);
    const tip = new THREE.Bone();
    tip.name = 'Tip';
    tip.position.set(1, 0, 0);
    root.add(tip);
    const skeleton = new THREE.Skeleton([root, tip]);
    const mesh = makeSkinnedMesh(
      [0, 1, 0, 0],
      [0.25, 0.75, 0, 0],
    );
    root.updateMatrixWorld(true);
    const rootWorldBefore = root.getWorldPosition(new THREE.Vector3());
    const tipWorldBefore = tip.getWorldPosition(new THREE.Vector3());
    const expectedRoot = rootWorldBefore.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
    const expectedTip = tipWorldBefore.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);

    const result = spinRig(skeleton, 'z');

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.axis, 'z');
    assert.equal(result.boneCount, 2);
    assert.ok(root.getWorldPosition(new THREE.Vector3()).distanceTo(expectedRoot) < 1e-6);
    assert.ok(tip.getWorldPosition(new THREE.Vector3()).distanceTo(expectedTip) < 1e-6);
    assert.deepEqual(skeleton.bones.map((bone) => bone.name), ['Root', 'Tip']);
    assert.equal(skeleton.boneInverses.length, 2);
    assert.equal(Number.isFinite(skeleton.boneMatrices?.[16]), true);
    const skinIndex = mesh.geometry.getAttribute('skinIndex');
    assert.deepEqual([skinIndex.getX(0), skinIndex.getY(0), skinIndex.getZ(0), skinIndex.getW(0)], [0, 1, 0, 0]);
  });

  it('spins disconnected hierarchy roots and rejects invalid spin requests', () => {
    const rootA = new THREE.Bone();
    rootA.name = 'RootA';
    rootA.position.set(1, 0, 0);
    const rootB = new THREE.Bone();
    rootB.name = 'RootB';
    rootB.position.set(0, 1, 0);
    const skeleton = new THREE.Skeleton([rootA, rootB]);
    rootA.updateMatrixWorld(true);
    rootB.updateMatrixWorld(true);

    const result = spinRig(skeleton, 'x');

    assert.equal(result.ok, true);
    assert.ok(rootA.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-6);
    assert.ok(rootB.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-6);
    assert.equal(spinRig(null, 'x').ok, false);
    assert.equal(spinRig(new THREE.Skeleton([]), 'x').ok, false);
    assert.equal(spinRig(skeleton, 'bad' as unknown as 'x').ok, false);
    const invalidAngle = spinRig(skeleton, 'x', Number.NaN);
    if (invalidAngle.ok) assert.fail('Expected non-finite spin angle to be rejected.');
    assert.equal(invalidAngle.reason, 'invalid-angle');
  });

  it('deletes an unweighted bone and remaps later skin indices', () => {
    const root = new THREE.Bone();
    root.name = 'Root';
    const middle = new THREE.Bone();
    middle.name = 'Middle';
    const tip = new THREE.Bone();
    tip.name = 'Tip';
    root.add(middle);
    root.add(tip);
    const skeleton = new THREE.Skeleton([root, middle, tip]);
    const mesh = makeSkinnedMesh(
      [0, 2, 0, 0],
      [0.5, 0.5, 0, 0],
    );

    const result = deleteBoneBranch(skeleton, 'Middle', [mesh]);
    const skinIndex = mesh.geometry.getAttribute('skinIndex');

    assert.equal(result.ok, true);
    assert.equal(skeleton.bones.length, 2);
    assert.deepEqual(skeleton.bones.map((bone) => bone.name), ['Root', 'Tip']);
    assert.equal(root.children.includes(middle), false);
    assert.equal(skinIndex.getX(0), 0);
    assert.equal(skinIndex.getY(0), 1);
    assert.equal(skeleton.boneInverses.length, 2);
    assert.equal(skeleton.boneMatrices?.length, 32);
  });

  it('blocks deleting bones that still have weighted skin references', () => {
    const skeleton = makeSkeleton();
    const mesh = makeSkinnedMesh(
      [1, 0, 0, 0],
      [1, 0, 0, 0],
    );

    const result = deleteBoneBranch(skeleton, 'Tip', [mesh]);

    assert.equal(result.ok, false);
    assert.equal(skeleton.bones.length, 2);
    assert.equal(skeleton.bones[0].children.includes(skeleton.bones[1]), true);
  });

  it('removes animation tracks for deleted bone names', () => {
    const clip = new THREE.AnimationClip('Move', 1, [
      new THREE.VectorKeyframeTrack('Root.position', [0, 1], [0, 0, 0, 1, 0, 0]),
      new THREE.VectorKeyframeTrack('Tip.position', [0, 1], [0, 0, 0, 0, 1, 0]),
    ]);

    const [cleaned] = removeAnimationClipBoneNames([clip], ['Tip']);

    assert.deepEqual(cleaned.tracks.map((track) => track.name), ['Root.position']);
    assert.deepEqual(clip.tracks.map((track) => track.name), ['Root.position', 'Tip.position']);
  });
});
