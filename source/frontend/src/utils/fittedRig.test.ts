import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFittedRig, fittedSkinIndices } from './fittedRig';
import { bakeFittedClip } from './fittedRigAnimation';
import { buildFittedComparisonSchedule } from './fittedRigTiming';
import { exportFittedRigGlb } from './fittedRigGlb';
import { buildGlbContainer, parseGlbContainer } from './glbContainer';

function fixture() {
  const sourceRoot = new THREE.Bone(); sourceRoot.name = 'sourceRoot';
  sourceRoot.position.set(2, 1, 3); sourceRoot.rotation.y = 0.4;
  const hand = new THREE.Bone(); hand.name = 'sourceHand'; hand.position.set(1, 2, 0);
  sourceRoot.add(hand); sourceRoot.updateMatrixWorld(true);
  const source = new THREE.Skeleton([sourceRoot, hand]); source.calculateInverses();
  const targetRoot = new THREE.Bone(); targetRoot.name = 'targetRoot';
  const helper = new THREE.Bone(); helper.name = 'helper'; helper.position.y = 0.3;
  const targetHand = new THREE.Bone(); targetHand.name = 'targetHand'; targetHand.position.x = 0.2;
  targetRoot.add(helper); helper.add(targetHand); targetRoot.updateMatrixWorld(true);
  const template = new THREE.Skeleton([targetRoot, helper, targetHand]);
  const map = { sourceRoot: 'targetRoot', sourceHand: 'targetHand' };
  return { source, template, map };
}

test('baked motion preserves mapped world frames and restores input poses', () => {
  const { source, template, map } = fixture(), fitted = buildFittedRig(source, template, map);
  const root = new THREE.Group(); root.add(source.bones[0]); root.updateMatrixWorld(true);
  const before = source.bones.map(bone => bone.matrixWorld.toArray());
  const clip = new THREE.AnimationClip('move', 1, [new THREE.VectorKeyframeTrack('sourceRoot.position', [0, 1], [2, 1, 3, 4, 3, 5])]);
  const baked = bakeFittedClip(root, clip, fitted, 30);
  assert.deepEqual(source.bones.map(bone => bone.matrixWorld.toArray()), before);
  const originalMixer = new THREE.AnimationMixer(root), fittedMixer = new THREE.AnimationMixer(fitted.root);
  originalMixer.clipAction(clip).play(); fittedMixer.clipAction(baked).play();
  for (const time of [0, 0.5]) {
    originalMixer.setTime(time); fittedMixer.setTime(time);
    root.updateMatrixWorld(true); fitted.root.updateMatrixWorld(true);
    for (const [a, b] of fitted.sourceToTarget) assert.ok(a.matrixWorld.elements.every((value, index) => Math.abs(value - b.matrixWorld.elements[index]) < 1e-6));
  }
  originalMixer.stopAllAction(); fittedMixer.stopAllAction();
  originalMixer.uncacheRoot(root); fittedMixer.uncacheRoot(fitted.root);
  assert.throws(() => bakeFittedClip(root, clip, fitted, 0), /bounded/);
  assert.throws(() => buildFittedComparisonSchedule(1_000_000, 60), /at most 6000 regular frames/);
  fitted.skeleton.dispose(); source.dispose(); template.dispose();
});

test('baked motion preserves a fractional declared duration and terminal key', () => {
  const { source, template, map } = fixture();
  const fitted = buildFittedRig(source, template, map);
  const root = new THREE.Group();
  root.add(source.bones[0]);
  root.updateMatrixWorld(true);
  const duration = Math.fround(0.025);
  const clip = new THREE.AnimationClip('fractional', duration, [
    new THREE.VectorKeyframeTrack('sourceRoot.position', [0, duration], [2, 1, 3, 5, 1, 3]),
  ]);
  const baked = bakeFittedClip(root, clip, fitted, 60);
  assert.equal(baked.duration, duration);
  assert.equal(baked.tracks[0].times.length, 3);
  assert.ok(baked.tracks[0].times[baked.tracks[0].times.length - 1] <= duration);
  assert.ok(duration - baked.tracks[0].times[baked.tracks[0].times.length - 1] < 1e-8);
  fitted.skeleton.dispose();
  source.dispose();
  template.dispose();
});

