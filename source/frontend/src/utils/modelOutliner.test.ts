import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { collectModelOutlinerItems } from './modelOutliner';

test('collectModelOutlinerItems summarizes renderable submodels', () => {
  const root = new THREE.Group();
  root.name = 'Root';

  const parent = new THREE.Group();
  parent.name = 'Body';
  root.add(parent);

  const texture = new THREE.DataTexture(
    new Uint8Array([0x33, 0x66, 0xff, 0xff]),
    1,
    1,
  );
  const material = new THREE.MeshBasicMaterial({ color: 0x3366ff, map: texture });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = 'Armor';
  parent.add(mesh);

  const hiddenMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), [
    new THREE.MeshBasicMaterial({ color: 0xffaa00 }),
    new THREE.MeshBasicMaterial({ color: 0x00aa88 }),
  ]);
  hiddenMesh.visible = false;
  root.add(hiddenMesh);

  const items = collectModelOutlinerItems(root);

  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((item) => ({ name: item.name, kind: item.kind, visible: item.visible, materialCount: item.materialCount })),
    [
      { name: 'Body', kind: 'group', visible: true, materialCount: 0 },
      { name: 'Armor', kind: 'mesh', visible: true, materialCount: 1 },
      { name: 'Mesh 1', kind: 'mesh', visible: false, materialCount: 2 },
    ],
  );
  assert.equal(items[1].depth, 1);
  assert.equal(items[1].color, '#3366ff');
  assert.equal(items[1].texture, texture);
  assert.equal(items[1].vertexCount, 24);
});

test('collectModelOutlinerItems returns empty without a root', () => {
  assert.deepEqual(collectModelOutlinerItems(null), []);
});
