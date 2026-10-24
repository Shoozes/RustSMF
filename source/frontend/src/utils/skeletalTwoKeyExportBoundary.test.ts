import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type { LoadedModel } from '../loaders/glb';
import { prepareSkeletalExport } from './skeletalExport';
import { bakeTwoKeyRotations } from './skeletalTwoKeyRotation';
import { chordRotationTrack, CONDITIONING_NLERP_MODE } from './skeletalChordRotation';
import { TWO_KEY_EXPORT_BOUNDARY_POLICY, twoKeyExportBaseline, type TwoKeyExportBoundary } from './skeletalTwoKeyExportBoundary';
import { disposeThreeObject } from './threeDisposal';

const quat = (angle: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle).toArray();
function fixture(): LoadedModel {
  const root = new THREE.Group(), bones = ['Base', 'Leg', 'Knee', 'Foot'].map(name => { const b = new THREE.Bone(); b.name = name; return b; });
  root.add(bones[0]); bones.slice(1).forEach((b, i) => { bones[i].add(b); b.position.y = 1; });root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones), geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, .1, 1, 0, -.1, 2, 0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));geometry.setIndex([0, 1, 2]);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());root.add(mesh);mesh.bind(skeleton);
  const times = Array.from({ length: 91 }, (_, tick) => Math.fround(tick / 60));
  const tracks = bones.slice(1).map(b => chordRotationTrack(b.name + '.quaternion', times, times.flatMap((_, tick) => quat(.01 * tick))));
  return { root, skeleton, skinnedMeshes: [mesh], clips: [new THREE.AnimationClip('gait', times[90], tracks)], mixer: new THREE.AnimationMixer(root) };
}
function authored(model: LoadedModel, startTick: number) {
  const clip = model.clips[0], baked = bakeTwoKeyRotations(clip, { clipId: 'gait', startTick, maxRotationDegrees: 13,
    rotations: ['Leg', 'Knee', 'Foot'].map(joint => ({ joint, values: [quat(.01 * startTick + .1), quat(.01 * (startTick + 1) + .1)] })) }, model.skeleton!.bones, ['Base']);
  return { baked, context: { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, report: baked.report } satisfies TwoKeyExportBoundary };
}
for (const startTick of [43, 87]) test(`export boundary preserves emitted keys when float32 times straddle nominal ticks (${startTick})`, async () => {
  const model = fixture(), options = { sourceIdentitySha256: 'a'.repeat(64), rootJoint: 'Base', conditionedRotationMode: CONDITIONING_NLERP_MODE };
  try {
    const baseline = await prepareSkeletalExport(model, options), { baked, context } = authored(model, startTick), before = JSON.stringify(context);
    model.clips = [baked.clip];const raw = baked.clip.tracks.map(t => Array.from(t.values));
    const legacy = await prepareSkeletalExport(model, options);
    const fixed = await prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: context });
    assert.deepEqual(fixed.asset.mesh, baseline.asset.mesh);assert.deepEqual(fixed.asset.joints, baseline.asset.joints);
    assert.deepEqual(fixed.asset.clips[0].root, baseline.asset.clips[0].root);
    let legacyLeaks = 0;
    for (let track = 0; track < baseline.asset.clips[0].tracks.length; track++) for (let key = 0; key <= 90; key++) {
      const a = baseline.asset.clips[0].tracks[track].keys[key], b = legacy.asset.clips[0].tracks[track].keys[key], c = fixed.asset.clips[0].tracks[track].keys[key];
      if (key === startTick || key === startTick + 1) assert.deepEqual(c, b);
      else { assert.deepEqual(c, a);if (JSON.stringify(a) !== JSON.stringify(b)) legacyLeaks++; }
    }
    assert.ok(legacyLeaks > 0, 'fixture must expose the old emitted boundary leak');
    assert.deepEqual(fixed.references, legacy.references, 'independent references must always sample the authored curve');
    assert.deepEqual((await prepareSkeletalExport(model, options)).assetBytes, legacy.assetBytes, 'omitted context preserves legacy output');
    assert.deepEqual((await prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: context })).assetBytes, fixed.assetBytes);
    assert.equal(JSON.stringify(context), before);assert.deepEqual(baked.clip.tracks.map(t => Array.from(t.values)), raw);
  } finally { disposeThreeObject(model.root); }
});
test('boundary context refuses stale, malformed or out-of-bound provenance and preserves input on cancellation', () => {
  const model = fixture();
  try {
    const { baked, context } = authored(model, 43), raw = baked.clip.tracks.map(t => Array.from(t.values));
    const restored = twoKeyExportBaseline(baked.clip, context, model.skeleton!.bones, ['Base']);
    assert.deepEqual(restored.tracks.map(t => Array.from(t.values)), model.clips[0].tracks.map(t => Array.from(t.values)));
    for (const mutate of [
      (c: typeof context) => { c.report.ticks[1]++; },
      (c: typeof context) => { c.report.corrections[0].values[0].after[0] += .01; },
      (c: typeof context) => { c.report.corrections[0].values[0].before[0] = NaN; },
      (c: typeof context) => { c.report.maxRotationDegrees = .01; },
      (c: typeof context) => { c.report.corrections[0].values[0].storedCorrectionDegrees = 0; },
    ]) { const bad = structuredClone(context);mutate(bad);assert.throws(() => twoKeyExportBaseline(baked.clip, bad, model.skeleton!.bones, ['Base'])); }
    const abort = new AbortController();abort.abort(new Error('cancel boundary'));assert.throws(() => twoKeyExportBaseline(baked.clip, context, model.skeleton!.bones, ['Base'], abort.signal), /cancel boundary/);
    assert.deepEqual(baked.clip.tracks.map(t => Array.from(t.values)), raw);
  } finally { disposeThreeObject(model.root); }
});

