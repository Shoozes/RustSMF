import * as THREE from 'three';
import type { LoadedModel } from '../loaders/glb';
import { measureConditioningDifferences } from './skeletalConditioningFidelity';

export const HIP_Y_LOOP_ENDPOINT_POLICY = 'walkSlow-hip-y-loop-endpoint.v1' as const;

export interface HipYLoopEndpointRecipe {
  policy: typeof HIP_Y_LOOP_ENDPOINT_POLICY;
  clipId: 'walkSlow';
  joint: 'mixamorigHips';
  maxCorrectionMeters: number;
}

export interface HipYLoopEndpointReport {
  policy: typeof HIP_Y_LOOP_ENDPOINT_POLICY;
  clipId: 'walkSlow';
  joint: 'mixamorigHips';
  tick: 90;
  keys: 91;
  interpolation: 'LINEAR';
  maxCorrectionMeters: number;
  beforeY: number;
  requestedY: number;
  storedY: number;
  storedCorrectionMeters: number;
  accessorIndex: number;
  sourceByteOffset: number;
  byteOffset: number;
  binOffsetDelta: number;
  beforeMax: number[];
  storedMax: number[];
}

export function validateHipYLoopEndpointReport(report: HipYLoopEndpointReport): HipYLoopEndpointReport {
  if (!report || typeof report !== 'object' || Array.isArray(report)) fail('invalid endpoint fidelity report');
  const spec = parseHipYLoopEndpoint({ policy: report?.policy, clipId: report?.clipId, joint: report?.joint, maxCorrectionMeters: report?.maxCorrectionMeters });
  if (Object.keys(report).sort().join(',') !== 'accessorIndex,beforeMax,beforeY,binOffsetDelta,byteOffset,clipId,interpolation,joint,keys,maxCorrectionMeters,policy,requestedY,sourceByteOffset,storedCorrectionMeters,storedMax,storedY,tick'
    || report.tick !== 90 || report.keys !== 91 || report.interpolation !== 'LINEAR'
    || !Number.isInteger(report.accessorIndex) || report.accessorIndex < 0
    || !Number.isSafeInteger(report.sourceByteOffset) || !Number.isSafeInteger(report.byteOffset)
    || !Number.isSafeInteger(report.binOffsetDelta) || report.byteOffset - report.sourceByteOffset !== report.binOffsetDelta
    || ![report.beforeY, report.requestedY, report.storedY, report.storedCorrectionMeters].every(Number.isFinite)
    || report.requestedY !== report.storedY || report.storedCorrectionMeters !== report.storedY - report.beforeY
    || Math.abs(report.storedCorrectionMeters) > spec.maxCorrectionMeters
    || !Array.isArray(report.beforeMax) || !Array.isArray(report.storedMax)
    || report.beforeMax.length !== 3 || report.storedMax.length !== 3
    || [...report.beforeMax, ...report.storedMax].some(value => !Number.isFinite(value))) fail('invalid endpoint fidelity report');
  return report;
}

export function restoreHipYLoopEndpointClip(clip: THREE.AnimationClip, report: HipYLoopEndpointReport): THREE.AnimationClip {
  validateHipYLoopEndpointReport(report);
  if (clip.name !== report.clipId || Math.round(clip.duration * 60) !== 90) fail('endpoint report clip/duration mismatch');
  const tracks = clip.tracks.filter(track => track.name === `${report.joint}.position`);
  if (tracks.length !== 1 || tracks[0].ValueTypeName !== 'vector' || tracks[0].getInterpolation() !== THREE.InterpolateLinear
    || tracks[0].times.length !== 91 || tracks[0].values.length !== 273
    || Array.from(tracks[0].times).some((time, tick) => time !== Math.fround(tick / 60))
    || tracks[0].values[1] !== report.storedY || tracks[0].values[90 * 3 + 1] !== report.storedY) fail('endpoint report differs from loaded carrier');
  const restored = tracks[0].clone(); restored.values[90 * 3 + 1] = report.beforeY;
  return new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.map(track => track === tracks[0] ? restored : track));
}

const fail = (reason: string): never => { throw new Error(`walkSlow hip-Y loop endpoint: ${reason}`); };
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected a recipe object');
  return value as Record<string, unknown>;
};

