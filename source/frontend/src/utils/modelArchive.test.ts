import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { test } from 'node:test';
import { MAX_MODEL_ARCHIVE_BYTES, unpackModelArchive } from './modelArchive';

type Spec = { name: string; data?: Uint8Array; method?: 0 | 8; descriptor?: boolean };

function put16(target: Uint8Array, at: number, value: number): void {
  target[at] = value & 255;
  target[at + 1] = (value >>> 8) & 255;
}

function put32(target: Uint8Array, at: number, value: number): void {
  put16(target, at, value & 0xffff);
  put16(target, at + 2, value >>> 16);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function archive(specs: Spec[], comment = ''): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;
  for (const spec of specs) {
    const name = encoder.encode(spec.name);
    const data = spec.data ?? new Uint8Array();
    const method = spec.method ?? 0;
    const packed = method === 8 ? deflateRawSync(data) : data;
    const crc = crc32(data);
    const flags = 0x0800 | (spec.descriptor ? 8 : 0);
    const local = new Uint8Array(30 + name.length + packed.length + (spec.descriptor ? 16 : 0));
    put32(local, 0, 0x04034b50); put16(local, 4, 20); put16(local, 6, flags); put16(local, 8, method);
    put32(local, 14, spec.descriptor ? 0 : crc); put32(local, 18, spec.descriptor ? 0 : packed.length);
    put32(local, 22, spec.descriptor ? 0 : data.length); put16(local, 26, name.length);
    local.set(name, 30); local.set(packed, 30 + name.length);
    if (spec.descriptor) {
      const at = 30 + name.length + packed.length;
      put32(local, at, 0x08074b50); put32(local, at + 4, crc); put32(local, at + 8, packed.length); put32(local, at + 12, data.length);
    }
    locals.push(local);
    const central = new Uint8Array(46 + name.length);
    put32(central, 0, 0x02014b50); put16(central, 4, 0x031e); put16(central, 6, 20);
    put16(central, 8, flags); put16(central, 10, method); put32(central, 16, crc);
    put32(central, 20, packed.length); put32(central, 24, data.length); put16(central, 28, name.length);
    put32(central, 38, spec.name.endsWith('/') ? 0x10 : 0);
    put32(central, 42, localOffset); central.set(name, 46); centrals.push(central);
    localOffset += local.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const commentBytes = encoder.encode(comment);
  const out = new Uint8Array(localOffset + centralSize + 22 + commentBytes.length);
  let at = 0;
  for (const local of locals) { out.set(local, at); at += local.length; }
  for (const central of centrals) { out.set(central, at); at += central.length; }
  put32(out, at, 0x06054b50); put16(out, at + 8, specs.length); put16(out, at + 10, specs.length);
  put32(out, at + 12, centralSize); put32(out, at + 16, centralSize ? localOffset : 0);
  put16(out, at + 20, commentBytes.length); out.set(commentBytes, at + 22);
  return out;
}

function centralOffsets(input: Uint8Array): number[] {
  const result: number[] = [];
  for (let at = 0; at + 46 <= input.length; at += 1) {
    if (input[at] === 0x50 && input[at + 1] === 0x4b && input[at + 2] === 1 && input[at + 3] === 2) result.push(at);
  }
  return result;
}

const bytes = (value: string) => new TextEncoder().encode(value);

test('unpacks nested model resources, directory entries, deflate, and ZIP comments', async () => {
  const result = await unpackModelArchive(archive([
    { name: 'scene/model.gltf', data: bytes('{"asset":{"version":"2.0"}}'), method: 8 },
    { name: 'scene/buffers/', data: new Uint8Array(), method: 8, descriptor: true },
    { name: 'scene/buffers/mesh.bin', data: bytes('mesh'), method: 8, descriptor: true },
  ], 'valid comment'));
  assert.deepEqual(result.map((file) => file.name), ['scene/model.gltf', 'scene/buffers/mesh.bin']);
  assert.equal(new TextDecoder().decode(result[1].data), 'mesh');
});

test('rejects unsafe, encoded, duplicate, and nested archive names', async () => {
  for (const name of ['../escape.obj', '%2e%2e/escape.obj', '/root.obj', 'C:/root.obj', 'a\\b.obj', 'nested.zip']) {
    await assert.rejects(unpackModelArchive(archive([{ name, data: bytes('x') }])), /refused|unsafe|encoded/i);
  }
  await assert.rejects(unpackModelArchive(archive([
    { name: 'Map.obj', data: bytes('a') }, { name: 'map.OBJ', data: bytes('b') },
  ])), /duplicate|case-ambiguous/i);
});

test('rejects file-parent collisions and inconsistent special-file attributes', async () => {
  await assert.rejects(unpackModelArchive(archive([
    { name: 'scene', data: bytes('file') }, { name: 'scene/model.gltf', data: bytes('{}') },
  ])), /path conflicts with parent/i);

  const dosMismatch = archive([{ name: 'scene/', data: new Uint8Array() }]);
  const central = centralOffsets(dosMismatch)[0];
  put32(dosMismatch, central + 38, 0);
  await assert.rejects(unpackModelArchive(dosMismatch), /DOS directory attributes disagree/i);

  const macSpecial = archive([{ name: 'device.obj', data: bytes('x') }]);
  const macCentral = centralOffsets(macSpecial)[0];
  put16(macSpecial, macCentral + 5, 19);
  put32(macSpecial, macCentral + 38, (0x6000 << 16));
  await assert.rejects(unpackModelArchive(macSpecial), /special file/i);
});

test('rejects CRC mismatch and truncated central or local data', async () => {
  const valid = archive([{ name: 'map.obj', data: bytes('valid') }]);
  const badCrc = valid.slice(); badCrc[14] ^= 1;
  await assert.rejects(unpackModelArchive(badCrc), /CRC/i);
  await assert.rejects(unpackModelArchive(valid.slice(0, valid.length - 3)), /end-of-directory|truncated/i);
  const badLocal = valid.slice(); put32(badLocal, 0, 0);
  await assert.rejects(unpackModelArchive(badLocal), /local record/i);
});

test('checks declared sizes and the archive input bound before expansion', async () => {
  const mismatched = archive([{ name: 'map.obj', data: bytes('x') }]);
  // Central directory uncompressed size is one byte; claim two while leaving payload unchanged.
  const central = mismatched.findIndex((value, index) => value === 0x50 && mismatched[index + 1] === 0x4b && mismatched[index + 2] === 0x01 && mismatched[index + 3] === 0x02);
  put32(mismatched, central + 24, 2);
  await assert.rejects(unpackModelArchive(mismatched), /sizes|declares|deflate output/i);
  await assert.rejects(unpackModelArchive(new Uint8Array(MAX_MODEL_ARCHIVE_BYTES + 1)), /no larger/i);
});

test('honors cancellation before parsing and reports completed ordinary files', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(unpackModelArchive(archive([{ name: 'map.obj', data: bytes('x') }]), { signal: controller.signal }), { name: 'AbortError' });
  const progress: Array<[number, number]> = [];
  await unpackModelArchive(archive([{ name: 'one.obj', data: bytes('1') }, { name: 'two.mtl', data: bytes('2') }]), {
    onProgress: (completed, total) => progress.push([completed, total]),
  });
  assert.deepEqual(progress, [[1, 2], [2, 2]]);
});

