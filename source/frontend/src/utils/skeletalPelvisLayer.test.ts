import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { LoadedModel } from '../loaders/glb';
import { exportGLB, loadGLB } from '../loaders/glb';
import { installNodeThreeRuntime } from '../../scripts/node-three-runtime';
import { chordRotationTrack, CONDITIONING_NLERP_MODE } from './skeletalChordRotation';
import { bakePelvisLayer, parsePelvisLayer, restorePelvisLayer, type PelvisLayerRecipe } from './skeletalPelvisLayer';
import { bakeRotationSpan } from './skeletalRotationSpan';
import { prepareSkeletalExport } from './skeletalExport';
import { TWO_KEY_EXPORT_BOUNDARY_POLICY, twoKeyExportBaseline } from './skeletalTwoKeyExportBoundary';
import { conditionSkeletalModel, measureConditioningDifferences } from './skeletalConditioning';
import { parseSkeletalExportJobDocument, SKELETAL_EXPORT_JOB_V3_SCHEMA } from './skeletalExportJob';
import { disposeThreeObject } from './threeDisposal';

const names = ['LHip', 'LKnee', 'LFoot', 'RHip', 'RKnee', 'RFoot'];
const q = (v: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), v).toArray();
const spec: PelvisLayerRecipe = { clipId: 'gait', startTick: 5, pelvisJoint: 'Pelvis', maxTranslationFraction: .03, maxRotationDegrees: 25,
  positions: [[.01, .98, 0], [.02, .97, 0]], rotations: names.map(joint => ({ joint, values: [q(.03), q(.04)] })) };
function fixture(conditioned = true): LoadedModel {
  const root = new THREE.Group(), pelvis = new THREE.Bone(); pelvis.name = 'Pelvis'; pelvis.position.y = 1;
  if (!conditioned) pelvis.position.set(.005, 1, .003);
  const bones = [pelvis];
  for (let side = 0; side < 2; side++) {
    let parent = pelvis;
    for (let i = 0; i < 3; i++) { const b = new THREE.Bone(); b.name = names[side * 3 + i]; b.position.set(i === 0 ? (side ? .2 : -.2) : 0, -.2, 0); parent.add(b); bones.push(b); parent = b; }
  }
  if (conditioned) { const locomotion = new THREE.Bone(); locomotion.name = 'Root'; locomotion.add(pelvis); root.add(locomotion); bones.push(locomotion); } else root.add(pelvis);
  root.updateMatrixWorld(true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, .1, 1, 0, -.1, 2, 0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4)); geometry.setIndex([0, 1, 2]);
  const skeleton = new THREE.Skeleton(bones), mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()); root.add(mesh); mesh.bind(skeleton);
  const times = Array.from({ length: 11 }, (_, i) => Math.fround(i / 60)), tracks: THREE.KeyframeTrack[] = [new THREE.VectorKeyframeTrack('Pelvis.position', times, times.flatMap(() => pelvis.position.toArray()))];
  for (const b of bones) {
    const values = times.flatMap((_, tick) => !conditioned && b === pelvis
      ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tick * .02).toArray() : q(b.name === 'Root' ? 0 : tick * .01));
    tracks.push(conditioned && b.name !== 'Root' ? chordRotationTrack(b.name + '.quaternion', times, values) : new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, values));
  }
  return { root, skeleton, skinnedMeshes: [mesh], clips: ['idle', 'gait'].map(id => new THREE.AnimationClip(id, times[10], tracks.map(t => t.clone()))), mixer: new THREE.AnimationMixer(root) };
}
const recipe = () => ({ mode: CONDITIONING_NLERP_MODE, sourceRootJoint: 'Pelvis', locomotionRootJoint: 'Root', clipIds: ['idle', 'gait'],
  transitions: [{ gait: 'gait', idle: 'idle', phases: [0], durationTicks: 6 as const }], pelvisLayerBake: structuredClone(spec) });
