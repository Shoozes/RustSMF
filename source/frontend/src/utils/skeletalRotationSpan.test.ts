import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadGLB, exportGLB, type LoadedModel } from '../loaders/glb';
import { installNodeThreeRuntime } from '../../scripts/node-three-runtime';
import { parseRotationSpanBake, bakeRotationSpan, assertDisjointRotationSpan, type RotationSpanBakeRecipe } from './skeletalRotationSpan';
import { bakeTwoKeyRotations } from './skeletalTwoKeyRotation';
import { chordRotationTrack, CONDITIONING_NLERP_MODE } from './skeletalChordRotation';
import { conditionSkeletalModel, measureConditioningDifferences, CONDITIONING_MODE, type ConditioningRecipe } from './skeletalConditioning';
import { parseSkeletalExportJobDocument } from './skeletalExportJob';
import { TWO_KEY_EXPORT_BOUNDARY_POLICY, twoKeyExportBaseline } from './skeletalTwoKeyExportBoundary';
import { prepareSkeletalExport } from './skeletalExport';
import { disposeThreeObject } from './threeDisposal';

const names = ['Leg', 'Knee', 'Foot'], quat = (r: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), r).toArray();
const spec: RotationSpanBakeRecipe = { clipId: 'gait', startTick: 48, maxRotationDegrees: 25,
  rotations: names.map(joint => ({ joint, values: Array.from({ length: 18 }, (_, i) => quat(.001 * (48 + i) + .1)) })) };
const pair = (startTick: number) => ({ clipId: 'gait', startTick, maxRotationDegrees: 13,
  rotations: names.map(joint => ({ joint, values: [0, 1].map(i => quat(.001 * (startTick + i) + .05)) })) });
function fixture(linear = false): LoadedModel {
  const root = new THREE.Group(), bones = ['Base', ...names, 'Toe'].map(name => { const b = new THREE.Bone(); b.name = name; return b; });
  root.add(bones[0]); bones.slice(1).forEach((b, i) => { bones[i].add(b); b.position.y = 1; }); root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, .1, 1, 0, -.1, 2, 0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4)); geometry.setIndex([0, 1, 2]);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()); root.add(mesh); mesh.bind(skeleton);
  const times = Array.from({ length: 91 }, (_, tick) => Math.fround(tick / 60));
  const tracks: THREE.KeyframeTrack[] = names.map(name => linear ? new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, times.flatMap((_, tick) => quat(.001 * tick))) : chordRotationTrack(name + '.quaternion', times, times.flatMap((_, tick) => quat(.001 * tick))));
  tracks.push(new THREE.VectorKeyframeTrack('Base.position', times, times.flatMap((_, i) => [i * .01, 0, 0])));
  const clips = [new THREE.AnimationClip('idle', 1.5, [new THREE.VectorKeyframeTrack('Base.position', [0, 1.5], [0, 0, 0, .001, 0, 0])]), new THREE.AnimationClip('gait', 1.5, tracks)];
  return { root, skeleton, skinnedMeshes: [mesh], clips, mixer: new THREE.AnimationMixer(root) };
}
const recipe = (): ConditioningRecipe => ({ mode: CONDITIONING_NLERP_MODE, sourceRootJoint: 'Base', locomotionRootJoint: 'LocomotionRoot', clipIds: ['idle', 'gait'], transitions: [{ idle: 'idle', gait: 'gait', phases: [0], durationTicks: 6 }], twoKeyRotationBakes: [pair(43), pair(87)], rotationSpanBake: spec });
function document(root: string) {
  return { $schema: 'rustsmf.skeletal-export-job.v3', input: { skinnedModel: path.join(root, 'source.glb') },
    export: { rootJoint: 'LocomotionRoot', units: 'meters', upAxis: '+Y', forwardAxis: '+Z', handedness: 'right', ticksPerSecond: 60, rootMotion: 'separate-track', clipIds: ['gait'], twoKeyExportBoundary: TWO_KEY_EXPORT_BOUNDARY_POLICY }, conditioning: recipe(), output: { generationRoot: path.join(root, 'generations'), conditioningRoot: path.join(root, 'conditioned') } };
}

