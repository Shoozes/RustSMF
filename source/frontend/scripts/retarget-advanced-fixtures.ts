import assert from 'node:assert/strict';
import * as THREE from 'three';
import { retargetAnimationClip, type AnimationRetargetOptions } from '../src/utils/animationRetarget';
import { buildRigMap } from '../src/utils/rigMapping';
import { snapshotSkeleton, snapshotClip, snapshotOptions, restoreSkeleton, restoreClip, restoreOptions } from '../src/workers/retargetSnapshot';
import { portableBakeRequest } from '../src/workers/retargetPortable';
import type { BakeInput } from '../src/workers/retargetProtocol';
import { naturalFixture } from './retarget-natural-fixtures';
import { RETARGET_OPTIONS, RETARGET_REPORTS } from '../src/workers/retargetInventory';

function fixture(options: AnimationRetargetOptions): BakeInput {
  const rig = () => {
    const bones = ['root', 'neck', 'head', 'eye', 'arm', 'hand', 'finger', 'tip'].map(name => { const b = new THREE.Bone(); b.name = name; b.position.y = 1; return b; });
    const [root, neck, head, eye, arm, hand, finger, tip] = bones;
    root.add(neck, arm); neck.add(head); head.add(eye); arm.add(hand); hand.add(finger); finger.add(tip);
    root.updateWorldMatrix(true, true); return new THREE.Skeleton(bones);
  };
  const source = rig(), target = rig();
  try {
    const map = Object.fromEntries(source.bones.filter(b => !['finger', 'tip'].includes(b.name)).map(b => [b.name, b.name]));
    const mapping = buildRigMap(source, target, {manualMap: map});
    mapping.map = map; mapping.decisions = mapping.decisions.filter(d => d.source in map); mapping.ok = true; mapping.diagnostics = [];
    mapping.upCorrection = null; mapping.orientationCorrection = null;
    const rotation = (name: string, degrees: number, axis = new THREE.Vector3(1, 0, 0)) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, .5, 1],
      [0, 0, 0, 1, ...new THREE.Quaternion().setFromAxisAngle(axis, degrees * Math.PI / 180).toArray(), 0, 0, 0, 1]);
    const clip = new THREE.AnimationClip('Advanced', 1, [rotation('neck', 100), rotation('head', -60), rotation('eye', 10), rotation('arm', 20), rotation('hand', 120, new THREE.Vector3(0, 1, 0)),
      new THREE.VectorKeyframeTrack('root.position', [0, 1], [0, 1, 0, 1, 1, 0])]);
    return {source: snapshotSkeleton(source, 'current'), target: snapshotSkeleton(target, 'current'), mapping,
      clips: [{clip: snapshotClip(clip), options: snapshotOptions({alignMappedBoneDirections: false, scaleRootMotion: false, sampleRateHz: 60, ...options})}]};
  } finally {source.dispose(); target.dispose();}
}
export function advancedReference(input: BakeInput) {
  const source = restoreSkeleton(input.source), target = restoreSkeleton(input.target);
  try {
    return {apiVersion: 1, stage: 'advanced-bake', capabilities: ['core-bake-v1', 'advanced-bake-v1'], status: 'baked', clips: input.clips.map(job => {
      const out = retargetAnimationClip(restoreClip(job.clip), source, target, input.mapping, restoreOptions(job.options));
      const clip = portableBakeRequest({source: input.target, target: input.target, mapping: input.mapping, clips: [{clip: snapshotClip(out.clip), options: {}}]}, [0], 'bake').clips[0].clip;
      return {clip, report: JSON.parse(JSON.stringify(out.report))};
    })};
  } finally {source.dispose(); target.dispose();}
}
const joint = (bone: string, flexionDegrees: [number, number]) => ({bone, referenceRotation: [0, 0, 0, 1] as [number, number, number, number], twistAxis: [0, 1, 0] as [number, number, number],
  bendAxis: [1, 0, 0] as [number, number, number], flexionDegrees, lateralDegrees: [-20, 20] as [number, number], twistDegrees: [-30, 30] as [number, number], maximumSwingDegrees: 80});
