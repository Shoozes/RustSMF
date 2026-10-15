import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { PNG } from 'pngjs';
import { expect } from '@playwright/test';
import { expectNumbersClose, readAssetEvidence, sampleTrack } from './asset-evidence';

export const BLACK_CAT_PATH = fileURLToPath(new URL('../../../../examples/black-cat/sable.glb', import.meta.url));
export const BLACK_CAT_MANIFEST = fileURLToPath(new URL('../../../../examples/black-cat/asset.json', import.meta.url));
export const CAT_CLIPS = { Idle: 3, Walk: 1.2, Run: 0.8, Sit: 2 } as const;

// Inputs are immutable evidence buffers. Parse once per buffer, not once per vertex/sample.
const parsed = new WeakMap<Buffer, { evidence: ReturnType<typeof readAssetEvidence>; nodes: { name: string; children?: number[] }[] }>();
function catEvidence(bytes: Buffer) {
  let entry = parsed.get(bytes);
  if (!entry) {
    const doc = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    entry = { evidence: readAssetEvidence(bytes), nodes: doc.nodes };
    parsed.set(bytes, entry);
  }
  return entry;
}

/** Evaluate exported TRS channels and hierarchy without the application loader/mixer. */
export function catWorldMatrices(bytes: Buffer, clipName?: string, time = 0): Map<string, Matrix4> {
  const { nodes, evidence } = catEvidence(bytes);
  const parents = new Map<number, number>();
  nodes.forEach((node, i) => node.children?.forEach(child => parents.set(child, i)));
  const clip = evidence.clips.find(value => value.name === clipName);
  const matrices = new Map<number, Matrix4>();
  const world = (index: number): Matrix4 => {
    const existing = matrices.get(index); if (existing) return existing;
    const pose = evidence.poses[index];
    let translation = pose.translation, rotation = pose.rotation, scale = pose.scale;
    for (const track of clip?.tracks ?? []) if (track.bone === pose.name) {
      const value = sampleTrack(track, time);
      if (track.path === 'translation') translation = value;
      else if (track.path === 'rotation') rotation = value;
      else if (track.path === 'scale') scale = value;
    }
    const local = new Matrix4().compose(new Vector3().fromArray(translation), new Quaternion().fromArray(rotation), new Vector3().fromArray(scale));
    const parent = parents.get(index);
    const result = parent === undefined ? local : world(parent).clone().multiply(local);
    matrices.set(index, result); return result;
  };
  return new Map(nodes.map((node, i) => [node.name, world(i)]));
}

export function blackCatBytes(): Buffer { return fs.readFileSync(BLACK_CAT_PATH); }

/** Every baked 30 fps key and its midpoint, including both endpoints. */
export function catSampleTimes(duration: number): number[] {
  return Array.from({ length: Math.round(duration * 60) + 1 }, (_, frame) => frame / 60);
}

function assertTransforms(actual: Matrix4, expected: Matrix4, label: string): void {
  const ap = new Vector3(), aq = new Quaternion(), as = new Vector3();
  const ep = new Vector3(), eq = new Quaternion(), es = new Vector3();
  actual.decompose(ap, aq, as); expected.decompose(ep, eq, es);
  assert.ok(ap.distanceTo(ep) < 2e-5, `${label} position`);
  assert.ok(aq.normalize().angleTo(eq.normalize()) < 2e-5, `${label} rotation`);
  assert.ok(as.distanceTo(es) < 2e-5, `${label} scale`);
}

function assertSkin(actual: Vector3[], expected: Vector3[], label: string): void {
  assert.equal(actual.length, expected.length, `${label} vertex count`);
  let maximum = 0;
  actual.forEach((point, i) => { maximum = Math.max(maximum, point.distanceTo(expected[i])); });
  assert.ok(maximum < 2e-5, `${label} skin drift ${maximum} m`);
}

export function expectCatLoop(bytes: Buffer, clip: 'Idle' | 'Walk' | 'Run'): void {
  const duration = CAT_CLIPS[clip];
  const first = catWorldMatrices(bytes, clip, 0), last = catWorldMatrices(bytes, clip, duration);
  for (const name of catEvidence(bytes).evidence.joints) assertTransforms(last.get(name)!, first.get(name)!, `${clip} seam ${name}`);
  assertSkin(catSkinnedVertices(bytes, clip, duration), catSkinnedVertices(bytes, clip, 0), `${clip} seam`);
}

export function expectCatMotionContinuity(bytes: Buffer, before: Buffer): void {
  for (const [clip, duration] of Object.entries(CAT_CLIPS)) for (const time of catSampleTimes(duration)) {
    const actual = catWorldMatrices(bytes, clip, time), expected = catWorldMatrices(before, clip, time);
    for (const name of catEvidence(before).evidence.joints) assertTransforms(actual.get(name)!, expected.get(name)!, `${clip} motion ${time} ${name}`);
    assertSkin(catSkinnedVertices(bytes, clip, time), catSkinnedVertices(before, clip, time), `${clip} motion ${time}`);
  }
}

