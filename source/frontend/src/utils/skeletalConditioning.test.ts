import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { loadGLB } from '../loaders/glb';
import { bytesToArrayBuffer } from '../loaders/smfBinary';
import { installNodeThreeRuntime } from '../../scripts/node-three-runtime';
import { disposeThreeObject } from './threeDisposal';
import { conditionSkeletalModel, CONDITIONING_MODE, CONDITIONING_NLERP_MODE, measureConditioningDifferences, type ConditioningRecipe } from './skeletalConditioning';
import { trackInterpolation } from './animationTrackInterpolation';
import { prepareSkeletalExport } from './skeletalExport';

test('conditioning serializes continuous poses with unweighted root, retained tilt and bind geometry', async () => {
  installNodeThreeRuntime();
  const original = await fixture();
  let derived: Awaited<ReturnType<typeof loadGLB>> | undefined;
  try {
    const base = original.skeleton!.bones[0];
    original.clips = [new THREE.AnimationClip('idle', 2 / 60, [
      new THREE.QuaternionKeyframeTrack(`${base.name}.quaternion`, [0, 1 / 60, 2 / 60], [0, 0, 0, 1, ...new THREE.Quaternion().setFromEuler(new THREE.Euler(.15, .2, .1)).toArray(), 0, 0, 0, 1], THREE.InterpolateDiscrete),
    ])];
    const before = original.skinnedMeshes.map(m => Array.from(m.geometry.getAttribute('position').array));
    const result = await conditionSkeletalModel(original, { mode: CONDITIONING_MODE, sourceRootJoint: base.name, locomotionRootJoint: 'LocomotionRoot', clipIds: ['idle'], transitions: [] });
    derived = await loadGLB(bytesToArrayBuffer(result.bytes));
    assert.equal(derived.skeleton!.bones.length, 6);
    assert.deepEqual(derived.skinnedMeshes.map(m => Array.from(m.geometry.getAttribute('position').array)), before);
    assert.ok(derived.clips[0].tracks.every(t => t.getInterpolation() === THREE.InterpolateLinear));
    const packet = await prepareSkeletalExport(derived, { sourceIdentitySha256: 'a'.repeat(64), rootJoint: 'LocomotionRoot' });
    const hip = packet.asset.joints.findIndex(j => j.id === base.name);
    const middle = packet.asset.clips[0].tracks.find(t => t.joint === hip)!.keys[1];
    assert.ok(Math.abs(middle.transform.rotation[0]) > .01);
    assert.ok(packet.asset.mesh.weights.every((w, i) => w.every((weight, j) => weight === 0 || packet.asset.mesh.joints[i][j] !== 0)));
    assert.equal(result.report.vertexLineage.reduce((n, m) => n + m.count, 0), 2400);
  } finally { disposeThreeObject(original.root); if (derived) disposeThreeObject(derived.root); }
});

async function fixture(): Promise<Awaited<ReturnType<typeof loadGLB>>> {
  installNodeThreeRuntime();
  return loadGLB(bytesToArrayBuffer(await readFile(fileURLToPath(new URL('../../../../examples/rustsmf-demo.glb', import.meta.url)))));
}
const recipe: ConditioningRecipe = { mode: CONDITIONING_MODE, sourceRootJoint: 'Base', locomotionRootJoint: 'LocomotionRoot', clipIds: ['Wave', 'Turn'], transitions: [{ idle: 'Wave', gait: 'Turn', phases: [0, .25, .5, .75], durationTicks: 6 }] };

test('explicit authored idle reports changed source ticks while retaining endpoint and other-role guards',async()=>{
  const original=await fixture(),derived=await fixture();
  try {
    const base=original.skeleton!.bones[0],values=[base.position.toArray(),base.position.toArray(),base.position.toArray()].flat();
    original.clips=[new THREE.AnimationClip('idle',2/60,[new THREE.VectorKeyframeTrack(`${base.name}.position`,[0,1/60,2/60],values)])];
    const corrected=[...values];corrected[3]+=.05;
    derived.clips=[new THREE.AnimationClip('idle',2/60,[new THREE.VectorKeyframeTrack(`${base.name}.position`,[0,1/60,2/60],corrected)])];
    assert.throws(()=>measureConditioningDifferences(original,derived,['idle']),/tick-pose preservation/);
    assert.throws(()=>measureConditioningDifferences(original,derived,['idle'],'other'),/tick-pose preservation/);
    const report=measureConditioningDifferences(original,derived,['idle'],'idle')[0];
    assert.ok(report.maximumTickJointMatrix>.01);assert.ok(report.maximumEndpointJointMatrix<1e-6);
    assert.match(report.differenceKind,/explicit planted/);
    derived.clips[0].tracks[0].values[6]+=.1;
    assert.throws(()=>measureConditioningDifferences(original,derived,['idle'],'idle'),/tick-pose preservation/);
  }finally{disposeThreeObject(original.root);disposeThreeObject(derived.root);}
});