test('rotation-span admission is bounded, immutable and disjoint without expanding two-key admission', () => {
  const parse = (x: unknown) => parseRotationSpanBake(x, ['gait'], ['gait', 'idle'], ['Base']);
  const parsed = parse(spec); assert.deepEqual(parsed, spec); assert.notEqual(parsed.rotations[0].values[0], spec.rotations[0].values[0]);
  for (const bad of [null, [], { ...spec, extra: 1 }, { ...spec, maxRotationDegrees: 25.01 }, { ...spec, startTick: 0 }, { ...spec, clipId: 'idle' }, { ...spec, rotations: Array(3) }, { ...spec, rotations: spec.rotations.map(r => ({ ...r, values: Array(18) })) }, { ...spec, rotations: spec.rotations.map(r => ({ ...r, values: [quat(0), quat(0)] })) }, { ...spec, rotations: spec.rotations.map(r => ({ ...r, values: Array(19).fill(quat(0)) })) }, { ...spec, rotations: spec.rotations.map(r => ({ ...r, values: Array(18).fill([0, 0, 0, NaN]) })) }, { ...spec, rotations: spec.rotations.map(r => ({ ...r, joint: 'Base' })) }]) assert.throws(() => parse(bad));
  assert.doesNotThrow(() => assertDisjointRotationSpan(spec, [pair(43), pair(87)]));
  for (const tick of [46, 47, 48, 64, 65, 66]) assert.throws(() => assertDisjointRotationSpan(spec, [pair(tick)]), /overlap|adjoin/);
  const job = document(os.tmpdir()); assert.doesNotThrow(() => parseSkeletalExportJobDocument(job));
  assert.throws(() => parseSkeletalExportJobDocument({ ...job, conditioning: { ...job.conditioning, twoKeyRotationBakes: [pair(4), pair(20), pair(80)] } }), /one or two/);
  const noPolicy = { ...job.export }; delete (noPolicy as Partial<typeof noPolicy>).twoKeyExportBoundary;
  assert.throws(() => parseSkeletalExportJobDocument({ ...job, export: noPolicy }), /preservation/);
  assert.throws(() => parseSkeletalExportJobDocument({ ...job, conditioning: { ...job.conditioning, mode: CONDITIONING_MODE } }), /NLERP/);
  assert.throws(() => parseSkeletalExportJobDocument({ ...job, conditioning: { ...job.conditioning, rotationSpanBake: { ...spec, startTick: 43 } } }), /overlap/);
});

test('rotation-span stored bounds and curve isolation fail atomically for malformed chains and cancellation', () => {
  const m = fixture(), clip = m.clips[1], before = clip.tracks.map(t => Array.from(t.values));
  try {
    const baked = bakeRotationSpan(clip, spec, m.skeleton!.bones, ['Base']);
    assert.deepEqual(clip.tracks.map(t => Array.from(t.values)), before);
    assert.equal(baked.report.ticks.length, 18); assert.ok(baked.report.corrections.every(r => r.values.every(v => v.storedCorrectionDegrees < 25)));
    for (const [i, t] of baked.clip.tracks.entries()) {
      if (i >= 3) { assert.equal(t, clip.tracks[i]); continue; }
      for (let tick = 0; tick <= 90; tick++) if (tick < 48 || tick > 65) assert.deepEqual(t.values.slice(tick * 12 + 4, tick * 12 + 8), clip.tracks[i].values.slice(tick * 12 + 4, tick * 12 + 8));
      assert.deepEqual(t.values.slice(0, 47 * 12 + 8), clip.tracks[i].values.slice(0, 47 * 12 + 8)); assert.deepEqual(t.values.slice(66 * 12 + 4), clip.tracks[i].values.slice(66 * 12 + 4));
    }
    assert.throws(() => bakeRotationSpan(clip, { ...spec, maxRotationDegrees: .001 }, m.skeleton!.bones, ['Base']), /bound/);
    assert.throws(() => bakeRotationSpan(clip, { ...spec, rotations: [...spec.rotations].reverse() }, m.skeleton!.bones, ['Base']), /parent order/);
    assert.throws(() => bakeRotationSpan(clip, { ...spec, startTick: 74 }, m.skeleton!.bones, ['Base']), /interior/);
    const abort = new AbortController(); abort.abort(new Error('cancel span')); assert.throws(() => bakeRotationSpan(clip, spec, m.skeleton!.bones, ['Base'], abort.signal), /cancel span/);
    assert.deepEqual(clip.tracks.map(t => Array.from(t.values)), before);
  } finally { disposeThreeObject(m.root); }
});