function catTexture(hex: string) {
  const data = Buffer.from(hex, 'hex');
  for (let offset = 8; offset + 12 <= data.length;) {
    const end = offset + 12 + data.readUInt32BE(offset);
    assert.ok(end <= data.length, 'complete PNG chunks');
    if (data.toString('ascii', offset + 4, offset + 8) === 'IEND') {
      // Three's GLB writer includes at most three zero alignment bytes.
      assert.ok(data.length - end <= 3 && data.subarray(end).every(byte => byte === 0), 'bounded GLB image padding');
      return PNG.sync.read(data.subarray(0, end));
    }
    offset = end;
  }
  throw new Error('Sable atlas has no complete PNG IEND chunk');
}

export function catSkinnedVertices(bytes: Buffer, clipName: string, time: number): Vector3[] {
  const { evidence } = catEvidence(bytes), world = catWorldMatrices(bytes, clipName, time);
  const skin = evidence.joints.map((name, i) => world.get(name)!.clone().multiply(new Matrix4().fromArray(evidence.binds[0], i * 16)));
  return evidence.primitives.flatMap(primitive => {
    const a = primitive.attributes;
    return Array.from({ length: a.POSITION.length / 3 }, (_, v) => {
      const position = new Vector3().fromArray(a.POSITION, v * 3), output = new Vector3();
      for (let slot = 0; slot < 4; slot++) {
        const weight = a.WEIGHTS_0[v * 4 + slot];
        if (weight) output.addScaledVector(position.clone().applyMatrix4(skin[a.JOINTS_0[v * 4 + slot]]), weight);
      }
      return output;
    });
  });
}

/** Compare named raw influences and actual skinned motion, allowing exporter node wrappers. */
export function expectCatContinuity(bytes: Buffer, before = blackCatBytes()): void {
  const actual = catEvidence(bytes).evidence, expected = catEvidence(before).evidence;
  expect([...actual.joints].sort()).toEqual([...expected.joints].sort());
  expect([...actual.hierarchy].sort((a, b) => a.name.localeCompare(b.name)))
    .toEqual([...expected.hierarchy].sort((a, b) => a.name.localeCompare(b.name)));
  expect(actual.images).toHaveLength(1);
  const texture = catTexture(actual.images[0].signature);
  const sourceTexture = catTexture(expected.images[0].signature);
  expect([texture.width, texture.height]).toEqual([1024, 1024]);
  assert.equal(texture.data.length, sourceTexture.data.length);
  let pixelDrift = 0;
  for (let i = 0; i < texture.data.length; i++) pixelDrift = Math.max(pixelDrift, Math.abs(texture.data[i] - sourceTexture.data[i]));
  expect(pixelDrift, 'decoded atlas pixels survive project/export continuity').toBeLessThanOrEqual(1);
  expect(actual.primitives).toHaveLength(1);
  const material = (p: typeof actual.primitives[number]) => p.material as {
    name: string; pbrMetallicRoughness: { baseColorFactor: number[]; roughnessFactor: number; metallicFactor: number };
    doubleSided?: boolean; extensions?: { KHR_materials_specular?: { specularFactor?: number } };
  };
  for (const p of actual.primitives) {
    const q = expected.primitives.find(candidate => material(candidate).name === material(p).name)!;
    expect(q, `material ${material(p).name}`).toBeDefined();
    expect(p.indices).toEqual(q.indices);
    expectNumbersClose(p.attributes.POSITION, q.attributes.POSITION);
    expectNumbersClose(p.attributes.TEXCOORD_0, q.attributes.TEXCOORD_0);
    const am = material(p).pbrMetallicRoughness, em = material(q).pbrMetallicRoughness;
    expectNumbersClose(am.baseColorFactor ?? [1, 1, 1, 1], em.baseColorFactor ?? [1, 1, 1, 1]);
    expectNumbersClose([am.roughnessFactor, am.metallicFactor], [em.roughnessFactor, em.metallicFactor]);
    expect(material(p).doubleSided ?? false).toBe(material(q).doubleSided ?? false);
    expectNumbersClose([material(p).extensions?.KHR_materials_specular?.specularFactor ?? 1], [material(q).extensions?.KHR_materials_specular?.specularFactor ?? 1]);
    const influences = (asset: typeof actual, primitive: typeof p, vertex: number) => [0, 1, 2, 3]
      .map(slot => ({ bone: asset.joints[primitive.attributes.JOINTS_0[vertex * 4 + slot]], weight: primitive.attributes.WEIGHTS_0[vertex * 4 + slot] }))
      .filter(value => value.weight > 0).sort((a, b) => a.bone.localeCompare(b.bone));
    expect(p.attributes.WEIGHTS_0.length).toBe(q.attributes.WEIGHTS_0.length);
    for (let v = 0; v < p.attributes.WEIGHTS_0.length / 4; v++) {
      const a = influences(actual, p, v), e = influences(expected, q, v);
      assert.deepEqual(a.map(value => value.bone), e.map(value => value.bone), `raw influence names at ${v}`);
      assert.ok(a.every((value, slot) => Math.abs(value.weight - e[slot].weight) < 1e-6), `raw influences at ${v}`);
    }
  }
  expect(actual.clips.map(clip => clip.name).sort()).toEqual(Object.keys(CAT_CLIPS).sort());
  for (const [name, duration] of Object.entries(CAT_CLIPS)) {
    expect(actual.clips.find(clip => clip.name === name)!.duration).toBeCloseTo(duration, 5);
  }
  expectCatMotionContinuity(bytes, before);
}