test('transition floor is opt-in and modifies no unselected clip channels', async () => {
  const a = await fixture(), b = await fixture();
  try {
    const baseline = await conditionSkeletalModel(a, { ...recipe, mode: CONDITIONING_NLERP_MODE });
    const selected = await conditionSkeletalModel(b, { ...recipe, mode: CONDITIONING_NLERP_MODE,
      transitionFloor: { clipIds: ['start-Turn-p25', 'stop-Turn-p25'], floorY: -100, maxLiftMeters: .1 } });
    assert.deepEqual(selected.bytes, baseline.bytes);
    assert.equal(baseline.report.floorBakes, undefined);
    assert.deepEqual(selected.report.floorBakes!.map(r => r.clipId), ['start-Turn-p25', 'stop-Turn-p25']);
    assert.ok(selected.report.floorBakes!.every(r => r.rootYLiftByTick.every(v => v === 0)));
  } finally { disposeThreeObject(a.root); disposeThreeObject(b.root); }
});

test('opt-in NLERP survives GLB serialization, matches fractional gait endpoints and unwraps root yaw', async () => {
  const model = await fixture(); let derived: Awaited<ReturnType<typeof loadGLB>> | undefined;
  try {
    const base = model.skeleton!.bones[0], child = model.skeleton!.bones[1];
    const times = Array.from({ length: 6 }, (_, i) => i / 60);
    const rotations = times.flatMap((_, i) => new THREE.Quaternion().setFromEuler(new THREE.Euler(i % 2 ? 2.6 : .1, .15 * i, .05)).toArray());
    model.clips = [new THREE.AnimationClip('idle', 2 / 60, []), new THREE.AnimationClip('gait', 5 / 60, [
      new THREE.QuaternionKeyframeTrack(`${base.name}.quaternion`, times, times.flatMap((_, i) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 2.8 + .8 * i / 5).toArray())),
      new THREE.QuaternionKeyframeTrack(`${child.name}.quaternion`, times, rotations, THREE.InterpolateDiscrete),
    ])];
    const result = await conditionSkeletalModel(model, { ...recipe, mode: CONDITIONING_NLERP_MODE, clipIds: ['idle', 'gait'], transitions: [{ idle: 'idle', gait: 'gait', phases: [0, .25, .5, .75], durationTicks: 6 }] });
    derived = await loadGLB(bytesToArrayBuffer(result.bytes));
    assert.ok(derived.clips.flatMap(c => c.tracks).some(t => trackInterpolation(t) === 'gltf-cubic-spline'));
    assert.ok(derived.clips.flatMap(c => c.tracks).filter(t => t.name.startsWith('LocomotionRoot.')).every(t => t.getInterpolation() === THREE.InterpolateLinear));
    const at = (id: string, tick: number): number[][] => {
      const mixer = new THREE.AnimationMixer(derived!.root), action = mixer.clipAction(derived!.clips.find(c => c.name === id)!);
      action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
      try { mixer.setTime(tick / 60); derived!.root.updateMatrixWorld(true); return derived!.skeleton!.bones.map(b => [...b.matrixWorld.elements]); }
      finally { action.stop(); mixer.uncacheRoot(derived!.root); }
    };
    const near = (a: number[][], b: number[][]): void => assert.ok(a.every((row, i) => row.every((v, c) => Math.abs(v - b[i][c]) < 2e-5)));
    for (const phase of [0, .25, .5, .75]) {
      near(at(`start-gait-p${phase * 100}`, 6), at('gait', phase * 5));
      near(at(`stop-gait-p${phase * 100}`, 0), at('gait', phase * 5));
      near(at(`stop-gait-p${phase * 100}`, 6), at('idle', 0));
    }
    const selected = { ...derived, clips: derived.clips.filter(c => c.name === 'gait') };
    await assert.rejects(prepareSkeletalExport(selected, { sourceIdentitySha256: 'a'.repeat(64), rootJoint: 'LocomotionRoot' }), /unsupported/);
    const options = { sourceIdentitySha256: 'a'.repeat(64), rootJoint: 'LocomotionRoot', conditionedRotationMode: CONDITIONING_NLERP_MODE };
    const packet = await prepareSkeletalExport(selected, options);
    assert.ok(packet.asset.clips[0].root.at(-1)!.yaw > Math.PI);
    assert.ok(packet.asset.clips[0].root.every((key, i, keys) => !i || Math.abs(key.yaw - keys[i - 1].yaw) < Math.PI));
    const cubic = selected.clips[0].tracks.find(t => trackInterpolation(t) === 'gltf-cubic-spline')!;
    cubic.values[8] += .001;
    await assert.rejects(prepareSkeletalExport(selected, options), /canonical conditioned NLERP/);
  } finally { disposeThreeObject(model.root); if (derived) disposeThreeObject(derived.root); }
});

