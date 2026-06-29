import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { exportFBX, loadFBX } from './fbx';

function makeStaticScene(): THREE.Group {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ]), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0, 0,
    1, 0,
    0, 1,
  ]), 2));

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ color: 0x66aaee }),
  );
  mesh.name = 'TriangleMesh';

  const root = new THREE.Group();
  root.name = 'FBXExportRoot';
  root.add(mesh);
  return root;
}

function toTightArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

describe('fbx export', () => {
  it('writes binary FBX bytes, not the old GLB fallback', async () => {
    const bytes = await exportFBX(makeStaticScene());
    const header = new TextDecoder().decode(bytes.slice(0, 21));

    assert.equal(header, 'Kaydara FBX Binary  \0');
    assert.notEqual(new TextDecoder().decode(bytes.slice(0, 4)), 'glTF');
    assert.ok(bytes.byteLength > 1000);
  });

  it('roundtrips exported static FBX through the app loader', async () => {
    const bytes = await exportFBX(makeStaticScene());
    const loaded = await loadFBX(toTightArrayBuffer(bytes));
    const meshes: THREE.Mesh[] = [];

    loaded.root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        meshes.push(object as THREE.Mesh);
      }
    });

    assert.equal(loaded.root.name, 'FBX_Root');
    assert.equal(meshes.length, 1);
    assert.equal(meshes[0].name, 'TriangleMesh');
  });
});