export function advancedFixtures() {
  const positives: Array<{name: string; input: ReturnType<typeof portableBakeRequest>; expected: ReturnType<typeof advancedReference>}> = [];
  const add = (name: string, options: AnimationRetargetOptions) => {const input = fixture(options); positives.push({name, input: portableBakeRequest(input, [0], 'bake'), expected: advancedReference(input)});};
  add('defaults', {});
  const staticPose = new THREE.AnimationClip('Neutral', 0, [new THREE.QuaternionKeyframeTrack('neck.quaternion', [0], [0, 0, 0, 1])]);
  add('zero-source-target-reference', {sourceReferencePose: 'clip', sourceReferenceClip: staticPose, targetReferenceClip: staticPose,
    forearmTwist: [{forearm: 'arm', hand: 'hand', share: .5}], interpolation: 'step'});
  add('curl', {targetChainCurls: [{palmBone: 'hand', bones: ['finger', 'tip'], palmNormal: [0, 0, 1], degrees: [30, 20]}]});
  add('recovery', {poseRecovery: {peakFrame: 20, holdThroughFrame: 30, returnByFrame: 50}});
  const correction = {from: [0, 0, 0, 1] as [number, number, number, number], to: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), .2).toArray()};
  add('local-correction', {localReferenceCorrections: {hand: correction}});
  const label = 'é'.repeat(100);
  const unicode = fixture({localReferenceCorrections: {[label]: correction}});
  for (const skeleton of [unicode.source, unicode.target]) skeleton.nodes.find(n => n.name === 'hand')!.name = label;
  unicode.mapping.map = Object.fromEntries(Object.entries(unicode.mapping.map).map(([s, t]) => [s === 'hand' ? label : s, t === 'hand' ? label : t]));
  unicode.mapping.decisions.forEach(d => {if (d.source === 'hand') d.source = label; if (d.target === 'hand') d.target = label;});
  unicode.clips[0].clip.tracks.forEach(t => {if (t.name.startsWith('hand.')) t.name = t.name.replace('hand.', `${label}.`);});
  positives.push({name: 'unicode-calibration-name', input: portableBakeRequest(unicode, [0], 'bake'), expected: advancedReference(unicode)});
  add('recovery-local', {poseRecovery: {peakFrame: 20, holdThroughFrame: 30, returnByFrame: 50}, localReferenceCorrections: {hand: correction}});
  add('twist', {interpolation: 'step', forearmTwist: [{forearm: 'arm', hand: 'hand', share: .5}]});
  const poseRanges = {schema: 'rustsmf.pose-ranges.v1' as const, id: 'head-fixture', policy: 'report' as const, joints: [joint('neck', [-30, 65]), joint('head', [-40, 45])]};
  add('range-flags', {poseRanges});
  add('head-constraint', {poseRanges, jointConstraints: {neck: 'neck', head: 'head', transitionDegrees: 5}});
  for (const variant of ['default', 'weighted', 'recovery', 'wrap', 'ramp', 'limits', 'free', 'ratio', 'bend', 'bend-extension', 'plane', 'anchor', 'patch', 'travel', 'swing']) {
    const input = naturalFixture(variant); positives.push({name: `natural-${variant}`, input: portableBakeRequest(input, [0], 'bake'), expected: advancedReference(input)});
  }
  const mirrored = fixture({interpolation: 'step', forearmTwist: [{forearm: 'arm', hand: 'hand', share: .5}]});
  mirrored.target.nodes.find(n => n.name === 'hand')!.position[1] = -1;
  positives.push({name: 'twist-mirrored-axis', input: portableBakeRequest(mirrored, [0], 'bake'), expected: advancedReference(mirrored)});
  const pose = (name: string, degrees: number) => new THREE.AnimationClip(name, 1, [new THREE.VectorKeyframeTrack('root.position', [0, 1], [0, 1, 0, 0, 1, 0]),
    new THREE.QuaternionKeyframeTrack('neck.quaternion', [0, 1], [...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), degrees * Math.PI / 180).toArray(), ...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), degrees * Math.PI / 180).toArray()])]);
  const entry = {targetClip: 'Entry', targetFrame: 0, spanFrames: 5, rootOffset: [0, 0, 0] as [number, number, number]};
  const exit = {targetClip: 'Exit', targetFrame: 0, spanFrames: 5, rootOffset: [1, 0, .5] as [number, number, number]};
  const envelope = {entry, exit};
  const endpointTargetClips = [pose('Entry', 20), pose('Exit', -10), pose('Middle', 5)];
  add('endpoint', {interpolation: 'step', endpointEnvelope: envelope, endpointTargetClips});
  const endpointPathClips = endpointTargetClips.map(clip => clip.clone());
  endpointPathClips.forEach(clip => clip.tracks.forEach(track => {track.name = `Target/${track.name}`;}));
  add('endpoint-path-bindings', {interpolation: 'step', endpointEnvelope: envelope, endpointTargetClips: endpointPathClips});
  add('endpoint-next-down', {interpolation: 'step', nextDownRationalTimes: true, endpointEnvelope: envelope, endpointTargetClips});
  add('endpoint-yaw', {interpolation: 'step', endpointEnvelope: {entry: {...entry, rootYawDegrees: 90}, exit: {...exit, rootYawDegrees: -30}}, endpointTargetClips});
  const parentInput = fixture({interpolation: 'step', endpointEnvelope: {entry: {...entry, rootYawDegrees: 90}, exit: {...exit, rootYawDegrees: -30}}, endpointTargetClips});
  const parentRig = restoreSkeleton(parentInput.target);
  try {
    const group = new THREE.Group(); group.name = 'TargetFrame'; group.rotation.set(.15, -.3, .2); group.position.set(.2, .3, -.1);
    parentRig.bones.filter(b => !(b.parent instanceof THREE.Bone)).forEach(b => {b.removeFromParent(); group.add(b);});
    group.updateWorldMatrix(true, true); parentInput.target = snapshotSkeleton(parentRig, 'current');
    positives.push({name: 'endpoint-parent-frame', input: portableBakeRequest(parentInput, [0], 'bake'), expected: advancedReference(parentInput)});
  } finally {parentRig.dispose();}
  add('endpoint-intermediate', {interpolation: 'step', endpointEnvelope: {...envelope, intermediatePoses: [{targetClip: 'Middle', targetFrame: 0, frame: 30, rootOffset: [.5, 0, .2]}]}, endpointTargetClips});
  const naturalEndpoint = naturalFixture('default');
  naturalEndpoint.clips[0].options.interpolation = 'step';
  const naturalPose = {targetClip: 'TargetRef', targetFrame: 0, spanFrames: 4, rootOffset: [0, 0, 0] as [number, number, number]};
  naturalEndpoint.clips[0].options.endpointEnvelope = {entry: naturalPose, exit: naturalPose};
  naturalEndpoint.clips[0].options.endpointTargetClips = [naturalEndpoint.clips[0].options.targetReferenceClip!];
  positives.push({name: 'natural-endpoint', input: portableBakeRequest(naturalEndpoint, [0], 'bake'), expected: advancedReference(naturalEndpoint)});
  add('curl-recovery-local-ranges', {targetChainCurls: [{palmBone: 'hand', bones: ['finger', 'tip'], palmNormal: [0, 0, 1], degrees: [-25, -15]}],
    poseRecovery: {peakFrame: 15, holdThroughFrame: 20, returnByFrame: 60}, localReferenceCorrections: {hand: correction}, poseRanges});
  const curl = positives.find(c => c.name === 'curl')!.expected.clips[0].clip.tracks.find(ch => ch.name === 'finger.quaternion')!;
  assert.ok(Math.abs(curl.values[0] - Math.sin(Math.PI / 12)) < 1e-6);
  const recovery = positives.find(c => c.name === 'recovery')!.expected.clips[0].clip.tracks.find(ch => ch.name === 'root.position')!;
  assert.deepEqual(recovery.values.slice(-3), [0, 1, 0]);
  assert.ok(positives.find(c => c.name === 'twist')!.expected.clips[0].report.forearmTwist[0].maximumTransferredDegrees > 59);
  assert.ok(positives.find(c => c.name === 'range-flags')!.expected.clips[0].report.poseRanges.issues.length > 0);
  assert.ok(positives.find(c => c.name === 'head-constraint')!.expected.clips[0].report.jointConstraints.correctedSamples > 0);
  assert.ok(positives.find(c => c.name === 'natural-travel')!.expected.clips[0].report.naturalMotion.contacts.some((c: {unreachable: boolean}) => c.unreachable), 'bounded unreachable travel must remain visible');
  const negatives: Array<{name: string; request: ReturnType<typeof portableBakeRequest>; code: string}> = [];
  const bad = (name: string, key: string, value: unknown) => {const request = structuredClone(positives[0].input); request.clips[0].options[key] = value; negatives.push({name, request, code: 'ADVANCED_INPUT_INVALID'});};
  bad('recovery-order', 'poseRecovery', {peakFrame: 30, holdThroughFrame: 20, returnByFrame: 50});
  bad('recovery-bound', 'poseRecovery', {peakFrame: 10, holdThroughFrame: 20, returnByFrame: 61});
  bad('local-nonunit', 'localReferenceCorrections', {hand: {from: [0, 0, 0, 0], to: [0, 0, 0, 1]}});
  bad('local-missing', 'localReferenceCorrections', {missing: correction});
  bad('local-unknown-field', 'localReferenceCorrections', {hand: {...correction, extra: true}});
  bad('curl-mapped', 'targetChainCurls', [{palmBone: 'arm', bones: ['hand'], palmNormal: [0, 0, 1], degrees: [20]}]);
  bad('curl-parallel', 'targetChainCurls', [{palmBone: 'hand', bones: ['finger'], palmNormal: [0, 1, 0], degrees: [20]}]);
  bad('curl-not-chain', 'targetChainCurls', [{palmBone: 'hand', bones: ['tip'], palmNormal: [0, 0, 1], degrees: [20]}]);
  bad('twist-linear', 'forearmTwist', [{forearm: 'arm', hand: 'hand', share: .5}]);
  bad('twist-share', 'forearmTwist', [{forearm: 'arm', hand: 'hand', share: 1}]);
  bad('head-missing-ranges', 'jointConstraints', {neck: 'neck', head: 'head', transitionDegrees: 5});
  bad('range-duplicate', 'poseRanges', {...poseRanges, joints: [poseRanges.joints[0], poseRanges.joints[0]]});
  bad('range-reject', 'poseRanges', {...poseRanges, policy: 'reject'});
  const endpointBad = (name: string, mutate: (input: ReturnType<typeof portableBakeRequest>) => void) => {const request = structuredClone(positives.find(c => c.name === 'endpoint')!.input); mutate(request); negatives.push({name, request, code: 'ADVANCED_INPUT_INVALID'});};
  endpointBad('endpoint-overlap', r => {r.clips[0].options.endpointEnvelope = {entry: {...entry, spanFrames: 40}, exit: {...exit, spanFrames: 30}};});
  endpointBad('endpoint-missing-clip', r => {r.clips[0].endpointTargetClips = [];});
  endpointBad('endpoint-duplicate-clip', r => {r.clips[0].endpointTargetClips.push(r.clips[0].endpointTargetClips[0]);});
  endpointBad('endpoint-linear', r => {r.clips[0].options.interpolation = 'linear';});
  endpointBad('endpoint-recovery-conflict', r => {r.clips[0].options.poseRecovery = {peakFrame: 20, holdThroughFrame: 30, returnByFrame: 50};});
  endpointBad('endpoint-invalid-offset', r => {r.clips[0].options.endpointEnvelope = {entry: {...entry, rootOffset: [10001, 0, 0]}, exit};});
  endpointBad('endpoint-child-offset', r => {r.clips[0].endpointTargetClips[0].tracks.push({name: 'head.position', boneChannel: true, node: r.target.nodes.findIndex(n => n.name === 'head'), property: 'position', interpolation: 'linear', times: [0, 1], values: [1, 1, 0, 1, 1, 0]});});
  endpointBad('endpoint-object-binding', r => {r.clips[0].endpointTargetClips[0].tracks[0].name = 'root.bones[root].position';});
  const naturalBad = (name: string, mutate: (input: ReturnType<typeof portableBakeRequest>) => void) => {const request = structuredClone(positives.find(c => c.name === 'natural-default')!.input); mutate(request); negatives.push({name, request, code: 'ADVANCED_INPUT_INVALID'});};
  naturalBad('natural-missing-reference', r => {r.clips[0].sourceReferenceClip = null;});
  negatives[negatives.length - 1].code = 'BAKE_INPUT_INVALID';
  naturalBad('natural-rest-reference', r => {r.clips[0].options.sourceReferencePose = 'rest';});
  naturalBad('natural-wrong-rate', r => {r.clips[0].options.sampleRateHz = 30;});
  naturalBad('natural-torso-owner', r => {const p = r.clips[0].options.naturalMotion as AnimationRetargetOptions['naturalMotion']; p!.torso!.targetBones = ['LeftUpLeg'];});
  naturalBad('natural-invalid-root-travel', r => {const p = r.clips[0].options.naturalMotion as AnimationRetargetOptions['naturalMotion']; p!.rootTravelSamples = {Natural: [[1, 0, 0], [1, 0, .1]]};});
  naturalBad('natural-nested-null', r => {r.clips[0].options.naturalMotion = {...r.clips[0].options.naturalMotion as object, legOrientation: null};});
  const patchLimit = structuredClone(positives.find(c => c.name === 'natural-patch')!.input);
  const patchProfile = patchLimit.clips[0].options.naturalMotion as AnimationRetargetOptions['naturalMotion'];
  const repeatedPatch = {...patchProfile!.contacts!.Natural[0], contactPatch: Array.from({length: 16}, () => ({point: [0, -.08, -.04] as [number, number, number]}))};
  patchProfile!.contacts!.Natural = Array.from({length: 512}, () => structuredClone(repeatedPatch));
  negatives.push({name: 'natural-aggregate-anchor-limit', request: patchLimit, code: 'ADVANCED_INPUT_INVALID'});
  bad('null-correction', 'localReferenceCorrections', {hand: null});
  const mixed = structuredClone(positives.find(c => c.name === 'recovery')!.input);
  mixed.clips.push(structuredClone(mixed.clips[0])); mixed.clips[1].options.future = true;
  negatives.push({name: 'mixed-unknown-atomic', request: mixed, code: 'BAKE_UNSUPPORTED_FEATURE'});
  const advancedOptions = Object.entries(RETARGET_OPTIONS).filter(([, v]) => v.slice === 'advanced').map(([k]) => k);
  const advancedReports = Object.entries(RETARGET_REPORTS).filter(([, v]) => v.slice === 'advanced').map(([k]) => k);
  for (const key of advancedOptions) assert.ok(positives.some(c => key === 'endpointTargetClips' ? c.input.clips[0].endpointTargetClips.length > 0 : key in c.input.clips[0].options), `Missing advanced option ${key}`);
  for (const key of advancedReports) assert.ok(positives.some(c => c.expected.clips.some(c => key in c.report)), `Missing advanced report ${key}`);
  return {positives, negatives, advancedOptions, advancedReports};
}
