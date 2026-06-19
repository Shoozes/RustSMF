import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  editVertexBoneWeight,
  getDirtySkinExportBlockReason,
  getSkinAttributes,
  hasDirtySkinEdits,
  makeSkinEditState,
  markSkinEdit,
  normalizeVertexSkinWeights,
  readVertexSkinWeights,
  setVertexBoneWeight,
} from './skinWeights';

function makeSkinnedMesh(): THREE.SkinnedMesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
  ], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
    0, 1, 2, 3,
    0, 1, 2, 3,
  ], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    1, 0, 0, 0,
    0.25, 0.25, 0.25, 0.25,
  ], 4));

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  const root = new THREE.Bone();
  const child = new THREE.Bone();
  root.add(child);
  mesh.bind(new THREE.Skeleton([root, child]));
  return mesh;
}

function weightsTotal(weights: readonly number[]): number {
  return weights.reduce((sum, weight) => sum + weight, 0);
}

describe('skinWeights', () => {
  it('reads vertex skin indices and weights from valid attributes', () => {
    const mesh = makeSkinnedMesh();
    const attributes = getSkinAttributes(mesh.geometry);

    assert.ok(attributes);
    assert.deepEqual(readVertexSkinWeights(attributes, 1), {
      indices: [0, 1, 2, 3],
      weights: [0.25, 0.25, 0.25, 0.25],
    });
  });

  it('normalizes finite weights and recovers from zero-weight vertices', () => {
    assert.deepEqual(normalizeVertexSkinWeights({
      indices: [0, 1, 2, 3],
      weights: [2, Number.NaN, -1, 1],
    }), {
      indices: [0, 1, 2, 3],
      weights: [0.5, 0, 0, 0.5],
    });

    assert.deepEqual(normalizeVertexSkinWeights({
      indices: [4, 5, 6, 7],
      weights: [0, 0, 0, 0],
    }), {
      indices: [4, 5, 6, 7],
      weights: [1, 0, 0, 0],
    });
  });

  it('sets an existing bone slot and preserves normalized four-bone weights', () => {
    const mesh = makeSkinnedMesh();
    const result = editVertexBoneWeight(mesh, 1, 1, 'set', 0.5);

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.slot, 1);
    assert.equal(result.changed, true);
    assert.equal(weightsTotal(result.vertex.weights), 1);
    assert.equal(result.vertex.indices[1], 1);
    assert.ok(result.vertex.weights[1] > 0.39 && result.vertex.weights[1] < 0.41);
    assert.equal((mesh.geometry.getAttribute('skinWeight') as THREE.BufferAttribute).version, 1);
  });

  it('adds, subtracts, and clamps selected-bone weights', () => {
    const mesh = makeSkinnedMesh();

    const added = editVertexBoneWeight(mesh, 1, 2, 'add', 10);
    assert.equal(added.ok, true);
    if (!added.ok) return;
    assert.ok(added.vertex.weights[2] > 0.55);
    assert.equal(weightsTotal(added.vertex.weights), 1);

    const subtracted = editVertexBoneWeight(mesh, 1, 2, 'subtract', 10);
    assert.equal(subtracted.ok, true);
    if (!subtracted.ok) return;
    assert.equal(subtracted.vertex.weights[2], 0);
    assert.equal(weightsTotal(subtracted.vertex.weights), 1);
  });

  it('uses an empty slot before replacing the weakest influence', () => {
    const mesh = makeSkinnedMesh();

    const emptySlot = editVertexBoneWeight(mesh, 0, 7, 'set', 0.5);
    assert.equal(emptySlot.ok, true);
    if (!emptySlot.ok) return;
    assert.equal(emptySlot.slot, 1);
    assert.equal(emptySlot.vertex.indices[1], 7);

    const noEmptySlot = setVertexBoneWeight({
      indices: [0, 1, 2, 3],
      weights: [0.4, 0.3, 0.2, 0.1],
    }, 8, 0.5);
    assert.ok(noEmptySlot);
    assert.equal(noEmptySlot.slot, 3);
    assert.equal(noEmptySlot.vertex.indices[3], 8);
  });

  it('returns explicit failures for invalid edit targets', () => {
    const mesh = makeSkinnedMesh();
    const staticMesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());

    assert.deepEqual(editVertexBoneWeight(staticMesh, 0, 0, 'set', 1), {
      ok: false,
      reason: 'missing-skin-attributes',
    });
    assert.deepEqual(editVertexBoneWeight(mesh, 99, 0, 'set', 1), {
      ok: false,
      reason: 'invalid-vertex',
    });
    assert.deepEqual(editVertexBoneWeight(mesh, 0, -1, 'set', 1), {
      ok: false,
      reason: 'invalid-bone',
    });
  });

  it('tracks dirty skin edits and exposes an export block reason', () => {
    const clean = makeSkinEditState('Bone', 'glb');
    assert.equal(hasDirtySkinEdits(clean), false);
    assert.equal(getDirtySkinExportBlockReason(clean), null);

    const dirty = markSkinEdit(clean, 'mesh-1', 4);
    assert.equal(hasDirtySkinEdits(dirty), true);
    assert.equal(clean.dirtyMeshIds.size, 0);
    assert.equal(dirty.dirtyMeshIds.has('mesh-1'), true);
    assert.equal(dirty.editedVertices.get('mesh-1')?.has(4), true);
    assert.match(getDirtySkinExportBlockReason(dirty) ?? '', /not yet connected to the SMF export serializer/);
  });
});
