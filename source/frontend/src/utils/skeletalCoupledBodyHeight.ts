import * as THREE from 'three';
import profile from './walkSlowCoupledBodyHeight.v1.json';
import { rotationDifferenceDegrees } from './skeletalTerminalRotation';
import type { LoadedModel } from '../loaders/glb';

export const COUPLED_BODY_HEIGHT_POLICY = 'walkSlow-coupled-body-height.v1' as const;
export const COUPLED_BODY_HEIGHT_PROFILE_SHA256 = 'dacbc3589777961f794fe8d27d80bb9ea72c4090779757c57f0a60d31fca1cd4';
export const COUPLED_BODY_HEIGHT_SOURCE_SHA256 = '32837faf217be2f58aeba35a6d5d70352f7dc2d077e400cc4349a82a8bc3eeae';

export interface CoupledBodyHeightRecipe { policy: typeof COUPLED_BODY_HEIGHT_POLICY }
export interface CoupledBodyHeightSegment {
  accessor: number;
  joint: string;
  path: 'translation' | 'rotation';
  firstTick: number;
  lastTick: number;
  beforeBase64: string;
  afterBase64: string;
}
export interface CoupledBodyHeightReport {
  policy: typeof COUPLED_BODY_HEIGHT_POLICY;
  clipId: 'walkSlow';
  sourceModelSha256: string;
  profileSha256: string;
  sourceCandidateSha256: string;
  masks: { hipY: [51, 56]; leftRotations: [46, 56]; rightRotations: [51, 56]; rightSpanOverlap: [51, 56] };
  caps: { hipDownMeters: 0.2; leftDegrees: 65; rightDegrees: 25 };
  maxima: { hipDownMeters: number; leftDegrees: number; rightDegrees: number };
  segments: CoupledBodyHeightSegment[];
}

const fail = (reason: string): never => { throw new Error(`walkSlow coupled body height: ${reason}`); };
const expected = [
  { accessor: 95, joint: 'mixamorigHips', path: 'translation', firstTick: 51, lastTick: 56 },
  { accessor: 101, joint: 'mixamorigRightUpLeg', path: 'rotation', firstTick: 50, lastTick: 57 },
  { accessor: 105, joint: 'mixamorigLeftUpLeg', path: 'rotation', firstTick: 45, lastTick: 57 },
  { accessor: 109, joint: 'mixamorigLeftLeg', path: 'rotation', firstTick: 45, lastTick: 57 },
  { accessor: 113, joint: 'mixamorigRightLeg', path: 'rotation', firstTick: 50, lastTick: 57 },
  { accessor: 117, joint: 'mixamorigRightFoot', path: 'rotation', firstTick: 50, lastTick: 57 },
  { accessor: 121, joint: 'mixamorigLeftFoot', path: 'rotation', firstTick: 45, lastTick: 57 },
] as const;

export function parseCoupledBodyHeight(value: unknown): CoupledBodyHeightRecipe {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).join(',') !== 'policy'
    || (value as { policy?: unknown }).policy !== COUPLED_BODY_HEIGHT_POLICY) fail('unsupported recipe');
  return { policy: COUPLED_BODY_HEIGHT_POLICY };
}

function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  if (btoa(binary) !== base64) fail('noncanonical profile segment');
  return bytes;
}

function encode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

interface Accessor { bufferView: number; byteOffset?: number; count: number; type: string; componentType: number; sparse?: unknown; min?: number[]; max?: number[] }
interface BufferView { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }
interface Animation { name?: string; channels: Array<{ sampler: number; target: { node: number; path: string } }>; samplers: Array<{ input: number; output: number; interpolation?: string }> }
interface Document { buffers: Array<{ byteLength: number; uri?: string }>; bufferViews: BufferView[]; accessors: Accessor[]; animations: Animation[]; nodes: Array<{ name?: string; children?: number[] }> }