test('fitted GLB export preserves source streams and rejects unmapped influences', () => {
  const { source, template, map } = fixture(), fitted = buildFittedRig(source, template, map);
  const binary = new Uint8Array(36);
  binary.set(new Uint8Array(new Float32Array([1, 2, 3]).buffer), 0);
  binary.set(new Uint8Array(new Uint16Array([1, 0, 0, 0]).buffer), 12);
  binary.set(new Uint8Array(new Float32Array([1, 0, 0, 0]).buffer), 20);
  const input = buildGlbContainer({ asset: { version: '2.0' }, scene: 0,
    scenes: [{ nodes: [0, 2] }], nodes: [{ name: 'sourceRoot', children: [1] }, { name: 'sourceHand' }, { mesh: 0, skin: 0 }],
    skins: [{ joints: [0, 1] }], meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 }, material: 0 }] }],
    materials: [{ name: 'preserved', pbrMetallicRoughness: { metallicFactor: 0 } }],
    buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 12 }, { buffer: 0, byteOffset: 12, byteLength: 8 }, { buffer: 0, byteOffset: 20, byteLength: 16 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: 'VEC3' }, { bufferView: 1, componentType: 5123, count: 1, type: 'VEC4' }, { bufferView: 2, componentType: 5126, count: 1, type: 'VEC4' }] }, binary);
  const before = input.slice(), output = parseGlbContainer(exportFittedRigGlb(input, fitted, []));
  assert.deepEqual(input, before); assert.deepEqual(output.binary.slice(0, 36), binary);
  assert.deepEqual(output.json.materials, parseGlbContainer(input).json.materials);
  assert.deepEqual(output.json.skins, [{ joints: [3, 4, 5], inverseBindMatrices: 4 }]);
  assert.equal(new DataView(output.binary.buffer, output.binary.byteOffset).getUint16(36, true), 2);
  const incomplete = { ...fitted, sourceToTarget: new Map([[source.bones[0], fitted.skeleton.bones[0]]]) };
  assert.throws(() => exportFittedRigGlb(input, incomplete, []), /Unmapped weighted/);
  // Separate meshes can use the same joints with different inverse bindings.
  const distinct = parseGlbContainer(input), expanded = new Uint8Array(36 + 256);
  expanded.set(distinct.binary);
  for (const [index, translation] of [10, 20].entries()) {
    const matrices = Float32Array.from([...new THREE.Matrix4().toArray(), ...new THREE.Matrix4().makeTranslation(translation, 0, 0).toArray()]);
    expanded.set(new Uint8Array(matrices.buffer), 36 + index * 128);
    distinct.json.bufferViews!.push({ buffer: 0, byteOffset: 36 + index * 128, byteLength: 128 });
    distinct.json.accessors!.push({ bufferView: 3 + index, componentType: 5126, count: 2, type: 'MAT4' });
  }
  distinct.json.buffers![0].byteLength = expanded.length;
  distinct.json.skins = [{ joints: [0, 1], inverseBindMatrices: 3 }, { joints: [0, 1], inverseBindMatrices: 4 }];
  (distinct.json.nodes as object[]).push({ mesh: 0, skin: 1 });
  (distinct.json.scenes as Array<{ nodes: number[] }>)[0].nodes.push(3);
  const multi = parseGlbContainer(exportFittedRigGlb(buildGlbContainer(distinct.json, expanded), fitted, []));
  const skins = multi.json.skins as Array<{ inverseBindMatrices: number }>;
  assert.equal(skins.length, 2);
  assert.deepEqual(skins.map(skin => {
    const accessor = multi.json.accessors![skin.inverseBindMatrices], view = multi.json.bufferViews![accessor.bufferView!];
    return new DataView(multi.binary.buffer, multi.binary.byteOffset).getFloat32(view.byteOffset! + 2 * 64 + 12 * 4, true);
  }), [10, 20]);
  fitted.skeleton.dispose(); source.dispose(); template.dispose();
});

test('fitted topology retains helpers and matches mapped bind-world frames', () => {
  const { source, template, map } = fixture();
  const before = source.bones.map(bone => bone.matrixWorld.toArray());
  const fitted = buildFittedRig(source, template, map);
  assert.deepEqual(fitted.skeleton.bones.map(bone => bone.name), ['targetRoot', 'helper', 'targetHand']);
  assert.equal(fitted.skeleton.bones[2].parent, fitted.skeleton.bones[1]);
  assert.ok(fitted.maximumBindFrameError < 1e-12);
  assert.deepEqual(source.bones.map(bone => bone.matrixWorld.toArray()), before);
  fitted.skeleton.dispose();
});

test('remapped rigid skin preserves rest vertices and rejects lost influences before applying', () => {
  const { source, template, map } = fixture(), fitted = buildFittedRig(source, template, map);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 2, 3], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial()); mesh.bind(source);
  source.update(); fitted.skeleton.update();
  const before = [0, 1].map(index => mesh.applyBoneTransform(index,
    new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('position'), index)).toArray());
  const remapped = fittedSkinIndices(mesh, fitted);
  assert.deepEqual(Array.from(remapped.array), [0, 0, 0, 0, 2, 0, 0, 0]);
  const replacement = geometry.clone(); replacement.setAttribute('skinIndex', remapped);
  const rebound = new THREE.SkinnedMesh(replacement, mesh.material); rebound.bind(fitted.skeleton);
  for (const index of [0, 1]) {
    const vertex = rebound.applyBoneTransform(index, new THREE.Vector3().fromBufferAttribute(replacement.getAttribute('position'), index));
    assert.ok(vertex.distanceTo(new THREE.Vector3().fromArray(before[index])) < 1e-12);
  }
  const incomplete = { ...fitted, sourceToTarget: new Map([[source.bones[0], fitted.skeleton.bones[0]]]) };
  assert.throws(() => fittedSkinIndices(mesh, incomplete), /Unmapped weighted joint/);
  assert.deepEqual(Array.from(geometry.getAttribute('skinIndex').array), [0, 0, 0, 0, 1, 0, 0, 0]);
  geometry.dispose(); replacement.dispose(); mesh.material.dispose(); fitted.skeleton.dispose();
});

test('incomplete and ambiguous rig maps fail without changing source bindings', () => {
  const { source, template } = fixture();
  assert.throws(() => buildFittedRig(source, template, { sourceHand: 'targetHand' }), /root needs/);
  assert.throws(() => buildFittedRig(source, template, { sourceRoot: 'targetRoot', sourceHand: 'targetRoot' }), /repeated/);
  assert.throws(() => buildFittedRig(source, template, { absent: 'targetRoot' }), /missing/);
});
