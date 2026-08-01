import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  autoSkinSkinnedMeshWeights,
  autoSkinSkinnedMeshVertexWeights,
  appendSkinHistoryEntry,
  captureSkinVertexSnapshot,
  cloneSkinEditState,
  editVertexBoneWeight,
  getDirtySkinExportBlockReason,
  getSkinVertexSnapshotKey,
  getSkinAttributes,
  indexSkinVertexSnapshots,
  isSkinAutoWeightAlgorithm,
  hasDirtySkinEdits,
  makeSkinEditState,
  markSkinEdit,
  normalizeSkinnedMeshWeights,
  normalizeVertexSkinWeights,
  readVertexSkinWeights,
  resolveSkinAutoWeightOptions,
  restoreSkinVertexSnapshots,
  sameVertexSkinWeights,
  setVertexBoneWeight,
  writeSkinnedMeshVertexWeights,
  writeVertexSkinWeights,
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
  child.position.set(0, 1, 0);
  root.add(child);
  mesh.bind(new THREE.Skeleton([root, child]));
  return mesh;
}

function makeAutoskinMesh(): THREE.SkinnedMesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    0, 1, 0,
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 1,
    0, 0, 1,
  ], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
    0, 0, 0, 0,
    0, 0, 0, 0,
  ], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    1, 0, 0, 0,
    1, 0, 0, 0,
  ], 4));

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  const root = new THREE.Bone();
  root.name = 'Root';
  root.position.set(0, 0, 0);
  const tip = new THREE.Bone();
  tip.name = 'Tip';
  tip.position.set(0, 1, 0);
  root.add(tip);
  const skeleton = new THREE.Skeleton([root, tip]);
  mesh.add(root);
  mesh.bind(skeleton);
  return mesh;
}

function makeOriginVsSegmentMesh(): THREE.SkinnedMesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    9, 0.1, 0,
  ], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
    0, 0, 0, 0,
  ], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
    1, 0, 0, 0,
  ], 4));

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  const root = new THREE.Bone();
  root.name = 'Root';
  root.position.set(0, 0, 0);
  const longTip = new THREE.Bone();
  longTip.name = 'LongTip';
  longTip.position.set(10, 0, 0);
  root.add(longTip);
  const originNear = new THREE.Bone();
  originNear.name = 'OriginNear';
  originNear.position.set(9, 1, 0);
  mesh.add(root);
  mesh.add(originNear);
  mesh.bind(new THREE.Skeleton([root, longTip, originNear]));
  return mesh;
}

function weightsTotal(weights: readonly number[]): number {
  return weights.reduce((sum, weight) => sum + weight, 0);
}