function glb(input: Uint8Array): { doc: Document; binStart: number; binLength: number } {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (input.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== input.byteLength || view.getUint32(16, true) !== 0x4e4f534a) fail('invalid GLB header');
  const length = view.getUint32(12, true), binHeader = 20 + length;
  if (length % 4 || binHeader + 8 > input.byteLength || view.getUint32(binHeader + 4, true) !== 0x004e4942
    || binHeader + 8 + view.getUint32(binHeader, true) !== input.byteLength) fail('expected one JSON and one BIN chunk');
  let doc: Document;
  try { doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input.subarray(20, binHeader))) as Document; }
  catch { fail('invalid JSON chunk'); }
  if (!Array.isArray(doc!.buffers) || doc!.buffers.length !== 1 || doc!.buffers[0].uri
    || !Array.isArray(doc!.bufferViews) || !Array.isArray(doc!.accessors) || !Array.isArray(doc!.animations)
    || !Array.isArray(doc!.nodes)) fail('unsupported GLB layout');
  return { doc: doc!, binStart: binHeader + 8, binLength: view.getUint32(binHeader, true) };
}

function offset(doc: Document, accessorIndex: number, binLength: number): number {
  const accessor = doc.accessors[accessorIndex], buffer = accessor && doc.bufferViews[accessor.bufferView];
  const width = accessorIndex === 95 ? 3 : 4;
  if (!accessor || !buffer || buffer.buffer !== 0 || buffer.byteStride || accessor.sparse
    || accessor.componentType !== 5126 || accessor.type !== (width === 3 ? 'VEC3' : 'VEC4')
    || accessor.count !== (width === 3 ? 91 : 273)) fail('unsupported selected accessor layout');
  const start = (buffer.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  if (!Number.isSafeInteger(start) || start < 0 || start % 4 || start + accessor.count * width * 4 > binLength
    || start + accessor.count * width * 4 > (buffer.byteOffset ?? 0) + buffer.byteLength) fail('selected accessor escapes BIN chunk');
  return start;
}

function bounds(view: DataView, binStart: number, start: number, count: number, width: number): { min: number[]; max: number[] } {
  const min = Array(width).fill(Infinity), max = Array(width).fill(-Infinity);
  for (let key = 0; key < count; key++) for (let component = 0; component < width; component++) {
    const value = view.getFloat32(binStart + start + (key * width + component) * 4, true);
    if (!Number.isFinite(value)) fail('non-finite selected accessor');
    min[component] = Math.min(min[component], value); max[component] = Math.max(max[component], value);
  }
  return { min, max };
}

export function bakeCoupledBodyHeight(input: Uint8Array, sourceSha256: string, recipe: CoupledBodyHeightRecipe): { bytes: Uint8Array; report: CoupledBodyHeightReport } {
  parseCoupledBodyHeight(recipe);
  if (sourceSha256 !== COUPLED_BODY_HEIGHT_SOURCE_SHA256 || profile.sourceModelSha256 !== sourceSha256
    || profile.policy !== COUPLED_BODY_HEIGHT_POLICY || profile.segments.length !== expected.length) fail('foreign source or profile');
  const source = new Uint8Array(input), { doc, binStart, binLength } = glb(source);
  const sourceView = new DataView(source.buffer), clips = doc.animations.filter(clip => clip.name === 'walkSlow');
  const root = doc.nodes.flatMap((node, index) => node.name === 'LocomotionRoot' ? [index] : []);
  const hips = doc.nodes.flatMap((node, index) => node.name === 'mixamorigHips' ? [index] : []);
  if (clips.length !== 1 || root.length !== 1 || hips.length !== 1 || !doc.nodes[root[0]].children?.includes(hips[0])) fail('missing canonical clip or root hierarchy');
  const clip = clips[0], nextBin = new Uint8Array(source.subarray(binStart)), nextView = new DataView(nextBin.buffer);
  const segments: CoupledBodyHeightSegment[] = [];
  let hipDownMeters = 0, leftDegrees = 0, rightDegrees = 0;
  for (const [index, spec] of expected.entries()) {
    const stored = profile.segments[index];
    if (stored.accessor !== spec.accessor || stored.firstTick !== spec.firstTick || stored.lastTick !== spec.lastTick) fail('profile mask differs');
    const nodes = doc.nodes.flatMap((node, index) => node.name === spec.joint ? [index] : []);
    const channels = clip.channels.filter(channel => channel.target.node === nodes[0] && channel.target.path === spec.path);
    if (nodes.length !== 1 || channels.length !== 1) fail('missing or ambiguous selected channel');
    const sampler = clip.samplers[channels[0].sampler];
    if (!sampler || sampler.output !== spec.accessor || sampler.interpolation !== (spec.path === 'translation' ? 'LINEAR' : 'CUBICSPLINE')) fail('selected sampler mismatch');
    const time = doc.accessors[sampler.input], timeBuffer = time && doc.bufferViews[time.bufferView];
    if (!time || !timeBuffer || time.type !== 'SCALAR' || time.componentType !== 5126 || time.count !== 91 || time.sparse
      || timeBuffer.buffer !== 0 || timeBuffer.byteStride) fail('selected timeline mismatch');
    const timeStart = (timeBuffer.byteOffset ?? 0) + (time.byteOffset ?? 0);
    if (timeStart < 0 || timeStart + 91 * 4 > binLength) fail('selected timeline escapes BIN chunk');
    for (let tick = 0; tick <= 90; tick++) if (sourceView.getFloat32(binStart + timeStart + tick * 4, true) !== Math.fround(tick / 60)) fail('noncanonical selected timeline');
    const width = spec.path === 'translation' ? 3 : 12;
    const start = offset(doc, spec.accessor, binLength) + spec.firstTick * width * 4;
    const length = (spec.lastTick - spec.firstTick + 1) * width * 4;
    const before = source.subarray(binStart + start, binStart + start + length), after = decode(stored.afterBase64);
    if (after.byteLength !== length || before.byteLength !== length || encode(before) !== stored.beforeBase64) fail('profile segment/source mismatch');
    const beforeView = new DataView(before.buffer, before.byteOffset, before.byteLength);
    const afterView = new DataView(after.buffer, after.byteOffset, after.byteLength);
    for (let tick = spec.firstTick; tick <= spec.lastTick; tick++) {
      const local = tick - spec.firstTick;
      if (spec.path === 'translation') {
        for (const component of [0, 2]) if (beforeView.getFloat32((local * 3 + component) * 4, true) !== afterView.getFloat32((local * 3 + component) * 4, true)) fail('hip X/Z changed');
        const delta = beforeView.getFloat32((local * 3 + 1) * 4, true) - afterView.getFloat32((local * 3 + 1) * 4, true);
        if (delta < 0 || delta > 0.2) fail('hip correction exceeds down-only cap');
        hipDownMeters = Math.max(hipDownMeters, delta);
      } else {
        const selected = tick >= (spec.joint.includes('Left') ? 46 : 51) && tick <= 56;
        for (let part = 0; part < 3; part++) {
          if ((!selected && part === 1) || (tick === Number(spec.firstTick) && part !== 2)
            || (tick === Number(spec.lastTick) && part !== 0)) {
            for (let c = 0; c < 4; c++) if (beforeView.getFloat32((local * 12 + part * 4 + c) * 4, true) !== afterView.getFloat32((local * 12 + part * 4 + c) * 4, true)) fail('fixed neighbor changed');
          }
        }
        if (selected) {
          const values = (view: DataView) => Array.from({ length: 4 }, (_, c) => view.getFloat32((local * 12 + 4 + c) * 4, true));
          const prior = values(beforeView), next = values(afterView);
          if (Math.abs(Math.hypot(...next) - 1) > 1e-4) fail('nonunit selected quaternion');
          const degrees = rotationDifferenceDegrees(prior, next);
          if (!Number.isFinite(degrees) || degrees > (spec.joint.includes('Left') ? 65 : 25)) fail('leg correction exceeds cap');
          if (spec.joint.includes('Left')) leftDegrees = Math.max(leftDegrees, degrees); else rightDegrees = Math.max(rightDegrees, degrees);
        }
      }
    }
    nextBin.set(after, start);
    segments.push({ ...spec, beforeBase64: encode(before), afterBase64: stored.afterBase64 });
    const accessor = doc.accessors[spec.accessor], carrierStart = offset(doc, spec.accessor, binLength);
    const nextBounds = bounds(nextView, 0, carrierStart, accessor.count, spec.path === 'translation' ? 3 : 4);
    accessor.min = nextBounds.min; accessor.max = nextBounds.max;
  }
  if (hipDownMeters === 0 || leftDegrees === 0 || rightDegrees === 0) fail('profile had no coupled correction');
  const json = new TextEncoder().encode(JSON.stringify(doc)), padded = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(28 + padded + nextBin.byteLength), output = new DataView(bytes.buffer);
  output.setUint32(0, 0x46546c67, true); output.setUint32(4, 2, true); output.setUint32(8, bytes.byteLength, true);
  output.setUint32(12, padded, true); output.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + padded); bytes.set(json, 20);
  output.setUint32(20 + padded, nextBin.byteLength, true); output.setUint32(24 + padded, 0x004e4942, true); bytes.set(nextBin, 28 + padded);
  return { bytes, report: { policy: COUPLED_BODY_HEIGHT_POLICY, clipId: 'walkSlow', sourceModelSha256: sourceSha256,
    profileSha256: COUPLED_BODY_HEIGHT_PROFILE_SHA256, sourceCandidateSha256: profile.privateCandidateSha256,
    masks: { hipY: [51, 56], leftRotations: [46, 56], rightRotations: [51, 56], rightSpanOverlap: [51, 56] },
    caps: { hipDownMeters: 0.2, leftDegrees: 65, rightDegrees: 25 },
    maxima: { hipDownMeters, leftDegrees, rightDegrees }, segments } };
}