test('rejects deflate output that exceeds a dishonest declared size', async () => {
  const input = archive([{ name: 'scene.gltf', data: new Uint8Array(1024).fill(65), method: 8 }]);
  const central = centralOffsets(input)[0];
  put32(input, 22, 1);
  put32(input, central + 24, 1);
  await assert.rejects(unpackModelArchive(input), /deflate output exceeded the declared/i);
});

test('rejects unsupported methods, ZIP64 sentinels, and excessive entry counts', async () => {
  const unsupported = archive([{ name: 'scene.gltf', data: bytes('x') }]);
  const unsupportedCentral = centralOffsets(unsupported)[0];
  put16(unsupported, 8, 12); put16(unsupported, unsupportedCentral + 10, 12);
  await assert.rejects(unpackModelArchive(unsupported), /compression method 12/i);

  const zip64 = archive([{ name: 'scene.gltf', data: bytes('x') }]);
  put16(zip64, zip64.length - 22 + 8, 0xffff);
  put16(zip64, zip64.length - 22 + 10, 0xffff);
  await assert.rejects(unpackModelArchive(zip64), /ZIP64/i);

  const many = archive(Array.from({ length: 65 }, (_, index) => ({ name: `f${index}.mtl`, data: bytes('x') })));
  await assert.rejects(unpackModelArchive(many), /at most 64/i);
});

test('enforces per-file and aggregate expanded limits from directory metadata', async () => {
  const largeOther = archive([{ name: 'material.png', data: bytes('x') }]);
  const otherCentral = centralOffsets(largeOther)[0];
  put32(largeOther, otherCentral + 24, 64 * 1024 * 1024 + 1);
  await assert.rejects(unpackModelArchive(largeOther), /per-file limit/i);

  const aggregate = archive([
    { name: 'one.gltf', data: bytes('x') }, { name: 'two.obj', data: bytes('y') },
  ]);
  const [first, second] = centralOffsets(aggregate);
  put32(aggregate, first + 24, 200 * 1024 * 1024);
  put32(aggregate, second + 24, 100 * 1024 * 1024);
  await assert.rejects(unpackModelArchive(aggregate), /aggregate limit/i);
});

test('rejects local-record overlap before expanding any entry', async () => {
  const embedded = archive([{ name: 'b', data: bytes('b') }]);
  const embeddedCentral = centralOffsets(embedded)[0];
  const embeddedLocal = embedded.slice(0, embeddedCentral);
  const data = new Uint8Array(embeddedLocal.length);
  data.set(embeddedLocal);
  const overlap = archive([{ name: 'a', data }, { name: 'b', data: bytes('b') }]);
  const [firstCentral, secondCentral] = centralOffsets(overlap);
  const firstNameLength = overlap[firstCentral + 28] | (overlap[firstCentral + 29] << 8);
  const firstSize = overlap[firstCentral + 24] | (overlap[firstCentral + 25] << 8) | (overlap[firstCentral + 26] << 16) | (overlap[firstCentral + 27] << 24);
  put32(overlap, secondCentral + 42, 31);
  // The second local record is embedded at the start of A's data; retain B's declared record.
  assert.ok(firstSize > 0 && firstNameLength === 1);
  await assert.rejects(unpackModelArchive(overlap), /overlap|local and central names/i);
});

test('cancels during pending deflate reads and rejects malformed deflate and bad CRC', async () => {
  const controller = new AbortController();
  const input = archive([{ name: 'scene.gltf', data: new Uint8Array(2 * 1024 * 1024).fill(65), method: 8 }]);
  const pending = unpackModelArchive(input, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });

  const malformed = archive([{ name: 'scene.gltf', data: bytes('valid'), method: 8 }]);
  const nameLength = malformed[26] | (malformed[27] << 8);
  malformed[30 + nameLength] ^= 0xff;
  await assert.rejects(unpackModelArchive(malformed));

  const badCrc = archive([{ name: 'scene.gltf', data: bytes('valid') }]);
  const dataNameLength = badCrc[26] | (badCrc[27] << 8);
  badCrc[30 + dataNameLength] ^= 1;
  await assert.rejects(unpackModelArchive(badCrc), /CRC/i);
});
