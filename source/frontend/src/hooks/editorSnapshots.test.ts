import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { makeAnimationEditState } from '../utils/animationEdits';
import {
  captureRigSkinIndexSnapshots,
  cloneAnimationWorkspaceSnapshot,
  restoreRigSkinIndexSnapshots,
  sameAnimationWorkspaceSnapshot,
  samePoseSnapshot,
  type PoseHistorySnapshot,
} from './editorSnapshots';

function poseSnapshot(positionX = 0, dRotX = 0, dRotY = 0): PoseHistorySnapshot {
  return {
    selectedBoneName: 'Bone',
    poseEdits: {
      Bone: {
        dx: positionX,
        dy: 0,
        dRotX,
        dRotY,
        dRotZ: 0,
        dirty: positionX !== 0,
        hasScale: false,
      },
    },
    bones: {
      Bone: {
        position: [positionX, 0, 0],
        quaternion: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
    },
  };
}

test('pose snapshots compare all edit and transform state', () => {
  assert.equal(samePoseSnapshot(poseSnapshot(), poseSnapshot()), true);
  assert.equal(samePoseSnapshot(poseSnapshot(), poseSnapshot(1)), false);
  assert.equal(samePoseSnapshot(poseSnapshot(), poseSnapshot(0, 0.2)), false);
  assert.equal(samePoseSnapshot(poseSnapshot(), poseSnapshot(0, 0, -0.2)), false);
});

test('animation workspace clones own clip and edit buffers', () => {
  const source = {
    baseClips: [new THREE.AnimationClip('Idle', 1, [
      new THREE.VectorKeyframeTrack('Bone.position', [0], [0, 0, 0]),
    ])],
    animationEditState: makeAnimationEditState(),
    currentClipName: 'Idle',
    currentTime: 0,
  };
  const clone = cloneAnimationWorkspaceSnapshot(source);
  assert.equal(sameAnimationWorkspaceSnapshot(source, clone), true);
  clone.baseClips[0].tracks[0].values[0] = 2;
  assert.equal(sameAnimationWorkspaceSnapshot(source, clone), false);
});

test('rig skin-index snapshots restore mutated attributes', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 1, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  const root = new THREE.Group();
  root.add(mesh);
  const snapshots = captureRigSkinIndexSnapshots(root);

  mesh.geometry.getAttribute('skinIndex').setX(0, 3);
  restoreRigSkinIndexSnapshots(snapshots);
  assert.equal(mesh.geometry.getAttribute('skinIndex').getX(0), 0);
});
