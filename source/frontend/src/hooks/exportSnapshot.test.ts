import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { captureExportSnapshot } from './exportSnapshot';
import { prepareQueuedExport } from './exportPreparation';
import { makeAnimationEditState } from '../utils/animationEdits';
import { registerMaterialPreviewRoot, updateMaterialPreview } from '../utils/materialPreview';
import type { ImportedSmf } from '../loaders';
import { installFileReaderTestPolyfill } from '../test/installFileReaderTestPolyfill';

function fixture() {
  const root = new THREE.Group(); root.name = 'Authored'; root.userData = { metadata: { tag: 'captured' } };
  const base = new THREE.Bone(); base.name = 'Base';
  const tip = new THREE.Bone(); tip.name = 'Tip'; tip.position.y = 1; base.add(tip); root.add(base);
  const geometry = new THREE.BufferGeometry();
  geometry.userData = { tag: 'geometry-captured' };
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 1,0,0, 0,1,0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0,0,1, 0,0,1, 0,0,1], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0,1,0,0, 0,1,0,0, 0,1,0,0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([0.25,0.75,0,0, 1,0,0,0, 0.5,0.5,0,0], 4));
  const texture = new THREE.DataTexture(new Uint8Array([30,60,90,255]), 1, 1);
  const material = new THREE.MeshStandardMaterial({ map: texture, opacity: 0.8 });
  const mesh = new THREE.SkinnedMesh(geometry, material); mesh.name = 'Triangle'; root.add(mesh);
  const skeleton = new THREE.Skeleton([base, tip]); mesh.bind(skeleton);
  const clips = [new THREE.AnimationClip('Wave', 1, [new THREE.VectorKeyframeTrack('Tip.position', [0,1], [0,1,0, 0,2,0])])];
  const input = { root, skeleton, clips, sourceSmf: null as ImportedSmf | null, poseEdits: {}, animationEdits: makeAnimationEditState() };
  return { input, root, mesh, geometry, material, texture, tip, clips };
}
const preset = { format: 'glb', includeAnimation: true } as const;

test('capture rewrites the node address without altering an indexed property suffix', () => {
  const f = fixture(); f.mesh.morphTargetInfluences = [0];
  f.input.clips = [new THREE.AnimationClip('Indexed', 1, [new THREE.NumberKeyframeTrack(`${f.mesh.uuid}.morphTargetInfluences[0]`, [0, 1], [0, 1])])];
  const captured = captureExportSnapshot(f.input, preset, 1_000_000);
  try {
    const mesh = captured.root!.getObjectByName('Triangle')!;
    assert.equal(captured.clips[0].tracks[0].name, `${mesh.uuid}.morphTargetInfluences[0]`);
    assert.notEqual(mesh.uuid, f.mesh.uuid);
  } finally { captured.dispose(); }
});

test('UUID remapping preserves identical text in a path prefix and named property index', () => {
  const f = fixture(); f.mesh.morphTargetInfluences = [0];
  f.mesh.morphTargetDictionary = { [f.mesh.uuid]: 0 };
  const suffix = `.morphTargetInfluences[${f.mesh.uuid}]`;
  f.input.clips = [new THREE.AnimationClip('Indexed alias', 1, [new THREE.NumberKeyframeTrack(`${f.mesh.uuid}/${f.mesh.uuid}${suffix}`, [0, 1], [0, 1])])];
  const captured = captureExportSnapshot(f.input, preset, 1_000_000);
  try {
    const mesh = captured.root!.getObjectByName('Triangle')!;
    assert.equal(captured.clips[0].tracks[0].name, `${f.mesh.uuid}/${mesh.uuid}${suffix}`);
    assert.equal(f.input.clips[0].tracks[0].name, `${f.mesh.uuid}/${f.mesh.uuid}${suffix}`);
  } finally { captured.dispose(); }
});
test('captures geometry, raw influences, bones, transforms, metadata, clips and texture bytes independently', () => {
  const f = fixture(); const capture = captureExportSnapshot(f.input, preset, 1000000);
  const mesh = capture.root!.getObjectByName('Triangle') as THREE.SkinnedMesh;
  f.geometry.attributes.skinWeight.setX(0, 0.9); f.geometry.attributes.position.setX(0, 100);
  f.tip.position.y = 8; f.mesh.skeleton.boneInverses[0].elements[0] = 9;
  (f.texture.image as { data: Uint8Array }).data[0] = 200; f.clips[0].tracks[0].values[4] = 99;
  f.root.userData.metadata.tag = 'changed';
  f.geometry.userData.tag = 'geometry-changed';
  assert.equal(mesh.geometry.attributes.position.getX(0), 0); assert.equal(mesh.geometry.attributes.skinWeight.getX(0), 0.25);
  assert.equal(capture.root!.getObjectByName('Tip')!.position.y, 1);
  assert.equal(mesh.skeleton.boneInverses[0].elements[0], 1);
  assert.equal(((mesh.material as THREE.MeshStandardMaterial).map!.image as { data: Uint8Array }).data[0], 30);
  assert.equal(capture.clips[0].tracks[0].values[4], 2); assert.equal(capture.root!.userData.metadata.tag, 'captured');
  assert.equal(mesh.geometry.userData.tag, 'geometry-captured');
  let liveDisposed = 0, copyDisposed = 0;
  f.geometry.addEventListener('dispose', () => liveDisposed++); mesh.geometry.addEventListener('dispose', () => copyDisposed++);
  capture.dispose(); capture.dispose(); assert.equal(liveDisposed, 0); assert.equal(copyDisposed, 1);
});
test('captures source materials and restores viewport previews synchronously', () => {
  const f = fixture(); registerMaterialPreviewRoot(f.root);
  updateMaterialPreview(f.root, { textureEnabled: false, modelOpacity: 0.2, repeatTextures: true, textureFilter: 'linear' });
  const capture = captureExportSnapshot(f.input, preset, 1000000);
  const material = (capture.root!.getObjectByName('Triangle') as THREE.Mesh).material as THREE.MeshStandardMaterial;
  assert.equal(material.opacity, 0.8); assert.ok(material.map); assert.equal(material.map.wrapS, THREE.ClampToEdgeWrapping);
  assert.equal(f.material.opacity, 0.8 * 0.2); assert.equal(f.material.map, null); capture.dispose();
});
test('bounds before allocating scene copies and restores preview even on failure', () => {
  const f = fixture(); registerMaterialPreviewRoot(f.root); updateMaterialPreview(f.root, { modelOpacity: 0.2 });
  assert.throws(() => captureExportSnapshot(f.input, preset, 1), /128 MiB/); assert.equal(f.material.opacity, 0.8 * 0.2);
});