export function restoreCoupledBodyHeightClip(clip: THREE.AnimationClip, report: CoupledBodyHeightReport): THREE.AnimationClip {
  if (clip.name !== 'walkSlow' || report.policy !== COUPLED_BODY_HEIGHT_POLICY
    || report.profileSha256 !== COUPLED_BODY_HEIGHT_PROFILE_SHA256 || report.sourceModelSha256 !== COUPLED_BODY_HEIGHT_SOURCE_SHA256
    || report.segments.length !== expected.length
    || JSON.stringify(report.masks) !== JSON.stringify({ hipY: [51, 56], leftRotations: [46, 56], rightRotations: [51, 56], rightSpanOverlap: [51, 56] })
    || JSON.stringify(report.caps) !== JSON.stringify({ hipDownMeters: 0.2, leftDegrees: 65, rightDegrees: 25 })) fail('invalid export-boundary report');
  const replacements = new Map<string, THREE.KeyframeTrack>();
  for (const [index, spec] of expected.entries()) {
    const segment = report.segments[index], name = `${spec.joint}.${spec.path === 'translation' ? 'position' : 'quaternion'}`;
    if (segment.accessor !== spec.accessor || segment.joint !== spec.joint || segment.path !== spec.path
      || segment.firstTick !== spec.firstTick || segment.lastTick !== spec.lastTick
      || segment.beforeBase64 !== profile.segments[index].beforeBase64
      || segment.afterBase64 !== profile.segments[index].afterBase64) fail('invalid export-boundary mask');
    const tracks = clip.tracks.filter(track => track.name === name);
    if (tracks.length !== 1 || tracks[0].times.length !== 91) fail('missing export-boundary carrier');
    const track = tracks[0], clone = track.clone(), width = spec.path === 'translation' ? 3 : 12;
    const before = decode(segment.beforeBase64), after = decode(segment.afterBase64);
    if (before.byteLength !== after.byteLength || before.byteLength !== (spec.lastTick - spec.firstTick + 1) * width * 4) fail('invalid export-boundary segment size');
    const beforeView = new DataView(before.buffer), afterView = new DataView(after.buffer);
    for (let key = 0; key <= spec.lastTick - spec.firstTick; key++) for (let component = 0; component < width; component++) {
      const offset = (key * width + component) * 4, target = (spec.firstTick + key) * width + component;
      if (track.values[target] !== afterView.getFloat32(offset, true)) fail('loaded export-boundary carrier differs');
      clone.values[target] = beforeView.getFloat32(offset, true);
    }
    replacements.set(name, clone);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.map(track => replacements.get(track.name) ?? track));
}