test('span boundary preserves every other emitted component while source references stay independent', async () => {
  const m = fixture(), options = { sourceIdentitySha256: 'a'.repeat(64), rootJoint: 'Base', conditionedRotationMode: CONDITIONING_NLERP_MODE };
  try {
    const original = m.clips[1], a = bakeTwoKeyRotations(original, pair(43), m.skeleton!.bones, ['Base']), b = bakeTwoKeyRotations(a.clip, pair(87), m.skeleton!.bones, ['Base']);
    m.clips = [b.clip]; const context = { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, reports: [a.report, b.report] }, baseline = await prepareSkeletalExport(m, { ...options, twoKeyExportBoundary: context });
    const span = bakeRotationSpan(b.clip, spec, m.skeleton!.bones, ['Base']); m.clips = [span.clip]; const full = { ...context, spanReport: span.report }, snapshot = span.clip.tracks.map(t => Array.from(t.values));
    assert.deepEqual(twoKeyExportBaseline(span.clip, full, m.skeleton!.bones, ['Base']).tracks.map(t => Array.from(t.values)), original.tracks.map(t => Array.from(t.values)));
    const fixed = await prepareSkeletalExport(m, { ...options, twoKeyExportBoundary: full }), raw = await prepareSkeletalExport(m, options);
    assert.deepEqual(fixed.referenceBytes, raw.referenceBytes); assert.deepEqual(fixed.asset.mesh, baseline.asset.mesh); assert.deepEqual(fixed.asset.joints, baseline.asset.joints); assert.deepEqual(fixed.asset.clips[0].root, baseline.asset.clips[0].root);
    for (const track of fixed.asset.clips[0].tracks) for (const key of track.keys) {
      const previous = baseline.asset.clips[0].tracks.find(t => t.joint === track.joint)!.keys.find(k => k.tick === key.tick)!;
      if (names.includes(fixed.asset.joints[track.joint].id) && key.tick >= 48 && key.tick <= 65) {
        assert.deepEqual(key.transform.translation, previous.transform.translation); assert.deepEqual(key.transform.scale, previous.transform.scale);
        assert.deepEqual(key.transform.rotation, raw.asset.clips[0].tracks.find(t => t.joint === track.joint)!.keys.find(k => k.tick === key.tick)!.transform.rotation);
      } else assert.deepEqual(key, previous);
    }
    for (const mutate of [(c: typeof full) => { c.spanReport.corrections[0].values[0].before[0] += .01; }, (c: typeof full) => { c.spanReport.corrections[0].values[0].after[0] += .01; }, (c: typeof full) => { c.spanReport.corrections[0].values[0].storedCorrectionDegrees += 1; }, (c: typeof full) => { c.spanReport.ticks[2]++; }, (c: typeof full) => { c.spanReport.maxRotationDegrees = .001; }]) { const bad = structuredClone(full); mutate(bad); await assert.rejects(prepareSkeletalExport(m, { ...options, twoKeyExportBoundary: bad })); }
    const malformed = structuredClone(full); malformed.spanReport.ticks = malformed.spanReport.ticks.slice(0, 3);
    await assert.rejects(prepareSkeletalExport(m, { ...options, twoKeyExportBoundary: malformed }), /tick coverage/);
    const cancel = new AbortController(), pending = prepareSkeletalExport(m, { ...options, twoKeyExportBoundary: full, signal: cancel.signal, yieldEvery: 1 });
    cancel.abort(new Error('cancel restored span')); await assert.rejects(pending, /cancel restored span/);
    assert.deepEqual(span.clip.tracks.map(t => Array.from(t.values)), snapshot);
    assert.equal((await prepareSkeletalExport(m, { ...options, twoKeyExportBoundary: full })).asset.clips.length, 1);
  } finally { disposeThreeObject(m.root); }
});

