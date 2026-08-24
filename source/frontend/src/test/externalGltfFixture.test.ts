import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const fixtureDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../tests/fixtures/external-gltf',
);
const scenePath = path.join(fixtureDirectory, 'scene.gltf');
const meshPath = path.join(fixtureDirectory, 'mesh.bin');
const texturePath = path.join(fixtureDirectory, 'texture.png');
const expectedMeshHash = '36f50957f5e0b6ee3ef455674da35a86667f3314209dc1514c510fe95e840831';

function collectUris(value: unknown, uris: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectUris(item, uris);
    return uris;
  }
  if (!value || typeof value !== 'object') return uris;

  for (const [key, child] of Object.entries(value)) {
    if (key === 'uri' && typeof child === 'string') uris.push(child);
    else collectUris(child, uris);
  }
  return uris;
}

describe('external GLTF fixture integrity', () => {
  it('keeps the committed fixture files and exact mesh payload stable', () => {
    for (const fixturePath of [scenePath, meshPath, texturePath]) {
      assert.equal(existsSync(fixturePath), true, `missing fixture: ${fixturePath}`);
      assert.equal(statSync(fixturePath).isFile(), true, `fixture is not a file: ${fixturePath}`);
    }

    const meshBytes = readFileSync(meshPath);
    assert.equal(meshBytes.byteLength, 9);
    assert.equal(meshBytes.toString('ascii'), '012345678');
    assert.equal(createHash('sha256').update(meshBytes).digest('hex'), expectedMeshHash);
  });

  it('keeps every relative external URI inside the fixture directory', () => {
    const scene = JSON.parse(readFileSync(scenePath, 'utf8')) as unknown;
    const relativeUris = collectUris(scene).filter((uri) => !/^[a-z][a-z0-9+.-]*:/i.test(uri));
    assert.deepEqual(relativeUris.sort(), ['mesh.bin', 'texture.png']);

    for (const uri of relativeUris) {
      const resolved = path.resolve(fixtureDirectory, decodeURIComponent(uri));
      const relative = path.relative(fixtureDirectory, resolved);
      assert.equal(
        relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
        true,
        `fixture URI escapes its directory: ${uri}`,
      );
      assert.equal(existsSync(resolved), true, `fixture URI is missing: ${uri}`);
      assert.equal(statSync(resolved).isFile(), true, `fixture URI is not a file: ${uri}`);
    }
  });
});
