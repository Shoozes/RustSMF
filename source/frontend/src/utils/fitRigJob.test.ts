import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as THREE from 'three';
import { parseFitRigJob } from '../../scripts/fit-rig-cli';
import { compareFittedMotion } from './fittedRigVerification';

test('fit-rig jobs reject implicit clips, unknown fields, and relative paths', () => {
  const job = { schema: 'rustsmf-fit-rig-v1', source: path.resolve('source.glb'), template: path.resolve('template.glb'),
    outputDirectory: path.resolve('fresh-output'), mapping: { source: 'target' }, clips: ['idle'] };
  assert.deepEqual(parseFitRigJob(job), job);
  assert.throws(() => parseFitRigJob({ ...job, clips: [] }), /clip names/);
  assert.throws(() => parseFitRigJob({ ...job, clips: ['idle', 'idle'] }), /clip names/);
  assert.throws(() => parseFitRigJob({ ...job, source: 'relative.glb' }), /absolute/);
  assert.throws(() => parseFitRigJob({ ...job, overwrite: true }), /Unknown/);
});

test('fitted comparison detects actual vertex displacement and restores animated poses', () => {
  const make = () => {
    const root = new THREE.Group(), bone = new THREE.Bone(); bone.name = 'joint'; root.add(bone);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([1, 0, 0], 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial()); root.add(mesh);
    mesh.bind(new THREE.Skeleton([bone])); root.updateMatrixWorld(true);
    return { root, bone, mesh };
  };
  const a = make(), b = make();
  const clip = new THREE.AnimationClip('move', 1, [new THREE.VectorKeyframeTrack('joint.position', [0, 1], [0, 0, 0, 2, 0, 0])]);
  try {
    assert.ok(compareFittedMotion(a.root, b.root, [clip], [clip]).maximumVertexError < 1e-6);
    b.mesh.geometry.getAttribute('position').setX(0, 1.5);
    assert.ok(Math.abs(compareFittedMotion(a.root, b.root, [clip], [clip]).maximumVertexError - 0.5) < 1e-6);
    assert.deepEqual(a.bone.position.toArray(), [0, 0, 0]);
    assert.deepEqual(b.bone.position.toArray(), [0, 0, 0]);
    assert.throws(() => compareFittedMotion(a.root, b.root, [clip], []), /Missing/);
    assert.throws(() => compareFittedMotion(a.root, b.root, [], []), /no clips/);
  } finally { for (const item of [a, b]) { item.mesh.geometry.dispose(); item.mesh.material.dispose(); item.mesh.skeleton.dispose(); } }
});
