export const WALK_ROOT_BODY_POLICY = 'walkSlow-root-y-to-body.v1' as const;

export interface WalkRootBodyTransferReport {
  policy: typeof WALK_ROOT_BODY_POLICY;
  clipId: string;
  keys: number;
  maximumTransferredMeters: number;
  maximumStoredWorldYErrorMeters: number;
}

interface Accessor { bufferView: number; byteOffset?: number; count: number; type: string; componentType: number; sparse?: unknown; min?: number[]; max?: number[] }
interface BufferView { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }
interface Channel { sampler: number; target: { node: number; path: string } }
interface Sampler { input: number; output: number; interpolation?: string }
interface Document {
  nodes: Array<{ name?: string; children?: number[]; rotation?: number[]; scale?: number[] }>;
  animations: Array<{ name?: string; channels: Channel[]; samplers: Sampler[] }>;
  accessors: Accessor[];
  bufferViews: BufferView[];
  buffers: Array<{ byteLength: number }>;
}

function refuse(message: string): never { throw new Error(`walkSlow root/body transfer: ${message}`); }

/** Derives the selected gait or one of its endpoint transitions without re-encoding unrelated accessors. */
export function transferWalkSlowRootYToBody(input: Uint8Array, policy: typeof WALK_ROOT_BODY_POLICY, clipId = 'walkSlow'): { bytes: Uint8Array; report: WalkRootBodyTransferReport } {
  if (policy !== WALK_ROOT_BODY_POLICY) refuse('unknown opt-in policy');
  if (clipId !== 'walkSlow' && !/^(start|stop|reversal)-walkSlow-p(0|25|50|75)$/.test(clipId)) refuse('unselected clip');
  const count = clipId === 'walkSlow' ? 91 : clipId.startsWith('reversal-') ? 2 : 7;
  const durationTicks = clipId === 'walkSlow' ? 90 : 6;
  const source = new Uint8Array(input), view = new DataView(source.buffer);
  if (source.length < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== source.length) refuse('invalid GLB header');
  const jsonLength = view.getUint32(12, true), binHeader = 20 + jsonLength;
  if (binHeader + 8 > source.length || view.getUint32(16, true) !== 0x4e4f534a || view.getUint32(binHeader + 4, true) !== 0x004e4942
    || binHeader + 8 + view.getUint32(binHeader, true) !== source.length) refuse('expected one JSON and one BIN chunk');
  let doc: Document;
  try { doc = JSON.parse(new TextDecoder().decode(source.subarray(20, binHeader))); }
  catch { refuse('invalid JSON chunk'); }
  if (!Array.isArray(doc.animations) || !Array.isArray(doc.nodes) || !Array.isArray(doc.accessors) || !Array.isArray(doc.bufferViews)
    || doc.buffers?.length !== 1 || doc.buffers[0].byteLength > source.length - binHeader - 8) refuse('unsupported GLB layout');
  const clips = doc.animations.filter(a => a.name === clipId);
  if (clips.length !== 1) refuse(`requires one ${clipId} clip`);
  const clip = clips[0], root = doc.nodes.map((n, i) => n.name === 'LocomotionRoot' ? i : -1).filter(i => i >= 0);
  const body = doc.nodes.map((n, i) => n.name === 'mixamorigHips' ? i : -1).filter(i => i >= 0);
  if (root.length !== 1 || body.length !== 1 || !doc.nodes[root[0]].children?.includes(body[0])) refuse('requires the existing root/body parent chain');
  const binStart = binHeader + 8, binLength = view.getUint32(binHeader, true);
  const rootNode = doc.nodes[root[0]];
  if (rootNode.scale && (rootNode.scale.length !== 3 || rootNode.scale.some(x => x !== 1))
    || clip.channels.some(c => c.target.node === root[0] && c.target.path === 'scale')) refuse('root scale must remain identity');
  const yawOnly = (q: number[]) => q.length === 4 && q.every(Number.isFinite) && Math.abs(q[0]) <= 1e-5 && Math.abs(q[2]) <= 1e-5
    && Math.abs(Math.hypot(...q) - 1) <= 1e-5;
  if (rootNode.rotation && !yawOnly(rootNode.rotation)) refuse('root rotation must remain yaw-only');
  const rootRotations = clip.channels.filter(c => c.target.node === root[0] && c.target.path === 'rotation');
  if (rootRotations.length > 1) refuse('ambiguous root rotation');
  if (rootRotations.length) {
    const sampler = clip.samplers[rootRotations[0].sampler], accessor = sampler && doc.accessors[sampler.output];
    const buffer = accessor && doc.bufferViews[accessor.bufferView];
    if (!sampler || sampler.interpolation !== 'LINEAR' || !accessor || accessor.type !== 'VEC4' || accessor.componentType !== 5126
      || accessor.count < 2 || accessor.count > 91 || accessor.sparse || !buffer || buffer.buffer !== 0 || buffer.byteStride) refuse('root rotation must have finite LINEAR yaw keys');
    const offset = binStart + (buffer.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    if (offset < binStart || offset + accessor.count * 16 > binStart + (buffer.byteOffset ?? 0) + buffer.byteLength || offset + accessor.count * 16 > binStart + binLength) refuse('root rotation escapes BIN chunk');
    for (let key = 0; key < accessor.count; key++) if (!yawOnly(Array.from({ length: 4 }, (_, axis) => view.getFloat32(offset + key * 16 + axis * 4, true)))) refuse('root rotation has pitch, roll or invalid yaw');
  }
  const channel = (node: number): { output: Accessor; offset: number; input: number; outputIndex: number } => {
    const selected = clip.channels.filter(c => c.target.node === node && c.target.path === 'translation');
    if (selected.length !== 1) refuse('requires one translation channel per selected joint');
    const sampler = clip.samplers[selected[0].sampler];
    if (!sampler || sampler.interpolation !== 'LINEAR') refuse('requires LINEAR translation');
    const accessor = doc.accessors[sampler.output], buffer = accessor && doc.bufferViews[accessor.bufferView];
    if (!accessor || accessor.type !== 'VEC3' || accessor.componentType !== 5126 || accessor.count !== count || accessor.sparse
      || !buffer || buffer.buffer !== 0 || buffer.byteStride) refuse(`requires ${count} packed float32 translation keys`);
    const offset = (buffer.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    if (offset < 0 || offset + count * 12 > (buffer.byteOffset ?? 0) + buffer.byteLength || offset + count * 12 > binLength || offset % 4) refuse('translation accessor escapes BIN chunk');
    return { output: accessor, offset: binStart + offset, input: sampler.input, outputIndex: sampler.output };
  };
  const a = channel(root[0]), b = channel(body[0]);
  if (a.outputIndex === b.outputIndex || Math.max(a.offset, b.offset) < Math.min(a.offset + count * 12, b.offset + count * 12)) refuse('selected accessors overlap');
  for (const selected of [a, b]) {
    const time = doc.accessors[selected.input], timeView = time && doc.bufferViews[time.bufferView];
    if (!time || time.type !== 'SCALAR' || time.componentType !== 5126 || time.count !== count || time.sparse || !timeView || timeView.buffer !== 0 || timeView.byteStride) refuse(`requires ${count} packed float32 times`);
    const timeOffset = binStart + (timeView.byteOffset ?? 0) + (time.byteOffset ?? 0);
    if (timeOffset < binStart || timeOffset + count * 4 > binStart + (timeView.byteOffset ?? 0) + timeView.byteLength || timeOffset + count * 4 > source.length) refuse('timeline escapes BIN chunk');
    for (let key = 0; key < count; key++) {
      const tick = count === 2 ? key * durationTicks : key;
      if (view.getFloat32(timeOffset + key * 4, true) !== Math.fround(tick / 60)) refuse('requires matching integer-phase keys');
    }
  }
  for (let i = 0; i < doc.accessors.length; i++) {
    if (i === a.outputIndex || i === b.outputIndex) continue;
    const other = doc.accessors[i], otherView = doc.bufferViews[other.bufferView];
    if (!otherView || otherView.buffer !== 0) continue;
    const start = binStart + (otherView.byteOffset ?? 0) + (other.byteOffset ?? 0), end = binStart + (otherView.byteOffset ?? 0) + otherView.byteLength;
    if (Math.max(start, a.offset) < Math.min(end, a.offset + count * 12) || Math.max(start, b.offset) < Math.min(end, b.offset + count * 12)) refuse('selected output overlaps another accessor view');
  }
  const binary = new Uint8Array(source), output = new DataView(binary.buffer);
  let maximumTransferredMeters = 0, maximumStoredWorldYErrorMeters = 0;
  for (let tick = 0; tick < count; tick++) {
    const rootY = view.getFloat32(a.offset + tick * 12 + 4, true), bodyY = view.getFloat32(b.offset + tick * 12 + 4, true);
    if (!Number.isFinite(rootY) || !Number.isFinite(bodyY)) refuse('non-finite selected translation');
    const nextBodyY = Math.fround(bodyY + rootY);
    if (!Number.isFinite(nextBodyY)) refuse('transferred translation is not finite');
    output.setFloat32(a.offset + tick * 12 + 4, 0, true);
    output.setFloat32(b.offset + tick * 12 + 4, nextBodyY, true);
    maximumTransferredMeters = Math.max(maximumTransferredMeters, Math.abs(rootY));
    maximumStoredWorldYErrorMeters = Math.max(maximumStoredWorldYErrorMeters, Math.abs(nextBodyY - bodyY - rootY));
  }
  for (const selected of [a, b]) {
    selected.output.min = [Infinity, Infinity, Infinity]; selected.output.max = [-Infinity, -Infinity, -Infinity];
    for (let tick = 0; tick < count; tick++) for (let axis = 0; axis < 3; axis++) {
      const value = output.getFloat32(selected.offset + tick * 12 + axis * 4, true);
      selected.output.min[axis] = Math.min(selected.output.min[axis], value);
      selected.output.max[axis] = Math.max(selected.output.max[axis], value);
    }
  }
  const encoded = new TextEncoder().encode(JSON.stringify(doc)), padded = Math.ceil(encoded.length / 4) * 4;
  const result = new Uint8Array(20 + padded + binary.length - binHeader);
  result.set(source.subarray(0, 20)); result.fill(32, 20, 20 + padded); result.set(encoded, 20);
  result.set(binary.subarray(binHeader), 20 + padded);
  const header = new DataView(result.buffer); header.setUint32(8, result.length, true); header.setUint32(12, padded, true);
  return { bytes: result, report: { policy, clipId, keys: count, maximumTransferredMeters, maximumStoredWorldYErrorMeters } };
}
