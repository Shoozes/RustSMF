import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createModelResourceBundle,
  createResourceUrlRegistry,
  ModelResourceError,
  normalizeResourceName,
  resolveModelResource,
} from './modelResourceBundle';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('model resource bundle boundaries', () => {
  it('normalizes safe relative names and rejects traversal or external URIs', () => {
    assert.equal(normalizeResourceName('./textures\\albedo.png'), 'textures/albedo.png');
    assert.throws(
      () => normalizeResourceName('../outside.bin'),
      (error: unknown) => error instanceof ModelResourceError && error.code === 'RESOURCE_URI_TRAVERSAL',
    );
    assert.throws(
      () => normalizeResourceName('%2e%2e/outside.bin'),
      (error: unknown) => error instanceof ModelResourceError && error.code === 'RESOURCE_URI_TRAVERSAL',
    );
    assert.throws(
      () => normalizeResourceName('https://example.test/model.bin'),
      (error: unknown) => error instanceof ModelResourceError && error.code === 'RESOURCE_URI_REMOTE',
    );
    assert.throws(
      () => normalizeResourceName('C:/outside.bin'),
      (error: unknown) => error instanceof ModelResourceError && error.code === 'RESOURCE_URI_TRAVERSAL',
    );
  });

  it('rejects duplicate and case-ambiguous selected files before loading', () => {
    assert.throws(
      () => createModelResourceBundle({ name: 'scene.gltf', data: bytes(1) }, [
        { name: 'scene.gltf', data: bytes(2) },
      ]),
      (error: unknown) => error instanceof ModelResourceError && error.code === 'RESOURCE_DUPLICATE',
    );
    assert.throws(
      () => createModelResourceBundle({ name: 'scene.gltf', data: bytes(1) }, [
        { name: 'Textures/a.png', data: bytes(2) },
        { name: 'textures/A.png', data: bytes(3) },
      ]),
      (error: unknown) => error instanceof ModelResourceError && error.code === 'RESOURCE_AMBIGUOUS',
    );
  });

  it('resolves case differences but names missing resources explicitly', () => {
    const bundle = createModelResourceBundle(
      { name: 'scene.gltf', data: bytes(1) },
      [{ name: 'textures/albedo.png', data: bytes(2, 3) }],
    );
    assert.deepEqual(resolveModelResource(bundle, 'Textures/ALBEDO.PNG')?.data, bytes(2, 3));
    assert.equal(resolveModelResource(bundle, 'data:image/png;base64,AA=='), null);
    assert.throws(
      () => resolveModelResource(bundle, 'textures/missing.png'),
      (error: unknown) => error instanceof ModelResourceError
        && error.code === 'RESOURCE_MISSING'
        && error.message.includes('textures/missing.png'),
    );
  });

  it('revokes generated object URLs exactly once when the load owner releases them', () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const created: string[] = [];
    const revoked: string[] = [];
    URL.createObjectURL = (() => {
      const url = `blob:test-${created.length}`;
      created.push(url);
      return url;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = ((url: string) => { revoked.push(url); }) as typeof URL.revokeObjectURL;
    try {
      const bundle = createModelResourceBundle(
        { name: 'scene.gltf', data: bytes(1) },
        [{ name: 'buffer.bin', data: bytes(2) }],
      );
      const registry = createResourceUrlRegistry(bundle);
      assert.equal(registry.resolve('buffer.bin'), 'blob:test-0');
      assert.equal(registry.resolve('./buffer.bin'), 'blob:test-0');
      assert.equal(registry.resolve('blob:embedded-gltf-image'), 'blob:embedded-gltf-image');
      registry.dispose();
      registry.dispose();
      assert.deepEqual(revoked, ['blob:test-0']);
      assert.throws(() => registry.resolve('buffer.bin'), /disposed/);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