const document = (dir: string) => ({ $schema: SKELETAL_EXPORT_JOB_V3_SCHEMA, input: { skinnedModel: path.join(dir, 'source.glb') },
  export: { rootJoint: 'Root', units: 'meters', upAxis: '+Y', forwardAxis: '+Z', handedness: 'right', ticksPerSecond: 60, rootMotion: 'separate-track', clipIds: ['gait'], twoKeyExportBoundary: TWO_KEY_EXPORT_BOUNDARY_POLICY },
  conditioning: recipe(), output: { generationRoot: path.join(dir, 'generations'), conditioningRoot: path.join(dir, 'conditioned') } });

test('pelvis-layer admission is strict, bounded, gait-only and independently copied', () => {
  const parse = (v: unknown) => parsePelvisLayer(v, ['gait'], ['gait', 'idle'], 'Pelvis', 'Root');
  const parsed = parse(spec); assert.deepEqual(parsed, spec); assert.notEqual(parsed.positions[0], spec.positions[0]);
  for (const v of [null, [], { ...spec, extra: 1 }, { ...spec, clipId: 'idle' }, { ...spec, pelvisJoint: 'Root' }, { ...spec, startTick: 0 }, { ...spec, maxTranslationFraction: .031 }, { ...spec, maxRotationDegrees: 26 }, { ...spec, positions: Array(2) }, { ...spec, rotations: Array(6) }, { ...spec, positions: [[NaN, 0, 0], [0, 0, 0]] }, { ...spec, rotations: spec.rotations.map(r => ({ ...r, joint: 'LHip' })) }]) assert.throws(() => parse(v));
  const job = document(os.tmpdir()); assert.doesNotThrow(() => parseSkeletalExportJobDocument(job));
  const settings = { ...job.export }; delete (settings as Partial<typeof settings>).twoKeyExportBoundary;
  assert.throws(() => parseSkeletalExportJobDocument({ ...job, export: settings }), /preservation/);
});

test('pelvis layer bounds meter-space requests and stored values without mutating caller tracks', () => {
  const model = fixture(), clip = model.clips[1], before = clip.tracks.map(t => Array.from(t.values));
  try {
    const baked = bakePelvisLayer(clip, spec, model.skeleton!.bones, model.root, 'Pelvis', 'Root', 2);
    assert.deepEqual(clip.tracks.map(t => Array.from(t.values)), before);
    assert.ok(baked.report.positions.every(p => p.storedCorrectionMeters < .06));
    assert.deepEqual(restorePelvisLayer(baked.clip, baked.report, model.skeleton!.bones, model.root, 'Root', 2).tracks.map(t => Array.from(t.values)), before);
    const bad = { ...spec, positions: [[.5, 1, 0], spec.positions[1]] }; assert.throws(() => bakePelvisLayer(clip, bad, model.skeleton!.bones, model.root, 'Pelvis', 'Root', 2), /meter-space/);
    model.skeleton!.bones.find(b => b.name === 'Root')!.scale.setScalar(4); model.root.updateMatrixWorld(true);
    assert.throws(() => bakePelvisLayer(clip, spec, model.skeleton!.bones, model.root, 'Pelvis', 'Root', 2), /meter-space/);
    const controller = new AbortController(); controller.abort(); assert.throws(() => bakePelvisLayer(clip, spec, model.skeleton!.bones, model.root, 'Pelvis', 'Root', 2, controller.signal));
    assert.deepEqual(clip.tracks.map(t => Array.from(t.values)), before);
  } finally { disposeThreeObject(model.root); }
});

