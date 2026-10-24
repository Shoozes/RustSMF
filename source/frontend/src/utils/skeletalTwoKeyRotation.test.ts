import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { LoadedModel } from '../loaders/glb';
import { exportGLB } from '../loaders/glb';
import { installNodeThreeRuntime } from '../../scripts/node-three-runtime';
import { chordRotationTrack, CONDITIONING_NLERP_MODE, validateChordRotation } from './skeletalChordRotation';
import { createTrackInterpolant } from './animationTrackInterpolation';
import { bakeTwoKeyRotations, parseTwoKeyRotationBake, parseTwoKeyRotationSelection, type TwoKeyRotationBakeRecipe } from './skeletalTwoKeyRotation';
import { conditionSkeletalModel, measureConditioningDifferences, CONDITIONING_MODE } from './skeletalConditioning';
import { parseSkeletalExportJobDocument, SKELETAL_EXPORT_JOB_V3_SCHEMA } from './skeletalExportJob';
import { disposeThreeObject } from './threeDisposal';

const quat = (angle: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle).toArray();
const spec: TwoKeyRotationBakeRecipe = { clipId: 'gait', startTick: 2, maxRotationDegrees: 13,
  rotations: ['Leg', 'Knee', 'Foot'].map((joint, i) => ({ joint, values: [quat(.1 + i * .01), quat(.12 + i * .01)] })) };

function fixture(ticks = 6): LoadedModel {
  const root = new THREE.Group(), bones = ['Base', 'Leg', 'Knee', 'Foot', 'Toe'].map(name => { const b = new THREE.Bone(); b.name = name; return b; });
  root.add(bones[0]); bones.slice(1).forEach((b, i) => { bones[i].add(b); b.position.y = 1; });
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, .1, 1, 0, -.1, 2, 0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.setIndex([0, 1, 2]);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()); root.add(mesh); mesh.bind(skeleton);
  const times = Array.from({ length: ticks + 1 }, (_, t) => Math.fround(t / 60));
  const tracks: THREE.KeyframeTrack[] = ['Leg', 'Knee', 'Foot'].map(name => chordRotationTrack(`${name}.quaternion`, times, times.flatMap((_, i) => quat(.01 * i))));
  tracks.push(new THREE.VectorKeyframeTrack('Base.position', times, times.flatMap((_, i) => [i * .01, 0, 0])));
  const clips = [new THREE.AnimationClip('idle', times[ticks], [new THREE.VectorKeyframeTrack('Base.position', [0, times[ticks]], [.02, 0, 0, .02, 0, 0])]), new THREE.AnimationClip('gait', times[ticks], tracks)];
  return { root, skeleton, skinnedMeshes: [mesh], clips, mixer: new THREE.AnimationMixer(root) };
}

test('two-key authoring preserves all unselected values, intervals and input bytes', () => {
  const model = fixture(), original = model.clips[1], snapshot = original.tracks.map(t => Array.from(t.values));
  try {
    const result = bakeTwoKeyRotations(original, spec, model.skeleton!.bones, ['Base']);
    assert.equal(result.clip.duration, original.duration); assert.equal(result.clip.tracks[3], original.tracks[3]);
    assert.deepEqual(original.tracks.map(t => Array.from(t.values)), snapshot);
    for (let i = 0; i < 3; i++) {
      const before = original.tracks[i], after = result.clip.tracks[i]; validateChordRotation(after, 6);
      assert.deepEqual(after.times, before.times);
      for (let tick = 0; tick <= 6; tick++) if (tick !== 2 && tick !== 3) assert.deepEqual(after.values.slice(tick * 12 + 4, tick * 12 + 8), before.values.slice(tick * 12 + 4, tick * 12 + 8));
      for (const phase of [0, .25, 1, 4, 4.25, 5.5, 6]) assert.deepEqual(Array.from(createTrackInterpolant(after).evaluate(Math.fround(phase / 60))), Array.from(createTrackInterpolant(before).evaluate(Math.fround(phase / 60))));
    }
    assert.equal(result.report.corrections.length, 3);
    assert.ok(result.report.corrections.every(r => r.values.every(v => v.storedCorrectionDegrees <= 13)));
  } finally { disposeThreeObject(model.root); }
});