export function parseHipYLoopEndpoint(value: unknown): HipYLoopEndpointRecipe {
  const spec = record(value);
  if (Object.keys(spec).sort().join(',') !== 'clipId,joint,maxCorrectionMeters,policy'
    || spec.policy !== HIP_Y_LOOP_ENDPOINT_POLICY || spec.clipId !== 'walkSlow' || spec.joint !== 'mixamorigHips'
    || typeof spec.maxCorrectionMeters !== 'number' || !Number.isFinite(spec.maxCorrectionMeters)
    || spec.maxCorrectionMeters <= 0 || spec.maxCorrectionMeters > .24) fail('invalid or unsupported recipe');
  return { policy: HIP_Y_LOOP_ENDPOINT_POLICY, clipId: 'walkSlow', joint: 'mixamorigHips', maxCorrectionMeters: spec.maxCorrectionMeters as number };
}

interface Accessor { bufferView: number; byteOffset?: number; count: number; type: string; componentType: number; sparse?: unknown; min?: number[]; max?: number[] }
interface BufferView { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }
interface Animation { name?: string; channels: Array<{ sampler: number; target: { node: number; path: string } }>; samplers: Array<{ input: number; output: number; interpolation?: string }> }
interface Document { buffers: Array<{ byteLength: number; uri?: string }>; bufferViews: BufferView[]; accessors: Accessor[]; animations: Animation[]; nodes: Array<{ name?: string; children?: number[] }>;
  meshes?: Array<{ primitives: Array<{ attributes: Record<string, number>; indices?: number; targets?: Array<Record<string, number>> }> }>;
  skins?: Array<{ inverseBindMatrices?: number }> }