test('overlapping span provenance reverses the pelvis layer first and exports only declared components', async () => {
  const model = fixture(), original = model.clips[1], options = { sourceIdentitySha256: 'a'.repeat(64), rootJoint: 'Root', conditionedRotationMode: CONDITIONING_NLERP_MODE };
  try {
    model.clips = [original]; const baseline = await prepareSkeletalExport(model, options);
    const spanTicks = [3, 4, 5, 6, 7, 8, 9];
    const span = bakeRotationSpan(original, { clipId: 'gait', startTick: 3, maxRotationDegrees: 25, rotations: names.slice(3).map(joint => ({ joint, values: spanTicks.map(t => q(.01 * t + .05)) })) }, model.skeleton!.bones, ['Root', 'Pelvis']);
    model.clips = [span.clip];
    const priorLayer = await prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, spanReport: span.report } });
    const baked = bakePelvisLayer(span.clip, spec, model.skeleton!.bones, model.root, 'Pelvis', 'Root', 2), context = { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, spanReport: span.report, pelvisReport: baked.report };
    assert.throws(() => twoKeyExportBaseline(baked.clip, { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, spanReport: span.report }, model.skeleton!.bones, ['Root']));
    assert.deepEqual(twoKeyExportBaseline(baked.clip, context, model.skeleton!.bones, ['Root'], undefined, model.root, 2).tracks.map(t => Array.from(t.values)), original.tracks.map(t => Array.from(t.values)));
    model.clips = [baked.clip]; const raw = await prepareSkeletalExport(model, options), fixed = await prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: context });
    assert.deepEqual(fixed.referenceBytes, raw.referenceBytes);
    for (const t of fixed.asset.clips[0].tracks) for (const k of t.keys) {
      const name = fixed.asset.joints[t.joint].id, base = baseline.asset.clips[0].tracks.find(x => x.joint === t.joint)!.keys.find(x => x.tick === k.tick)!, authored = raw.asset.clips[0].tracks.find(x => x.joint === t.joint)!.keys.find(x => x.tick === k.tick)!;
      assert.deepEqual(k.transform.translation, name === 'Pelvis' && [5, 6].includes(k.tick) ? authored.transform.translation : base.transform.translation);
      const prior = priorLayer.asset.clips[0].tracks.find(x => x.joint === t.joint)!.keys.find(x => x.tick === k.tick)!;
      assert.deepEqual(k.transform.rotation, [5, 6].includes(k.tick) && names.includes(name) ? authored.transform.rotation : prior.transform.rotation);
      assert.deepEqual(k.transform.scale, base.transform.scale);
    }
    for (const mutate of [(x: typeof context) => { x.pelvisReport.positions[1].after[0] += .001; }, (x: typeof context) => { x.pelvisReport.height *= 2; x.pelvisReport.maxTranslationMeters *= 2; }, (x: typeof context) => { x.pelvisReport.corrections[5].values[1].storedCorrectionDegrees += 1; }, (x: typeof context) => { x.pelvisReport.positions[0].storedCorrectionMeters = NaN; }]) {
      const bad = structuredClone(context); mutate(bad); await assert.rejects(prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: bad }));
    }
  } finally { disposeThreeObject(model.root); }
});

