import test from 'node:test';
import assert from 'node:assert/strict';
import { bakeHipYLoopEndpoint, HIP_Y_LOOP_ENDPOINT_POLICY, parseHipYLoopEndpoint } from './skeletalHipYLoopEndpoint';
import * as THREE from 'three';
import { prepareSkeletalExport } from './skeletalExport';
import { CONDITIONING_NLERP_MODE } from './skeletalChordRotation';
import { TWO_KEY_EXPORT_BOUNDARY_POLICY } from './skeletalTwoKeyExportBoundary';
import { disposeThreeObject } from './threeDisposal';

const recipe = { policy: HIP_Y_LOOP_ENDPOINT_POLICY, clipId: 'walkSlow' as const, joint: 'mixamorigHips' as const, maxCorrectionMeters: .24 };

function fixture() {
  const bin = new Uint8Array(91 * (4 + 12 + 12 + 12));
  const data = new DataView(bin.buffer);
  for (let tick = 0; tick <= 90; tick++) {
    data.setFloat32(tick * 4, Math.fround(tick / 60), true);
    data.setFloat32(364 + tick * 12, tick * .01, true);
    data.setFloat32(1456 + tick * 12 + 4, tick === 90 ? 2.3758182525634766 : 2.137423276901245, true);
    data.setFloat32(2548 + tick * 12 + 4, tick * .02, true);
  }
  const doc = {
    asset: { version: '2.0' }, buffers: [{ byteLength: bin.length }],
    bufferViews: [0, 364, 1456, 2548].map((byteOffset, i) => ({ buffer: 0, byteOffset, byteLength: i === 0 ? 364 : 1092 })),
    accessors: [{ bufferView: 0, componentType: 5126, count: 91, type: 'SCALAR' },
      { bufferView: 1, componentType: 5126, count: 91, type: 'VEC3', min: [0, 0, 0], max: [.9, 0, 0] },
      { bufferView: 2, componentType: 5126, count: 91, type: 'VEC3', min: [0, 2.137423276901245, 0], max: [0, 2.3758182525634766, 0] },
      { bufferView: 3, componentType: 5126, count: 91, type: 'VEC3', min: [0, 0, 0], max: [0, Math.fround(1.8), 0] }],
    nodes: [{ name: 'LocomotionRoot', children: [1] }, { name: 'mixamorigHips' }, { name: 'other' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 3 } }] }],
    animations: [{ name: 'walkSlow', samplers: [1, 2, 3].map(output => ({ input: 0, output, interpolation: 'LINEAR' })),
      channels: [0, 1, 2].map((node, sampler) => ({ sampler, target: { node, path: 'translation' } })) }],
  };
  const json = new TextEncoder().encode(JSON.stringify(doc)), padded = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(28 + padded + bin.length), header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, bytes.length, true);
  header.setUint32(12, padded, true); header.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + padded); bytes.set(json, 20);
  header.setUint32(20 + padded, bin.length, true); header.setUint32(24 + padded, 0x004e4942, true);
  bytes.set(bin, 28 + padded);
  return { bytes, doc, binStart: 28 + padded };
}

test('one-value endpoint recipe preserves every other BIN byte and JSON value', () => {
  const { bytes, doc, binStart } = fixture(), before = bytes.slice();
  const { bytes: changed, report } = bakeHipYLoopEndpoint(bytes, recipe);
  assert.deepEqual(bytes, before);
  assert.equal(report.beforeY, 2.3758182525634766);
  assert.equal(report.requestedY, 2.137423276901245);
  assert.equal(report.storedY, 2.137423276901245);
  assert.ok(Math.abs(report.storedCorrectionMeters) <= .24);
  const changedBinStart = 28 + new DataView(changed.buffer).getUint32(12, true);
  assert.equal(changed.length - bytes.length, changedBinStart - binStart);
  const after = JSON.parse(new TextDecoder().decode(changed.subarray(20, changedBinStart - 8)));
  const expected = structuredClone(doc); expected.accessors[2].max![1] = 2.137423276901245;
  assert.deepEqual(after, expected);
  const oldBin = before.subarray(binStart), newBin = changed.subarray(changedBinStart);
  const altered = Array.from(newBin).flatMap((value, index) => value !== oldBin[index] ? [index] : []);
  assert.ok(altered.length > 0 && altered.every(index => index >= report.byteOffset - changedBinStart && index < report.byteOffset - changedBinStart + 4));
  assert.equal(report.binOffsetDelta, changedBinStart - binStart);
  assert.equal(new DataView(changed.buffer).getFloat32(report.byteOffset, true), 2.137423276901245);
  assert.throws(() => bakeHipYLoopEndpoint(changed, recipe), /already applied/);
});

