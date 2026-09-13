import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { retargetAnimationClip } from './animationRetarget';
import type { NaturalMotionProfile } from './naturalRetarget';
import { buildRigMap } from './rigMapping';

function sourceSkeleton(): THREE.Skeleton {
  const helper = new THREE.Bone();
  helper.name = 'joint-4';
  const hips = new THREE.Bone();
  hips.name = 'joint-5';
  hips.position.y = 1;
  const torso = new THREE.Bone();
  torso.name = 'joint-6';
  torso.position.y = 1;
  helper.add(hips);
  hips.add(torso);
  helper.updateWorldMatrix(true, true);
  return new THREE.Skeleton([helper, hips, torso]);
}

function targetSkeleton(): THREE.Skeleton {
  const hips = new THREE.Bone();
  hips.name = 'mixamorigHips';
  hips.position.y = 3;
  const torso = new THREE.Bone();
  torso.name = 'mixamorigSpine2';
  torso.position.y = 2;
  hips.add(torso);
  hips.updateWorldMatrix(true, true);
  return new THREE.Skeleton([hips, torso]);
}

test('retargeting samples unmapped helper ancestors into mapped target motion', () => {
  const source = sourceSkeleton();
  const target = targetSkeleton();
  const mapping = buildRigMap(source, target, {
    manualMap: {
      'joint-5': 'mixamorigHips',
      'joint-6': 'mixamorigSpine2',
    },
  });
  assert.equal(mapping.ok, true);
  const halfTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const clip = new THREE.AnimationClip('jab', 1, [
    new THREE.QuaternionKeyframeTrack('joint-4.quaternion', [0, 1], [
      0, 0, 0, 1,
      halfTurn.x, halfTurn.y, halfTurn.z, halfTurn.w,
    ]),
    new THREE.VectorKeyframeTrack('joint-4.position', [0, 1], [0, 0, 0, 2, 0, 0]),
  ]);
  const result = retargetAnimationClip(clip, source, target, mapping, {
    applyUpCorrection: false,
    scaleRootMotion: false,
    sampleRateHz: 60,
    interpolation: 'step',
    nextDownRationalTimes: true,
  });
  const hipsRotation = result.clip.tracks.find((track) => track.name === 'mixamorigHips.quaternion');
  const hipsPosition = result.clip.tracks.find((track) => track.name === 'mixamorigHips.position');
  assert.ok(hipsRotation);
  assert.ok(hipsPosition);
  const lastRotation = new THREE.Quaternion().fromArray(hipsRotation!.values, hipsRotation!.values.length - 4);
  const rotationError = Math.abs(lastRotation.angleTo(halfTurn));
  assert.ok(rotationError < 1e-3, `helper rotation error was ${rotationError}`);
  assert.ok(Math.abs(hipsPosition!.values.at(-3)! - 1) < 1e-5);
  assert.deepEqual(result.report.hierarchyOnlyTracks.sort(), ['joint-4.position', 'joint-4.quaternion']);
  assert.equal(result.report.sampleCount, 61);
  assert.equal(hipsRotation!.getInterpolation(), THREE.InterpolateDiscrete);
  assert.ok(Array.from(hipsRotation!.times).every((time, frame) => time <= frame / 60));
});

test('retargeting samples upward-rounded float32 STEP keys at their intended frame', () => {
  const source = sourceSkeleton();
  const target = targetSkeleton();
  const mapping = buildRigMap(source, target, {
    manualMap: {
      'joint-5': 'mixamorigHips',
      'joint-6': 'mixamorigSpine2',
    },
  });
  const frameOne = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4);
  const frameTwo = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const sourceTrack = new THREE.QuaternionKeyframeTrack('joint-6.quaternion', [
    0,
    Math.fround(1 / 60),
    Math.fround(2 / 60),
  ], [
    0, 0, 0, 1,
    ...frameOne.toArray(),
    ...frameTwo.toArray(),
  ]);
  sourceTrack.setInterpolation(THREE.InterpolateDiscrete);
  const clip = new THREE.AnimationClip('float32_step', Math.fround(2 / 60), [sourceTrack]);
  const result = retargetAnimationClip(clip, source, target, mapping, {
    applyUpCorrection: false,
    alignMappedBoneDirections: false,
    sampleRateHz: 60,
    interpolation: 'step',
    nextDownRationalTimes: true,
  });
  const targetTrack = result.clip.tracks.find((track) => track.name === 'mixamorigSpine2.quaternion');
  assert.ok(targetTrack);
  const sampledFrameTwo = new THREE.Quaternion().fromArray(targetTrack!.values, 8);
  const frameTwoError = sampledFrameTwo.angleTo(frameTwo);
  assert.ok(frameTwoError < 1e-3, `float32 STEP frame error was ${frameTwoError}; sampled ${sampledFrameTwo.toArray().join(',')}`);
  assert.ok(targetTrack!.times[2] <= 2 / 60);
});

