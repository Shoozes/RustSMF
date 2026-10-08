import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { createSkinnedGlbFixtureInput } from '../../tests/helpers/skinned-glb-fixture';
import { disposeThreeObject } from '../utils/threeDisposal';
import { loadGLB } from './glb';
import { exportFBX, loadFBX, validateExportedFBX } from './fbx';

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
  it('preserves working-space diffuse and emissive colors without mutating the source', async () => {
    const source = makeStaticScene();
    const material = (source.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
    material.emissive.setRGB(0.08, 0.16, 0.24);
    material.emissiveIntensity = 0.5;
    const color = material.color.clone(), emissive = material.emissive.clone();
    const loaded = await loadFBX(toTightArrayBuffer(await exportFBX(source)));
    try {
      let restored: THREE.MeshLambertMaterial | undefined;
      loaded.root.traverse(object => {
        if (object instanceof THREE.Mesh) restored = object.material as THREE.MeshLambertMaterial;
      });
      assert.ok(restored);
      assert.ok(restored.color.toArray().every((v, i) => Math.abs(v - color.toArray()[i]) < 1e-5));
      assert.ok(restored.emissive.toArray().every((v, i) => Math.abs(v - emissive.toArray()[i]) < 1e-5));
      assert.equal(restored.emissiveIntensity, 0.5);
      assert.deepEqual(material.color, color);
      assert.deepEqual(material.emissive, emissive);
    } finally {
      loaded.mixer.stopAllAction(); disposeThreeObject(loaded.root); disposeThreeObject(source);
    }
  });
  it('writes binary FBX bytes, not the old GLB fallback', async () => {
    const bytes = await exportFBX(makeStaticScene());
    const header = new TextDecoder().decode(bytes.slice(0, 21));

    assert.equal(header, 'Kaydara FBX Binary  \0');
    assert.notEqual(new TextDecoder().decode(bytes.slice(0, 4)), 'glTF');
    assert.ok(bytes.byteLength > 1000);
  });

  it('roundtrips exported static FBX through the app loader', async () => {
    const source = makeStaticScene();
    const bytes = await exportFBX(source);
    const loaded = await loadFBX(toTightArrayBuffer(bytes));
    const meshes: THREE.Mesh[] = [];

    try {
      loaded.root.traverse((object) => {
        if (object instanceof THREE.Mesh) meshes.push(object);
      });

      assert.equal(loaded.root.name, 'FBX_Root');
      assert.equal(meshes.length, 1);
      assert.equal(meshes[0].name, 'TriangleMesh');
      assert.equal(loaded.summary.meshCount, 1);
      assert.equal(loaded.summary.skinnedMeshCount, 0);
      assert.equal(loaded.summary.boneCount, 0);
      assert.equal(loaded.summary.primaryMeshName, 'TriangleMesh');
      assert.ok(
        loaded.summary.notes.some((note) => /static mesh only/i.test(note)),
        'static FBX load should note that skin tools need a root skeleton',
      );
    } finally {
      loaded.mixer.stopAllAction();
      disposeThreeObject(loaded.root);
      disposeThreeObject(source);
    }
  });

  it('validates static binary structure and app-loader roundtrip before save', async () => {
    const source = makeStaticScene();
    try {
      const bytes = await exportFBX(source);
      const summary = await validateExportedFBX(bytes, source);
      assert.equal(summary.version, 7500);
      assert.equal(summary.meshCount, 1);
      assert.equal(summary.primitiveVertexCount, 3);
      assert.deepEqual(summary.meshNames, ['TriangleMesh']);
    } finally {
      disposeThreeObject(source);
    }
  });

  it('rejects empty, non-FBX, and wrong-version bytes', async () => {
    const source = makeStaticScene();
    try {
      await assert.rejects(
        validateExportedFBX(new Uint8Array(), source),
        /empty or truncated file/,
      );
      await assert.rejects(
        validateExportedFBX(new Uint8Array(32), source),
        /binary FBX header is missing/,
      );
      const bytes = await exportFBX(source);
      const wrongVersion = new Uint8Array(bytes);
      new DataView(wrongVersion.buffer).setUint32(23, 7400, true);
      await assert.rejects(
        validateExportedFBX(wrongVersion, source),
        /expected binary FBX 7500, received 7400/,
      );
    } finally {
      disposeThreeObject(source);
    }
  });

  it('blocks an FBX export that drops an expected animation clip', async () => {
    const fixture = await createSkinnedGlbFixtureInput();
    const source = await loadGLB(toTightArrayBuffer(fixture.buffer));
    try {
      const bytes = await exportFBX(source.root, []);
      await assert.rejects(
        validateExportedFBX(bytes, source.root, source.clips),
        /clip count changed from 1 to 0/,
      );
    } finally {
      source.mixer.stopAllAction();
      disposeThreeObject(source.root);
    }
  });

  it('preserves representative skinned geometry and animation endpoints', async () => {
    const fixture = await createSkinnedGlbFixtureInput();
    const source = await loadGLB(toTightArrayBuffer(fixture.buffer));
    try {
      const bytes = await exportFBX(source.root, source.clips);
      const summary = await validateExportedFBX(bytes, source.root, source.clips);
      assert.equal(summary.boneCount, 2);
      assert.equal(summary.skinnedMeshCount, 1);
      assert.equal(summary.primitiveVertexCount, 6);
      assert.deepEqual(summary.clipNames, ['FixtureBend']);
      assert.deepEqual(summary.trackCounts, [2]);
    } finally {
      source.mixer.stopAllAction();
      disposeThreeObject(source.root);
    }
  });
});