/** Change the one existing float32 component; preserve all other BIN bytes and JSON values. */
export function bakeHipYLoopEndpoint(input: Uint8Array, recipe: HipYLoopEndpointRecipe): { bytes: Uint8Array; report: HipYLoopEndpointReport } {
  const spec = parseHipYLoopEndpoint(recipe), source = new Uint8Array(input), data = new DataView(source.buffer);
  if (source.length < 28 || data.getUint32(0, true) !== 0x46546c67 || data.getUint32(4, true) !== 2
    || data.getUint32(8, true) !== source.length || data.getUint32(16, true) !== 0x4e4f534a) fail('invalid GLB header');
  const jsonLength = data.getUint32(12, true), binHeader = 20 + jsonLength;
  if (jsonLength % 4 || binHeader + 8 > source.length || data.getUint32(binHeader + 4, true) !== 0x004e4942
    || binHeader + 8 + data.getUint32(binHeader, true) !== source.length) fail('expected one JSON and one BIN chunk');
  const binStart = binHeader + 8, binLength = data.getUint32(binHeader, true);
  let doc!: Document;
  try { doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(source.subarray(20, binHeader))) as Document; }
  catch { fail('invalid JSON chunk'); }
  if (!Array.isArray(doc.buffers) || doc.buffers.length !== 1 || doc.buffers[0].uri || doc.buffers[0].byteLength > binLength
    || !Array.isArray(doc.bufferViews) || !Array.isArray(doc.accessors) || !Array.isArray(doc.animations) || !Array.isArray(doc.nodes)) fail('unsupported GLB layout');
  const root = doc.nodes.flatMap((node, index) => node.name === 'LocomotionRoot' ? [index] : []);
  const hips = doc.nodes.flatMap((node, index) => node.name === spec.joint ? [index] : []);
  if (root.length !== 1 || hips.length !== 1 || !doc.nodes[root[0]].children?.includes(hips[0])) fail('requires the direct root/hip carrier');
  const clips = doc.animations.filter(animation => animation.name === spec.clipId);
  if (clips.length !== 1) fail('requires one walkSlow clip');
  const clip = clips[0];
  const channel = (node: number) => {
    const channels = clip.channels.filter(c => c.target.node === node && c.target.path === 'translation');
    if (channels.length !== 1) fail('requires one translation channel per selected joint');
    const sampler = clip.samplers[channels[0].sampler], accessor = sampler && doc.accessors[sampler.output];
    const buffer = accessor && doc.bufferViews[accessor.bufferView];
    if (!sampler || sampler.interpolation !== 'LINEAR' || !accessor || accessor.type !== 'VEC3'
      || accessor.componentType !== 5126 || accessor.count !== 91 || accessor.sparse || !buffer
      || buffer.buffer !== 0 || buffer.byteStride) fail('requires 91 packed LINEAR float32 translation keys');
    const offset = (buffer.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset % 4 || offset + 91 * 12 > (buffer.byteOffset ?? 0) + buffer.byteLength
      || offset + 91 * 12 > binLength) fail('translation accessor escapes BIN chunk');
    const times = doc.accessors[sampler.input], timeView = times && doc.bufferViews[times.bufferView];
    if (!times || times.type !== 'SCALAR' || times.componentType !== 5126 || times.count !== 91 || times.sparse
      || !timeView || timeView.buffer !== 0 || timeView.byteStride) fail('requires 91 packed float32 times');
    const timeOffset = (timeView.byteOffset ?? 0) + (times.byteOffset ?? 0);
    if (!Number.isSafeInteger(timeOffset) || timeOffset < 0 || timeOffset % 4
      || timeOffset + 91 * 4 > (timeView.byteOffset ?? 0) + timeView.byteLength || timeOffset + 91 * 4 > binLength) fail('timeline escapes BIN chunk');
    for (let tick = 0; tick <= 90; tick++) if (data.getFloat32(binStart + timeOffset + tick * 4, true) !== Math.fround(tick / 60)) fail('requires canonical 60 Hz keys');
    return { accessor, index: sampler.output, start: offset, end: offset + 91 * 12 };
  };
  const rootChannel = channel(root[0]), hipChannel = channel(hips[0]);
  if (Math.max(rootChannel.start, hipChannel.start) < Math.min(rootChannel.end, hipChannel.end)) fail('selected accessors overlap');
  let uses = 0;
  for (const animation of doc.animations) for (const animationChannel of animation.channels) {
    const selectedSampler = animation.samplers[animationChannel.sampler];
    if (!selectedSampler) fail('invalid animation sampler reference');
    if (selectedSampler.input === hipChannel.index) fail('selected carrier is shared with a timeline');
    if (selectedSampler.output !== hipChannel.index) continue;
    uses++;
    if (animation !== clip || animationChannel.target.node !== hips[0] || animationChannel.target.path !== 'translation') fail('selected carrier is shared by another animation channel');
  }
  const samplerUses = doc.animations.reduce((total, animation) => total + animation.samplers.filter(sampler => sampler.output === hipChannel.index).length, 0);
  if (uses !== 1 || samplerUses !== 1) fail('selected carrier has ambiguous sampler use');
  for (const mesh of doc.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    if (Object.values(primitive.attributes ?? {}).includes(hipChannel.index) || primitive.indices === hipChannel.index
      || (primitive.targets ?? []).some(target => Object.values(target).includes(hipChannel.index))) fail('selected carrier is shared with mesh data');
  }
  if ((doc.skins ?? []).some(skin => skin.inverseBindMatrices === hipChannel.index)) fail('selected carrier is shared with skin data');
  for (let index = 0; index < doc.accessors.length; index++) {
    if (index === hipChannel.index || index === rootChannel.index) continue;
    const other = doc.accessors[index], otherView = other && doc.bufferViews[other.bufferView];
    if (!otherView || otherView.buffer !== 0) continue;
    const start = (otherView.byteOffset ?? 0) + (other.byteOffset ?? 0), end = (otherView.byteOffset ?? 0) + otherView.byteLength;
    if (Math.max(start, hipChannel.start) < Math.min(end, hipChannel.end)
      || Math.max(start, rootChannel.start) < Math.min(end, rootChannel.end)) fail('selected output overlaps another accessor view');
  }
  const triples = (channel: typeof hipChannel) => Array.from({ length: 91 }, (_, tick) => Array.from({ length: 3 }, (_, axis) => data.getFloat32(binStart + channel.start + tick * 12 + axis * 4, true)));
  const rootValues = triples(rootChannel), hipsValues = triples(hipChannel);
  if (rootValues.some(row => row.some(v => !Number.isFinite(v)) || row[1] !== 0)
    || hipsValues.some(row => row.some(v => !Number.isFinite(v)))) fail('requires zero root Y and finite carrier values');
  const bounds = (values: number[][]) => ({ min: [0, 1, 2].map(axis => Math.min(...values.map(row => row[axis]))), max: [0, 1, 2].map(axis => Math.max(...values.map(row => row[axis]))) });
  const beforeBounds = bounds(hipsValues);
  if (JSON.stringify(hipChannel.accessor.min) !== JSON.stringify(beforeBounds.min)
    || JSON.stringify(hipChannel.accessor.max) !== JSON.stringify(beforeBounds.max)) fail('stale carrier accessor bounds');
  const beforeY = hipsValues[90][1], requestedY = hipsValues[0][1], storedY = Math.fround(requestedY);
  const correction = storedY - beforeY;
  if (Math.abs(correction) > spec.maxCorrectionMeters || correction === 0) fail('endpoint correction exceeds cap or is already applied');
  hipsValues[90][1] = storedY;
  const afterBounds = bounds(hipsValues);
  hipChannel.accessor.max = afterBounds.max; hipChannel.accessor.min = afterBounds.min;
  const encoded = new TextEncoder().encode(JSON.stringify(doc));
  const padded = Math.ceil(encoded.length / 4) * 4, nextBinHeader = 20 + padded;
  const bytes = new Uint8Array(nextBinHeader + source.length - binHeader);
  bytes.set(source.subarray(0, 20)); bytes.fill(32, 20, nextBinHeader); bytes.set(encoded, 20);
  bytes.set(source.subarray(binHeader), nextBinHeader);
  const output = new DataView(bytes.buffer);
  output.setUint32(8, bytes.length, true); output.setUint32(12, padded, true);
  const sourceByteOffset = binStart + hipChannel.start + 90 * 12 + 4;
  const byteOffset = nextBinHeader + 8 + hipChannel.start + 90 * 12 + 4;
  output.setFloat32(byteOffset, storedY, true);
  return { bytes, report: { policy: spec.policy, clipId: spec.clipId, joint: spec.joint, tick: 90, keys: 91,
    interpolation: 'LINEAR', maxCorrectionMeters: spec.maxCorrectionMeters, beforeY, requestedY, storedY,
    storedCorrectionMeters: correction, accessorIndex: hipChannel.index, sourceByteOffset, byteOffset,
    binOffsetDelta: padded - jsonLength,
    beforeMax: beforeBounds.max, storedMax: afterBounds.max } };
}

