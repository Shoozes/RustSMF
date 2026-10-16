import * as THREE from 'three';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureDaeGeometryNormals, exportDAE } from './dae';
import { captureExportSnapshot } from '../hooks/exportSnapshot';
import { makeAnimationEditState } from '../utils/animationEdits';

test('DAE geometry normalization computes missing normals without replacing existing normals', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.deleteAttribute('normal');
  assert.equal(ensureDaeGeometryNormals(geometry), true);
  assert.equal(geometry.getAttribute('normal')?.count, geometry.getAttribute('position')?.count);
  assert.equal(ensureDaeGeometryNormals(geometry), false);
  geometry.dispose();
});

test('DAE joint sid matches the controller name so independent readers retain named bones', async () => {
  const root = new THREE.Group();
  const bone = new THREE.Bone(); bone.name = 'FixtureRoot'; root.add(bone);
  const tip = new THREE.Bone(); tip.name = 'FixtureTip'; bone.add(tip);
  const text = new TextDecoder().decode(await exportDAE(root));
  assert.match(text, /name="FixtureRoot" type="JOINT" sid="FixtureRoot"/);
  assert.match(text, /name="FixtureTip" type="JOINT" sid="FixtureTip"/);
});

test('DAE emits a named clip definition and refuses fidelity loss before direct or queued export', async () => {
  const root = new THREE.Group(); root.name = 'Model';
  const material = new THREE.MeshStandardMaterial();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const clip = new THREE.AnimationClip('Move & Hold', 1, [new THREE.VectorKeyframeTrack('Model.position', [0, 1], [0, 0, 0, 1, 0, 0])]);
  const text = new TextDecoder().decode(await exportDAE(root, [clip]));
  assert.match(text, /<animation_clip[^>]*name="Move &amp; Hold"[^>]*end="1"/);
  assert.match(text, /<instance_animation url="#dae-anim-0-node-Model"/);
  const input = { root, clips: [clip], skeleton: null, sourceSmf: null, poseEdits: {}, animationEdits: makeAnimationEditState() };
  for (const scenario of ['multiple', 'texture', 'step'] as const) {
    input.clips = scenario === 'multiple' ? [clip, clip.clone()] : [clip];
    material.map = scenario === 'texture' ? new THREE.Texture() : null;
    clip.tracks[0].setInterpolation(scenario === 'step' ? THREE.InterpolateDiscrete : THREE.InterpolateLinear);
    const message = scenario === 'multiple' ? /one clip.*GLB/ : scenario === 'texture' ? /texture export.*GLB/ : /linear transform.*GLB/;
    await assert.rejects(exportDAE(root, input.clips), message);
    assert.throws(() => captureExportSnapshot(input, { format: 'dae', includeAnimation: true }, 1_000_000), message);
    assert.equal(root.name, 'Model'); assert.equal(root.position.x, 0);
  }
});
