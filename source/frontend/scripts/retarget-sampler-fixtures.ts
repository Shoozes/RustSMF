import assert from 'node:assert/strict';
import * as THREE from 'three';
import { portableBakeRequest, type PortableBakeRequestV1, type PortableClipV1, type PortablePoseV1, type PortableSampleResponseV1 } from '../src/workers/retargetPortable';
import { snapshotClip, snapshotSkeleton } from '../src/workers/retargetSnapshot';
import { restoreTrackInterpolation, createTrackInterpolant } from '../src/utils/animationTrackInterpolation';
import { buildRigMap } from '../src/utils/rigMapping';
/** Independent Three interpolants; no Rust implementation is used by this reference. */
export function referenceSample(request: PortableBakeRequestV1): PortableSampleResponseV1 {
  const pose = (skeleton: typeof request.source, clip?: PortableClipV1, time = 0): PortablePoseV1 => {
    const local = skeleton.nodes.map(node => ({ position: [...node.position], quaternion: [...node.quaternion], scale: [...node.scale] }));
    for (const t of clip?.tracks ?? []) {
      const Constructor = t.property === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
      const track = new Constructor('sample', t.times, t.values);
      restoreTrackInterpolation(track, t.interpolation === 'gltf-cubic-spline' ? t.interpolation
        : ({ step: THREE.InterpolateDiscrete, linear: THREE.InterpolateLinear, smooth: THREE.InterpolateSmooth } as const)[t.interpolation]);
      local[t.node][t.property] = Array.from(createTrackInterpolant(track).evaluate(time));
    }
    const matrices: THREE.Matrix4[] = [];
    local.forEach((node, i) => {
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3().fromArray(node.position), new THREE.Quaternion().fromArray(node.quaternion), new THREE.Vector3().fromArray(node.scale));
      matrices.push(skeleton.nodes[i].parent === null ? matrix : matrices[skeleton.nodes[i].parent!].clone().multiply(matrix));
    });
    return { local, worldMatrices: matrices.map(m => m.toArray()) };
  };
  const clips: PortableSampleResponseV1['clips'] = [];
  request.clips.forEach((job, index) => {
    const candidates = [{ clip: job.clip, skeleton: request.source, role: 'source' },
      ...(job.sourceReferenceClip ? [{ clip: job.sourceReferenceClip, skeleton: request.source, role: 'source-reference' }] : []),
      ...(job.targetReferenceClip ? [{ clip: job.targetReferenceClip, skeleton: request.target, role: 'target-reference' }] : []),
      ...job.endpointTargetClips.map(clip => ({ clip, skeleton: request.target, role: 'endpoint-target' }))];
    for (const { clip, skeleton, role } of candidates) clips.push({ job: index, role, name: clip.name,
      samples: request.sampleTimes.map(time => ({ time, pose: pose(skeleton, clip, time) })) });
  });
  return { apiVersion: 1, stage: 'sampler', capabilities: ['sample-trs-v1'], status: 'sampled', targetRest: pose(request.target), clips };
}
function rig() {
  const helper = new THREE.Group(); helper.name = 'Helper'; helper.position.set(2, 3, -1); helper.rotation.z = Math.PI / 2; helper.scale.set(2, 1, 1);
  const root = new THREE.Bone(); root.name = 'Root'; root.position.y = 1; helper.add(root);
  const tip = new THREE.Bone(); tip.name = 'Tip'; tip.position.x = 1; root.add(tip); helper.updateMatrixWorld(true);
  return new THREE.Skeleton([root, tip]);
}
function request(tracks: THREE.KeyframeTrack[], times = [-1, 0, .25, .5, 1, 1.5, 2, 3]) {
  const source = rig(), target = rig();
  try { return portableBakeRequest({ source: snapshotSkeleton(source, 'current'), target: snapshotSkeleton(target, 'current'),
    mapping: buildRigMap(source, target, { manualMap: { Root: 'Root', Tip: 'Tip' } }),
    clips: [{ clip: snapshotClip(new THREE.AnimationClip('Fixture', 2, tracks)), options: {} }] }, times); }
  finally { source.dispose(); target.dispose(); }
}
export function samplerFixtures() {
  const vector = (name: string, values: number[], interpolation: THREE.InterpolationModes = THREE.InterpolateLinear, times = [0, 1, 2]) => new THREE.VectorKeyframeTrack(name, times, values, interpolation);
  const quaternion = (values: number[]) => new THREE.QuaternionKeyframeTrack('Tip.quaternion', [0, 2], values);
  const linear = request([vector('Root.position', [0, 0, 0, 2, 4, 6, 4, 8, 12]), vector('Tip.scale', [1, 1, 1, 2, 3, 4, 1, 1, 1])]);
  const smooth = request([vector('Root.position', [0, 0, 0, 2, 0, 0, 0, 0, 0], THREE.InterpolateSmooth)]);
  const step = request([vector('Root.position', [0, 0, 0, 2, 4, 6, 4, 8, 12], THREE.InterpolateDiscrete)]);
  const cubicVector = vector('Root.position', [0,0,0, 0,0,0, 1,0,0, 0,0,0, 2,0,0, 0,0,0], THREE.InterpolateLinear, [0, 2]);
  restoreTrackInterpolation(cubicVector, 'gltf-cubic-spline');
  const cubicRotation = quaternion([0,0,0,0, 0,0,0,1, 0,0,.6,0, 0,0,0,0, 0,0,Math.SQRT1_2,Math.SQRT1_2, 0,0,0,0]);
  restoreTrackInterpolation(cubicRotation, 'gltf-cubic-spline');
  const cubic = request([cubicVector, cubicRotation]);
  const constant = request([quaternion([0,0,0,1.00001, 0,0,0,1.00001])]);
  const antipodal = request([quaternion([0,0,0,1, 0,0,0,-1])]);
  const slerp = request([quaternion([0,0,0,1, 0,0,1,0])]);
  const small = request([quaternion([0,0,0,1, 0,0,Math.sin(.001),Math.cos(.001)])]);
  const boundary = Math.fround(1/30);
  const float32 = request([vector('Root.position', [0,0,0, 1,2,3, 2,4,6], THREE.InterpolateDiscrete, [0, boundary, 2])], [1/30, boundary-1e-10, boundary, boundary+1e-10]);
  const helper = request([vector('Helper.position', [2,3,-1, 3,4,0, 2,3,-1])]);
  const refs = structuredClone(linear);
  refs.clips[0].sourceReferenceClip = structuredClone(cubic.clips[0].clip);
  refs.clips[0].targetReferenceClip = structuredClone(smooth.clips[0].clip);
  refs.clips[0].endpointTargetClips = [structuredClone(step.clips[0].clip)];
  const single = request([new THREE.VectorKeyframeTrack('Root.position', [0], [7,8,9])]);
  const irregular = request([vector('Root.position', [0,0,0, 2,0,0, 1,0,0, 3,0,0], THREE.InterpolateSmooth, [0,.25,1,2])]);
  const zeroPose = (clip: typeof linear.clips[0]['clip']) => ({...structuredClone(clip), duration: 0,
    tracks: clip.tracks.map(t => ({...t, times: [0], values: t.values.slice(0, t.property === 'quaternion' ? 4 : 3)}))});
  const zeroSource = structuredClone(linear); zeroSource.clips[0].sourceReferenceClip = zeroPose(linear.clips[0].clip);
  const zeroTarget = structuredClone(linear); zeroTarget.clips[0].targetReferenceClip = zeroPose(linear.clips[0].clip);
  const zeroBoth = structuredClone(zeroSource); zeroBoth.clips[0].targetReferenceClip = zeroPose(linear.clips[0].clip);
  const unnamedHelpers = structuredClone(helper); unnamedHelpers.source.nodes[0].name = ''; unnamedHelpers.target.nodes[0].name = '';
  const positives = Object.entries({zeroSource, zeroTarget, zeroBoth, unnamedHelpers, linear, smooth, step, cubic, constant, antipodal, slerp, small, float32, helper, references: refs, single, irregular });
  assert.equal(referenceSample(cubic).clips[0].samples.find(s => s.time === .5)!.pose.local[1].position[0], .59375);
  assert.equal(referenceSample(smooth).clips[0].samples.find(s => s.time === .5)!.pose.local[1].position[0], 1.25);
  assert.deepEqual(referenceSample(linear).clips[0].samples.find(s => s.time === 0)!.pose.worldMatrices[2].slice(12,15).map(v => Math.round(v)), [2,5,-1]);
  const negatives: Array<{ name: string; request: unknown; code: string }> = [];
  const bad = (name: string, mutate: (r: PortableBakeRequestV1) => void, code = 'SAMPLER_INPUT_INVALID') => {
    const input = structuredClone(linear); mutate(input); negatives.push({ name, request: input, code });
  };
  bad('unsupported-bake', r => { r.operation = 'bake'; }, 'SAMPLER_UNSUPPORTED_FEATURE');
  bad('unsupported-options', r => { r.clips[0].options = { scaleRootMotion: false }; }, 'SAMPLER_UNSUPPORTED_FEATURE');
  bad('unknown-option', r => { r.clips[0].options = { future: true }; }, 'SAMPLER_UNSUPPORTED_FEATURE');
  bad('zero-moving-duration', r => {r.clips[0].clip.duration = 0;});
  bad('zero-reference-multiple-keys', r => {r.clips[0].sourceReferenceClip = structuredClone(r.clips[0].clip); r.clips[0].sourceReferenceClip.duration = 0;});
  bad('too-many-source-bones', r => {r.source.bones = Array(513).fill(1);});
  bad('too-many-target-bones', r => {r.target.bones = Array(513).fill(1);});
  bad('version', r => { r.apiVersion = 2 as 1; });
  bad('cyclic-parent', r => { r.source.nodes[0].parent = 2; });
  bad('duplicate-name', r => { r.source.nodes[1].name = r.source.nodes[0].name; });
  bad('missing-node', r => { r.clips[0].clip.tracks[0].node = 9000; });
  bad('duplicate-channel', r => { r.clips[0].clip.tracks.push(r.clips[0].clip.tracks[0]); });
  bad('invalid-key-order', r => { r.clips[0].clip.tracks[0].times[1] = 0; });
  bad('float32-collapsed-keys', r => { r.clips[0].clip.tracks[0].times = [0, 1, 1+1e-10]; });
  bad('invalid-values', r => { r.clips[0].clip.tracks[0].values.pop(); });
  bad('nonfinite-null', r => { r.clips[0].clip.tracks[0].values[0] = NaN; });
  bad('overflowing-float32', r => { r.clips[0].clip.tracks[0].values[0] = 1e100; });
  bad('unknown-interpolation', r => { r.clips[0].clip.tracks[0].interpolation = 'unknown' as 'linear'; }, 'SAMPLER_UNSUPPORTED_FEATURE');
  bad('additive-clip', r => { r.clips[0].clip.blendMode = 2501; }, 'SAMPLER_UNSUPPORTED_FEATURE');
  bad('duplicate-map-target', r => { r.mapping.Tip = 'Root'; });
  bad('zero-quaternion', r => { r.source.nodes[0].quaternion = [0,0,0,0]; });
  bad('too-many-nodes', r => { r.source.nodes = Array(4097).fill(r.source.nodes[0]); });
  bad('too-many-times', r => { r.sampleTimes = Array(20_001).fill(0); });
  bad('output-budget', r => { r.sampleTimes = Array(20_000).fill(0); r.clips = Array(12).fill(r.clips[0]); }, 'SAMPLER_OUTPUT_LIMIT');
  return { positives: positives.map(([name, input]) => ({ name, input, expected: referenceSample(input) })), negatives };
}