test('fixed-rate retargeting keeps a partial terminal frame within clip duration', () => {
  const source = sourceSkeleton();
  const target = targetSkeleton();
  const mapping = buildRigMap(source, target, {
    manualMap: {
      'joint-5': 'mixamorigHips',
      'joint-6': 'mixamorigSpine2',
    },
  });
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
  const clip = new THREE.AnimationClip('partial_frame', 0.6, [
    new THREE.QuaternionKeyframeTrack('joint-6.quaternion', [0, 0.6], [
      0, 0, 0, 1,
      ...turn.toArray(),
    ]),
  ]);
  const result = retargetAnimationClip(clip, source, target, mapping, {
    applyUpCorrection: false,
    alignMappedBoneDirections: false,
    sampleRateHz: 4,
    nextDownRationalTimes: true,
  });
  const track = result.clip.tracks.find((candidate) => candidate.name === 'mixamorigSpine2.quaternion');
  assert.ok(track);
  assert.equal(track!.times.length, 4);
  assert.ok(track!.times.at(-1)! <= clip.duration);
  assert.ok(track!.times.at(-1)! > track!.times.at(-2)!);
});

test('retargeting transfers mapped limb swings relative to different source and target bind directions', () => {
  const sourceHips = new THREE.Bone();
  sourceHips.name = 'joint-5';
  const sourceArm = new THREE.Bone();
  sourceArm.name = 'joint-8';
  const sourceForearm = new THREE.Bone();
  sourceForearm.name = 'joint-9';
  sourceForearm.position.x = 1;
  sourceHips.add(sourceArm);
  sourceArm.add(sourceForearm);
  sourceHips.updateWorldMatrix(true, true);
  const source = new THREE.Skeleton([sourceHips, sourceArm, sourceForearm]);

  const targetHips = new THREE.Bone();
  targetHips.name = 'mixamorigHips';
  const targetArm = new THREE.Bone();
  targetArm.name = 'mixamorigRightArm';
  const targetForearm = new THREE.Bone();
  targetForearm.name = 'mixamorigRightForeArm';
  targetForearm.position.y = -1;
  targetHips.add(targetArm);
  targetArm.add(targetForearm);
  targetHips.updateWorldMatrix(true, true);
  const target = new THREE.Skeleton([targetHips, targetArm, targetForearm]);
  const mapping = buildRigMap(source, target, {
    manualMap: {
      'joint-5': 'mixamorigHips',
      'joint-8': 'mixamorigRightArm',
      'joint-9': 'mixamorigRightForeArm',
    },
  });
  const quarterTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const clip = new THREE.AnimationClip('punch', 1, [
    new THREE.QuaternionKeyframeTrack('joint-8.quaternion', [0, 1], [
      0, 0, 0, 1,
      quarterTurn.x, quarterTurn.y, quarterTurn.z, quarterTurn.w,
    ]),
  ]);
  const result = retargetAnimationClip(clip, source, target, mapping, { applyUpCorrection: false });
  const armTrack = result.clip.tracks.find((track) => track.name === 'mixamorigRightArm.quaternion');
  assert.ok(armTrack);
  const finalRotation = new THREE.Quaternion().fromArray(armTrack!.values, armTrack!.values.length - 4);
  const finalDirection = new THREE.Vector3(0, -1, 0).applyQuaternion(finalRotation);
  assert.ok(finalDirection.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-6);
  assert.deepEqual(result.report.directionAlignedBones, ['mixamorigRightArm']);
  assert.equal(result.report.directionTransferMode, 'relative');
});

test('retargeting can use absolute source directions for action peaks with different idle limbs', () => {
  const sourceHips = new THREE.Bone();
  sourceHips.name = 'joint-5';
  const sourceArm = new THREE.Bone();
  sourceArm.name = 'joint-8';
  const sourceForearm = new THREE.Bone();
  sourceForearm.name = 'joint-9';
  sourceForearm.position.x = 1;
  sourceHips.add(sourceArm);
  sourceArm.add(sourceForearm);
  sourceHips.updateWorldMatrix(true, true);
  const source = new THREE.Skeleton([sourceHips, sourceArm, sourceForearm]);

  const targetHips = new THREE.Bone();
  targetHips.name = 'mixamorigHips';
  const targetArm = new THREE.Bone();
  targetArm.name = 'mixamorigRightArm';
  const targetForearm = new THREE.Bone();
  targetForearm.name = 'mixamorigRightForeArm';
  targetForearm.position.y = -1;
  targetHips.add(targetArm);
  targetArm.add(targetForearm);
  targetHips.updateWorldMatrix(true, true);
  const target = new THREE.Skeleton([targetHips, targetArm, targetForearm]);
  const mapping = buildRigMap(source, target, {
    manualMap: {
      'joint-5': 'mixamorigHips',
      'joint-8': 'mixamorigRightArm',
      'joint-9': 'mixamorigRightForeArm',
    },
  });
  const forwardTurn = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    -Math.PI / 2,
  );
  const clip = new THREE.AnimationClip('absolute_jab', 1, [
    new THREE.QuaternionKeyframeTrack('joint-8.quaternion', [0, 1], [
      0, 0, 0, 1,
      ...forwardTurn.toArray(),
    ]),
  ]);
  const result = retargetAnimationClip(clip, source, target, mapping, {
    applyUpCorrection: false,
    directionTransferMode: 'absolute',
    directionTransferBones: ['mixamorigRightArm'],
  });
  const armTrack = result.clip.tracks.find((track) => track.name === 'mixamorigRightArm.quaternion');
  assert.ok(armTrack);
  const finalRotation = new THREE.Quaternion().fromArray(armTrack!.values, armTrack!.values.length - 4);
  const finalDirection = new THREE.Vector3(0, -1, 0).applyQuaternion(finalRotation);
  assert.ok(finalDirection.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-6);
  assert.equal(result.report.directionTransferMode, 'absolute');
  assert.deepEqual(result.report.directionTransferBones, ['mixamorigRightArm']);
});

