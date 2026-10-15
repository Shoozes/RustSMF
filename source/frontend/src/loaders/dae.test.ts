import * as THREE from 'three';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureDaeGeometryNormals, exportDAE } from './dae';

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