test('endpoint policy refuses malformed selection, cap, layout, overlap and root Y', () => {
  const { bytes, doc, binStart } = fixture();
  for (const bad of [{ ...recipe, maxCorrectionMeters: 0 }, { ...recipe, maxCorrectionMeters: .241 },
    { ...recipe, policy: 'other' }, { ...recipe, extra: true }, { ...recipe, joint: 'other' }]) {
    assert.throws(() => parseHipYLoopEndpoint(bad), /invalid or unsupported recipe/);
  }
  assert.throws(() => bakeHipYLoopEndpoint(bytes, { ...recipe, maxCorrectionMeters: .1 }), /exceeds cap/);
  const rootY = bytes.slice(); new DataView(rootY.buffer).setFloat32(binStart + 364 + 4, .01, true);
  assert.throws(() => bakeHipYLoopEndpoint(rootY, recipe), /zero root Y/);
  const mutated = (change: (copy: typeof doc) => void) => {
    const copy = structuredClone(doc); change(copy);
    const json = new TextEncoder().encode(JSON.stringify(copy)), length = new DataView(bytes.buffer).getUint32(12, true);
    assert.ok(json.length <= length, 'fixture JSON budget');
    const result = bytes.slice(); result.fill(32, 20, 20 + length); result.set(json, 20); return result;
  };
  assert.throws(() => bakeHipYLoopEndpoint(mutated(copy => { copy.animations[0].samplers[1].interpolation = 'STEP'; }), recipe), /LINEAR/);
  assert.throws(() => bakeHipYLoopEndpoint(mutated(copy => { copy.accessors[2].count = 90; }), recipe), /91 packed/);
  assert.throws(() => bakeHipYLoopEndpoint(mutated(copy => { copy.accessors[3].bufferView = 2; }), recipe), /overlaps another accessor/);
  assert.throws(() => bakeHipYLoopEndpoint(mutated(copy => { copy.animations[0].samplers[2].output = 2; }), recipe), /shared by another animation channel/);
  assert.throws(() => bakeHipYLoopEndpoint(mutated(copy => { copy.meshes[0].primitives[0].attributes.POSITION = 2; }), recipe), /shared with mesh data/);
  assert.throws(() => bakeHipYLoopEndpoint(mutated(copy => { copy.nodes[0].children = [2]; }), recipe), /direct root\/hip/);
});

test('a second clip cannot reuse the selected hip output accessor', () => {
  const { bytes, doc, binStart } = fixture();
  const changed = structuredClone(doc);
  changed.animations.push({ ...structuredClone(changed.animations[0]), name: 'idle' });
  const json = new TextEncoder().encode(JSON.stringify(changed)), padded = Math.ceil(json.length / 4) * 4;
  const candidate = new Uint8Array(28 + padded + bytes.length - binStart), header = new DataView(candidate.buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, candidate.length, true);
  header.setUint32(12, padded, true); header.setUint32(16, 0x4e4f534a, true);
  candidate.fill(32, 20, 20 + padded); candidate.set(json, 20);
  candidate.set(bytes.subarray(binStart - 8), 20 + padded);
  assert.throws(() => bakeHipYLoopEndpoint(candidate, recipe), /shared by another animation channel/);
});

function loadedModel(lastHipY: number) {
  const root = new THREE.Group();
  const locomotion = new THREE.Bone(), hips = new THREE.Bone(), knee = new THREE.Bone();
  locomotion.name = 'LocomotionRoot'; hips.name = 'mixamorigHips'; knee.name = 'Knee';
  hips.position.y = 1; knee.position.y = .5;
  root.add(locomotion); locomotion.add(hips); hips.add(knee); root.updateMatrixWorld(true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, .1, .5, 0, -.1, 1, 0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([1, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.setIndex([0, 1, 2]);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()); root.add(mesh);
  mesh.bind(new THREE.Skeleton([locomotion, hips, knee]));
  const times = Array.from({ length: 91 }, (_, tick) => Math.fround(tick / 60));
  const clip = new THREE.AnimationClip('walkSlow', 1.5, [
    new THREE.VectorKeyframeTrack('LocomotionRoot.position', times, times.flatMap(() => [0, 0, 0])),
    new THREE.VectorKeyframeTrack('mixamorigHips.position', times, times.flatMap((_, tick) => [0, tick === 90 ? lastHipY : 1, 0])),
    new THREE.VectorKeyframeTrack('Knee.position', times, times.flatMap(() => [0, .5, 0])),
  ]);
  return { root, skeleton: mesh.skeleton, skinnedMeshes: [mesh], clips: [clip], mixer: new THREE.AnimationMixer(root) };
}

test('export boundary restores all unselected endpoint components and keeps only declared hip Y', async () => {
  const before = loadedModel(1.2), after = loadedModel(1);
  const report = { policy: HIP_Y_LOOP_ENDPOINT_POLICY, clipId: 'walkSlow' as const, joint: 'mixamorigHips' as const,
    tick: 90 as const, keys: 91 as const, interpolation: 'LINEAR' as const, maxCorrectionMeters: .24,
    beforeY: Math.fround(1.2), requestedY: 1, storedY: 1, storedCorrectionMeters: 1 - Math.fround(1.2),
    accessorIndex: 2, sourceByteOffset: 100, byteOffset: 100, binOffsetDelta: 0,
    beforeMax: [0, Math.fround(1.2), 0], storedMax: [0, 1, 0] };
  try {
    const options = { sourceIdentitySha256: 'a'.repeat(64), rootJoint: 'LocomotionRoot', conditionedRotationMode: CONDITIONING_NLERP_MODE };
    const original = await prepareSkeletalExport(before, options);
    const selected = await prepareSkeletalExport(after, { ...options, twoKeyExportBoundary: { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, endpointReport: report } });
    const expected = structuredClone(original.asset.clips[0]), actual = structuredClone(selected.asset.clips[0]);
    const carrier = actual.tracks.find(track => track.joint === 1)!;
    assert.equal(carrier.keys.at(-1)!.transform.translation[1], 1);
    carrier.keys.at(-1)!.transform.translation[1] = Math.fround(1.2);
    assert.deepEqual(actual, expected);
    await assert.rejects(prepareSkeletalExport(after, { ...options, twoKeyExportBoundary: { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY,
      endpointReport: { ...report, storedY: 1.1 } } }), /invalid endpoint fidelity report|differs from loaded carrier/);
  } finally { disposeThreeObject(before.root); disposeThreeObject(after.root); }
});