test('retargeting anchors shared reference clips and preserves target leaf rotations', () => {
  const sourceHips = new THREE.Bone();
  sourceHips.name = 'joint-5';
  const sourceArm = new THREE.Bone();
  sourceArm.name = 'joint-8';
  const sourceHand = new THREE.Bone();
  sourceHand.name = 'joint-10';
  sourceHand.position.x = 1;
  sourceHips.add(sourceArm);
  sourceArm.add(sourceHand);
  sourceHips.updateWorldMatrix(true, true);
  const source = new THREE.Skeleton([sourceHips, sourceArm, sourceHand]);

  const targetHips = new THREE.Bone();
  targetHips.name = 'mixamorigHips';
  const targetArm = new THREE.Bone();
  targetArm.name = 'mixamorigRightArm';
  const targetHand = new THREE.Bone();
  targetHand.name = 'mixamorigRightHand';
  targetHand.position.y = -1;
  targetHips.add(targetArm);
  targetArm.add(targetHand);
  targetHips.updateWorldMatrix(true, true);
  const target = new THREE.Skeleton([targetHips, targetArm, targetHand]);
  const mapping = buildRigMap(source, target, {
    manualMap: {
      'joint-5': 'mixamorigHips',
      'joint-8': 'mixamorigRightArm',
      'joint-10': 'mixamorigRightHand',
    },
  });

  const sourceBaselineArm = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    Math.PI / 6,
  );
  const sourceBaselineHand = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    Math.PI / 3,
  );
  const sourceReference = new THREE.AnimationClip('source_idle', 1, [
    new THREE.QuaternionKeyframeTrack('joint-8.quaternion', [0, 1], [
      ...sourceBaselineArm.toArray(), ...sourceBaselineArm.toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack('joint-10.quaternion', [0, 1], [
      ...sourceBaselineHand.toArray(), ...sourceBaselineHand.toArray(),
    ]),
  ]);
  const sourceActionArm = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    Math.PI / 2,
  );
  const sourceActionHand = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    -Math.PI / 2,
  );
  const action = new THREE.AnimationClip('jab', 1, [
    new THREE.QuaternionKeyframeTrack('joint-8.quaternion', [0, 1], [
      ...sourceBaselineArm.toArray(), ...sourceActionArm.toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack('joint-10.quaternion', [0, 1], [
      ...sourceBaselineHand.toArray(), ...sourceActionHand.toArray(),
    ]),
  ]);

  const targetBaselineArm = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI / 8,
  );
  const targetBaselineHand = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    -Math.PI / 5,
  );
  const targetReference = new THREE.AnimationClip('target_idle', 1, [
    new THREE.QuaternionKeyframeTrack('mixamorigRightArm.quaternion', [0, 1], [
      ...targetBaselineArm.toArray(), ...targetBaselineArm.toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack('mixamorigRightHand.quaternion', [0, 1], [
      ...targetBaselineHand.toArray(), ...targetBaselineHand.toArray(),
    ]),
  ]);

  const result = retargetAnimationClip(action, source, target, mapping, {
    applyUpCorrection: false,
    alignMappedBoneDirections: false,
    sourceReferencePose: 'clip',
    sourceReferenceClip: sourceReference,
    targetReferenceClip: targetReference,
    preserveTargetLeafRotations: true,
    sampleRateHz: 4,
    poseRecovery: {
      peakFrame: 1,
      holdThroughFrame: 2,
      returnByFrame: 4,
    },
  });
  const armTrack = result.clip.tracks.find((track) => track.name === 'mixamorigRightArm.quaternion');
  const handTrack = result.clip.tracks.find((track) => track.name === 'mixamorigRightHand.quaternion');
  assert.ok(armTrack);
  assert.ok(handTrack);
  const initialArm = new THREE.Quaternion().fromArray(armTrack!.values, 0);
  const initialArmError = initialArm.angleTo(targetBaselineArm);
  assert.ok(initialArmError < 1e-3, `initial target reference error was ${initialArmError}`);
  const peakArm = new THREE.Quaternion().fromArray(armTrack!.values, 4);
  const heldArm = new THREE.Quaternion().fromArray(armTrack!.values, 8);
  const recoveredArm = new THREE.Quaternion().fromArray(armTrack!.values, 16);
  assert.ok(peakArm.angleTo(heldArm) < 1e-6);
  assert.ok(recoveredArm.angleTo(targetBaselineArm) < 1e-3);
  for (let offset = 0; offset < handTrack!.values.length; offset += 4) {
    const handRotation = new THREE.Quaternion().fromArray(handTrack!.values, offset);
    assert.ok(handRotation.angleTo(targetBaselineHand) < 1e-3);
  }
  assert.equal(result.report.sourceReferenceClip, 'source_idle');
  assert.equal(result.report.targetReferenceClip, 'target_idle');
  assert.deepEqual(result.report.preservedTargetLeafRotations, ['mixamorigRightHand']);
  assert.deepEqual(result.report.poseRecovery, {
    peakFrame: 1,
    holdThroughFrame: 2,
    returnByFrame: 4,
  });
});