test('disjoint chains can share span and two-key ticks while preserving selected-pose semantics', async () => {
  const m = fixture(), otherNames = ['OtherLeg', 'OtherKnee', 'OtherFoot'];
  try {
    const other = otherNames.map(name => { const b = new THREE.Bone(); b.name = name; b.position.y = 1; return b; });
    m.skeleton!.bones[0].add(other[0]); other[0].add(other[1]); other[1].add(other[2]);
    m.root.updateMatrixWorld(true);
    m.skeleton = new THREE.Skeleton([...m.skeleton!.bones, ...other]);
    m.skinnedMeshes[0].bind(m.skeleton);
    const original = m.clips[1], times = Array.from(original.tracks[0].times);
    original.tracks.push(...otherNames.map(name => chordRotationTrack(name + '.quaternion', times, times.flatMap((_, tick) => quat(.001 * tick)))));
    const options = { sourceIdentitySha256: 'a'.repeat(64), rootJoint: 'Base', conditionedRotationMode: CONDITIONING_NLERP_MODE };
    m.clips = [original]; const baseline = await prepareSkeletalExport(m, options);
    const first = bakeTwoKeyRotations(original, pair(43), m.skeleton.bones, ['Base']);
    const otherPair = { ...pair(49), rotations: pair(49).rotations.map((r, i) => ({ ...r, joint: otherNames[i] })) };
    assert.doesNotThrow(() => assertDisjointRotationSpan(spec, [otherPair]));
    const second = bakeTwoKeyRotations(first.clip, otherPair, m.skeleton.bones, ['Base']);
    const span = bakeRotationSpan(second.clip, spec, m.skeleton.bones, ['Base']);
    m.clips = [span.clip]; const before = span.clip.tracks.map(t => Array.from(t.values));
    const raw = await prepareSkeletalExport(m, options);
    for (const context of [
      { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, reports: [first.report, second.report], spanReport: span.report },
      { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, report: second.report, spanReport: span.report },
    ]) {
      const fixed = await prepareSkeletalExport(m, { ...options, twoKeyExportBoundary: context });
      assert.deepEqual(fixed.referenceBytes, raw.referenceBytes);
      for (const track of fixed.asset.clips[0].tracks) for (const key of track.keys) {
        const rawKey = raw.asset.clips[0].tracks.find(t => t.joint === track.joint)!.keys.find(k => k.tick === key.tick)!;
        if (key.tick === 49 || key.tick === 50) assert.deepEqual(key, rawKey);
        else if (context.reports && key.tick !== 43 && key.tick !== 44) {
          const prior = baseline.asset.clips[0].tracks.find(t => t.joint === track.joint)!.keys.find(k => k.tick === key.tick)!;
          if (names.includes(fixed.asset.joints[track.joint].id) && key.tick >= 48 && key.tick <= 65) {
            assert.deepEqual(key.transform.translation, prior.transform.translation);
            assert.deepEqual(key.transform.scale, prior.transform.scale);
            assert.deepEqual(key.transform.rotation, rawKey.transform.rotation);
          } else assert.deepEqual(key, prior);
        }
      }
    }
    assert.deepEqual(span.clip.tracks.map(t => Array.from(t.values)), before);
  } finally { disposeThreeObject(m.root); }
});

