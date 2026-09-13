import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { validateGameReadyModel } from './gameReadyValidation';

test('game-ready deformation sampling holds the non-looping terminal pose', () => {
  const root = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = 'root';
  root.add(bone);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([1, 0, 0], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'body';
  root.add(mesh);
  const skeleton = new THREE.Skeleton([bone]);
  mesh.bind(skeleton);
  root.updateMatrixWorld(true);
  const duration = Math.fround(0.025);
  const clip = new THREE.AnimationClip('terminal', duration, [
    new THREE.VectorKeyframeTrack('root.position', [0, duration], [0, 0, 0, 2, 0, 0]),
  ]);
  try {
    const report = validateGameReadyModel(root, skeleton, [clip]);
    const samples = report.deformationSamples.filter((sample) => sample.clip === 'terminal');
    assert.equal(samples.length, 5);
    assert.equal(samples.at(-1)?.time, duration);
    assert.ok((samples.at(-1)?.max[0] ?? 0) - samples[0].max[0] > 1.9);
  } finally {
    geometry.dispose();
    material.dispose();
    skeleton.dispose();
  }
});
