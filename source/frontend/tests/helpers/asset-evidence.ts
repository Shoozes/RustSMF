import { expect } from '@playwright/test';
import { Matrix4, Quaternion, Vector3 } from 'three';

interface Node { name?: string; children?: number[]; mesh?: number; skin?: number; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }
interface Accessor { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }
interface GlbDocument {
  nodes: Node[];
  meshes?: { name?: string; primitives: { attributes: Record<string, number>; indices?: number; material?: number }[] }[];
  skins?: { joints: number[]; inverseBindMatrices?: number }[];
  animations?: { name?: string; samplers: { input: number; output: number; interpolation?: string }[]; channels: { sampler: number; target: { node: number; path: string } }[] }[];
  accessors: Accessor[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  materials?: unknown[];
  images?: { mimeType?: string; bufferView?: number }[];
}

export interface TrackEvidence { bone: string; path: string; interpolation: string; times: number[]; values: number[] }
export interface AssetEvidence {
  joints: string[];
  hierarchy: { name: string; parent: string | null }[];
  binds: number[][];
  poses: { name: string; translation: number[]; rotation: number[]; scale: number[] }[];
  primitives: { name: string; attributes: Record<string, number[]>; indices: number[]; material: unknown }[];
  clips: { name: string; duration: number; tracks: TrackEvidence[] }[];
  images: { mime: string; signature: string; width: number; height: number }[];
}

// Independent glTF accessor inspection: no application parser or export validator.
export function readAssetEvidence(bytes: Buffer): AssetEvidence {
  expect(bytes.toString('ascii', 0, 4)).toBe('glTF');
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  expect(bytes.toString('ascii', 16, 20)).toBe('JSON');
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength)) as GlbDocument;
  const binaryOffset = 20 + jsonLength;
  expect(bytes.toString('ascii', binaryOffset + 4, binaryOffset + 8)).toBe('BIN\0');
  const binary = bytes.subarray(binaryOffset + 8);
  const sizes: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const readers: Record<number, [number, (offset: number) => number]> = {
    5120: [1, offset => binary.readInt8(offset)], 5121: [1, offset => binary.readUInt8(offset)],
    5122: [2, offset => binary.readInt16LE(offset)], 5123: [2, offset => binary.readUInt16LE(offset)],
    5125: [4, offset => binary.readUInt32LE(offset)], 5126: [4, offset => binary.readFloatLE(offset)],
  };
  const accessor = (index: number): number[] => {
    const a = doc.accessors[index];
    const view = doc.bufferViews[a.bufferView];
    expect(view.buffer).toBe(0);
    const [size, read] = readers[a.componentType];
    const count = sizes[a.type];
    expect(count).toBeGreaterThan(0);
    const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const stride = view.byteStride ?? size * count;
    expect(offset + (a.count - 1) * stride + size * count).toBeLessThanOrEqual(binary.length);
    const values = Array.from({ length: a.count * count }, (_, i) => {
      const value = read(offset + Math.floor(i / count) * stride + (i % count) * size);
      if (!a.normalized) return value;
      if (a.componentType === 5121) return value / 255;
      if (a.componentType === 5123) return value / 65535;
      throw new Error('Unexpected normalized accessor component');
    });
    expect(values.every(Number.isFinite)).toBe(true);
    return values;
  };
  const name = (index: number) => doc.nodes[index].name ?? (doc.nodes[index].mesh === undefined ? `node-${index}` : doc.meshes![doc.nodes[index].mesh!].name ?? `mesh_${doc.nodes[index].mesh}`);
  const joints = [...new Set(doc.skins?.flatMap(s => s.joints) ?? [])];
  const parents = new Map<number, number>();
  doc.nodes.forEach((node, i) => node.children?.forEach(child => parents.set(child, i)));
  return {
    joints: joints.map(name),
    hierarchy: joints.map(index => {
      let parent = parents.get(index);
      while (parent !== undefined && !joints.includes(parent)) parent = parents.get(parent);
      return { name: name(index), parent: parent === undefined ? null : name(parent) };
    }),
    binds: (doc.skins ?? []).map(s => s.inverseBindMatrices === undefined ? [] : accessor(s.inverseBindMatrices)),
    poses: doc.nodes.map((node, i) => {
      const translation = new Vector3(), rotation = new Quaternion(), scale = new Vector3(1, 1, 1);
      if (node.matrix) new Matrix4().fromArray(node.matrix).decompose(translation, rotation, scale);
      else {
        translation.fromArray(node.translation ?? [0, 0, 0]);
        rotation.fromArray(node.rotation ?? [0, 0, 0, 1]);
        scale.fromArray(node.scale ?? [1, 1, 1]);
      }
      return { name: name(i), translation: translation.toArray(), rotation: rotation.toArray(), scale: scale.toArray() };
    }),
    primitives: doc.nodes.flatMap((node, i) => node.mesh === undefined ? [] : doc.meshes![node.mesh].primitives.map(p => ({
      name: name(i), attributes: Object.fromEntries(Object.entries(p.attributes).map(([key, value]) => [key, accessor(value)])),
      indices: p.indices === undefined ? [] : accessor(p.indices), material: p.material === undefined ? null : doc.materials![p.material],
    }))),
    clips: (doc.animations ?? []).map((clip, i) => {
      const tracks = clip.channels.map(channel => {
        const sampler = clip.samplers[channel.sampler];
        return { bone: name(channel.target.node), path: channel.target.path, interpolation: sampler.interpolation ?? 'LINEAR', times: accessor(sampler.input), values: accessor(sampler.output) };
      });
      return { name: clip.name ?? `clip-${i}`, duration: Math.max(...tracks.flatMap(t => t.times)), tracks };
    }),
    images: (doc.images ?? []).map(image => {
      expect(image.mimeType).toBe('image/png');
      const view = doc.bufferViews[image.bufferView!];
      const data = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
      expect(width).toBeGreaterThan(0); expect(height).toBeGreaterThan(0);
      return { mime: image.mimeType!, signature: data.toString('hex'), width, height };
    }),
  };
}