test('source fidelity excepts only selected span rotations and still guards toe, translation and missing provenance', async () => {
  installNodeThreeRuntime(); const source = fixture(true), working = fixture(true); let derived: LoadedModel | undefined;
  try {
    const result = await conditionSkeletalModel(working, recipe()); derived = await loadGLB(result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength) as ArrayBuffer);
    const measure = (span: RotationSpanBakeRecipe | undefined = spec) => measureConditioningDifferences(source, derived!, ['gait'], undefined, undefined, undefined, recipe().twoKeyRotationBakes, span);
    assert.ok(measure()[0].maximumPreservedTickJointMatrix < 1e-4);
    assert.throws(() => measureConditioningDifferences(source, derived!, ['gait'], undefined, undefined, undefined, recipe().twoKeyRotationBakes), /tick-pose/);
    assert.throws(() => measure({ ...spec, maxRotationDegrees: .001 }), /source-fidelity/);
    const clip = derived.clips.find(c => c.name === 'gait')!; clip.tracks.push(new THREE.VectorKeyframeTrack('Toe.scale', [0, 1.5], [1.1, 1, 1, 1.1, 1, 1])); assert.throws(() => measure(), /tick-pose/);
  } finally { disposeThreeObject(source.root); disposeThreeObject(working.root); if (derived) disposeThreeObject(derived.root); }
});

test('ordinary CLI span jobs serialize all reports and refuse late failures before publication', async () => {
  installNodeThreeRuntime(); const root = await mkdtemp(path.join(os.tmpdir(), 'rustsmf-span-cli-')), m = fixture(true);
  const cli = fileURLToPath(new URL('../../scripts/skeletal-export-cli.ts', import.meta.url)), cwd = path.resolve(path.dirname(cli), '..');
  const invoke = (jobPath: string) => spawnSync(process.execPath, ['--import', 'tsx', cli, '--job', jobPath], { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, TSX_DISABLE_CACHE: '1' } });
  try {
    await writeFile(path.join(root, 'source.glb'), await exportGLB(m.root, m.clips)); const job = document(root), file = path.join(root, 'job.json'); await writeFile(file, JSON.stringify(job));
    const good = invoke(file); assert.equal(good.status, 0, good.stderr); const output = JSON.parse(good.stdout.trim()), report = JSON.parse(await readFile(output.conditioning.report, 'utf8'));
    assert.equal(report.twoKeyRotationBakes.length, 2); assert.equal(report.rotationSpanBake.ticks.length, 18); assert.equal(report.rotationSpanBake.corrections.length, 3);
    const before = await readdir(job.output.generationRoot), conditioned = await readdir(job.output.conditioningRoot);
    await writeFile(file, JSON.stringify({ ...job, conditioning: { ...job.conditioning, rotationSpanBake: { ...spec, maxRotationDegrees: .001 } } })); const bad = invoke(file); assert.notEqual(bad.status, 0); assert.match(bad.stderr, /bound/);
    assert.deepEqual(await readdir(job.output.generationRoot), before); assert.deepEqual(await readdir(job.output.conditioningRoot), conditioned);
    const spanOnly = { ...job, conditioning: { ...job.conditioning, twoKeyRotationBakes: undefined } }; await writeFile(file, JSON.stringify(spanOnly)); const only = invoke(file); assert.equal(only.status, 0, only.stderr);
    const selected = { ...job, export: { ...job.export, clipIds: ['idle'] } }; await writeFile(file, JSON.stringify(selected)); const unrelated = invoke(file); assert.equal(unrelated.status, 0, unrelated.stderr);
  } finally { disposeThreeObject(m.root); assert.ok(path.basename(root).startsWith('rustsmf-span-cli-')); await rm(root, { recursive: true, force: true }); }
});