test('bounds each private track copy even when source tracks share key arrays', () => {
  const f = fixture(); const times = new Float32Array(1024), values = new Float32Array(3072);
  const base = new THREE.VectorKeyframeTrack('Base.position', times, values);
  f.input.clips = [new THREE.AnimationClip('Shared', 1, [base])];
  const first = captureExportSnapshot(f.input, preset, 1000000); const limit = first.bytes + 1024; first.dispose();
  const tip = new THREE.VectorKeyframeTrack('Tip.position', times, values);
  assert.equal(base.times, tip.times); assert.equal(base.values, tip.values);
  f.input.clips[0].tracks.push(tip);
  assert.throws(() => { const capture = captureExportSnapshot(f.input, preset, limit); capture.dispose(); }, /128 MiB/);
});

test('bounds separate geometry attribute copies of one source array', () => {
  const f = fixture(); const shared = new Float32Array(3072);
  f.geometry.setAttribute('position', new THREE.BufferAttribute(shared, 3)); f.geometry.deleteAttribute('normal');
  const first = captureExportSnapshot(f.input, preset, 1000000); const limit = first.bytes + 1024; first.dispose();
  f.geometry.setAttribute('normal', new THREE.BufferAttribute(shared, 3));
  assert.throws(() => { const capture = captureExportSnapshot(f.input, preset, limit); capture.dispose(); }, /128 MiB/);
});

test('bounds the whole backing buffer copied by structured texture image cloning', () => {
  const f = fixture();
  const first = captureExportSnapshot(f.input, preset, 1000000); const limit = first.bytes + 1024; first.dispose();
  const image = f.texture.image as { data: Uint8Array };
  image.data = new Uint8Array(new ArrayBuffer(32768), 1024, 4);
  assert.throws(() => { const capture = captureExportSnapshot(f.input, preset, limit); capture.dispose(); }, /128 MiB/);
});

test('interleaved attributes retain their private shared allocation without double counting', () => {
  const f = fixture(); const data = new THREE.InterleavedBuffer(new Float32Array(6144), 6);
  f.geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 0)); f.geometry.deleteAttribute('normal');
  const first = captureExportSnapshot(f.input, preset, 1000000); const limit = first.bytes + 1024; first.dispose();
  f.geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(data, 3, 3));
  const capture = captureExportSnapshot(f.input, preset, limit);
  const mesh = capture.root!.getObjectByName('Triangle') as THREE.Mesh;
  const position = mesh.geometry.attributes.position as THREE.InterleavedBufferAttribute;
  const normal = mesh.geometry.attributes.normal as THREE.InterleavedBufferAttribute;
  assert.equal(position.data, normal.data); assert.notEqual(position.data.array.buffer, data.array.buffer); capture.dispose();
});

test('bounds instance matrix copies before allocating the scene capture', () => {
  const f = fixture(); const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 1); f.root.add(mesh);
  const first = captureExportSnapshot(f.input, preset, 1000000); const limit = first.bytes + 1024; first.dispose();
  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(16384), 16); mesh.count = 1024;
  assert.throws(() => { const capture = captureExportSnapshot(f.input, preset, limit); capture.dispose(); }, /128 MiB/);
});