/** Prove the declared endpoint world-pose change while retaining all older source-fidelity checks. */
export function measureHipYLoopEndpointFidelity(original: LoadedModel, derived: LoadedModel, recipe: HipYLoopEndpointRecipe, report: HipYLoopEndpointReport) {
  const spec = parseHipYLoopEndpoint(recipe);
  validateHipYLoopEndpointReport(report);
  if (report.policy !== spec.policy || report.clipId !== spec.clipId || report.joint !== spec.joint
    || report.maxCorrectionMeters !== spec.maxCorrectionMeters) fail('invalid endpoint fidelity selection');
  const clipA = original.clips.filter(c => c.name === spec.clipId), clipB = derived.clips.filter(c => c.name === spec.clipId);
  if (clipA.length !== 1 || clipB.length !== 1 || !original.skeleton || !derived.skeleton
    || original.skeleton.bones.map(b => b.name).join('\0') !== derived.skeleton.bones.map(b => b.name).join('\0')
    || original.skinnedMeshes.length !== derived.skinnedMeshes.length) fail('incompatible fidelity inputs');
  const carrier = (clip: THREE.AnimationClip) => {
    const matches = clip.tracks.filter(t => t.name === `${spec.joint}.position`);
    if (matches.length !== 1 || matches[0].ValueTypeName !== 'vector' || matches[0].getInterpolation() !== THREE.InterpolateLinear
      || matches[0].times.length !== 91 || matches[0].values.length !== 273
      || Array.from(matches[0].times).some((time, tick) => time !== Math.fround(tick / 60))) fail('invalid loaded endpoint carrier');
    return matches[0];
  };
  const before = carrier(clipA[0]), after = carrier(clipB[0]);
  if (before.values[90 * 3 + 1] !== report.beforeY || after.values[90 * 3 + 1] !== report.storedY
    || before.values[1] !== report.requestedY || after.values[1] !== report.storedY) fail('endpoint report differs from loaded tracks');
  const reversed = restoreHipYLoopEndpointClip(clipB[0], report);
  const reversedModel: LoadedModel = { ...derived, clips: derived.clips.map(clip => clip === clipB[0] ? reversed : clip) };
  const sourceFidelity = measureConditioningDifferences(original, reversedModel, [spec.clipId])[0];
  const mixerA = new THREE.AnimationMixer(original.root), mixerB = new THREE.AnimationMixer(derived.root);
  const actionA = mixerA.clipAction(clipA[0]), actionB = mixerB.clipAction(clipB[0]);
  for (const action of [actionA, actionB]) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play(); }
  const sourceSkeleton = original.skeleton!;
  const names = sourceSkeleton.bones.map(b => b.name), root = 'LocomotionRoot';
  if (!names.includes(root) || !names.includes(spec.joint)) fail('missing endpoint root/hip joints');
  const all = Array.from({ length: 16 }, (_, index) => index), linear = [0, 1, 2, 4, 5, 6, 8, 9, 10];
  const palettePositions = (model: LoadedModel) => {
    const positions: number[] = [];
    for (const mesh of model.skinnedMeshes) {
      const p = mesh.geometry.getAttribute('position'), joints = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
      const palette = mesh.skeleton.bones.map((bone, index) => bone.matrixWorld.clone().multiply(mesh.skeleton.boneInverses[index]).multiply(mesh.bindMatrix));
      const point = new THREE.Vector3(), contribution = new THREE.Vector3(), result = new THREE.Vector3();
      for (let vertex = 0; vertex < p.count; vertex++) {
        point.fromBufferAttribute(p, vertex); result.set(0, 0, 0);
        for (let slot = 0; slot < 4; slot++) result.addScaledVector(contribution.copy(point).applyMatrix4(palette[joints.getComponent(vertex, slot)]), weights.getComponent(vertex, slot));
        positions.push(result.x, result.y, result.z);
      }
    }
    return positions;
  };
  const capture = (model: LoadedModel, mixer: THREE.AnimationMixer, tick: number) => {
    mixer.setTime(Math.fround(tick / 60)); model.root.updateMatrixWorld(true);
    return { matrices: new Map(model.skeleton!.bones.map(b => [b.name, [...b.matrixWorld.elements]])), skin: palettePositions(model) };
  };
  const maxDifference = (a: number[], b: number[], indices: number[]) => Math.max(...indices.map(index => Math.abs(a[index] - b[index])));
  const result = { sourceFidelity, quarterSamples: 361, maximumEarlierJointMatrixDifference: 0, maximumEarlierSkinDifferenceMeters: 0,
    maximumAffectedRootMatrixDifference: 0, maximumAffectedJointLinearDifference: 0, maximumAffectedSkinXZDifferenceMeters: 0,
    maximumAffectedSkinPredictionErrorMeters: 0, minimumAffectedSkinY: Infinity, maximumLimbSegmentLengthDifferenceMeters: 0,
    jointLoopSeamMatrixDifference: 0, skinLoopSeamMeters: 0 };
  let entry: ReturnType<typeof capture> | undefined;
  const relative = (pose: ReturnType<typeof capture>) => {
    const inverse = new THREE.Matrix4().fromArray(pose.matrices.get(root)!).invert();
    return { matrices: new Map([...pose.matrices].map(([name, values]) => [name, [...new THREE.Matrix4().multiplyMatrices(inverse, new THREE.Matrix4().fromArray(values)).elements]])),
      skin: Array.from({ length: pose.skin.length / 3 }, (_, index) => new THREE.Vector3(...pose.skin.slice(index * 3, index * 3 + 3)).applyMatrix4(inverse).toArray()).flat() };
  };
  try {
    for (let quarter = 0; quarter <= 360; quarter++) {
      const tick = quarter / 4, left = capture(original, mixerA, tick), right = capture(derived, mixerB, tick);
      if (quarter === 0) entry = right;
      const affected = tick > 89;
      for (const name of names) {
        const a = left.matrices.get(name)!, b = right.matrices.get(name)!;
        if (!affected) result.maximumEarlierJointMatrixDifference = Math.max(result.maximumEarlierJointMatrixDifference, maxDifference(a, b, all));
        else result.maximumAffectedJointLinearDifference = Math.max(result.maximumAffectedJointLinearDifference, maxDifference(a, b, linear));
      }
      if (!affected) for (let index = 0; index < left.skin.length; index++) result.maximumEarlierSkinDifferenceMeters = Math.max(result.maximumEarlierSkinDifferenceMeters, Math.abs(left.skin[index] - right.skin[index]));
      else {
        const alpha = Math.max(0, Math.min(1, (Math.fround(tick / 60) - Math.fround(89 / 60)) / (Math.fround(90 / 60) - Math.fround(89 / 60))));
        const predicted = alpha * report.storedCorrectionMeters;
        result.maximumAffectedRootMatrixDifference = Math.max(result.maximumAffectedRootMatrixDifference, maxDifference(left.matrices.get(root)!, right.matrices.get(root)!, all));
        for (const bone of sourceSkeleton.bones) if (bone.parent instanceof THREE.Bone && bone.name !== spec.joint) {
          const position = (pose: ReturnType<typeof capture>, name: string) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(pose.matrices.get(name)!));
          const prior = position(left, bone.name).distanceTo(position(left, bone.parent.name));
          const next = position(right, bone.name).distanceTo(position(right, bone.parent.name));
          result.maximumLimbSegmentLengthDifferenceMeters = Math.max(result.maximumLimbSegmentLengthDifferenceMeters, Math.abs(prior - next));
        }
        for (let index = 0; index < left.skin.length; index += 3) {
          result.maximumAffectedSkinXZDifferenceMeters = Math.max(result.maximumAffectedSkinXZDifferenceMeters,
            Math.abs(left.skin[index] - right.skin[index]), Math.abs(left.skin[index + 2] - right.skin[index + 2]));
          result.maximumAffectedSkinPredictionErrorMeters = Math.max(result.maximumAffectedSkinPredictionErrorMeters,
            Math.abs(right.skin[index + 1] - left.skin[index + 1] - predicted));
        }
      }
      if (tick >= 89) for (let index = 1; index < right.skin.length; index += 3) result.minimumAffectedSkinY = Math.min(result.minimumAffectedSkinY, right.skin[index]);
      if (quarter === 360) {
        const a = relative(entry!), b = relative(right);
        for (const name of names) result.jointLoopSeamMatrixDifference = Math.max(result.jointLoopSeamMatrixDifference, maxDifference(a.matrices.get(name)!, b.matrices.get(name)!, all));
        for (let index = 0; index < a.skin.length; index += 3) result.skinLoopSeamMeters = Math.max(result.skinLoopSeamMeters,
          new THREE.Vector3(...a.skin.slice(index, index + 3)).distanceTo(new THREE.Vector3(...b.skin.slice(index, index + 3))));
      }
    }
  } finally { actionA.stop(); actionB.stop(); mixerA.stopAllAction(); mixerB.stopAllAction(); mixerA.uncacheRoot(original.root); mixerB.uncacheRoot(derived.root); }
  if (result.maximumEarlierJointMatrixDifference > 1e-7 || result.maximumEarlierSkinDifferenceMeters > 1e-7
    || result.maximumAffectedRootMatrixDifference > 1e-7 || result.maximumAffectedJointLinearDifference > 1e-7
    || result.maximumAffectedSkinXZDifferenceMeters > 1e-7 || result.maximumAffectedSkinPredictionErrorMeters > 1e-5
    || result.maximumLimbSegmentLengthDifferenceMeters > 1e-7 || result.minimumAffectedSkinY < 0
    || result.jointLoopSeamMatrixDifference > 1e-4 || result.skinLoopSeamMeters > 1e-4) fail('actual quarter-tick fidelity, clearance or loop seam failed');
  return result;
}
