import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { loadOBJ } from './obj';
import { createModelResourceBundle } from '../utils/modelResourceBundle';

for (const fail of [false, true]) test(`actual OBJ/MTL loading waits for delayed texture ${fail ? 'failure' : 'success'} before revoking resources`, async t => {
  const bundle = createModelResourceBundle(
    { name: 'model.obj', data: new TextEncoder().encode('mtllib model.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl Coat\nf 1 2 3\n') }, [
    { name: 'model.mtl', data: new TextEncoder().encode('newmtl Coat\nKd 1 1 1\nmap_Kd texture.png\nnewmtl Unused\nmap_Kd unused.png\n') },
    { name: 'texture.png', data: new Uint8Array([1]) },
    { name: 'unused.png', data: new Uint8Array([2]) },
  ]);
  let ended = false, revoked = 0, disposed = 0;
  const revoke = URL.revokeObjectURL;
  t.mock.method(URL, 'revokeObjectURL', (url: string) => { revoked++; revoke(url); });
  t.mock.method(THREE.TextureLoader.prototype, 'load', function(this: THREE.TextureLoader, url: string, onLoad?: (texture: THREE.Texture) => void) {
    const resolved = this.manager.resolveURL(url);
    this.manager.itemStart(resolved);
    const texture = new THREE.Texture();
    texture.addEventListener('dispose', () => { disposed++; });
    setTimeout(() => {
      ended = true;
      if (fail) this.manager.itemError(resolved);
      else { texture.image = { width: 2, height: 2 }; onLoad?.(texture); }
      this.manager.itemEnd(resolved);
    }, 25);
    return texture;
  });
  const loading = loadOBJ(bundle);
  const outcome = fail ? assert.rejects(loading, /OBJ resource failed to load/) : loading;
  await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(ended, false); assert.equal(revoked, 0);
  const loaded = await outcome;
  assert.equal(ended, true); assert.equal(revoked, 2);
  if (fail) assert.equal(disposed, 2);
  else {
    assert.equal(disposed, 1);
    const mesh = (loaded as Awaited<ReturnType<typeof loadOBJ>>).root.children[0] as THREE.Mesh;
    assert.equal(((mesh.material as THREE.MeshPhongMaterial).map!.image as { width: number }).width, 2);
  }
});

test('OBJ preparation failure releases used and unused textures exactly once', async t => {
  const bundle = createModelResourceBundle(
    { name: 'model.obj', data: new TextEncoder().encode('mtllib model.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl Coat\nf 1 2 3\n') }, [
    { name: 'model.mtl', data: new TextEncoder().encode('newmtl Coat\nmap_Kd coat.png\nnewmtl Unused\nmap_Kd unused.png\n') },
    { name: 'coat.png', data: new Uint8Array([1]) },
    { name: 'unused.png', data: new Uint8Array([2]) },
  ]);
  const disposals: number[] = [];
  t.mock.method(THREE.TextureLoader.prototype, 'load', function(this: THREE.TextureLoader, url: string) {
    const resolved = this.manager.resolveURL(url);
    this.manager.itemStart(resolved);
    const texture = new THREE.Texture();
    const index = disposals.push(0) - 1;
    texture.addEventListener('dispose', () => { disposals[index]++; });
    texture.image = { width: 2, height: 2 };
    this.manager.itemEnd(resolved);
    return texture;
  });
  const setAttribute = THREE.BufferGeometry.prototype.setAttribute;
  const failure = new Error('Geometry preparation failed');
  t.mock.method(THREE.BufferGeometry.prototype, 'setAttribute', function(this: THREE.BufferGeometry, name: string, attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
    if (name === 'uv') throw failure;
    return setAttribute.call(this, name, attribute);
  });
  await assert.rejects(loadOBJ(bundle), error => error === failure);
  assert.deepEqual(disposals, [1, 1]);
});