test('instance morph pixels are owned and released without changing the live texture', () => {
  const f = fixture(); const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 1); mesh.name = 'Instances';
  const texture = new THREE.DataTexture(new Float32Array([1, 0, 0, 0]), 4, 1, THREE.RedFormat, THREE.FloatType); mesh.morphTexture = texture; f.root.add(mesh);
  let sourceDisposals = 0, ownedDisposals = 0; texture.addEventListener('dispose', () => sourceDisposals++);
  const capture = captureExportSnapshot(f.input, preset, 1000000);
  const copy = capture.root!.getObjectByName('Instances') as THREE.InstancedMesh;
  copy.morphTexture!.addEventListener('dispose', () => ownedDisposals++);
  try {
    (texture.image as { data: Float32Array }).data[0] = 9;
    assert.equal((copy.morphTexture!.image as { data: Float32Array }).data[0], 1);
  } finally { capture.dispose(); capture.dispose(); }
  assert.equal(sourceDisposals, 0); assert.equal(ownedDisposals, 1);
});
test('mesh and rig preset captures no clips without mutating canonical animation', () => {
  const f = fixture(); const capture = captureExportSnapshot(f.input, { ...preset, includeAnimation: false }, 1000000);
  assert.equal(capture.clips.length, 0); assert.equal(f.clips.length, 1); capture.dispose();
});
test('SMF snapshot retains imported payloads and isolates source-only metadata and pixels', () => {
  const f = fixture();
  f.input.sourceSmf = { meshes: [], textures: [{ width: 1, height: 1, pixels: new Uint8Array([1,2,3,4]) }], bones: [], animations: [] } as unknown as ImportedSmf;
  const capture = captureExportSnapshot(f.input, { ...preset, format: 'smf' }, 1000000);
  f.input.sourceSmf.textures[0].pixels[0] = 99;
  assert.equal(capture.smf!.textures[0].pixels[0], 1); assert.equal(capture.root, null); capture.dispose();
});
test('explicit SMF refusal happens before enqueue, with no GLB fallback', () => {
  const root = new THREE.Group(); root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  assert.throws(() => captureExportSnapshot({ root, clips: [], skeleton: null, sourceSmf: null, poseEdits: {}, animationEdits: makeAnimationEditState() }, { ...preset, format: 'smf' }, 1000000), /skinned|skeleton|Skin|SMF/);
});
test('preparation checks cancellation before export and produces validated owned GLB bytes', async () => {
  installFileReaderTestPolyfill(); const f = fixture(); f.material.map = null;
  const capture = captureExportSnapshot(f.input, preset, 1000000); const controller = new AbortController(); controller.abort();
  await assert.rejects(prepareQueuedExport(capture, preset, controller.signal, () => true), /canceled/);
  const bytes = await prepareQueuedExport(capture, preset, new AbortController().signal, () => true);
  assert.equal(new TextDecoder().decode(bytes.subarray(0,4)), 'glTF'); capture.dispose();
});

test('captured UUID animation bindings retain property syntax, interpolation and owned motion', async () => {
  installFileReaderTestPolyfill();
  const f = fixture(); f.material.map = null; f.tip.name = '';
  f.clips[0].tracks[0].name = `${f.tip.uuid}.position`;
  f.clips[0].tracks[0].setInterpolation(THREE.InterpolateDiscrete);
  const capture = captureExportSnapshot(f.input, preset, 1000000);
  try {
    const target = THREE.PropertyBinding.findNode(capture.root!, THREE.PropertyBinding.parseTrackName(capture.clips[0].tracks[0].name).nodeName);
    assert.ok(target instanceof THREE.Object3D, 'cloned binding resolves inside the captured hierarchy');
    assert.notEqual(target, f.tip);
    assert.equal(capture.clips[0].tracks[0].getInterpolation(), THREE.InterpolateDiscrete);
    assert.equal(f.clips[0].tracks[0].name, `${f.tip.uuid}.position`);
    f.tip.position.y = 99; f.clips[0].tracks[0].values[4] = 88; f.root.remove(f.tip);
    const mixer = new THREE.AnimationMixer(capture.root!);
    const action = mixer.clipAction(capture.clips[0]); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    for (const [time, expected] of [[0, 1], [.5, 1], [1, 2]]) { mixer.setTime(time); assert.equal(target.position.y, expected); }
    mixer.stopAllAction(); mixer.uncacheRoot(capture.root!);
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(prepareQueuedExport(capture, preset, cancelled.signal, () => true), /canceled/);
    const bytes = await prepareQueuedExport(capture, preset, new AbortController().signal, () => true);
    assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), 'glTF');
  } finally { capture.dispose(); }
});
