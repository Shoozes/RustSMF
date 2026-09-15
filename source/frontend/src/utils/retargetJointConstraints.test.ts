import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { constrainHeadChain, parseClipJointConstraints } from './retargetJointConstraints';
import { measurePoseJoint, type PoseJointRange } from './poseRanges';
import { retargetAnimationClip } from './animationRetarget';
import { buildRigMap } from './rigMapping';

const range = (bone: string, cone: number): PoseJointRange => ({ bone, referenceRotation: [0, 0, 0, 1],
  twistAxis: [0, 1, 0], bendAxis: [1, 0, 0], flexionDegrees: [-cone, cone], lateralDegrees: [-cone, cone],
  twistDegrees: [-90, 90], maximumSwingDegrees: cone });
const rotation = (degrees: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(degrees));
const neckRange = range('neck', 70), headRange = range('head', 55);

test('neck/head redistribution preserves feasible world intent, mirror, antipodes and loop endpoints', () => {
  for (const sign of [-1, 1]) {
    const neck = rotation(sign * 100), head = rotation(sign * -60);
    const solved = constrainHeadChain(neck, head, neckRange, headRange, 5);
    assert.ok(solved.residualDegrees < 1e-4);
    assert.ok(measurePoseJoint(neckRange, solved.neck).swing <= 70 + 1e-6);
    assert.ok(measurePoseJoint(headRange, solved.head).swing <= 55 + 1e-6);
    const antipodal = new THREE.Quaternion(...neck.toArray().map(n => -n) as [number, number, number, number]);
    const other = constrainHeadChain(antipodal, head, neckRange, headRange, 5);
    assert.ok(other.neck.angleTo(solved.neck) < 1e-7);
    assert.ok(other.head.angleTo(solved.head) < 1e-7);
    const first = constrainHeadChain(rotation(0), rotation(0), neckRange, headRange, 5);
    const terminal = constrainHeadChain(rotation(0), rotation(0), neckRange, headRange, 5);
    assert.deepEqual(first, terminal);
  }
  const impossible = constrainHeadChain(rotation(160), rotation(0), neckRange, headRange, 5);
  assert.ok(impossible.residualDegrees > 34 && impossible.residualDegrees < 36);
});

test('joint constraint parser rejects ambiguous roles and malformed transitions', () => {
  assert.deepEqual(parseClipJointConstraints(undefined), {});
  for (const value of [null, [], { walk: {} }, { walk: { neck: 'neck', head: 'neck', transitionDegrees: 5 } },
    ...[NaN, null, 0, -1, 21, '5'].map(transitionDegrees => ({ walk: { neck: 'neck', head: 'head', transitionDegrees } })),
    { walk: { neck: 'neck', head: 'head', transitionDegrees: 5, ignored: true } }]) {
    assert.throws(() => parseClipJointConstraints(value));
  }
});

test('actual retarget emits constrained chain while retaining root, sibling, descendant and exact timing tracks', () => {
  const skeleton = () => {
    const [root, neck, head, eye, hand] = ['root', 'neck', 'head', 'eye', 'hand'].map(name => { const bone = new THREE.Bone(); bone.name = name; bone.position.y = 1; return bone; });
    root.add(neck, hand); neck.add(head); head.add(eye); root.updateWorldMatrix(true, true);
    return new THREE.Skeleton([root, neck, head, eye, hand]);
  };
  const source = skeleton(), target = skeleton();
  const mapping = buildRigMap(source, target, { manualMap: Object.fromEntries(source.bones.map(bone => [bone.name, bone.name])) });
  const clip = new THREE.AnimationClip('fixture', 1, [
    ...[['neck', 100], ['head', -60], ['hand', 30], ['eye', 10]].map(([name, degrees]) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, .5, 1], [0, 0, 0, 1, ...rotation(degrees as number).toArray(), 0, 0, 0, 1])),
    new THREE.VectorKeyframeTrack('root.position', [0, 1], [0, 1, 0, 1, 1, 0]),
  ]);
  const options = { applyUpCorrection: false, alignMappedBoneDirections: false, sampleRateHz: 60, nextDownRationalTimes: true,
    poseRanges: { schema: 'rustsmf.pose-ranges.v1' as const, id: 'fixture', policy: 'report' as const, joints: [neckRange, headRange] } };
  const baseline = retargetAnimationClip(clip, source, target, mapping, options);
  const result = retargetAnimationClip(clip, source, target, mapping, { ...options, jointConstraints: { neck: 'neck', head: 'head', transitionDegrees: 5 } });
  assert.equal(result.report.poseRanges!.status, 'within-profile');
  assert.ok(result.report.jointConstraints!.correctedSamples > 0);
  assert.ok(result.report.jointConstraints!.maximumResidualDegrees < 1e-4);
  for (const track of baseline.clip.tracks) {
    const corrected = result.clip.tracks.find(t => t.name === track.name)!;
    assert.deepEqual(corrected.times, track.times);
    if (!['neck.quaternion', 'head.quaternion'].includes(track.name)) {
      Array.from(track.values).forEach((value, i) => assert.ok(Math.abs(value - corrected.values[i]) < 1e-7, track.name));
    }
  }
  assert.throws(() => retargetAnimationClip(clip, source, target, mapping, { ...options, jointConstraints: { neck: 'root', head: 'neck', transitionDegrees: 5 } }), /unbranched/);
});