export async function decodedSamplerFixture() {
  const { createCubicRetargetFixtureInput } = await import('../tests/helpers/cubic-retarget-fixture');
  const { loadGLB } = await import('../src/loaders/glb');
  const { disposeThreeObject } = await import('../src/utils/threeDisposal');
  const { buffer } = await createCubicRetargetFixtureInput();
  const model = await loadGLB(Uint8Array.from(buffer).buffer);
  try {
    const skeleton = model.skeleton!;
    const input = portableBakeRequest({ source: snapshotSkeleton(skeleton, 'current'), target: snapshotSkeleton(skeleton, 'current'),
      mapping: buildRigMap(skeleton,skeleton,{ manualMap: Object.fromEntries(skeleton.bones.map(bone => [bone.name,bone.name])) }),
      clips: [{ clip: snapshotClip(model.clips[0]), options: {} }] }, [0,.5,1,1.5,2]);
    const expected = referenceSample(input);
    const middle = expected.clips[0].samples[2].pose;
    assert.equal(middle.local[input.source.nodes.findIndex(n => n.name === 'FixtureRoot')].position[0], 1.25);
    assert.equal(middle.local[input.source.nodes.findIndex(n => n.name === 'FixtureTip')].scale[0], 1.3125);
    return { name: 'decoded-gltf-cubic', input, expected };
  } finally { model.mixer.stopAllAction(); model.mixer.uncacheRoot(model.root); disposeThreeObject(model.root); }
}