test('plural boundary restores a shared channel union, preserves singular bytes and is order independent', async () => {
  const model = fixture(), options = { sourceIdentitySha256: 'a'.repeat(64), rootJoint: 'Base', conditionedRotationMode: CONDITIONING_NLERP_MODE };
  try {
    const original = model.clips[0], baseline = await prepareSkeletalExport(model, options), first = authored(model, 43);
    model.clips = [first.baked.clip];
    const singular = await prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: first.context });
    assert.deepEqual((await prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, reports: [first.baked.report] } })).assetBytes, singular.assetBytes);
    const second = authored(model, 87); model.clips = [second.baked.clip];
    const context = { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, reports: [first.baked.report, second.baked.report] };
    const raw = second.baked.clip.tracks.map(t => Array.from(t.values)), provenance = JSON.stringify(context);
    assert.deepEqual(twoKeyExportBaseline(second.baked.clip, context, model.skeleton!.bones, ['Base']).tracks.map(t => Array.from(t.values)), original.tracks.map(t => Array.from(t.values)));
    const legacy = await prepareSkeletalExport(model, options), fixed = await prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: context });
    const reverse = await prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: { ...context, reports: [...context.reports].reverse() } });
    assert.deepEqual(fixed.assetBytes, reverse.assetBytes); assert.deepEqual(fixed.mappingBytes, reverse.mappingBytes); assert.deepEqual(fixed.referenceBytes, reverse.referenceBytes);
    for (let t = 0; t < fixed.asset.clips[0].tracks.length; t++) for (let tick = 0; tick <= 90; tick++) {
      assert.deepEqual(fixed.asset.clips[0].tracks[t].keys[tick], ([43,44,87,88].includes(tick) ? legacy : baseline).asset.clips[0].tracks[t].keys[tick]);
      if (tick !== 87 && tick !== 88) assert.deepEqual(fixed.asset.clips[0].tracks[t].keys[tick], singular.asset.clips[0].tracks[t].keys[tick]);
    }
    assert.deepEqual(fixed.referenceBytes, legacy.referenceBytes); assert.deepEqual(fixed.asset.mesh, baseline.asset.mesh);
    assert.deepEqual(fixed.asset.joints, baseline.asset.joints); assert.deepEqual(fixed.asset.clips[0].root, baseline.asset.clips[0].root);
    assert.equal(JSON.stringify(context), provenance); assert.deepEqual(second.baked.clip.tracks.map(t => Array.from(t.values)), raw);
    const before = model.skeleton!.bones.map(b => b.quaternion.toArray());
    for (const reports of [[], [first.baked.report, first.baked.report], [...context.reports, first.baked.report],
      [first.baked.report, { ...second.baked.report, maxRotationDegrees: .01 }]]) {
      await assert.rejects(prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: { ...context, reports } }));
      assert.deepEqual(model.skeleton!.bones.map(b => b.quaternion.toArray()), before);
    }
    const ambiguous = { ...context, report: first.baked.report } as unknown as TwoKeyExportBoundary;
    await assert.rejects(prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: ambiguous }));
    const abort = new AbortController(); setImmediate(() => abort.abort(new Error('cancel plural baseline')));
    await assert.rejects(prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: context, signal: abort.signal, yieldEvery: 1 }), /cancel plural baseline/);
    assert.deepEqual(model.skeleton!.bones.map(b => b.quaternion.toArray()), before);
  } finally { disposeThreeObject(model.root); }
});