describe('skinWeights', () => {
  it('indexes skin snapshots by mesh and vertex without scanning the full list', () => {
    const first = {
      meshId: 'mesh-a',
      vertexIndex: 3,
      vertex: { indices: [0, 1, 2, 3] as [number, number, number, number], weights: [1, 0, 0, 0] as [number, number, number, number] },
    };
    const second = {
      meshId: 'mesh-b',
      vertexIndex: 3,
      vertex: { indices: [2, 3, 4, 5] as [number, number, number, number], weights: [0.25, 0.25, 0.25, 0.25] as [number, number, number, number] },
    };
    const indexed = indexSkinVertexSnapshots([first, second]);

    assert.equal(getSkinVertexSnapshotKey('mesh-a', 3), 'mesh-a:3');
    assert.equal(indexed.get('mesh-a:3'), first);
    assert.equal(indexed.get('mesh-b:3'), second);
    assert.equal(indexed.get('mesh-a:4'), undefined);
  });

  it('rejects unsupported auto-weight algorithm values', () => {
    assert.equal(isSkinAutoWeightAlgorithm('nearest-segment'), true);
    assert.equal(isSkinAutoWeightAlgorithm('magic'), false);
    assert.equal(isSkinAutoWeightAlgorithm(null), false);
  });

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

  it('normalizes all writable vertices in a skinned mesh', () => {
    const mesh = makeSkinnedMesh();
    const attributes = getSkinAttributes(mesh.geometry);
    assert.ok(attributes);
    writeVertexSkinWeights(attributes, 1, {
      indices: [0, 1, 2, 3],
      weights: [0.5, 0.5, 0.5, 0.5],
    });

    const summary = normalizeSkinnedMeshWeights(mesh);
    assert.equal(summary.touchedVertices, 2);
    assert.equal(summary.changedVertices, 1);
    const normalized = readVertexSkinWeights(attributes, 1);
    assert.ok(normalized);
    assert.equal(weightsTotal(normalized.weights), 1);
    assert.deepEqual(normalized.weights, [0.25, 0.25, 0.25, 0.25]);
  });

  it('auto skins vertices from inverse distance to bone segments', () => {
    const mesh = makeAutoskinMesh();
    const summary = autoSkinSkinnedMeshWeights(mesh, mesh.skeleton, {
      algorithm: 'segment-inverse-distance',
      power: 2,
      normalWeighting: 0,
      maxInfluences: 4,
    });
    const attributes = getSkinAttributes(mesh.geometry);
    assert.ok(attributes);

    const rootVertex = readVertexSkinWeights(attributes, 0);
    const tipVertex = readVertexSkinWeights(attributes, 1);
    assert.ok(rootVertex);
    assert.ok(tipVertex);
    assert.equal(summary.touchedVertices, 2);
    assert.ok(Math.abs(weightsTotal(rootVertex.weights) - 1) < 1e-6);
    assert.ok(Math.abs(weightsTotal(tipVertex.weights) - 1) < 1e-6);
    assert.equal(rootVertex.indices[0], 0);
    assert.equal(tipVertex.indices[0], 1);
    assert.ok(tipVertex.weights[0] > 0.99);
  });

  it('auto skin options clamp and limit max influences', () => {
    assert.deepEqual(resolveSkinAutoWeightOptions({
      algorithm: 'segment-inverse-distance',
      power: Number.NaN,
      normalWeighting: 2,
      maxInfluences: 99,
    }), {
      algorithm: 'segment-inverse-distance',
      power: 2,
      normalWeighting: 1,
      maxInfluences: 4,
      blendAmount: 1,
      restrictToBoneIndices: undefined,
    });

    const mesh = makeAutoskinMesh();
    const summary = autoSkinSkinnedMeshWeights(mesh, mesh.skeleton, {
      algorithm: 'segment-inverse-distance',
      maxInfluences: 1,
    });
    const attributes = getSkinAttributes(mesh.geometry);
    assert.ok(attributes);
    const rootVertex = readVertexSkinWeights(attributes, 0);
    assert.ok(rootVertex);
    assert.equal(summary.touchedVertices, 2);
    assert.equal(rootVertex.weights.filter((weight) => weight > 1e-6).length, 1);
  });

  it('nearest-segment auto skin is a distinct implemented algorithm', () => {
    const inverseMesh = makeAutoskinMesh();
    autoSkinSkinnedMeshWeights(inverseMesh, inverseMesh.skeleton, {
      algorithm: 'segment-inverse-distance',
      maxInfluences: 4,
    });
    const inverseAttributes = getSkinAttributes(inverseMesh.geometry);
    assert.ok(inverseAttributes);
    const inverseRootVertex = readVertexSkinWeights(inverseAttributes, 0);
    assert.ok(inverseRootVertex);

    const nearestMesh = makeAutoskinMesh();
    autoSkinSkinnedMeshWeights(nearestMesh, nearestMesh.skeleton, {
      algorithm: 'nearest-segment',
    });
    const nearestAttributes = getSkinAttributes(nearestMesh.geometry);
    assert.ok(nearestAttributes);
    const nearestRootVertex = readVertexSkinWeights(nearestAttributes, 0);
    assert.ok(nearestRootVertex);

    assert.ok(inverseRootVertex.weights[1] > 0.4);
    assert.deepEqual(nearestRootVertex.indices, [0, 0, 0, 0]);
    assert.deepEqual(nearestRootVertex.weights, [1, 0, 0, 0]);
  });

  it('segment-distance-normal, closest-two-segments, nearest-bone-origin, and selected-branch algorithms are implemented', () => {
    const nearestMesh = makeAutoskinMesh();
    autoSkinSkinnedMeshWeights(nearestMesh, nearestMesh.skeleton, {
      algorithm: 'nearest-bone-origin',
    });
    const nearestAttributes = getSkinAttributes(nearestMesh.geometry);
    assert.ok(nearestAttributes);
    const nearestRootVertex = readVertexSkinWeights(nearestAttributes, 0);
    assert.ok(nearestRootVertex);
    assert.deepEqual(nearestRootVertex.weights, [1, 0, 0, 0]);

    const closestMesh = makeAutoskinMesh();
    autoSkinSkinnedMeshWeights(closestMesh, closestMesh.skeleton, {
      algorithm: 'closest-two-segments',
    });
    const closestAttributes = getSkinAttributes(closestMesh.geometry);
    assert.ok(closestAttributes);
    const closestRootVertex = readVertexSkinWeights(closestAttributes, 0);
    assert.ok(closestRootVertex);
    assert.equal(closestRootVertex.weights.filter((weight) => weight > 1e-6).length, 2);

    const branchMesh = makeAutoskinMesh();
    autoSkinSkinnedMeshWeights(branchMesh, branchMesh.skeleton, {
      algorithm: 'selected-branch',
      restrictToBoneIndices: new Set([1]),
    });
    const branchAttributes = getSkinAttributes(branchMesh.geometry);
    assert.ok(branchAttributes);
    const branchRootVertex = readVertexSkinWeights(branchAttributes, 0);
    assert.ok(branchRootVertex);
    assert.deepEqual(branchRootVertex.indices, [1, 0, 0, 0]);
    assert.deepEqual(branchRootVertex.weights, [1, 0, 0, 0]);

    const normalOptions = resolveSkinAutoWeightOptions({
      algorithm: 'segment-distance-normal',
      normalWeighting: 0.75,
      blendAmount: 0.5,
    });
    assert.equal(normalOptions.algorithm, 'segment-distance-normal');
    assert.equal(normalOptions.normalWeighting, 0.75);
    assert.equal(normalOptions.blendAmount, 0.5);
  });

  it('nearest segment and nearest bone origin can choose different influences', () => {
    const segmentMesh = makeOriginVsSegmentMesh();
    autoSkinSkinnedMeshWeights(segmentMesh, segmentMesh.skeleton, {
      algorithm: 'nearest-segment',
    });
    const segmentAttributes = getSkinAttributes(segmentMesh.geometry);
    assert.ok(segmentAttributes);
    const segmentVertex = readVertexSkinWeights(segmentAttributes, 0);
    assert.ok(segmentVertex);

    const originMesh = makeOriginVsSegmentMesh();
    autoSkinSkinnedMeshWeights(originMesh, originMesh.skeleton, {
      algorithm: 'nearest-bone-origin',
    });
    const originAttributes = getSkinAttributes(originMesh.geometry);
    assert.ok(originAttributes);
    const originVertex = readVertexSkinWeights(originAttributes, 0);
    assert.ok(originVertex);

    assert.equal(segmentVertex.indices[0], 1);
    assert.equal(originVertex.indices[0], 2);
  });

  it('normalizes legacy auto-weight algorithm names to canonical names', () => {
    assert.equal(resolveSkinAutoWeightOptions({ algorithm: 'inverse-segment-distance' }).algorithm, 'segment-inverse-distance');
    assert.equal(resolveSkinAutoWeightOptions({ algorithm: 'distance-power' }).algorithm, 'segment-inverse-distance');
    assert.equal(resolveSkinAutoWeightOptions({ algorithm: 'distance-normal' }).algorithm, 'segment-distance-normal');
    assert.equal(resolveSkinAutoWeightOptions({ algorithm: 'nearest-bone' }).algorithm, 'nearest-segment');
    assert.equal(resolveSkinAutoWeightOptions({ algorithm: 'closest-two' }).algorithm, 'closest-two-segments');
  });

  it('auto skins a single brush vertex with blend amount', () => {
    const mesh = makeAutoskinMesh();
    const attributes = getSkinAttributes(mesh.geometry);
    assert.ok(attributes);
    const before = readVertexSkinWeights(attributes, 1);
    assert.ok(before);

    const result = autoSkinSkinnedMeshVertexWeights(mesh, mesh.skeleton, 1, {
      algorithm: 'nearest-segment',
      blendAmount: 0.5,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.changed, true);
    const after = readVertexSkinWeights(attributes, 1);
    assert.ok(after);
    assert.ok(after.weights[1] > before.weights[1]);
    assert.ok(Math.abs(weightsTotal(after.weights) - 1) < 1e-6);
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

  it('reports a clamped add on a fully weighted bone as an unchanged edit', () => {
    const mesh = makeSkinnedMesh();
    const before = readVertexSkinWeights(getSkinAttributes(mesh.geometry)!, 0);
    assert.ok(before);

    const result = editVertexBoneWeight(mesh, 0, 0, 'add', 1);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.changed, false);
    assert.deepEqual(result.vertex, before);
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
    assert.equal(getDirtySkinExportBlockReason(dirty), null);
  });

  it('clones skin edit state without sharing mutable sets', () => {
    const dirty = markSkinEdit(makeSkinEditState('Bone', 'glb'), 'mesh-1', 4);
    const clone = cloneSkinEditState(dirty);

    clone.dirtyMeshIds.add('mesh-2');
    clone.editedVertices.get('mesh-1')?.add(5);

    assert.equal(dirty.dirtyMeshIds.has('mesh-2'), false);
    assert.equal(dirty.editedVertices.get('mesh-1')?.has(5), false);
    assert.equal(clone.selectedBoneName, 'Bone');
    assert.equal(clone.sourceFormat, 'glb');
  });

  it('captures and restores touched vertex skin snapshots', () => {
    const mesh = makeSkinnedMesh();
    const root = new THREE.Group();
    root.add(mesh);

    const before = captureSkinVertexSnapshot(mesh, 1);
    assert.ok(before);

    const edit = editVertexBoneWeight(mesh, 1, 2, 'add', 10);
    assert.equal(edit.ok, true);
    if (!edit.ok) return;
    assert.equal(sameVertexSkinWeights(before.vertex, edit.vertex), false);

    const restored = restoreSkinVertexSnapshots(root, [before]);
    assert.equal(restored, 1);
    const afterRestore = captureSkinVertexSnapshot(mesh, 1);
    assert.ok(afterRestore);
    assert.equal(sameVertexSkinWeights(before.vertex, afterRestore.vertex), true);
  });

  it('bounds skin history by bytes while retaining the newest edit', () => {
    const snapshot = {
      meshId: 'mesh-1',
      vertexIndex: 0,
      vertex: {
        indices: [0, 1, 2, 3] as [number, number, number, number],
        weights: [1, 0, 0, 0] as [number, number, number, number],
      },
    };
    const makeEntry = (marker: number) => ({
      beforeState: makeSkinEditState('Bone', 'glb'),
      afterState: markSkinEdit(makeSkinEditState('Bone', 'glb'), 'mesh-1', marker),
      before: [snapshot],
      after: [{ ...snapshot, vertexIndex: marker }],
    });

    const first = appendSkinHistoryEntry([], makeEntry(1), 10, 700);
    const second = appendSkinHistoryEntry(first.entries, makeEntry(2), 10, 700);

    assert.equal(second.accepted, true);
    assert.deepEqual(second.entries.map((entry) => entry.after[0]?.vertexIndex), [2]);
    assert.ok(second.bytesUsed <= 700);
    assert.equal(second.evictions, 1);
  });

  it('writes individual skinned vertex weights with bounds checks', () => {
    const mesh = makeSkinnedMesh();
    const next = {
      indices: [1, 0, 0, 0] as [number, number, number, number],
      weights: [1, 0, 0, 0] as [number, number, number, number],
    };

    assert.equal(writeSkinnedMeshVertexWeights(mesh, 1, next), true);
    const snapshot = captureSkinVertexSnapshot(mesh, 1);
    assert.ok(snapshot);
    assert.deepEqual(snapshot.vertex, next);
    assert.equal(writeSkinnedMeshVertexWeights(mesh, 99, next), false);
  });
});