const laterSpec: TwoKeyRotationBakeRecipe = { ...spec, startTick: 5,
  rotations: spec.rotations.map((r, i) => ({ joint: r.joint, values: [quat(.16 + i * .01), quat(.18 + i * .01)] })) };

function linearFixture(): LoadedModel {
  const model = fixture(10);
  model.clips[1].tracks = model.clips[1].tracks.map(t => t.ValueTypeName === 'quaternion'
    ? new THREE.QuaternionKeyframeTrack(t.name, t.times, Array.from(t.times, (_, i) => Array.from(t.values.slice(i * 12 + 4, i * 12 + 8))).flat()) : t);
  return model;
}

function composedRecipe(records = [spec, laterSpec]): Parameters<typeof conditionSkeletalModel>[1] {
  return { mode: CONDITIONING_NLERP_MODE, sourceRootJoint: 'Base', locomotionRootJoint: 'LocomotionRoot', clipIds: ['idle', 'gait'],
    transitions: [{ idle: 'idle', gait: 'gait', phases: [0], durationTicks: 6 }], twoKeyRotationBakes: records };
}

test('plural rotation admission owns one or two disjoint recipes and refuses ambiguous footprints', () => {
  const parse = (selection: Parameters<typeof parseTwoKeyRotationSelection>[0]) => parseTwoKeyRotationSelection(selection, ['gait', 'other'], ['idle', 'gait', 'other'], ['Base', 'LocomotionRoot']);
  assert.deepEqual(parse({}), {});
  const parsed = parse({ twoKeyRotationBakes: [spec, laterSpec] });
  assert.deepEqual(parsed.twoKeyRotationBakes, [spec, laterSpec]); assert.notEqual(parsed.twoKeyRotationBakes![0].rotations[0].values[0], spec.rotations[0].values[0]);
  assert.deepEqual(parse({ twoKeyRotationBake: spec }), { twoKeyRotationBake: spec });
  assert.equal(parse({ twoKeyRotationBakes: [spec] }).twoKeyRotationBakes!.length, 1);
  for (const records of [null, {}, [], [spec, laterSpec, laterSpec], [spec, null], Array(1), [spec, { ...laterSpec, extra: 1 }], [spec, spec], [spec, { ...laterSpec, startTick: 3 }], [spec, { ...laterSpec, startTick: 4 }]]) assert.throws(() => parse({ twoKeyRotationBakes: records }));
  assert.throws(() => parse({ twoKeyRotationBake: spec, twoKeyRotationBakes: [laterSpec] }), /mutually exclusive/);
  assert.throws(() => parse({ twoKeyRotationBake: undefined, twoKeyRotationBakes: [spec] }), /mutually exclusive/);
  assert.doesNotThrow(() => parse({ twoKeyRotationBakes: [spec, { ...spec, clipId: 'other' }] }));
  assert.doesNotThrow(() => parse({ twoKeyRotationBakes: [spec, { ...spec, rotations: spec.rotations.map((r, i) => ({ ...r, joint: `Other${i}` })) }] }));
  const document = job(path.join(os.tmpdir(), 'rustsmf-composed-parser'));
  const compound = { ...document, conditioning: composedRecipe() };
  assert.equal(parseSkeletalExportJobDocument(compound).$schema, SKELETAL_EXPORT_JOB_V3_SCHEMA);
  assert.throws(() => parseSkeletalExportJobDocument({ ...compound, conditioning: { ...compound.conditioning, mode: CONDITIONING_MODE } }), /NLERP/);
});

