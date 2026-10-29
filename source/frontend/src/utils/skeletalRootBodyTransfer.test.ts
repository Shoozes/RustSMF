import test from 'node:test';
import assert from 'node:assert/strict';
import { transferWalkSlowRootYToBody, WALK_ROOT_BODY_POLICY } from './skeletalRootBodyTransfer';

function fixture(clipId = 'walkSlow', keyCount = 91) {
  const binary = new Uint8Array(91 * (4 + 12 + 12 + 12));
  const view = new DataView(binary.buffer);
  for (let tick = 0; tick <= 90; tick++) {
    view.setFloat32(tick * 4, Math.fround((keyCount === 2 && tick === 1 ? 6 : tick) / 60), true);
    for (let axis = 0; axis < 3; axis++) {
      view.setFloat32(364 + tick * 12 + axis * 4, Math.fround(tick * .01 + axis * .02), true);
      view.setFloat32(1456 + tick * 12 + axis * 4, Math.fround(tick * .001 + axis * .2), true);
      view.setFloat32(2548 + tick * 12 + axis * 4, tick + axis, true);
    }
  }
  const doc = {
    asset: { version: '2.0' }, buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 364 },
      { buffer: 0, byteOffset: 364, byteLength: 1092 }, { buffer: 0, byteOffset: 1456, byteLength: 1092 },
      { buffer: 0, byteOffset: 2548, byteLength: 1092 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: keyCount, type: 'SCALAR' },
      ...[1, 2, 3].map(bufferView => ({ bufferView, componentType: 5126, count: keyCount, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] }))],
    nodes: [{ name: 'LocomotionRoot', children: [1] }, { name: 'mixamorigHips' }, { name: 'other' }],
    animations: [{ name: clipId, samplers: [1, 2, 3].map(output => ({ input: 0, output, interpolation: 'LINEAR' })),
      channels: [0, 1, 2].map((node, sampler) => ({ sampler, target: { node, path: 'translation' } })) }],
  };
  const json = new TextEncoder().encode(JSON.stringify(doc)), padded = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(28 + padded + binary.length);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, bytes.length, true);
  header.setUint32(12, padded, true); header.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + padded); bytes.set(json, 20);
  header.setUint32(20 + padded, binary.length, true); header.setUint32(24 + padded, 0x004e4942, true);
  bytes.set(binary, 28 + padded);
  return { bytes, doc, binaryStart: 28 + padded };
}

test('opt-in walkSlow root/body transfer retains source bytes, XZ and unrelated accessors', () => {
  const { bytes, binaryStart } = fixture(), original = bytes.slice();
  const { bytes: derived, report } = transferWalkSlowRootYToBody(bytes, WALK_ROOT_BODY_POLICY);
  assert.deepEqual(bytes, original);
  assert.equal(report.keys, 91);
  assert.ok(report.maximumStoredWorldYErrorMeters < 1e-6);
  const jsonLength = new DataView(derived.buffer).getUint32(12, true), nextBinary = 28 + jsonLength;
  const before = new DataView(bytes.buffer), after = new DataView(derived.buffer);
  for (let tick = 0; tick <= 90; tick++) {
    const rootAt = binaryStart + 364 + tick * 12, bodyAt = binaryStart + 1456 + tick * 12;
    const newRootAt = nextBinary + 364 + tick * 12, newBodyAt = nextBinary + 1456 + tick * 12;
    assert.equal(after.getFloat32(newRootAt + 4, true), 0);
    assert.ok(Math.abs(after.getFloat32(newBodyAt + 4, true) - before.getFloat32(rootAt + 4, true) - before.getFloat32(bodyAt + 4, true)) < 1e-6);
    for (const axis of [0, 8]) {
      assert.equal(after.getFloat32(newRootAt + axis, true), before.getFloat32(rootAt + axis, true));
      assert.equal(after.getFloat32(newBodyAt + axis, true), before.getFloat32(bodyAt + axis, true));
    }
  }
  assert.deepEqual(derived.slice(nextBinary + 2548), bytes.slice(binaryStart + 2548));
  for (let quarter = 0; quarter < 360; quarter++) {
    const low = Math.floor(quarter / 4), alpha = (quarter % 4) / 4;
    const y = (base: number, tick: number) => before.getFloat32(binaryStart + base + tick * 12 + 4, true);
    const changed = (base: number, tick: number) => after.getFloat32(nextBinary + base + tick * 12 + 4, true);
    const oldY = (1 - alpha) * (y(364, low) + y(1456, low)) + alpha * (y(364, low + 1) + y(1456, low + 1));
    const newY = (1 - alpha) * (changed(364, low) + changed(1456, low)) + alpha * (changed(364, low + 1) + changed(1456, low + 1));
    assert.ok(Math.abs(oldY - newY) < 1e-6);
  }
});

test('walkSlow root/body transfer refuses unselected policies and incompatible keys', () => {
  const { bytes, doc } = fixture();
  assert.throws(() => transferWalkSlowRootYToBody(bytes, 'other' as typeof WALK_ROOT_BODY_POLICY), /unknown opt-in policy/);
  const length = new DataView(bytes.buffer).getUint32(12, true);
  const changed = structuredClone(doc); changed.animations[0].samplers[1].interpolation = 'STEP';
  const json = new TextEncoder().encode(JSON.stringify(changed));
  assert.ok(json.length <= length);
  const invalid = bytes.slice(); invalid.fill(32, 20, 20 + length); invalid.set(json, 20);
  assert.throws(() => transferWalkSlowRootYToBody(invalid, WALK_ROOT_BODY_POLICY), /LINEAR/);
});

test('selected six-tick transitions stay within seven or two keys', () => {
  for (const [clipId, count] of [['start-walkSlow-p25', 7], ['stop-walkSlow-p25', 7], ['reversal-walkSlow-p25', 2]] as const) {
    const { bytes } = fixture(clipId, count);
    const derived = transferWalkSlowRootYToBody(bytes, WALK_ROOT_BODY_POLICY, clipId);
    assert.equal(derived.report.keys, count);
    assert.equal(derived.report.clipId, clipId);
  }
  assert.throws(() => transferWalkSlowRootYToBody(fixture().bytes, WALK_ROOT_BODY_POLICY, 'start-walk-p25'), /unselected clip/);
  assert.throws(() => transferWalkSlowRootYToBody(fixture('start-walkSlow-p25', 91).bytes, WALK_ROOT_BODY_POLICY, 'start-walkSlow-p25'), /7 packed/);
});