test('ordinary CLI admits pelvis-only authoring, validates fidelity, and leaves generations unchanged on refusal', async () => {
  installNodeThreeRuntime(); const dir = await mkdtemp(path.join(os.tmpdir(), 'rustsmf-pelvis-cli-')), source = fixture(false);
  try {
    const bytes = await exportGLB(source.root, source.clips); await writeFile(path.join(dir, 'source.glb'), bytes);
    const job = document(dir), file = path.join(dir, 'job.json'), cli = fileURLToPath(new URL('../../scripts/skeletal-export-cli.ts', import.meta.url));
    const invoke = async (value: unknown) => { await writeFile(file, JSON.stringify(value)); return spawnSync(process.execPath, ['--import', 'tsx', cli, '--job', file], { cwd: fileURLToPath(new URL('../..', import.meta.url)), encoding: 'utf8', windowsHide: true, timeout: 30000 }); };
    const result = await invoke(job); assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout), report = JSON.parse(await readFile(output.conditioning.report, 'utf8'));
    assert.equal(report.pelvisLayerBake.positions.length, 2); assert.equal(report.pelvisLayerBake.corrections.length, 6);
    assert.ok(report.differences.every((r: { maximumPreservedTickJointMatrix: number }) => r.maximumPreservedTickJointMatrix < 1e-4));
    const original = await loadGLB(Uint8Array.from(bytes).buffer), derived = await loadGLB(Uint8Array.from(await readFile(output.conditioning.model)).buffer);
    try {
      assert.throws(() => measureConditioningDifferences(original, derived, ['idle', 'gait']), /preservation/);
      assert.doesNotThrow(() => measureConditioningDifferences(original, derived, ['idle', 'gait'], undefined, undefined, undefined, undefined, undefined, spec, report.pelvisLayerBake));
      const missing = structuredClone(spec); missing.positions[0][0] += .001;
      assert.throws(() => measureConditioningDifferences(original, derived, ['idle', 'gait'], undefined, undefined, undefined, undefined, undefined, missing, report.pelvisLayerBake), /differs/);
    } finally { disposeThreeObject(original.root); disposeThreeObject(derived.root); }
    const generations = await readdir(job.output.generationRoot), bad = structuredClone(job); bad.conditioning.pelvisLayerBake.positions[1][0] = 10;
    assert.notEqual((await invoke(bad)).status, 0); assert.deepEqual(await readdir(job.output.generationRoot), generations);
  } finally { disposeThreeObject(source.root); await rm(dir, { recursive: true, force: true }); }
});

test('provenance rejects sparse snapshots and negative zero-correction meter claims without mutating inputs', () => {
  const model = fixture(), clip = model.clips[1], before = clip.tracks.map(t => Array.from(t.values));
  try {
    const zero = { ...spec, positions: [[0, 1, 0], [0, 1, 0]] }, baked = bakePelvisLayer(clip, zero, model.skeleton!.bones, model.root, 'Pelvis', 'Root', 2);
    for (const kind of ['position-before', 'position-after', 'rotation-before', 'rotation-after', 'negative-requested', 'negative-stored']) {
      const bad = structuredClone(baked.report);
      if (kind === 'position-before') bad.positions[0].before = Array(3);
      if (kind === 'position-after') bad.positions[0].after = Array(3);
      if (kind === 'rotation-before') bad.corrections[0].values[0].before = Array(4);
      if (kind === 'rotation-after') bad.corrections[0].values[0].after = Array(4);
      if (kind === 'negative-requested') bad.positions[0].requestedCorrectionMeters = -1e-10;
      if (kind === 'negative-stored') bad.positions[0].storedCorrectionMeters = -1e-10;
      assert.throws(() => restorePelvisLayer(baked.clip, bad, model.skeleton!.bones, model.root, 'Root', 2), /provenance/);
    }
    assert.deepEqual(restorePelvisLayer(baked.clip, baked.report, model.skeleton!.bones, model.root, 'Root', 2).tracks.map(t => Array.from(t.values)), before);
    assert.deepEqual(clip.tracks.map(t => Array.from(t.values)), before);
  } finally { disposeThreeObject(model.root); }
});

test('late pelvis translation and cancellation failures leave original clip arrays unpublished', async () => {
  installNodeThreeRuntime(); let calls = 0;
  const good = fixture(false); try { await conditionSkeletalModel(good, recipe(), { throwIfAborted() { calls++; } } as AbortSignal); } finally { disposeThreeObject(good.root); }
  for (const cancel of [false, true]) {
    const model = fixture(false), clips = model.clips, values = clips.map(c => c.tracks.map(t => Array.from(t.values))), bad = recipe(); bad.pelvisLayerBake.positions[1][0] = 10; let seen = 0;
    try {
      await assert.rejects(conditionSkeletalModel(model, cancel ? recipe() : bad, cancel ? { throwIfAborted() { if (++seen === calls - 1) throw new Error('cancel pelvis layer'); } } as AbortSignal : undefined), cancel ? /cancel pelvis/ : /meter-space/);
      assert.equal(model.clips, clips); assert.deepEqual(clips.map(c => c.tracks.map(t => Array.from(t.values))), values);
    } finally { disposeThreeObject(model.root); }
  }
});
