import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import {
  buildGlbContainer,
  embedMaterialTextures,
  parseGlbContainer,
  validateEmbeddedGlbTextures,
  validateStepClipTiming,
} from './glbContainer';
import type { ReferenceMaterialDefinition } from './materialRepair';

function png(red: number, green: number, blue: number): Uint8Array {
  const image = new PNG({ width: 1, height: 1 });
  image.data.set([red, green, blue, 255]);
  return new Uint8Array(PNG.sync.write(image));
}

function twoRowPng(): Uint8Array {
  const image = new PNG({ width: 1, height: 2 });
  image.data.set([
    255, 0, 0, 255,
    0, 0, 255, 255,
  ]);
  return new Uint8Array(PNG.sync.write(image));
}

test('GLB texture embedding keeps images internal and packs metallic/roughness channels', () => {
  const base = buildGlbContainer({
    asset: { version: '2.0' },
    buffers: [{ byteLength: 4 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
    materials: [{ name: 'fighter_mat', pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 } }],
  }, new Uint8Array([1, 2, 3, 4]));
  const definition: ReferenceMaterialDefinition = {
    name: 'fighter_mat',
    color: [1, 1, 1],
    opacity: 1,
    metallic: 0,
    roughness: 1,
    textures: {
      baseColor: 'base.png',
      normal: 'normal.png',
      roughness: 'rough.png',
      metallic: 'metal.png',
    },
  };
  const textures = new Map([
    ['base.png', { resource: 'base.png', mimeType: 'image/png' as const, bytes: png(255, 0, 0) }],
    ['normal.png', { resource: 'normal.png', mimeType: 'image/png' as const, bytes: png(128, 128, 255) }],
    ['rough.png', { resource: 'rough.png', mimeType: 'image/png' as const, bytes: png(64, 64, 64) }],
    ['metal.png', { resource: 'metal.png', mimeType: 'image/png' as const, bytes: png(192, 192, 192) }],
  ]);
  const result = embedMaterialTextures(base, [definition], textures);
  validateEmbeddedGlbTextures(result.bytes);
  const parsed = parseGlbContainer(result.bytes);
  assert.equal(parsed.json.images?.length, 3);
  assert.ok(parsed.json.images?.every((image) => !image.uri && Number.isInteger(image.bufferView)));
  assert.equal(parsed.json.materials?.[0].pbrMetallicRoughness?.metallicFactor, 1);
  assert.equal(parsed.json.materials?.[0].pbrMetallicRoughness?.roughnessFactor, 1);
  assert.deepEqual(result.report[0].textures.map((item) => item.semantic), [
    'baseColor',
    'normal',
    'metallicRoughness',
  ]);
  assert.equal(result.report[0].sourceTextureFlipY, true);
});

test('OBJ texture rows are flipped vertically when embedded for glTF sampling', () => {
  const base = buildGlbContainer({
    asset: { version: '2.0' },
    buffers: [{ byteLength: 4 }],
    materials: [{ name: 'fighter_mat', pbrMetallicRoughness: {} }],
  }, new Uint8Array([1, 2, 3, 4]));
  const definition: ReferenceMaterialDefinition = {
    name: 'fighter_mat',
    color: [1, 1, 1],
    opacity: 1,
    metallic: 0,
    roughness: 1,
    textures: { baseColor: 'rows.png' },
  };
  const result = embedMaterialTextures(base, [definition], new Map([
    ['rows.png', { resource: 'rows.png', mimeType: 'image/png' as const, bytes: twoRowPng() }],
  ]));
  const parsed = parseGlbContainer(result.bytes);
  const image = parsed.json.images?.[0];
  assert.ok(image && image.bufferView !== undefined);
  const bufferView = parsed.json.bufferViews?.[image.bufferView];
  assert.ok(bufferView);
  const offset = bufferView.byteOffset ?? 0;
  const decoded = PNG.sync.read(Buffer.from(parsed.binary.subarray(offset, offset + bufferView.byteLength)));
  assert.deepEqual([...decoded.data], [
    0, 0, 255, 255,
    255, 0, 0, 255,
  ]);
});

test('STEP timing validation rejects float32 keys above exact frame boundaries', () => {
  const safeTime = (value: number): number => {
    const rounded = Math.fround(value);
    if (rounded <= value) return rounded;
    const buffer = new ArrayBuffer(4);
    const float = new Float32Array(buffer);
    const bits = new Uint32Array(buffer);
    float[0] = rounded;
    bits[0] -= 1;
    return float[0];
  };
  const times = new Float32Array([0, safeTime(1 / 60), safeTime(2 / 60)]);
  const bytes = buildGlbContainer({
    asset: { version: '2.0' },
    buffers: [{ byteLength: times.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: times.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'SCALAR' }],
    animations: [{ name: 'attack', samplers: [{ input: 0, output: 0, interpolation: 'STEP' }] }],
  }, new Uint8Array(times.buffer));
  const summary = validateStepClipTiming(bytes, ['attack'], 60);
  assert.equal(summary[0].sampleCount, 3);
  assert.ok(summary[0].maxEarlyDelta < 1e-8);

  const unsafe = new Float32Array([0, Math.fround(1 / 60), Math.fround(2 / 60)]);
  const unsafeBytes = buildGlbContainer({
    asset: { version: '2.0' },
    buffers: [{ byteLength: unsafe.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: unsafe.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'SCALAR' }],
    animations: [{ name: 'attack', samplers: [{ input: 0, output: 0, interpolation: 'STEP' }] }],
  }, new Uint8Array(unsafe.buffer));
  if (unsafe[1] > 1 / 60 || unsafe[2] > 2 / 60) {
    assert.throws(() => validateStepClipTiming(unsafeBytes, ['attack'], 60), /timestamp/);
  }
});
