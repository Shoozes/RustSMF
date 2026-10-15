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
test('captures geometry, raw influences, bones, transforms, metadata, clips and texture bytes independently', () => {
  const f = fixture(); const capture = captureExportSnapshot(f.input, preset, 1000000);
  const mesh = capture.root!.getObjectByName('Triangle') as THREE.SkinnedMesh;
  f.geometry.attributes.skinWeight.setX(0, 0.9); f.geometry.attributes.position.setX(0, 100);
  f.tip.position.y = 8; f.mesh.skeleton.boneInverses[0].elements[0] = 9;
  (f.texture.image as { data: Uint8Array }).data[0] = 200; f.clips[0].tracks[0].values[4] = 99;
  f.root.userData.metadata.tag = 'changed';
  assert.equal(mesh.geometry.attributes.position.getX(0), 0); assert.equal(mesh.geometry.attributes.skinWeight.getX(0), 0.25);
  assert.equal(capture.root!.getObjectByName('Tip')!.position.y, 1);
  assert.equal(mesh.skeleton.boneInverses[0].elements[0], 1);
  assert.equal(((mesh.material as THREE.MeshStandardMaterial).map!.image as { data: Uint8Array }).data[0], 30);
  assert.equal(capture.clips[0].tracks[0].values[4], 2); assert.equal(capture.root!.userData.metadata.tag, 'captured');
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