test('plural authoring preserves singular bytes, reports each bake and is deterministic in either disjoint order', async () => {
  installNodeThreeRuntime();
  const models = [linearFixture(), linearFixture(), linearFixture(), linearFixture()];
  try {
    const singular = composedRecipe(); delete singular.twoKeyRotationBakes; singular.twoKeyRotationBake = spec;
    const a = await conditionSkeletalModel(models[0], singular), b = await conditionSkeletalModel(models[1], composedRecipe([spec]));
    assert.deepEqual(b.bytes, a.bytes); assert.ok(a.report.twoKeyRotationBake); assert.equal(a.report.twoKeyRotationBakes, undefined);
    assert.equal(b.report.twoKeyRotationBakes!.length, 1); assert.equal(b.report.twoKeyRotationBake, undefined);
    const c = await conditionSkeletalModel(models[2], composedRecipe()), d = await conditionSkeletalModel(models[3], composedRecipe([laterSpec, spec]));
    assert.deepEqual(c.bytes, d.bytes); assert.equal(c.report.twoKeyRotationBakes!.length, 2);
    assert.deepEqual(c.report.twoKeyRotationBakes!.map(r => r.ticks), [[2, 3], [5, 6]]);
  } finally { models.forEach(m => disposeThreeObject(m.root)); }
});

test('plural source fidelity restores only the complete selected union and keeps descendant guards', () => {
  const a = fixture(10), b = fixture(10);
  const reset = () => { b.clips[1] = bakeTwoKeyRotations(bakeTwoKeyRotations(a.clips[1], spec, b.skeleton!.bones, ['Base']).clip, laterSpec, b.skeleton!.bones, ['Base']).clip; };
  const measure = (records = [spec, laterSpec]) => measureConditioningDifferences(a, b, ['gait'], undefined, undefined, undefined, records);
  try {
    reset(); const report = measure()[0]; assert.ok(report.maximumTickJointMatrix > .01); assert.ok(report.maximumPreservedTickJointMatrix < 1e-6);
    assert.throws(() => measure([spec]), /tick-pose/);
    assert.throws(() => measureConditioningDifferences(a, b, ['gait'], undefined, undefined, spec, [laterSpec]), /mutually exclusive/);
    assert.throws(() => measure([spec, { ...laterSpec, maxRotationDegrees: .0001 }]), /source-fidelity/);
    b.clips[1].tracks.push(new THREE.VectorKeyframeTrack('Toe.scale', [0, Math.fround(10 / 60)], [1.1, 1, 1, 1.1, 1, 1]));
    assert.throws(() => measure(), /tick-pose/);
    reset(); b.clips[1].tracks[0].values[5 * 12 + 4] += .05; assert.throws(() => measure(), /source-fidelity/);
  } finally { disposeThreeObject(a.root); disposeThreeObject(b.root); }
});

test('plural late bound failures and cancellation leave original clips unpublished', async () => {
  installNodeThreeRuntime();
  const good = linearFixture(); let calls = 0;
  try { await conditionSkeletalModel(good, composedRecipe(), { throwIfAborted() { calls++; } } as AbortSignal); }
  finally { disposeThreeObject(good.root); }
  for (const cancel of [false, true]) {
    const model = linearFixture(), clips = model.clips, before = clips.map(c => c.tracks.map(t => Array.from(t.values))); let seen = 0;
    try {
      const signal = { throwIfAborted() { if (++seen === calls - 2) throw new Error('cancel staged composition'); } } as AbortSignal;
      await assert.rejects(conditionSkeletalModel(model, cancel ? composedRecipe() : composedRecipe([spec, { ...laterSpec, maxRotationDegrees: .0001 }]), cancel ? signal : undefined), cancel ? /cancel staged/ : /bound/);
      assert.equal(model.clips, clips); assert.deepEqual(clips.map(c => c.tracks.map(t => Array.from(t.values))), before);
    } finally { disposeThreeObject(model.root); }
  }
});