export function expectNumbersClose(actual: number[], expected: number[], tolerance = 1e-5): void {
  expect(actual.length).toBe(expected.length);
  let largest = 0;
  actual.forEach((value, i) => { largest = Math.max(largest, Math.abs(value - expected[i])); });
  expect(largest).toBeLessThanOrEqual(tolerance);
}

export function sampleTrack(track: TrackEvidence, time: number): number[] {
  const size = track.path === 'rotation' ? 4 : 3;
  let i = 0, upper = track.times.length;
  while (i + 1 < upper) {
    const mid = Math.floor((i + upper) / 2);
    if (track.times[mid] <= time) i = mid; else upper = mid;
  }
  const cubic = track.interpolation === 'CUBICSPLINE';
  const stride = cubic ? size * 3 : size;
  const offset = i * stride + (cubic ? size : 0);
  const a = track.values.slice(offset, offset + size);
  if (time <= track.times[0]) return a;
  if (i + 1 === track.times.length || track.interpolation === 'STEP') return a;
  if (cubic) {
    const span = track.times[i + 1] - track.times[i];
    const t = (time - track.times[i]) / span, s = 1 - t;
    // Independently inspect Hermite data as equivalent cubic Bezier control points.
    const values = a.map((v, j) => {
      const end = track.values[offset + stride + j];
      const control1 = v + track.values[offset + size + j] * span / 3;
      const control2 = end - track.values[offset + stride - size + j] * span / 3;
      return s*s*s*v + 3*s*s*t*control1 + 3*s*t*t*control2 + t*t*t*end;
    });
    if (size === 4) { const norm = Math.hypot(...values); return values.map(v => v / norm); }
    return values;
  }
  if (track.interpolation !== 'LINEAR') throw new Error(`Unsupported evidence interpolation: ${track.interpolation}`);
  const b = track.values.slice((i + 1) * size, (i + 2) * size);
  const alpha = Math.max(0, (time - track.times[i]) / (track.times[i + 1] - track.times[i]));
  return size === 4 ? new Quaternion().fromArray(a).slerp(new Quaternion().fromArray(b), alpha).toArray()
    : a.map((value, j) => value + (b[j] - value) * alpha);
}

