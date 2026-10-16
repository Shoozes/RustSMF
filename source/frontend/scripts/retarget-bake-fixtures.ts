import assert from 'node:assert/strict';
import * as THREE from 'three';
import { retargetAnimationClip, type AnimationRetargetOptions } from '../src/utils/animationRetarget';
import { buildRigMap } from '../src/utils/rigMapping';
import { snapshotSkeleton, snapshotClip, snapshotOptions, restoreSkeleton, restoreClip, restoreOptions } from '../src/workers/retargetSnapshot';
import { portableBakeRequest, type PortableBakeResponseV1 } from '../src/workers/retargetPortable';
import { RETARGET_OPTIONS, RETARGET_REPORTS } from '../src/workers/retargetInventory';
import type { BakeInput } from '../src/workers/retargetProtocol';
import { restoreTrackInterpolation } from '../src/utils/animationTrackInterpolation';

export const CORE_OPTIONS = Object.keys(RETARGET_OPTIONS).filter(k => RETARGET_OPTIONS[k as keyof typeof RETARGET_OPTIONS].slice === 'core');
export const CORE_REPORTS = Object.keys(RETARGET_REPORTS).filter(k => RETARGET_REPORTS[k as keyof typeof RETARGET_REPORTS].slice === 'core');
export function referenceBake(input: BakeInput): PortableBakeResponseV1 {
  const source = restoreSkeleton(input.source), target = restoreSkeleton(input.target);
  try {
    return { apiVersion: 1, stage: 'core-bake', capabilities: ['core-bake-v1'], status: 'baked',
      clips: input.clips.map(job => {
        const out = retargetAnimationClip(restoreClip(job.clip), source, target, input.mapping, restoreOptions(job.options));
        const portable = portableBakeRequest({ source: input.target, target: input.target, mapping: input.mapping,
          clips: [{ clip: snapshotClip(out.clip), options: {} }] }, [0], 'bake');
        const report = JSON.parse(JSON.stringify(Object.fromEntries(CORE_REPORTS.filter(k => k in out.report).map(k => [k, out.report[k as keyof typeof out.report]]))));
        return { clip: portable.clips[0].clip, report };
      }) };
  } finally { source.dispose(); target.dispose(); }
}
function rig(prefix: string, factor: number, helper = false) {
  const group = new THREE.Group(); group.name = `${prefix}Group`;
  group.position.set(.1, .2, -.3);
  if (helper) {group.rotation.y = .2; group.scale.set(1.2, .9, 1.1);}
  const bones = ['Travel', 'Pelvis', 'Bridge', 'Arm', 'Tip', 'Branch'].map(name => { const b = new THREE.Bone(); b.name = prefix + name; return b; });
  const [travel, pelvis, bridge, arm, tip, branch] = bones;
  group.add(travel); travel.add(pelvis); pelvis.add(bridge, branch); bridge.add(arm); arm.add(tip);
  pelvis.position.y = factor; bridge.position.y = factor; arm.position.x = factor; tip.position.x = factor; branch.position.z = factor;
  if (helper) {bridge.rotation.z = .3; arm.rotation.y = -.2;}
  group.updateMatrixWorld(true);
  return new THREE.Skeleton([travel, pelvis, arm, tip, bridge, branch]);
}
const vector = (name: string, a: number[], b: number[], interpolation = THREE.InterpolateLinear) => new THREE.VectorKeyframeTrack(name, [0, 1], [...a, ...b], interpolation);
const rotation = (name: string, radians: number, axis = new THREE.Vector3(0, 0, 1)) => new THREE.QuaternionKeyframeTrack(name, [0, 1], [0, 0, 0, 1, ...new THREE.Quaternion().setFromAxisAngle(axis, radians).toArray()]);
function fixture(options: AnimationRetargetOptions = {}, helper = false): BakeInput {
  const source = rig('S', 1, helper), target = rig('T', 2, helper);
  try {
    const map = { SPelvis: 'TPelvis', SArm: 'TArm', STip: 'TTip', SBranch: 'TBranch' };
    const mapping = buildRigMap(source, target, { manualMap: map });
    // Explicit fixtures isolate core baking from convention inference.
    mapping.decisions = mapping.decisions.filter(d => d.source in map);
    mapping.map = map; mapping.ok = true; mapping.diagnostics = [];
    mapping.upCorrection = null; mapping.orientationCorrection = null;
    const clip = new THREE.AnimationClip('Core', 1, [vector('STravel.position', [0, 0, 0], [1, 0, 0]),
      vector('SPelvis.position', [0, 1, 0], [0, 1, 1]), rotation('SBridge.quaternion', Math.PI / 3),
      rotation('SArm.quaternion', Math.PI / 2), vector('SArm.scale', [1, 1, 1], [2, 3, 1]),
      vector('SGroup.position', [.1, .2, -.3], [8, 9, 10])]);
    return {source: snapshotSkeleton(source, 'current'), target: snapshotSkeleton(target, 'current'), mapping,
      clips: [{clip: snapshotClip(clip), options: snapshotOptions(options)}]};
  } finally {source.dispose(); target.dispose();}
}
export function coreBakeFixtures() {
  const positives: Array<{name: string; input: ReturnType<typeof portableBakeRequest>; expected: PortableBakeResponseV1; coveredOptions: string[]}> = [];
  const add = (name: string, options: AnimationRetargetOptions = {}, mutate?: (input: BakeInput) => void, helper = false) => {
    const input = fixture(options, helper); mutate?.(input);
    const before = structuredClone(input), expected = referenceBake(input);
    assert.deepEqual(input, before, `${name}: reference mutated canonical input`);
    positives.push({name, input: portableBakeRequest(input, [0], 'bake'), expected, coveredOptions: Object.keys(options)});
  };
  add('defaults');
  add('named-fixed-root', {clipName: '  Renamed  ', rootMotionScale: 3, sampleRateHz: 30, interpolation: 'step', nextDownRationalTimes: true, alignMappedBoneDirections: false});
  add('unscaled-root', {scaleRootMotion: false});
  add('extract-travel', {extractRootMotionBone: 'STravel'});
  add('frame-correction', {}, input => { input.mapping.upCorrection = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]; input.mapping.orientationCorrection = [0, Math.SQRT1_2, 0, Math.SQRT1_2]; });
  add('correction-disabled', {applyUpCorrection: false}, input => {input.mapping.orientationCorrection = [0, 0, 1, 0];});
  add('alignment-selection', {directionAlignmentBones: ['TArm']});
  add('absolute-directions', {directionTransferMode: 'absolute'});
  add('absolute-selection', {directionTransferMode: 'absolute', directionTransferBones: ['TArm']});
  add('first-frame', {sourceReferencePose: 'first-frame'});
  add('offset-first-frame', {sourceReferencePose: 'first-frame', sampleRateHz: 20}, input => {
    const track = input.clips[0].clip.tracks.find(ch => ch.name === 'SArm.quaternion')!;
    (track.values as Float32Array).set(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), .4).toArray());
  });
  const sourceReference = new THREE.AnimationClip('Neutral', 1, [rotation('SBridge.quaternion', .2), vector('SPelvis.position', [0, 1, .2], [0, 1, .2]), vector('SArm.scale', [2, 1, 1], [2, 1, 1])]);
  // A non-identity reference at frame zero, including an intermediate target bone.
  (sourceReference.tracks[0].values as Float32Array).set(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), .2).toArray(), 0);
  const targetReference = new THREE.AnimationClip('TargetNeutral', 1, [rotation('TBridge.quaternion', .3), vector('TBridge.position', [0, 2, .2], [0, 2, .2]), vector('TArm.scale', [1.5, 1, 2], [1.5, 1, 2])]);
  (targetReference.tracks[0].values as Float32Array).set(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .3).toArray(), 0);
  const oneFrame = (clip: THREE.AnimationClip) => new THREE.AnimationClip(clip.name, 0, clip.tracks.map(track => {
    const copy = track.clone(); copy.times = copy.times.slice(0, 1); copy.values = copy.values.slice(0, track.getValueSize()); return copy;
  }));
  add('zero-source-reference', {sourceReferencePose: 'clip', sourceReferenceClip: oneFrame(sourceReference)});
  add('zero-target-reference', {targetReferenceClip: oneFrame(targetReference)});
  add('zero-both-references', {sourceReferencePose: 'clip', sourceReferenceClip: oneFrame(sourceReference), targetReferenceClip: oneFrame(targetReference)});
  add('unnamed-helper-uuid', {}, input => {
    for (const side of [input.source, input.target]) side.nodes[0].name = '';
    input.clips[0].clip.tracks.find(t => t.name === 'SGroup.position')!.name = `${input.source.nodes[0].id}.position`;
  });
  add('references', {sourceReferencePose: 'clip', sourceReferenceClip: sourceReference, targetReferenceClip: targetReference});
  add('preserved-rotations', {preserveTargetLeafRotations: true, preserveTargetRotations: ['TArm']});
  const scaleTransfer = [{sourceBone: 'SArm', targetBone: 'TArm', axes: ['y', 'x', 'z'] as ['y', 'x', 'z'], strength: [.5, 1, 0] as [number, number, number]}];
  add('scale-reference', {sourceReferencePose: 'clip', sourceReferenceClip: sourceReference, targetReferenceClip: targetReference, scaleTransfer});
  add('scale-reference-path-binding', {targetReferenceClip: targetReference, scaleTransfer}, input => {
    input.clips[0].options.targetReferenceClip!.tracks.find(ch => ch.name === 'TArm.scale')!.name = 'TGroup/TArm.scale';
  });
  add('scale-first-frame', {sourceReferencePose: 'first-frame', scaleTransfer});
  add('cycles', {sampleRateHz: 60, visualTiming: {durationFrames: 120, cycles: 2}});
  add('landmark-hold', {sampleRateHz: 60, visualTiming: {durationFrames: 60, cycles: 1, landmarks: [{outputFrame: 0, sourcePhase: 0}, {outputFrame: 20, sourcePhase: .5}, {outputFrame: 40, sourcePhase: .5}, {outputFrame: 60, sourcePhase: 1}]}});
  add('nonuniform-helper', {sampleRateHz: 20}, undefined, true);
  add('partial-endpoint', {sampleRateHz: 30, nextDownRationalTimes: true}, input => {input.clips[0].clip.duration = 1.011;});
  add('float32-step', {sampleRateHz: 30}, input => {input.clips[0].clip.tracks[0] = snapshotClip(new THREE.AnimationClip('Step', 1, [new THREE.VectorKeyframeTrack('STravel.position', [0, 1/30, 1], [0,0,0, 1,0,0, 2,0,0], THREE.InterpolateDiscrete)])).tracks[0];});
  add('cubic', {sampleRateHz: 10}, input => {
    const ch = vector('SPelvis.position', [0,1,0], [0,1,1]);
    ch.values = new Float32Array([0,0,0, 0,1,0, 0,0,1, 0,0,0, 0,1,1, 0,0,0]); restoreTrackInterpolation(ch, 'gltf-cubic-spline');
    input.clips[0].clip.tracks[1] = snapshotClip(new THREE.AnimationClip('Cubic', 1, [ch])).tracks[0];
  });
  add('smooth', {sampleRateHz: 10}, input => {input.clips[0].clip.tracks[1].interpolation = THREE.InterpolateSmooth;});
  add('cubic-quaternion', {sampleRateHz: 30}, input => {
    const ch = rotation('SArm.quaternion', Math.PI / 2);
    ch.values = new Float32Array([0,0,0,0, 0,0,0,1, 0,0,.6,0, 0,0,0,0, 0,0,Math.SQRT1_2,Math.SQRT1_2, 0,0,0,0]);
    restoreTrackInterpolation(ch, 'gltf-cubic-spline');
    input.clips[0].clip.tracks[3] = snapshotClip(new THREE.AnimationClip('Cubic rotation', 1, [ch])).tracks[0];
  });
  add('object-binding-discard', {}, input => {input.clips[0].clip.tracks[3].name = 'SGroup.bones[SArm].quaternion';});
  add('scale-only', {scaleTransfer}, input => {input.clips[0].clip.tracks = input.clips[0].clip.tracks.filter(ch => ch.name.endsWith('.scale'));});
  add('empty-name', {}, input => {input.clips[0].clip.name = '';});
  add('multiple-clips', {}, input => {input.clips.push(structuredClone(input.clips[0])); input.clips[1].options = {clipName: 'Second', preserveTargetLeafRotations: true};});
  // Independent anchors use one mapped joint and no reference solver calculations.
  const anchor = fixture({alignMappedBoneDirections: false, rootMotionScale: 2});
  anchor.mapping.decisions = anchor.mapping.decisions.filter(d => d.source === 'SPelvis'); anchor.mapping.map = {SPelvis: 'TPelvis'};
  anchor.clips[0].clip.tracks = [snapshotClip(new THREE.AnimationClip('Anchor', 1, [vector('SPelvis.position', [0,1,0], [1,1,0]), rotation('SPelvis.quaternion', Math.PI/2)])).tracks[0],
    snapshotClip(new THREE.AnimationClip('Anchor', 1, [rotation('SPelvis.quaternion', Math.PI/2)])).tracks[0]];
  const anchorExpected = referenceBake(anchor);
  assert.deepEqual(anchorExpected.clips[0].clip.tracks.find(ch => ch.property === 'position')!.values, [0,2,0, 2,2,0]);
  const q = anchorExpected.clips[0].clip.tracks.find(ch => ch.property === 'quaternion')!.values;
  assert.ok(Math.abs(q[6] - Math.SQRT1_2) < 1e-6 && Math.abs(q[7] - Math.SQRT1_2) < 1e-6);
  const scaleAnchor = positives.find(c => c.name === 'scale-reference')!.expected.clips[0].clip.tracks.find(ch => ch.property === 'scale')!;
  assert.deepEqual(scaleAnchor.values.slice(-3), [3, 1, 2]);
  positives.push({name: 'known-root-and-rotation', input: portableBakeRequest(anchor, [0], 'bake'), expected: anchorExpected, coveredOptions: []});
  const negatives: Array<{name: string; request: unknown; code: string}> = [];
  const bad = (name: string, mutate: (input: ReturnType<typeof portableBakeRequest>) => void, code = 'BAKE_INPUT_INVALID') => {const input = structuredClone(positives[0].input); mutate(input); negatives.push({name, request: input, code});};
  for (const [key, item] of Object.entries(RETARGET_OPTIONS)) if (item.slice === 'advanced' && key !== 'endpointTargetClips') bad(`advanced-${key}`, r => {r.clips[0].options[key] = {};}, 'BAKE_UNSUPPORTED_FEATURE');
  bad('endpoint-targets', r => {r.clips[0].endpointTargetClips.push(r.clips[0].clip);}, 'BAKE_UNSUPPORTED_FEATURE');
  bad('unknown-future-option', r => {r.clips[0].options.future = true;}, 'BAKE_UNSUPPORTED_FEATURE');
  bad('mixed-advanced-batch', r => {const second = structuredClone(r.clips[0]); second.options.naturalMotion = {}; r.clips.push(second);}, 'BAKE_UNSUPPORTED_FEATURE');
  bad('missing-metadata', r => {delete r.mappingDetails;});
  bad('invalid-map', r => {r.mappingDetails!.ok = false;});
  bad('map-diagnostic', r => {r.mappingDetails!.diagnostics.push({level: 'error', code: 'BROKEN', message: 'bad'});});
  bad('metadata-mismatch', r => {r.mappingDetails!.decisions.pop();});
  bad('duplicate-decision', r => {r.mappingDetails!.decisions[1] = r.mappingDetails!.decisions[0];});
  bad('invalid-correction', r => {r.mappingDetails!.orientationCorrection = [0,0,0,0];});
  bad('root-scale-disabled', r => {r.clips[0].options = {rootMotionScale: 2, scaleRootMotion: false};});
  bad('invalid-extraction', r => {r.clips[0].options.extractRootMotionBone = 'STip';});
  bad('missing-reference', r => {r.clips[0].options.sourceReferencePose = 'clip';});
  bad('invalid-preservation', r => {r.clips[0].options.preserveTargetRotations = ['TTravel'];});
  bad('invalid-alignment', r => {r.clips[0].options.directionAlignmentBones = ['TTip'];});
  bad('disabled-alignment', r => {r.clips[0].options = {alignMappedBoneDirections: false, directionAlignmentBones: ['TArm']};});
  bad('invalid-direction', r => {r.clips[0].options.directionTransferMode = 'wrong';});
  bad('invalid-rate', r => {r.clips[0].options.sampleRateHz = 0;});
  bad('excessive-schedule', r => {r.clips[0].clip.duration = 100; r.clips[0].options.sampleRateHz = 240;}, 'BAKE_OUTPUT_LIMIT');
  bad('next-down-without-rate', r => {r.clips[0].options.nextDownRationalTimes = true;});
  bad('invalid-timing', r => {r.clips[0].options = {sampleRateHz: 60, visualTiming: {durationFrames: 10, cycles: 3}};});
  bad('invalid-landmarks', r => {r.clips[0].options = {sampleRateHz: 60, visualTiming: {durationFrames: 60, cycles: 1, landmarks: [{outputFrame: 0, sourcePhase: 1}, {outputFrame: 60, sourcePhase: 0}]}};});
  bad('invalid-interpolation', r => {r.clips[0].options.interpolation = 'smooth';});
  bad('null-option', r => {r.clips[0].options.rootMotionScale = null;});
  bad('scale-ratio', r => {r.clips[0].options.scaleTransfer = [{sourceBone: 'SArm', targetBone: 'TArm', axes: ['x','y','z'], strength: [1,1,1]}]; r.clips[0].clip.tracks.find(ch => ch.property === 'scale')!.values[3] = 9;});
  bad('scale-object-binding', r => {
    r.clips[0].options.scaleTransfer = scaleTransfer;
    const ch = r.clips[0].clip.tracks.find(ch => ch.property === 'scale')!;
    ch.name = 'SGroup.bones[SArm].scale'; ch.boneChannel = false;
  });
  bad('oversized-canonical-role', r => {r.mappingDetails!.decisions[0].canonical = 'x'.repeat(129);});
  bad('oversized-label', r => {r.clips[0].options.clipName = 'x'.repeat(1025);});
  bad('duplicate-scale-target', r => {r.clips[0].options.scaleTransfer = [scaleTransfer[0], scaleTransfer[0]];});
  bad('zero-scale-reference', r => {r.source.nodes.find(n => n.name === 'SArm')!.scale[0] = 0; r.clips[0].options.scaleTransfer = scaleTransfer;});
  bad('malformed-parent', r => {r.source.nodes[0].parent = 1;}, 'SAMPLER_INPUT_INVALID');
  bad('malformed-key', r => {r.clips[0].clip.tracks[0].times[1] = 0;}, 'SAMPLER_INPUT_INVALID');
  bad('additive-input', r => {r.clips[0].clip.blendMode = 2501;}, 'SAMPLER_UNSUPPORTED_FEATURE');
  const covered = new Set(positives.flatMap(c => c.coveredOptions));
  assert.deepEqual(CORE_OPTIONS.filter(k => !covered.has(k)), [], 'every core option requires positive evidence');
  const fields = new Set(positives.flatMap(c => c.expected.clips.flatMap(c => Object.keys(c.report))));
  assert.deepEqual(CORE_REPORTS.filter(k => !fields.has(k)), [], 'every core report field requires evidence');
  return {positives, negatives, coreOptions: CORE_OPTIONS, coreReports: CORE_REPORTS};
}
