import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as THREE from 'three';
import { parseFitRigJob } from '../../scripts/fit-rig-cli';
import {
  compareFittedMotion,
  FittedMotionCoverageError,
} from './fittedRigVerification';

function comparisonFixture() {
  const root = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = 'joint';
  root.add(bone);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([1, 0, 0], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'body';
  root.add(mesh);
  mesh.bind(new THREE.Skeleton([bone]));
  root.updateMatrixWorld(true);
  return {
    root,
    bone,
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.skeleton.dispose();
    },
  };
}

function positionClip(name: string, duration: number, times: number[], x: number[]): THREE.AnimationClip {
  return new THREE.AnimationClip(
    name,
    duration,
    [new THREE.VectorKeyframeTrack(
      'joint.position',
      times,
      x.flatMap((value) => [value, 0, 0]),
      THREE.InterpolateDiscrete,
    )],
  );
}

function nextDownFloat32(value: number): number {
  const nearest = Math.fround(value);
  if (nearest <= value || value === 0) return nearest;
  const bytes = new ArrayBuffer(4);
  const view = new DataView(bytes);
  view.setFloat32(0, nearest, true);
  view.setUint32(0, view.getUint32(0, true) - 1, true);
  return view.getFloat32(0, true);
}

test('fit-rig jobs reject implicit clips, unknown fields, and relative paths', () => {
  const job = { schema: 'rustsmf-fit-rig-v1', source: path.resolve('source.glb'), template: path.resolve('template.glb'),
    outputDirectory: path.resolve('fresh-output'), mapping: { source: 'target' }, clips: ['idle'] };
  assert.deepEqual(parseFitRigJob(job), job);
  assert.throws(() => parseFitRigJob({ ...job, clips: [] }), /clip names/);
  assert.throws(() => parseFitRigJob({ ...job, clips: ['idle', 'idle'] }), /clip names/);
  assert.throws(() => parseFitRigJob({ ...job, source: 'relative.glb' }), /absolute/);
  assert.throws(() => parseFitRigJob({ ...job, overwrite: true }), /Unknown/);
  assert.deepEqual(parseFitRigJob({ ...job, comparison: { playbackRate: 0.25, displayHeight: 3 } }).comparison, {
    playbackRate: 0.25,
    displayHeight: 3,
    gameTransforms: undefined,
  });
  assert.throws(() => parseFitRigJob({ ...job, comparison: { gameTransforms: { source: {} } } }), /requires source/);
});

test('fitted comparison detects actual vertex displacement and restores animated poses', () => {
  const a = comparisonFixture(), b = comparisonFixture();
  const clip = new THREE.AnimationClip('move', 1, [new THREE.VectorKeyframeTrack('joint.position', [0, 1], [0, 0, 0, 2, 0, 0])]);
  try {
    const exact = compareFittedMotion(a.root, b.root, [clip], [clip]);
    assert.ok(exact.maximumVertexError < 1e-6);
    assert.equal(exact.requestedSamples, exact.completedSamples);
    assert.deepEqual(exact.rejectedCoverage, []);
    b.mesh.geometry.getAttribute('position').setX(0, 1.5);
    const displaced = compareFittedMotion(a.root, b.root, [clip], [clip]);
    assert.ok(Math.abs(displaced.maximumVertexError - 0.5) < 1e-6);
    assert.equal(displaced.clips[0].worstMesh, 'body');
    assert.equal(displaced.clips[0].worstVertex, 0);
    assert.deepEqual(a.bone.position.toArray(), [0, 0, 0]);
    assert.deepEqual(b.bone.position.toArray(), [0, 0, 0]);
    assert.throws(() => compareFittedMotion(a.root, b.root, [clip], []), /Missing/);
    assert.throws(() => compareFittedMotion(a.root, b.root, [], []), /no clips/);
  } finally { a.dispose(); b.dispose(); }
});

test('fitted comparison samples fractional terminals and rejects incomplete clip coverage', () => {
  const source = comparisonFixture();
  const received = comparisonFixture();
  const duration = Math.fround(0.025);
  const sourceClip = positionClip('fractional', duration, [0, duration], [0, 0]);
  const terminalError = positionClip('fractional', duration, [0, duration], [0, 10]);
  try {
    const report = compareFittedMotion(source.root, received.root, [sourceClip], [terminalError]);
    assert.equal(report.requestedSamples, 3);
    assert.equal(report.completedSamples, 3);
    assert.equal(report.clips[0].worstTime, duration);
    assert.ok(Math.abs(report.maximumVertexError - 10) < 1e-6);

    const shortened = positionClip('fractional', 0.02, [0, 0.02], [0, 0]);
    assert.throws(
      () => compareFittedMotion(source.root, received.root, [sourceClip], [shortened]),
      (error) => error instanceof FittedMotionCoverageError
        && error.requestedSamples === 3
        && error.completedSamples === 0
        && error.rejectedCoverage[0].reason === 'duration-mismatch',
    );

    const delayed = positionClip('fractional', duration, [0, duration + (1 / 60)], [0, 10]);
    const delayedReport = compareFittedMotion(source.root, received.root, [terminalError], [delayed]);
    assert.equal(delayedReport.clips[0].worstTime, duration);
    assert.ok(Math.abs(delayedReport.maximumVertexError - 10) < 1e-6);

    assert.throws(
      () => compareFittedMotion(source.root, received.root, [sourceClip], []),
      (error) => error instanceof FittedMotionCoverageError
        && error.rejectedCoverage[0].reason === 'missing-received',
    );
  } finally { source.dispose(); received.dispose(); }
});

test('fitted comparison catches ordinary frame-grid displacement', () => {
  const source = comparisonFixture();
  const received = comparisonFixture();
  const duration = Math.fround(2 / 60);
  const baseline = positionClip('grid', duration, [0, 1 / 60, duration], [0, 0, 0]);
  const displaced = positionClip('grid', duration, [0, nextDownFloat32(1 / 60), duration], [0, 7, 0]);
  try {
    const report = compareFittedMotion(source.root, received.root, [baseline], [displaced]);
    assert.ok(Math.abs(report.maximumVertexError - 7) < 1e-6);
    assert.ok(Math.abs(report.clips[0].worstTime - (1 / 60)) < 1e-8);
  } finally { source.dispose(); received.dispose(); }
});