test('retargeting can preserve an explicitly configured mapped target rotation', () => {
  const source = sourceSkeleton();
  const target = targetSkeleton();
  const mapping = buildRigMap(source, target, {
    manualMap: {
      'joint-5': 'mixamorigHips',
      'joint-6': 'mixamorigSpine2',
    },
  });
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const clip = new THREE.AnimationClip('source_walk', 1, [
    new THREE.QuaternionKeyframeTrack('joint-6.quaternion', [0, 1], [
      0, 0, 0, 1,
      ...turn.toArray(),
    ]),
  ]);
  const result = retargetAnimationClip(clip, source, target, mapping, {
    applyUpCorrection: false,
    alignMappedBoneDirections: false,
    sampleRateHz: 2,
    preserveTargetRotations: ['mixamorigSpine2'],
  });
  const track = result.clip.tracks.find((candidate) => candidate.name === 'mixamorigSpine2.quaternion');
  assert.ok(track);
  for (let offset = 0; offset < track!.values.length; offset += 4) {
    const rotation = new THREE.Quaternion().fromArray(track!.values, offset);
    assert.ok(rotation.angleTo(new THREE.Quaternion()) < 1e-6);
  }
  assert.deepEqual(result.report.preservedTargetRotations, ['mixamorigSpine2']);
});