test('ordinary CLI composes both recipes with exact bounds and refuses invalid or late-failing jobs atomically', async () => {
  installNodeThreeRuntime();
  const root = await mkdtemp(path.join(os.tmpdir(), 'rustsmf-two-key-composed-')), model = linearFixture();
  try {
    await writeFile(path.join(root, 'source.glb'), await exportGLB(model.root, model.clips));
    const document = { ...job(root), conditioning: composedRecipe() }, jobPath = path.join(root, 'job.json');
    const cli = fileURLToPath(new URL('../../scripts/skeletal-export-cli.ts', import.meta.url));
    const invoke = (conditioning: unknown) => { return writeFile(jobPath, JSON.stringify({ ...document, conditioning })).then(() => spawnSync(process.execPath, ['--import', 'tsx', cli, '--job', jobPath], { cwd: fileURLToPath(new URL('../..', import.meta.url)), encoding: 'utf8', windowsHide: true, timeout: 30000 })); };
    const a = await invoke(document.conditioning); assert.equal(a.status, 0, a.stderr);
    const result = JSON.parse(a.stdout) as { id: string; conditioning: { model: string; report: string } };
    const b = await invoke(document.conditioning); assert.equal(b.status, 0, b.stderr); assert.equal((JSON.parse(b.stdout) as { id: string }).id, result.id);
    const bytes = await readFile(result.conditioning.model), serialized = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12))) as RotationBoundsGlb;
    assertRotationAccessorBounds(bytes, serialized);
    const report = JSON.parse(await readFile(result.conditioning.report, 'utf8')) as { twoKeyRotationBakes: unknown[]; twoKeyRotationBake?: unknown; differences: Array<{ maximumPreservedTickJointMatrix: number }> };
    assert.equal(report.twoKeyRotationBakes.length, 2); assert.equal(report.twoKeyRotationBake, undefined); assert.ok(report.differences.every(d => d.maximumPreservedTickJointMatrix <= 1e-4));
    for (const bad of [{ ...document.conditioning, twoKeyRotationBake: spec }, { ...document.conditioning, mode: CONDITIONING_MODE }, composedRecipe([]), composedRecipe([spec, spec]), composedRecipe([spec, { ...laterSpec, startTick: 4 }]), composedRecipe([spec, laterSpec, laterSpec]), composedRecipe([spec, { ...laterSpec, maxRotationDegrees: .0001 }])]) {
      const refusal = await invoke(bad); assert.notEqual(refusal.status, 0); assert.deepEqual(await readdir(document.output.generationRoot), [result.id]);
    }
    const conditioned = await readdir(document.output.conditioningRoot); assert.equal(conditioned.length, 1); assert.ok(conditioned.every(n => !n.startsWith('.')));
  } finally { disposeThreeObject(model.root); assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('rustsmf-two-key-composed-')); await rm(root, { recursive: true, force: true }); }
});

test('two-key parser rejects malformed selection and returns owned quaternion arrays', () => {
  const parse = (value: unknown) => parseTwoKeyRotationBake(value, ['gait'], ['idle', 'gait'], ['Base', 'LocomotionRoot']);
  const parsed = parse(spec); assert.deepEqual(parsed, spec); assert.notEqual(parsed.rotations[0].values[0], spec.rotations[0].values[0]);
  const withRotations = (rotations: unknown[]) => ({ ...spec, rotations });
  for (const value of [null, {}, { ...spec, extra: true }, { ...spec, clipId: 'idle' }, { ...spec, clipId: 'absent' }, { ...spec, startTick: 0 }, { ...spec, startTick: 1.5 }, { ...spec, startTick: 3599 }, { ...spec, maxRotationDegrees: NaN }, { ...spec, maxRotationDegrees: 0 }, { ...spec, maxRotationDegrees: 181 },
    withRotations([]), withRotations([spec.rotations[0], spec.rotations[0], spec.rotations[2]]),
    withRotations([{ ...spec.rotations[0], joint: 'Base' }, ...spec.rotations.slice(1)]),
    ...[null, { ...spec.rotations[0], extra: true }, { ...spec.rotations[0], values: [[0, 0, 0, 0], quat(0)] }, { ...spec.rotations[0], values: [[0, 0, NaN, 1], quat(0)] }].map(r => withRotations([r, ...spec.rotations.slice(1)]))]) assert.throws(() => parse(value), /twoKeyRotationBake/);
});