test('serialized conditioning is deterministic and retains a scaled authored bind shape and source tick poses', async () => {
  const a = await fixture(), b = await fixture(), reference = await fixture();
  let derived: Awaited<ReturnType<typeof loadGLB>> | undefined;
  try {
    for (const model of [a, b, reference]) {
      const parent = new THREE.Group(); parent.scale.setScalar(4.407004976352389);
      for (const child of [...model.root.children]) parent.add(child);
      model.root.add(parent); model.root.updateMatrixWorld(true);
      model.clips.forEach(c => c.tracks.forEach(t => t.setInterpolation(THREE.InterpolateDiscrete)));
    }
    const left = await conditionSkeletalModel(a, recipe), right = await conditionSkeletalModel(b, recipe);
    assert.deepEqual(left.bytes, right.bytes);
    assert.deepEqual(left.report, right.report);
    derived = await loadGLB(bytesToArrayBuffer(left.bytes));
    assert.equal(derived.clips.length, 14);
    const differences = measureConditioningDifferences(reference, derived, recipe.clipIds);
    assert.ok(differences.every(row => row.maximumTickJointMatrix < 1e-4));
    assert.ok(differences.some(row => row.maximumPositionMeters > .01));
    const prepared = await prepareSkeletalExport({ ...derived, clips: derived.clips.filter(c => c.name === 'Turn') }, { sourceIdentitySha256: 'a'.repeat(64), rootJoint: 'LocomotionRoot' });
    assert.equal(prepared.mapping.sourceVertexCount, 2400);
    assert.ok(prepared.asset.mesh.positions.some(p => Math.abs(p[1]) > 2));
    for (const c of left.report.transitions) assert.equal(c.durationTicks, 6);
  } finally { for (const model of [a, b, reference, derived]) if (model) disposeThreeObject(model.root); }
});

test('six-tick transitions retain both endpoint poses and quarter-phase entry selection', async () => {
  const model = await fixture(); let derived: Awaited<ReturnType<typeof loadGLB>> | undefined;
  try {
    const result = await conditionSkeletalModel(model, recipe);
    derived = await loadGLB(bytesToArrayBuffer(result.bytes));
    const at = (name: string, tick: number): number[][] => {
      const mixer = new THREE.AnimationMixer(derived!.root), clip = derived!.clips.find(c => c.name === name)!;
      const action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
      try { mixer.setTime(Math.fround(tick / 60)); derived!.root.updateMatrixWorld(true); return derived!.skeleton!.bones.map(b => [...b.matrixWorld.elements]); }
      finally { action.stop(); mixer.uncacheRoot(derived!.root); }
    };
    const near = (a: number[][], b: number[][]): void => { assert.ok(a.every((row, i) => row.every((v, j) => Math.abs(v - b[i][j]) < 1e-5))); };
    for (const phase of [0, .25, .5, .75]) {
      near(at(`start-Turn-p${phase * 100}`, 0), at('Wave', 0));
      near(at(`start-Turn-p${phase * 100}`, 6), at('Turn', phase * 120));
      near(at(`stop-Turn-p${phase * 100}`, 0), at('Turn', phase * 120));
      near(at(`stop-Turn-p${phase * 100}`, 6), at('Wave', 0));
      const initial = at(`reversal-Turn-p${phase * 100}`, 0), final = at(`reversal-Turn-p${phase * 100}`, 6);
      const rootIndex = derived.skeleton!.bones.findIndex(b => b.name === 'LocomotionRoot');
      const q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().fromArray(initial[rootIndex]));
      const q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().fromArray(final[rootIndex]));
      assert.ok(Math.abs(q0.angleTo(q1) - Math.PI) < 1e-6);
    }
  } finally { disposeThreeObject(model.root); if (derived) disposeThreeObject(derived.root); }
});

test('conditioning rejects unsupported channels, duplicate selection and cancellation', async () => {
  for (const mutation of ['channel', 'duplicate', 'cancel']) {
    const model = await fixture();
    try {
      const selected = structuredClone(recipe), controller = new AbortController();
      if (mutation === 'channel') model.clips[0].tracks.push(new THREE.NumberKeyframeTrack('Base.visible', [0, 1], [0, 1]));
      if (mutation === 'duplicate') selected.clipIds.push('Wave');
      if (mutation === 'cancel') controller.abort(new Error('test cancellation'));
      await assert.rejects(conditionSkeletalModel(model, selected, controller.signal), /unsupported channel|unique source clips|test cancellation/);
    } finally { disposeThreeObject(model.root); }
  }
});
