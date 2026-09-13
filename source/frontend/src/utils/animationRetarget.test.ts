import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { retargetAnimationClip } from './animationRetarget';
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