test('two-key refuses missing or disconnected joints, noncanonical channels, stored bounds and cancellation atomically', () => {
  const model = fixture(), clip = model.clips[1], before = clip.tracks.map(t => Array.from(t.values));
  const bake = (s: TwoKeyRotationBakeRecipe, c = clip, signal?: AbortSignal) => bakeTwoKeyRotations(c, s, model.skeleton!.bones, ['Base'], signal);
  try {
    const degrees = Math.max(...bake(spec).report.corrections.flatMap(r => r.values.map(v => v.storedCorrectionDegrees)));
    assert.doesNotThrow(() => bake({ ...spec, maxRotationDegrees: degrees }));
    assert.throws(() => bake({ ...spec, maxRotationDegrees: degrees - 1e-8 }), /bound/);
    for (const invalid of [{ ...spec, startTick: 5 }, { ...spec, rotations: spec.rotations.map((r, i) => ({ ...r, joint: i === 0 ? 'Absent' : r.joint })) }, { ...spec, rotations: [...spec.rotations].reverse() }]) assert.throws(() => bake(invalid), /twoKeyRotationBake/);
    const duplicate = clip.clone(); duplicate.tracks.push(duplicate.tracks[0]); assert.throws(() => bake(spec, duplicate), /one quaternion/);
    const missing = clip.clone(); missing.tracks.splice(0, 1); assert.throws(() => bake(spec, missing), /one quaternion/);
    const malformed = clip.clone(); malformed.tracks[0].values[8] += 1; assert.throws(() => bake(spec, malformed), /canonical/);
    const constant = clip.clone(); constant.tracks[0] = chordRotationTrack('Leg.quaternion', [0, Math.fround(.1)], [...quat(0), ...quat(0)]); assert.throws(() => bake(spec, constant), /complete stored/);
    const controller = new AbortController(); controller.abort(new Error('cancel two-key'));
    assert.throws(() => bake(spec, clip, controller.signal), /cancel two-key/);
    let observations = 0;
    const signal = { throwIfAborted() { if (++observations === 3) throw new Error('cancel during two-key'); } } as AbortSignal;
    assert.throws(() => bake(spec, clip, signal), /cancel during/);
    assert.deepEqual(clip.tracks.map(t => Array.from(t.values)), before);
  } finally { disposeThreeObject(model.root); }
});

test('two-key source fidelity permits only requested rotations and rejects changes on selected descendants', () => {
  const original = fixture(), derived = fixture();
  const reset = () => { derived.clips[1] = bakeTwoKeyRotations(original.clips[1], spec, derived.skeleton!.bones, ['Base']).clip; };
  const measure = () => measureConditioningDifferences(original, derived, ['idle', 'gait'], undefined, undefined, spec);
  try {
    reset(); assert.throws(() => measureConditioningDifferences(original, derived, ['gait']), /tick-pose/);
    const report = measure()[1]; assert.ok(report.maximumTickJointMatrix > .01); assert.ok(report.maximumPreservedTickJointMatrix < 1e-6);
    assert.throws(() => measureConditioningDifferences(original, derived, ['gait'], 'gait', undefined, spec), /idle source-fidelity/);
    for (const property of ['position', 'scale', 'quaternion']) {
      reset(); const values = property === 'quaternion' ? quat(.2) : property === 'scale' ? [1.1, 1, 1] : [0, 1.1, 0];
      const Track = property === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
      derived.clips[1].tracks.push(new Track(`Toe.${property}`, [0, Math.fround(.1)], [...values, ...values]));
      assert.throws(measure, /tick-pose/);
    }
    reset(); derived.clips[1].tracks[0].values[2 * 12 + 4] += .05; assert.throws(measure, /two-key source-fidelity/);
    reset(); derived.clips[1].tracks[0].values[4 * 12 + 4] += .05; assert.throws(measure, /tick-pose/);
    reset(); derived.clips[1].tracks[3] = derived.clips[1].tracks[3].clone(); derived.clips[1].tracks[3].values[2 * 3] += .1; assert.throws(measure, /tick-pose/);
    reset(); assert.throws(() => measureConditioningDifferences(original, derived, ['gait'], undefined, undefined, { ...spec, maxRotationDegrees: .01 }), /two-key source-fidelity/);
  } finally { disposeThreeObject(original.root); disposeThreeObject(derived.root); }
});