test('retargeting compensates for target-reference motion on unmapped intermediate bones', () => {
  const sourceHips = new THREE.Bone();
  sourceHips.name = 'sourceHips';
  const sourceHead = new THREE.Bone();
  sourceHead.name = 'sourceHead';
  sourceHead.position.y = 1;
  sourceHips.add(sourceHead);
  sourceHips.updateWorldMatrix(true, true);
  const source = new THREE.Skeleton([sourceHips, sourceHead]);

  const targetHips = new THREE.Bone();
  targetHips.name = 'targetHips';
  const targetSpine = new THREE.Bone();
  targetSpine.name = 'targetSpine';
  targetSpine.position.y = 0.5;
  const targetHead = new THREE.Bone();
  targetHead.name = 'targetHead';
  targetHead.position.y = 0.5;
  const targetAccessory = new THREE.Bone();
  targetAccessory.name = 'targetAccessory';
  targetAccessory.position.y = 0.25;
  const targetFinger = new THREE.Bone();
  targetFinger.name = 'targetFinger';
  targetFinger.position.x = 0.25;
  targetHips.add(targetSpine);
  targetSpine.add(targetHead);
  targetHead.add(targetAccessory);
  targetHead.add(targetFinger);
  targetHips.updateWorldMatrix(true, true);
  const target = new THREE.Skeleton([targetHips, targetSpine, targetHead, targetAccessory, targetFinger]);
  const mapping = buildRigMap(source, target, {
    manualMap: {
      sourceHips: 'targetHips',
      sourceHead: 'targetHead',
    },
  });

  const identityValues = [0, 0, 0, 1, 0, 0, 0, 1];
  const sourceReference = new THREE.AnimationClip('source_idle', 1, [
    new THREE.QuaternionKeyframeTrack('sourceHips.quaternion', [0, 1], identityValues),
    new THREE.QuaternionKeyframeTrack('sourceHead.quaternion', [0, 1], identityValues),
  ]);
  const action = sourceReference.clone();
  action.name = 'source_action';
  const spineReferenceRotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    Math.PI / 6,
  );
  const headReferenceRotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    Math.PI / 18,
  );
  const targetReference = new THREE.AnimationClip('target_idle', 1, [
    new THREE.QuaternionKeyframeTrack('targetSpine.quaternion', [0, 1], [
      ...spineReferenceRotation.toArray(), ...spineReferenceRotation.toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack('targetHead.quaternion', [0, 1], [
      ...headReferenceRotation.toArray(), ...headReferenceRotation.toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack('targetAccessory.quaternion', [0, 1], [
      ...spineReferenceRotation.toArray(), ...spineReferenceRotation.toArray(),
    ]),
  ]);

  const result = retargetAnimationClip(action, source, target, mapping, {
    applyUpCorrection: false,
    alignMappedBoneDirections: false,
    sourceReferencePose: 'clip',
    sourceReferenceClip: sourceReference,
    targetReferenceClip: targetReference,
    targetChainCurls: [{
      palmBone: 'targetHead',
      bones: ['targetFinger'],
      palmNormal: [0, 0, 1],
      degrees: [60],
    }],
  });
  const headTrack = result.clip.tracks.find((track) => track.name === 'targetHead.quaternion');
  const spineTrack = result.clip.tracks.find((track) => track.name === 'targetSpine.quaternion');
  const accessoryTrack = result.clip.tracks.find((track) => track.name === 'targetAccessory.quaternion');
  const fingerTrack = result.clip.tracks.find((track) => track.name === 'targetFinger.quaternion');
  assert.ok(headTrack);
  assert.ok(spineTrack);
  assert.equal(accessoryTrack, undefined);
  assert.ok(fingerTrack);
  const outputHeadLocal = new THREE.Quaternion().fromArray(headTrack!.values, 0).normalize();
  const outputSpineLocal = new THREE.Quaternion().fromArray(spineTrack!.values, 0).normalize();
  const expectedHeadWorld = spineReferenceRotation.clone().multiply(headReferenceRotation).normalize();
  assert.ok(outputSpineLocal.clone().multiply(outputHeadLocal).angleTo(expectedHeadWorld) < 1e-6);
  assert.ok(outputSpineLocal.angleTo(spineReferenceRotation) < 1e-6);
  assert.ok(outputHeadLocal.angleTo(headReferenceRotation) < 1e-6);
  const outputFingerLocal = new THREE.Quaternion().fromArray(fingerTrack!.values, 0).normalize();
  const expectedFingerLocal = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 3);
  assert.ok(outputFingerLocal.angleTo(expectedFingerLocal) < 1e-6);
  assert.deepEqual(result.report.targetChainCurls, [{
    palmBone: 'targetHead',
    bones: ['targetFinger'],
    palmNormal: [0, 0, 1],
    degrees: [60],
  }]);
  assert.throws(() => retargetAnimationClip(action, source, target, mapping, {
    targetChainCurls: [{
      palmBone: 'targetSpine',
      bones: ['targetHead'],
      palmNormal: [0, 0, 1],
      degrees: [30],
    }],
  }), /Cannot curl mapped target bone targetHead/);
  assert.throws(() => retargetAnimationClip(action, source, target, mapping, {
    targetChainCurls: [{
      palmBone: 'targetHead',
      bones: ['targetFinger'],
      palmNormal: [0, 0, 1],
      degrees: [],
    }],
  }), /must provide one angle per bone/);
  assert.throws(() => retargetAnimationClip(action, source, target, mapping, {
    targetChainCurls: [{
      palmBone: 'targetHead',
      bones: ['targetFinger'],
      palmNormal: [Number.NaN, 0, 1],
      degrees: [60],
    }],
  }), /must contain finite components/);
});

test('natural retargeting is deterministic across helper ancestors, torso, legs, and sole contacts', () => {
  const sourceHelper = new THREE.Bone();
  sourceHelper.name = 'joint-4';
  const sourceHips = new THREE.Bone();
  sourceHips.name = 'joint-5';
  sourceHips.position.y = 2;
  const sourceSpine = new THREE.Bone();
  sourceSpine.name = 'joint-6';
  sourceSpine.position.y = 1;
  sourceHelper.add(sourceHips);
  sourceHips.add(sourceSpine);
  const sourceHead = new THREE.Bone(); sourceHead.name = 'joint-8'; sourceHead.position.y = 0.4;
  sourceSpine.add(sourceHead);
  const sourceBones = [sourceHelper, sourceHips, sourceSpine, sourceHead];
  for (const [hipName, kneeName, ankleName, x] of [
    ['joint-19', 'joint-20', 'joint-22', 0.3],
    ['joint-24', 'joint-25', 'joint-27', -0.3],
  ] as const) {
    const hip = new THREE.Bone();
    hip.name = hipName;
    hip.position.x = x;
    const knee = new THREE.Bone();
    knee.name = kneeName;
    knee.position.set(0, -0.8, 0.08);
    const ankle = new THREE.Bone();
    ankle.name = ankleName;
    ankle.position.set(0, -0.8, -0.08);
    sourceHips.add(hip);
    hip.add(knee);
    knee.add(ankle);
    sourceBones.push(hip, knee, ankle);
    const toe=new THREE.Bone();toe.name=`${ankleName}-toe`;toe.position.set(0,-0.03,0.15);ankle.add(toe);sourceBones.push(toe);
  }
  sourceHelper.updateWorldMatrix(true, true);
  const source = new THREE.Skeleton(sourceBones);

  const targetHips = new THREE.Bone();
  targetHips.name = 'mixamorigHips';
  targetHips.position.y = 2;
  const targetSpine = new THREE.Bone();
  targetSpine.name = 'mixamorigSpine';
  targetSpine.position.y = 0.3;
  const targetSpine1 = new THREE.Bone();
  targetSpine1.name = 'mixamorigSpine1';
  targetSpine1.position.y = 0.3;
  const targetSpine2 = new THREE.Bone();
  targetSpine2.name = 'mixamorigSpine2';
  targetSpine2.position.y = 0.4;
  targetHips.add(targetSpine);
  targetSpine.add(targetSpine1);
  targetSpine1.add(targetSpine2);
  const targetHead = new THREE.Bone(); targetHead.name = 'mixamorigHead'; targetHead.position.y = 0.4;
  targetSpine2.add(targetHead);
  const targetBones = [targetHips, targetSpine, targetSpine1, targetSpine2, targetHead];
  for (const [hipName, kneeName, ankleName, x] of [
    ['mixamorigLeftUpLeg', 'mixamorigLeftLeg', 'mixamorigLeftFoot', 0.25],
    ['mixamorigRightUpLeg', 'mixamorigRightLeg', 'mixamorigRightFoot', -0.25],
  ] as const) {
    const hip = new THREE.Bone();
    hip.name = hipName;
    hip.position.x = x;
    const knee = new THREE.Bone();
    knee.name = kneeName;
    knee.position.set(0, -0.75, 0.06);
    const ankle = new THREE.Bone();
    ankle.name = ankleName;
    ankle.position.set(0, -0.75, -0.06);
    targetHips.add(hip);
    hip.add(knee);
    knee.add(ankle);
    targetBones.push(hip, knee, ankle);
    const toe=new THREE.Bone();toe.name=`${ankleName}Toe`;toe.position.set(0,-0.03,0.15);ankle.add(toe);targetBones.push(toe);
  }
  targetHips.updateWorldMatrix(true, true);
  const target = new THREE.Skeleton(targetBones);
  const mapping = buildRigMap(source, target, {
    manualMap: {
      'joint-5': 'mixamorigHips',
      'joint-6': 'mixamorigSpine2',
      'joint-8': 'mixamorigHead',
      'joint-19': 'mixamorigLeftUpLeg',
      'joint-20': 'mixamorigLeftLeg',
      'joint-22': 'mixamorigLeftFoot',
      'joint-24': 'mixamorigRightUpLeg',
      'joint-25': 'mixamorigRightLeg',
      'joint-27': 'mixamorigRightFoot',
      'joint-22-toe':'mixamorigLeftFootToe',
      'joint-27-toe':'mixamorigRightFootToe',
    },
  });
  assert.equal(mapping.ok, true);
  const helperTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 12);
  const action = new THREE.AnimationClip('natural_test', 2 / 60, [
    new THREE.QuaternionKeyframeTrack('joint-22-toe.quaternion',[0,2/60],[0,0,0,1,...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),0.2).toArray()]),
    new THREE.QuaternionKeyframeTrack('joint-4.quaternion', [0, 2 / 60], [
      0, 0, 0, 1, ...helperTurn.toArray(),
    ]),
  ]);
  const sourceReference = new THREE.AnimationClip('source_reference', 2 / 60, [
    new THREE.QuaternionKeyframeTrack('joint-4.quaternion', [0, 2 / 60], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  const targetReference = new THREE.AnimationClip('target_reference', 2 / 60, [
    new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion', [0, 2 / 60], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  const naturalMotion: NaturalMotionProfile = {
    torso: { targetBones: ['mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2'] },
    legs: {
      left: {
        hip: 'mixamorigLeftUpLeg', knee: 'mixamorigLeftLeg', ankle: 'mixamorigLeftFoot',
        soleOffset: [0, -0.08, 0.04], pole: [0, 0, 1], minBendDegrees: 0.01,
        maxBendDegrees: 150, maxPelvisCorrection: 0.2,
      },
      right: {
        hip: 'mixamorigRightUpLeg', knee: 'mixamorigRightLeg', ankle: 'mixamorigRightFoot',
        soleOffset: [0, -0.08, 0.04], pole: [0, 0, 1], minBendDegrees: 0.01,
        maxBendDegrees: 150, maxPelvisCorrection: 0.2,
      },
    },
    contacts: {
      natural_test: [
        { foot: 'left', startFrame: 0, endFrame: 2, blendFrames: 1 },
        { foot: 'right', startFrame: 0, endFrame: 2, blendFrames: 1 },
      ],
    },
    legMotionLimits: {
      natural_test: {
        maximumForwardDegrees: 50,
        maximumBackwardDegrees: 40,
        maximumLateralDegrees: 20,
        minimumSwingBendDegrees: 12,
      },
    },
  };
  const run = () => retargetAnimationClip(action, source, target, mapping, {
    applyUpCorrection: false,
    sampleRateHz: 60,
    sourceReferencePose: 'clip',
    sourceReferenceClip: sourceReference,
    targetReferenceClip: targetReference,
    naturalMotion,
  });
  const grounded = retargetAnimationClip(action, source, target, mapping, {
    applyUpCorrection:false,sampleRateHz:60,sourceReferencePose:'clip',sourceReferenceClip:sourceReference,targetReferenceClip:targetReference,
    naturalMotion:{...naturalMotion,legOrientation:'animated',grounding:{natural_test:{strideScale:0.5,rootHeightOffset:-0.05,groundHeight:0.35}}},
  });
  const contactMixer=new THREE.AnimationMixer(targetHips);
  const savedPose=targetBones.map(b=>({bone:b,position:b.position.clone(),quaternion:b.quaternion.clone()}));
  try {
    const a=contactMixer.clipAction(grounded.clip);a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();
    for (const time of [0,1/60,2/60]) {
      contactMixer.setTime(time);targetHips.updateWorldMatrix(true,true);
      for (const side of ['Left','Right']) {
        const ankle=targetBones.find(b=>b.name===`mixamorig${side}Foot`)!;
        const sole=new THREE.Vector3(0,-0.08,0.04).applyMatrix4(ankle.matrixWorld);
        assert.ok(Math.abs(sole.y-0.35)<1e-5,`Explicit sole plane was not reached at ${time}/${side}: ${sole.y}; ${JSON.stringify(grounded.report.naturalMotion?.contacts)}`);
      }
      const toe=targetBones.find(b=>b.name==='mixamorigLeftFootToe')!;
      const expectedToe=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),time*6);
      assert.ok(toe.quaternion.angleTo(expectedToe)<1e-5,'Mapped toe must retain animated ankle-local rotation after foot correction');
    }
  }finally{
    contactMixer.stopAllAction();contactMixer.uncacheRoot(targetHips);
    savedPose.forEach(({bone,position,quaternion})=>{bone.position.copy(position);bone.quaternion.copy(quaternion);});targetHips.updateWorldMatrix(true,true);
  }
  const first = run();
  const second = run();
  assert.deepEqual(
    first.clip.tracks.map((track) => [track.name, [...track.times], [...track.values]]),
    second.clip.tracks.map((track) => [track.name, [...track.times], [...track.values]]),
  );
  assert.ok(first.report.naturalMotion?.torso?.effectiveWeights.every(
    (weight, index) => Math.abs(weight - [0.3, 0.3, 0.4][index]) < 1e-12,
  ));
  assert.equal(first.report.naturalMotion?.contacts.length, 2);
  assert.equal(first.report.naturalMotion?.legMotionLimit?.maximumBackwardDegrees, 40);
  assert.ok(first.clip.tracks.some((track) => track.name === 'mixamorigSpine.quaternion'));
  assert.ok(first.clip.tracks.some((track) => track.name === 'mixamorigLeftLeg.quaternion'));
  assert.ok(first.clip.tracks.every((track) => !track.name.endsWith('.scale')));
  const bendTurn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.1);
  const travelling = new THREE.AnimationClip('travelling', 1 / 60, [
    new THREE.VectorKeyframeTrack('joint-4.position', [0, 1 / 60], [0, 0, 0, 0, 0, 1]),
    new THREE.VectorKeyframeTrack('joint-5.position', [0, 1 / 60], [0, 2, 0, 0, 2.1, 0]),
  ]);
  const extracted = retargetAnimationClip(travelling, source, target, mapping, {
    applyUpCorrection: false, scaleRootMotion: false, extractRootMotionBone: 'joint-4',
  });
  const planar = retargetAnimationClip(travelling, source, target, mapping, {
    applyUpCorrection:false,scaleRootMotion:false,sampleRateHz:60,
    sourceReferencePose:'clip',sourceReferenceClip:sourceReference,targetReferenceClip:targetReference,
    naturalMotion:{...naturalMotion,grounding:{travelling:{strideScale:1,rootHeightOffset:0,groundHeight:0.35}},
      contacts:{travelling:[
        {foot:'left',positionMode:'plane',startFrame:0,endFrame:1,blendFrames:0},
        {foot:'right',positionMode:'plane',startFrame:0,endFrame:1,blendFrames:0},
      ]}},
  });
  const planeMixer=new THREE.AnimationMixer(targetHips),planePose=targetBones.map(b=>({bone:b,position:b.position.clone(),quaternion:b.quaternion.clone()}));
  try {
    const a=planeMixer.clipAction(planar.clip);a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.play();
    const soles:THREE.Vector3[][]=[];
    for(const time of [0,1/60]) {
      planeMixer.setTime(time);targetHips.updateWorldMatrix(true,true);
      soles.push(['Left','Right'].map(side=>{
        const ankle=targetBones.find(b=>b.name===`mixamorig${side}Foot`)!;
        const sole=new THREE.Vector3(0,-0.08,0.04).applyMatrix4(ankle.matrixWorld);
        assert.ok(Math.abs(sole.y-0.35)<1e-5,'Plane contact preserves sole height');return sole;
      }));
    }
    for(let side=0;side<2;side++)assert.ok(Math.abs(soles[1][side].z-soles[0][side].z-1)<1e-5,'Plane contact follows horizontal motion instead of silently planting');
    assert.ok(planar.report.naturalMotion!.contacts.every(c=>c.positionMode==='plane'));
  }finally {
    planeMixer.stopAllAction();planeMixer.uncacheRoot(targetHips);
    planePose.forEach(({bone,position,quaternion})=>{bone.position.copy(position);bone.quaternion.copy(quaternion);});targetHips.updateWorldMatrix(true,true);
  }
  const retained = retargetAnimationClip(travelling, source, target, mapping, {
    applyUpCorrection: false, scaleRootMotion: false,
  });
  const endRoot = (result: typeof extracted) => Array.from(result.clip.tracks.find(t => t.name === 'mixamorigHips.position')!.values.slice(-3));
  assert.ok(Math.abs(endRoot(extracted)[1] - 2.1) < 1e-6, 'Extraction must retain pelvis bob');
  assert.equal(endRoot(extracted)[2], 0, 'Extraction removes only the named ancestor travel');
  assert.ok(Math.abs(endRoot(retained)[2] - 1) < 1e-6, 'Existing jobs retain root motion');
  assert.ok(Math.abs(extracted.report.rootMotionExtraction!.maximumDisplacement - 1) < 1e-6);
  assert.throws(() => retargetAnimationClip(travelling, source, target, mapping, {extractRootMotionBone: 'joint-20'}), /ancestor/);
  assert.throws(() => retargetAnimationClip(travelling, source, target, mapping, {extractRootMotionBone: 'missing'}), /ancestor/);
  const timed = retargetAnimationClip(travelling, source, target, mapping, {
    applyUpCorrection:false,scaleRootMotion:false,extractRootMotionBone:'joint-4',
    visualTiming:{durationFrames:40,cycles:2},sampleRateHz:60,interpolation:'step',nextDownRationalTimes:true,
  });
  assert.equal(timed.clip.duration,40/60);
  const timedRoot=timed.clip.tracks.find(t=>t.name==='mixamorigHips.position')!;
  assert.equal(timedRoot.times.length,41);
  for(const [frame,y] of [[0,2],[10,2.05],[20,2],[30,2.05],[40,2.1]]) {
    assert.ok(Math.abs(timedRoot.values[frame*3+1]-y)<1e-6,`Baked frame ${frame} follows declared cadence`);
    assert.equal(timedRoot.values[frame*3+2],0);
  }
  assert.deepEqual(timed.report.visualTiming,{durationFrames:40,cycles:2,sourceDuration:1/60});
  const release = retargetAnimationClip(travelling,source,target,mapping,{
    applyUpCorrection:false,scaleRootMotion:false,extractRootMotionBone:'joint-4',sampleRateHz:60,
    visualTiming:{durationFrames:46,cycles:1,landmarks:[{outputFrame:0,sourcePhase:0},{outputFrame:16,sourcePhase:0.25},{outputFrame:46,sourcePhase:1}]},
  });
  const releaseRoot=release.clip.tracks.find(t=>t.name==='mixamorigHips.position')!;
  assert.ok(Math.abs(releaseRoot.values[16*3+1]-2.025)<1e-6,'Release frame must sample the declared source landmark');
  assert.equal(release.clip.duration,46/60);

  const bendClip = new THREE.AnimationClip('bend_calibration', 1 / 60, ['joint-20', 'joint-25'].map(name => (
    new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, 1 / 60], [0, 0, 0, 1, ...bendTurn])
  )));
  bendClip.tracks.push(new THREE.QuaternionKeyframeTrack('joint-4.quaternion', [0, 1 / 60], [0, 0, 0, 1, 0, 0, 0, 1]));
  const calibrated = retargetAnimationClip(bendClip, source, target, mapping, {
    applyUpCorrection: false, sourceReferencePose: 'clip', sourceReferenceClip: sourceReference,
    targetReferenceClip: targetReference,
    naturalMotion: { ...naturalMotion, reachTransfer: 'calibrated-bend', contacts: {}, legMotionLimits: {} },
  });
  const savedTarget = targetBones.map(b => ({ bone: b, position: b.position.clone(), rotation: b.quaternion.clone() }));
  const bendMixer = new THREE.AnimationMixer(targetHips);
  try {
    const clipAction = bendMixer.clipAction(calibrated.clip);clipAction.setLoop(THREE.LoopOnce, 1);clipAction.clampWhenFinished = true;clipAction.play();
    bendMixer.setTime(calibrated.clip.duration);targetHips.updateWorldMatrix(true, true);
    for (const side of ['Left', 'Right']) {
      const [hip, knee, ankle] = ['UpLeg', 'Leg', 'Foot'].map(suffix => targetBones.find(b => b.name === `mixamorig${side}${suffix}`)!.getWorldPosition(new THREE.Vector3()));
      const actual = knee.clone().sub(hip).angleTo(ankle.clone().sub(knee));
      const sourceBend = 2 * Math.atan(0.08 / 0.8), targetBend = 2 * Math.atan(0.06 / 0.75);
      assert.ok(Math.abs(actual - targetBend * (sourceBend - 0.1) / sourceBend) < 1e-6, `${side} bend must remain articulated, not saturate at full extension`);
    }
  } finally {
    bendMixer.stopAllAction();bendMixer.uncacheRoot(targetHips);
    savedTarget.forEach(({bone, position, rotation}) => {bone.position.copy(position);bone.quaternion.copy(rotation);});targetHips.updateWorldMatrix(true, true);
  }
  for (const name of ['mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2']) {
    const track = first.clip.tracks.find((entry) => entry.name === `${name}.quaternion`)!;
    const local = new THREE.Quaternion().fromArray(track.values, track.values.length - 4);
    assert.ok(local.angleTo(new THREE.Quaternion()) < 1e-6, `Rigid parent turn bent ${name}`);
  }
  const turn = (axis: THREE.Vector3, angle: number) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
  const x = new THREE.Vector3(1, 0, 0), y = new THREE.Vector3(0, 1, 0), z = new THREE.Vector3(0, 0, 1);
  const track = (name: string, a: THREE.Quaternion, b = a) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, 2 / 60], [...a.toArray(), ...b.toArray()]);
  for (const rotated of [false, true]) for (const [parentAngle, chestAngle] of [[0.3, 0], [0, 0.4], [0.3, 0.4]]) {
    const sourceRef = rotated ? turn(x, 0.27) : new THREE.Quaternion();
    const targetRef = rotated ? turn(z, -0.31) : new THREE.Quaternion();
    const parent = turn(y, parentAngle).multiply(sourceRef);
    const chest = turn(z, chestAngle);
    const input = new THREE.AnimationClip('articulation', 2 / 60, [
      track('joint-4', sourceRef, parent), track('joint-6', new THREE.Quaternion(), chest),
      track('joint-8', new THREE.Quaternion(), chest.clone().invert()),
    ]);
    const output = retargetAnimationClip(input, source, target, mapping, {
      applyUpCorrection: false, sampleRateHz: 60, sourceReferencePose: 'clip',
      sourceReferenceClip: new THREE.AnimationClip('reference', 2 / 60, [track('joint-4', sourceRef)]),
      targetReferenceClip: new THREE.AnimationClip('reference', 2 / 60, [track('mixamorigHips', targetRef)]),
      naturalMotion: { ...naturalMotion, contacts: {}, legMotionLimits: {} },
    });
    const local = (name: string) => {
      const value = output.clip.tracks.find(entry => entry.name === `${name}.quaternion`)!;
      return new THREE.Quaternion().fromArray(value.values, value.values.length - 4).normalize();
    };
    const spineLocals = ['mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2'].map(local);
    const chestWorld = local('mixamorigHips'); spineLocals.forEach(q => chestWorld.multiply(q));
    const expectedChest = parent.clone().multiply(chest).multiply(sourceRef.clone().invert()).multiply(targetRef);
    assert.ok(chestWorld.angleTo(expectedChest) < 1e-6, 'Chest world articulation must match source-relative motion');
    const headWorld = chestWorld.clone().multiply(local('mixamorigHead'));
    const expectedHead = parent.clone().multiply(sourceRef.clone().invert()).multiply(targetRef);
    assert.ok(headWorld.angleTo(expectedHead) < 1e-6, 'Head counter-rotation must survive spine distribution');
    if (chestAngle === 0) spineLocals.forEach(q => assert.ok(q.angleTo(new THREE.Quaternion()) < 1e-6));
    if (!rotated) spineLocals.forEach((q, i) => assert.ok(q.angleTo(turn(z, chestAngle * [0.3, 0.3, 0.4][i])) < 1e-6));
  }
});