export function expectMotion(clip: AssetEvidence['clips'][number]): void {
  expect(clip.duration).toBeGreaterThan(0);
  expect(clip.tracks.some(track => {
    const start = sampleTrack(track, 0);
    return [...track.times, clip.duration / 2, clip.duration].some(time => sampleTrack(track, time).some((v, i) => Math.abs(v - start[i]) > 1e-3));
  })).toBe(true);
}

export function expectAssetContinuity(actual: AssetEvidence, expected: AssetEvidence, tolerance = 1e-5): void {
  expect(actual.joints).toEqual(expected.joints);
  expect(actual.hierarchy).toEqual(expected.hierarchy);
  expect(actual.primitives.length).toBe(expected.primitives.length);
  actual.primitives.forEach((p, i) => {
    const before = expected.primitives[i];
    expect(p.name).toBe(before.name);
    expect(p.indices).toEqual(before.indices);
    expect(Object.keys(p.attributes).sort()).toEqual(Object.keys(before.attributes).sort());
    for (const key of Object.keys(p.attributes)) expectNumbersClose(p.attributes[key], before.attributes[key], tolerance);
    expectJsonClose(p.material, before.material, tolerance);
  });
  expect(actual.binds.length).toBe(expected.binds.length);
  actual.binds.forEach((bind, i) => expectNumbersClose(bind, expected.binds[i], tolerance));
  expect(actual.images).toEqual(expected.images);
  expect(actual.clips.map(c => c.name)).toEqual(expected.clips.map(c => c.name));
  actual.clips.forEach((clip, i) => {
    const before = expected.clips[i];
    expect(Math.abs(clip.duration - before.duration)).toBeLessThanOrEqual(tolerance);
    expect(clip.tracks.map(t => [t.bone, t.path])).toEqual(before.tracks.map(t => [t.bone, t.path]));
    clip.tracks.forEach((track, j) => {
      expect(track.interpolation).toBe(before.tracks[j].interpolation);
      const sameGrid = track.times.length === before.tracks[j].times.length
        && track.times.every((time, k) => time === before.tracks[j].times[k]);
      if (sameGrid) {
        const values = [...track.values];
        if (track.path === 'rotation') for (let k = 0; k < values.length; k += 4) {
          const dot = values.slice(k, k + 4).reduce((sum, value, n) => sum + value * before.tracks[j].values[k + n], 0);
          if (dot < 0) for (let n = 0; n < 4; n++) values[k + n] *= -1;
        }
        expectNumbersClose(values, before.tracks[j].values, tolerance);
      }
      const actualSamples: number[] = [], expectedSamples: number[] = [];
      const times = sameGrid ? [0, before.duration / 2, before.duration]
        : [...new Set([0, before.duration / 2, before.duration, ...track.times, ...before.tracks[j].times])];
      for (const time of times) {
        const a = sampleTrack(track, time), b = sampleTrack(before.tracks[j], time);
        if (track.path === 'rotation' && a.reduce((sum, v, k) => sum + v * b[k], 0) < 0) a.forEach((v, k) => { a[k] = -v; });
        actualSamples.push(...a); expectedSamples.push(...b);
      }
      expectNumbersClose(actualSamples, expectedSamples, tolerance);
    });
  });
}

function expectJsonClose(actual: unknown, expected: unknown, tolerance: number): void {
  if (typeof expected === 'number') {
    expect(typeof actual).toBe('number');
    expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(tolerance);
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    expect((actual as unknown[]).length).toBe(expected.length);
    expected.forEach((value, i) => expectJsonClose((actual as unknown[])[i], value, tolerance));
  } else if (expected !== null && typeof expected === 'object') {
    expect(actual !== null && typeof actual === 'object').toBe(true);
    expect(Object.keys(actual!)).toEqual(Object.keys(expected));
    for (const [key, value] of Object.entries(expected)) expectJsonClose((actual as Record<string, unknown>)[key], value, tolerance);
  } else expect(actual).toEqual(expected);
}