function job(root: string) {
  return { $schema: SKELETAL_EXPORT_JOB_V3_SCHEMA, input: { skinnedModel: path.join(root, 'source.glb') },
    export: { rootJoint: 'LocomotionRoot', units: 'meters', upAxis: '+Y', forwardAxis: '+Z', handedness: 'right', ticksPerSecond: 60, rootMotion: 'separate-track', clipIds: ['gait'] },
    conditioning: { mode: CONDITIONING_NLERP_MODE as string, sourceRootJoint: 'Base', locomotionRootJoint: 'LocomotionRoot', clipIds: ['idle', 'gait'], transitions: [{ idle: 'idle', gait: 'gait', phases: [0], durationTicks: 6 }], twoKeyRotationBake: spec },
    output: { generationRoot: path.join(root, 'generations'), conditioningRoot: path.join(root, 'conditioned') } };
}

interface RotationBoundsGlb {
  animations: Array<{ name?: string; channels: Array<{ sampler: number; target: { node: number; path: string } }>; samplers: Array<{ output: number; interpolation?: string }> }>;
  nodes: Array<{ name?: string }>;
  accessors: Array<{ bufferView: number; byteOffset?: number; componentType: number; count: number; type: string; min?: number[]; max?: number[] }>;
  bufferViews: Array<{ buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }>;
}

function assertRotationAccessorBounds(bytes: Buffer, document: RotationBoundsGlb): number[] {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const binaryHeader = 20 + bytes.readUInt32LE(12), binaryStart = binaryHeader + 8;
  assert.equal(bytes.readUInt32LE(binaryHeader + 4), 0x004e4942);
  assert.equal(binaryStart + bytes.readUInt32LE(binaryHeader), bytes.length);
  const animation = document.animations.find(a => a.name === spec.clipId);
  assert.ok(animation);
  return spec.rotations.map(({ joint }) => {
    const channels = animation.channels.filter(c => c.target.path === 'rotation' && document.nodes[c.target.node].name === joint);
    assert.equal(channels.length, 1);
    const sampler = animation.samplers[channels[0].sampler], accessor = document.accessors[sampler.output];
    assert.equal(sampler.interpolation, 'CUBICSPLINE');
    assert.equal(accessor.type, 'VEC4'); assert.equal(accessor.componentType, 5126);
    assert.ok(accessor.count > 0 && Number.isInteger(accessor.count)); assert.equal(accessor.count % 3, 0);
    const view = document.bufferViews[accessor.bufferView], viewStart = binaryStart + (view.byteOffset ?? 0);
    assert.equal(view.buffer, 0); assert.equal(view.byteStride, undefined);
    const start = viewStart + (accessor.byteOffset ?? 0), end = start + accessor.count * 16;
    assert.ok(start >= viewStart && end <= viewStart + view.byteLength && end <= bytes.length);
    const minimum = [Infinity, Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < accessor.count * 4; i++) {
      const stored = bytes.readFloatLE(start + i * 4), value = stored === 0 ? 0 : stored, component = i % 4;
      assert.ok(Number.isFinite(value));
      minimum[component] = Math.min(minimum[component], value); maximum[component] = Math.max(maximum[component], value);
    }
    assert.deepEqual(accessor.min, minimum, 'rotation accessor bounds must match every stored triplet component (min)');
    assert.deepEqual(accessor.max, maximum, 'rotation accessor bounds must match every stored triplet component (max)');
    return sampler.output;
  });
}