export function measureCoupledBodyHeightFidelity(before: LoadedModel, after: LoadedModel, report: CoupledBodyHeightReport): {
  exactOtherClips: number; exactOtherTracks: number; exactUnselectedQuaternionKeys: number;
  exactP50TransitionClips: number; exactP50TransitionTracks: number;
  exactRootTracks: number; exactHipXzKeys: number; exactHipEndpoint90: boolean;
} {
  if (before.clips.length !== after.clips.length || before.clips.length !== 46
    || before.clips.some((clip, index) => clip.name !== after.clips[index].name)) fail('reloaded clip lineage differs');
  const result = { exactOtherClips: 0, exactOtherTracks: 0, exactUnselectedQuaternionKeys: 0,
    exactP50TransitionClips: 0, exactP50TransitionTracks: 0, exactRootTracks: 0, exactHipXzKeys: 0, exactHipEndpoint90: false };
  const names = new Set(expected.map(item => `${item.joint}.${item.path === 'translation' ? 'position' : 'quaternion'}`));
  for (let clipIndex = 0; clipIndex < before.clips.length; clipIndex++) {
    const prior = before.clips[clipIndex], next = after.clips[clipIndex];
    if (prior.tracks.length !== next.tracks.length) fail('reloaded track lineage differs');
    if (prior.name !== 'walkSlow') result.exactOtherClips++;
    const p50 = /^(start|stop|reversal)-walkSlow-p50$/.test(prior.name);
    if (p50) result.exactP50TransitionClips++;
    for (let trackIndex = 0; trackIndex < prior.tracks.length; trackIndex++) {
      const a = prior.tracks[trackIndex], b = next.tracks[trackIndex];
      if (a.name !== b.name || a.getInterpolation() !== b.getInterpolation()
        || a.times.length !== b.times.length || a.values.length !== b.values.length
        || Array.from(a.times).some((value, index) => value !== b.times[index])) fail('reloaded track shape differs');
      const selected = prior.name === 'walkSlow' && names.has(a.name);
      if (!selected && Array.from(a.values).some((value, index) => value !== b.values[index])) fail('unselected track changed');
      if (!selected) result.exactOtherTracks++;
      if (p50) result.exactP50TransitionTracks++;
      if (a.name === 'LocomotionRoot.position' || a.name === 'LocomotionRoot.quaternion') result.exactRootTracks++;
      if (!selected) continue;
      const spec = expected.find(item => `${item.joint}.${item.path === 'translation' ? 'position' : 'quaternion'}` === a.name)!;
      const width = spec.path === 'translation' ? 3 : 12;
      if (a.values.length !== 91 * width) fail('reloaded selected track size differs');
      for (let tick = 0; tick <= 90; tick++) for (let component = 0; component < width; component++) {
        const changed = a.values[tick * width + component] !== b.values[tick * width + component];
        const allowed = spec.path === 'translation'
          ? tick >= 51 && tick <= 56 && component === 1
          : (tick >= (spec.joint.includes('Left') ? 46 : 51) && tick <= 56)
            || (tick === spec.firstTick && component >= 8)
            || (tick === spec.lastTick && component < 4);
        if (changed && !allowed) fail('selected track changed outside declared interpolation footprint');
        if (spec.path === 'translation' && (component === 0 || component === 2)) result.exactHipXzKeys++;
      }
      if (spec.path === 'rotation') result.exactUnselectedQuaternionKeys += 91 - (spec.joint.includes('Left') ? 11 : 6);
      if (spec.path === 'translation') result.exactHipEndpoint90 = a.values[90 * 3 + 1] === b.values[90 * 3 + 1];
    }
  }
  if (result.exactOtherClips !== 45 || result.exactOtherTracks !== 1227 || result.exactUnselectedQuaternionKeys !== 495
    || result.exactP50TransitionClips !== 3 || result.exactP50TransitionTracks !== 78 || !result.exactHipEndpoint90
    || report.maxima.hipDownMeters > 0.2 || report.maxima.leftDegrees > 65 || report.maxima.rightDegrees > 25)
    fail(`loaded preservation witness differs: ${JSON.stringify(result)}`);
  return result;
}