test('plural boundary matches reports by clip and refuses a stale later clip before sampling', async () => {
  const model = fixture(), options = { sourceIdentitySha256: 'a'.repeat(64), rootJoint: 'Base', conditionedRotationMode: CONDITIONING_NLERP_MODE };
  try {
    const first = authored(model, 43), other = model.clips[0].clone(); other.name = 'other'; model.clips = [other];
    const secondSpec = { clipId: 'other', startTick: 87, maxRotationDegrees: 13,
      rotations: ['Leg','Knee','Foot'].map(joint => ({ joint, values: [quat(.97),quat(.98)] })) };
    const second = bakeTwoKeyRotations(other, secondSpec, model.skeleton!.bones, ['Base']);
    model.clips = [first.baked.clip, second.clip];
    const context = { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, reports: [second.report, first.baked.report] };
    const fixed = await prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: context });
    for (const [index, report] of [first.baked.report, second.report].entries()) {
      const one = await prepareSkeletalExport({ ...model, clips: [model.clips[index]] }, { ...options, twoKeyExportBoundary: { policy: TWO_KEY_EXPORT_BOUNDARY_POLICY, report } });
      assert.deepEqual(fixed.asset.clips[index], one.asset.clips[0]);
    }
    const bad = structuredClone(context); bad.reports[0].corrections[0].values[0].after[0] += .01;
    const before = model.skeleton!.bones.map(b => b.quaternion.toArray());
    await assert.rejects(prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: bad }));
    assert.deepEqual(model.skeleton!.bones.map(b => b.quaternion.toArray()), before);
    await assert.rejects(prepareSkeletalExport({ ...model, clips: [model.clips[0]] }, { ...options, twoKeyExportBoundary: context }), /requires its selected/);
  } finally { disposeThreeObject(model.root); }
});

test('export-boundary sampling is NLERP-only and cancellation releases the baseline mixer state', async () => {
  const model = fixture(), options = { sourceIdentitySha256: 'a'.repeat(64), rootJoint: 'Base', conditionedRotationMode: CONDITIONING_NLERP_MODE };
  try {
    const { baked, context } = authored(model, 43);model.clips = [baked.clip];
    await assert.rejects(prepareSkeletalExport(model, { ...options, conditionedRotationMode: undefined, twoKeyExportBoundary: context }), /requires its selected conditioned NLERP/);
    const before = model.skeleton!.bones.map(b => [b.position.toArray(), b.quaternion.toArray(), b.scale.toArray()]);
    const abort = new AbortController();setImmediate(() => abort.abort(new Error('cancel baseline mixer')));
    await assert.rejects(prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: context, signal: abort.signal, yieldEvery: 1 }), /cancel baseline mixer/);
    assert.deepEqual(model.skeleton!.bones.map(b => [b.position.toArray(), b.quaternion.toArray(), b.scale.toArray()]), before);
    assert.equal((await prepareSkeletalExport(model, { ...options, twoKeyExportBoundary: context })).asset.clips.length, 1);
  } finally { disposeThreeObject(model.root); }
});
