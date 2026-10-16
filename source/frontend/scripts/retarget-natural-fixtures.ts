import * as THREE from 'three';
import { buildRigMap } from '../src/utils/rigMapping';
import type { NaturalMotionProfile } from '../src/utils/naturalRetarget';
import type { AnimationRetargetOptions } from '../src/utils/animationRetarget';
import { snapshotSkeleton, snapshotClip, snapshotOptions } from '../src/workers/retargetSnapshot';
import type { BakeInput } from '../src/workers/retargetProtocol';

export function naturalFixture(variant: string): BakeInput {
  const rig = (factor: number, source: boolean) => {
    const make = (name: string, position: number[]) => {const b = new THREE.Bone(); b.name = name; b.position.fromArray(position); return b;};
    const root = make('Helper', [0, 0, 0]), hips = make('Hips', [0, factor * 1.8, 0]);
    if (source) root.add(hips);
    const bones = source ? [root, hips] : [hips];
    let parent = hips;
    for (const name of ['Spine', 'Spine1', 'Spine2']) {const b = make(name, [0, factor * .2, 0]); parent.add(b); bones.push(b); parent = b;}
    for (const [side, x] of [['Left', .25], ['Right', -.25]] as const) {
      const hip = make(`${side}UpLeg`, [x * factor, 0, 0]), knee = make(`${side}Leg`, [0, -.75 * factor, .06 * factor]), foot = make(`${side}Foot`, [0, -.75 * factor, -.06 * factor]), toe = make(`${side}Toe`, [0, -.03 * factor, .15 * factor]);
      hips.add(hip); hip.add(knee); knee.add(foot); foot.add(toe); bones.push(hip, knee, foot, toe);
    }
    (source ? root : hips).updateWorldMatrix(true, true); return new THREE.Skeleton(bones);
  };
  const source = rig(1, true), target = rig(1.2, false);
  try {
    const map = Object.fromEntries(source.bones.filter(b => !['Helper', 'Spine', 'Spine1'].includes(b.name)).map(b => [b.name, b.name]));
    const mapping = buildRigMap(source, target, {manualMap: map}); mapping.map = map; mapping.decisions = mapping.decisions.filter(d => d.source in map);
    mapping.decisions.find(d => d.source === 'Hips')!.canonical = 'hips'; mapping.ok = true; mapping.diagnostics = []; mapping.upCorrection = null; mapping.orientationCorrection = null;
    const q = (name: string, axis: THREE.Vector3, angle: number) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, .5], [0, 0, 0, 1, ...new THREE.Quaternion().setFromAxisAngle(axis, angle).toArray()]);
    const clip = new THREE.AnimationClip('Natural', .5, [q('Helper', new THREE.Vector3(0, 1, 0), .2), q('Spine2', new THREE.Vector3(1, 0, 0), .15), q('LeftToe', new THREE.Vector3(1, 0, 0), .15)]);
    const sourceRef = new THREE.AnimationClip('SourceRef', .5, [q('Helper', new THREE.Vector3(0, 1, 0), 0)]);
    const targetRef = new THREE.AnimationClip('TargetRef', .5, [q('Hips', new THREE.Vector3(0, 1, 0), 0)]);
    const leg = (side: string) => ({hip: `${side}UpLeg`, knee: `${side}Leg`, ankle: `${side}Foot`, soleOffset: [0, -.08, .04] as [number, number, number], pole: [0, 0, 1] as [number, number, number], minBendDegrees: .01, maxBendDegrees: 150, maxPelvisCorrection: .2});
    const natural: NaturalMotionProfile = {torso: {targetBones: ['Spine', 'Spine1', 'Spine2']}, legs: {left: leg('Left'), right: leg('Right')},
      contacts: {Natural: [{foot: 'left', startFrame: 0, endFrame: 30, blendFrames: 1}, {foot: 'right', startFrame: 0, endFrame: 30, blendFrames: 1}]},
      legMotionLimits: {Natural: {maximumForwardDegrees: 50, maximumBackwardDegrees: 40, maximumLateralDegrees: 20, minimumSwingBendDegrees: 12}}};
    const options: AnimationRetargetOptions = {sampleRateHz: 60, applyUpCorrection: false, sourceReferencePose: 'clip', sourceReferenceClip: sourceRef, targetReferenceClip: targetRef, naturalMotion: natural};
    if (variant === 'weighted') natural.torso!.weights = [1, 2, .5];
    if (variant === 'recovery') options.poseRecovery = {peakFrame: 8, holdThroughFrame: 16, returnByFrame: 30};
    if (variant === 'wrap') {
      natural.contacts!.Natural = [{foot: 'left', startFrame: 0, endFrame: 5, blendFrames: 1}, {foot: 'left', startFrame: 25, endFrame: 30, blendFrames: 1, wrapToStart: true}, {foot: 'right', startFrame: 0, endFrame: 30, blendFrames: 1}];
      natural.rootTravelPerFrame = {Natural: [0, 0, .001]};
    }
    if (variant === 'ramp') natural.contacts!.Natural = [{foot: 'left', startFrame: 2, endFrame: 28, blendFrames: 4, blendInFrames: 3, blendOutFrames: 5}, {foot: 'right', startFrame: 0, endFrame: 30, blendFrames: 0}];
    if (variant === 'limits') {
      clip.tracks.push(q('LeftUpLeg', new THREE.Vector3(1, 0, 0), .9));
      natural.contacts!.Natural = [{foot: 'right', startFrame: 0, endFrame: 30, blendFrames: 1}];
      natural.legMotionLimits!.Natural.maximumBackwardDegrees = 10;
    }
    if (['free', 'ratio', 'bend', 'bend-extension'].includes(variant)) {natural.contacts = {}; natural.legMotionLimits = {};}
    if (variant === 'bend' || variant === 'bend-extension') natural.reachTransfer = 'calibrated-bend';
    if (['ratio', 'bend', 'bend-extension'].includes(variant)) {
      clip.tracks.push(q('LeftLeg', new THREE.Vector3(1, 0, 0), variant === 'bend-extension' ? -.1 : .3));
      clip.tracks.push(q('RightLeg', new THREE.Vector3(1, 0, 0), variant === 'bend-extension' ? -.05 : .2));
    }
    if (variant === 'plane' || variant === 'patch') {
      natural.legOrientation = 'animated'; natural.grounding = {Natural: {strideScale: .8, rootHeightOffset: -.03, groundHeight: .25}};
      natural.contacts!.Natural.forEach(c => {c.positionMode = 'plane'; c.orientationMode = 'animated';});
    }
    if (variant === 'anchor') {natural.contacts!.Natural[0].anchorFrame = 10; natural.contacts!.Natural[0].contactBone = 'LeftToe'; natural.contacts!.Natural[0].contactPoint = [0, 0, .05];}
    if (variant === 'patch') {natural.contacts!.Natural[0].contactPatch = [{point: [0, -.08, -.04]}, {bone: 'LeftToe', point: [0, 0, .05]}];}
    if (variant === 'travel' || variant === 'swing') {
      options.interpolation = 'step'; natural.rootTravelSamples = {Natural: Array.from({length: 31}, (_, i) => [0, 0, .001 * i * i] as [number, number, number])};
    }
    if (variant === 'swing') {
      natural.contacts!.Natural = [{foot: 'left', startFrame: 0, endFrame: 5, blendFrames: 1}, {foot: 'left', startFrame: 25, endFrame: 30, blendFrames: 1}, {foot: 'right', startFrame: 0, endFrame: 30, blendFrames: 1}];
      natural.swingTrajectories = {Natural: [{foot: 'left', startFrame: 6, endFrame: 24, startAnchorFrame: 5, endAnchorFrame: 25, startGrounded: true, endGrounded: true, lift: .08, descendantRotations: true}]};
    }
    return {source: snapshotSkeleton(source, 'current'), target: snapshotSkeleton(target, 'current'), mapping, clips: [{clip: snapshotClip(clip), options: snapshotOptions(options)}]};
  } finally {source.dispose(); target.dispose();}
}
