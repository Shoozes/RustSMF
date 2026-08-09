import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  diagnoseSkinVertex,
  diagnoseSkinnedMeshes,
  getSkinPaintPoseTelemetry,
  getSkinPaintPoseWarning,
} from './skinDiagnostics';

function makeDiagnosticMesh(): THREE.SkinnedMesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
  ], 3));
  geometry.setAttribute('skinIndex', new THREE.Float32BufferAttribute([
    0, 1, 4, 0,
    0.5, 0, 0, 0,
  ], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    0.5, 0.5, 0, 0,
    2, 0, 0, 0,
  ], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  const root = new THREE.Bone();
  root.name = 'Root';
  const tip = new THREE.Bone();
  tip.name = 'Tip';
  root.add(tip);
  mesh.add(root);
  mesh.bind(new THREE.Skeleton([root, tip]));
  return mesh;
}

test('skin diagnostics reports exact raw slots and invalid references', () => {
  const mesh = makeDiagnosticMesh();
  const vertex = diagnoseSkinVertex(mesh, 0);

  assert.equal(vertex.slots[0].boneName, 'Root');
  assert.equal(vertex.slots[1].boneName, 'Tip');
  assert.equal(vertex.slots[2].boneIndex, 4);
  assert.equal(vertex.slots[2].issue, 'invalid-bone-index');
  assert.equal(vertex.weightSum, 1);
  assert.equal(vertex.invalidReferenceCount, 1);
  assert.deepEqual(vertex.issueCodes, ['invalid-bone-index']);
});

test('skin diagnostics aggregates invalid weights and unweighted vertices without clamping', () => {
  const mesh = makeDiagnosticMesh();
  const summary = diagnoseSkinnedMeshes([mesh]);

  assert.equal(summary.meshCount, 1);
  assert.equal(summary.vertexCount, 2);
  assert.equal(summary.inspectedVertexCount, 2);
  assert.equal(summary.invalidReferenceCount, 2);
  assert.equal(summary.invalidWeightCount, 1);
  assert.equal(summary.issueVertexCount, 2);
  assert.equal(summary.issueCounts['invalid-bone-index'], 2);
  assert.equal(summary.issueCounts['out-of-range-weight'], 1);
});

test('skin diagnostics keeps four bounded slots when skin attributes are missing', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  const root = new THREE.Bone();
  root.name = 'Root';
  mesh.add(root);
  mesh.bind(new THREE.Skeleton([root]));

  const vertex = diagnoseSkinVertex(mesh, 0);
  const summary = diagnoseSkinnedMeshes([mesh]);
  assert.equal(vertex.slots.length, 4);
  assert.deepEqual(vertex.slots.map((slot) => slot.issue), [
    'missing-skin-attributes',
    'missing-skin-attributes',
    'missing-skin-attributes',
    'missing-skin-attributes',
  ]);
  assert.equal(summary.issueCounts['missing-skin-attributes'], 1);
  assert.equal(summary.unweightedVertexCount, 1);
});

test('live skin paint emits a visible safety warning while stable modes do not', () => {
  assert.equal(getSkinPaintPoseWarning('live')?.includes('Frozen Current'), true);
  assert.equal(getSkinPaintPoseWarning('rest'), null);
  assert.equal(getSkinPaintPoseWarning('frozen'), null);
});

test('skin paint viewport telemetry follows mode transitions without stale live warnings', () => {
  assert.deepEqual(getSkinPaintPoseTelemetry('live', true), {
    pose: 'live',
    warning: 'live-animation',
  });
  assert.deepEqual(getSkinPaintPoseTelemetry('frozen', true), {
    pose: 'frozen',
    warning: '',
  });
  assert.deepEqual(getSkinPaintPoseTelemetry('rest', true), {
    pose: 'rest',
    warning: '',
  });
  assert.deepEqual(getSkinPaintPoseTelemetry('live', false), {
    pose: 'live',
    warning: '',
  });
});