test('v3 two-key authoring is explicit, NLERP-only and cannot select another role or a root', async () => {
  const document = job(path.join(os.tmpdir(), 'rustsmf-two-key-parser'));
  const parsed = parseSkeletalExportJobDocument(document);
  assert.equal(parsed.$schema, SKELETAL_EXPORT_JOB_V3_SCHEMA);
  if (parsed.$schema === SKELETAL_EXPORT_JOB_V3_SCHEMA) assert.deepEqual(parsed.conditioning.twoKeyRotationBake, spec);
  assert.throws(() => parseSkeletalExportJobDocument({ ...document, conditioning: { ...document.conditioning, mode: CONDITIONING_MODE } }), /NLERP/);
  const model = fixture();
  try {
    await assert.rejects(conditionSkeletalModel(model, { ...document.conditioning, mode: CONDITIONING_MODE, twoKeyRotationBake: spec } as Parameters<typeof conditionSkeletalModel>[1]), /NLERP/);
  } finally { disposeThreeObject(model.root); }
});

test('ordinary CLI serializes the opt-in bake reproducibly, binds it, refuses bad jobs and cleans owned output', async () => {
  installNodeThreeRuntime();
  const root = await mkdtemp(path.join(os.tmpdir(), 'rustsmf-two-key-cli-'));
  const model = fixture();
  try {
    // The input remains a supported LINEAR source; chord storage belongs to conditioning.
    model.clips[1].tracks = model.clips[1].tracks.map(t => t.ValueTypeName === 'quaternion'
      ? new THREE.QuaternionKeyframeTrack(t.name, t.times, Array.from({ length: 7 }, (_, i) => Array.from(t.values.slice(i * 12 + 4, i * 12 + 8))).flat()) : t);
    await writeFile(path.join(root, 'source.glb'), await exportGLB(model.root, model.clips));
    const document = job(root), jobPath = path.join(root, 'job.json');
    await writeFile(jobPath, JSON.stringify(document));
    const cli = fileURLToPath(new URL('../../scripts/skeletal-export-cli.ts', import.meta.url));
    const invoke = () => spawnSync(process.execPath, ['--import', 'tsx', cli, '--job', jobPath], { cwd: fileURLToPath(new URL('../..', import.meta.url)), encoding: 'utf8', windowsHide: true, timeout: 30000 });
    const a = invoke(), b = invoke(); assert.equal(a.status, 0, a.stderr); assert.equal(b.status, 0, b.stderr);
    const first = JSON.parse(a.stdout) as { id: string; conditioning: { model: string; report: string; recipe: string } };
    assert.equal((JSON.parse(b.stdout) as { id: string }).id, first.id);
    const recipe = JSON.parse(await readFile(first.conditioning.recipe, 'utf8')) as { twoKeyRotationBake: TwoKeyRotationBakeRecipe };
    assert.deepEqual(recipe.twoKeyRotationBake, spec);
    const report = JSON.parse(await readFile(first.conditioning.report, 'utf8')) as { twoKeyRotationBake: { corrections: Array<{ values: Array<{ storedCorrectionDegrees: number }> }> }; differences: Array<{ maximumPreservedTickJointMatrix: number }> };
    assert.equal(report.twoKeyRotationBake.corrections.length, 3); assert.ok(report.differences.every(d => d.maximumPreservedTickJointMatrix <= 1e-4));
    const bytes = await readFile(first.conditioning.model);
    const serialized = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12))) as RotationBoundsGlb;
    const accessors = assertRotationAccessorBounds(bytes, serialized);
    for (const bound of ['min', 'max'] as const) {
      const stale = structuredClone(serialized), values = stale.accessors[accessors[0]][bound];
      assert.ok(values); values[0] += bound === 'min' ? -1 : 1;
      assert.throws(() => assertRotationAccessorBounds(bytes, stale), /rotation accessor bounds/);
    }
    await writeFile(jobPath, JSON.stringify({ ...document, conditioning: { ...document.conditioning, twoKeyRotationBake: { ...spec, maxRotationDegrees: .0001 } } }));
    const refused = invoke(); assert.notEqual(refused.status, 0); assert.match(refused.stderr, /bound/);
    assert.deepEqual(await readdir(document.output.generationRoot), [first.id]);
  } finally { disposeThreeObject(model.root); assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('rustsmf-two-key-cli-')); await rm(root, { recursive: true, force: true }); }
});
