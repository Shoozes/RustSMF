import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { parseClipForearmTwist, redistributeForearmTwist } from './forearmTwist';
import { retargetWithWorkerProof as retargetAnimationClip } from '../workers/retargetParity';
import { buildRigMap } from './rigMapping';
import { parseRetargetProfile, profileClipOptions, RETARGET_PROFILE_SCHEMA } from './retargetProfile';

const pair = { forearm: 'arm', hand: 'hand', share: .5 };
const rotation = (angle: number, axis = new THREE.Vector3(1, 0, 0)) => new THREE.Quaternion().setFromAxisAngle(axis, angle * Math.PI / 180);
function fixture(sign = 1, angles = [0, 90, 140, 0]) {
  const bones = ['torso', 'arm', 'hand', 'finger'].map(name => { const bone = new THREE.Bone(); bone.name = name; return bone; });
  const [torso, arm, hand, finger] = bones;
  torso.add(arm); arm.add(hand); hand.add(finger);
  arm.position.set(sign, 1, 0); hand.position.set(sign * 2, 0, 0); finger.position.set(sign, .2, .1);
  hand.quaternion.copy(rotation(25, new THREE.Vector3(0, 1, 0)));
  torso.quaternion.copy(rotation(30, new THREE.Vector3(0, 0, 1)));
  torso.updateWorldMatrix(true, true);
  const references = new Map(bones.map(bone => [bone.name, { bone, localPosition: bone.position.clone(), localQuaternion: bone.quaternion.clone(), localScale: bone.scale.clone() }]));
  const rotations = new Map(bones.map(bone => [bone.name, angles.flatMap(angle => bone === hand
    ? rotation(sign * angle).multiply(hand.quaternion).toArray() : bone.quaternion.toArray())]));
  return { bones, references, rotations, positions: new Map<string, number[]>(), samples: angles.length };
}

test('mirrored wrist redistribution preserves palm world transform, descendants, lengths and unrelated tracks', () => {
  for (const sign of [-1, 1]) {
    const f = fixture(sign), original = structuredClone(f.rotations);
    const pose = (tracks: Map<string, number[]>, frame: number) => {
      for (const bone of f.bones) bone.quaternion.fromArray(tracks.get(bone.name)!, frame * 4);
      f.bones[0].updateWorldMatrix(true, true);
      return f.bones.map(bone => ({ position: bone.getWorldPosition(new THREE.Vector3()), quaternion: bone.getWorldQuaternion(new THREE.Quaternion()) }));
    };
    const report = redistributeForearmTwist([pair], f.references, f.rotations, f.positions, f.samples);
    assert.ok(Math.abs(report[0].maximumTransferredDegrees - 70) < 1e-8);
    for (let frame = 0; frame < f.samples; frame++) {
      const before = pose(original, frame), after = pose(f.rotations, frame);
      for (let i = 0; i < f.bones.length; i++) {
        assert.ok(before[i].position.distanceTo(after[i].position) < 1e-10);
        if (i !== 1) assert.ok(before[i].quaternion.angleTo(after[i].quaternion) < 1e-7);
        assert.deepEqual(f.bones[i].position, f.references.get(f.bones[i].name)!.localPosition);
      }
    }
    assert.deepEqual(f.rotations.get('torso'), original.get('torso'));
    assert.deepEqual(f.rotations.get('finger'), original.get('finger'));
    assert.notDeepEqual(f.rotations.get('arm'), original.get('arm'));
  }
});

test('wrist twist unwraps antipodal keys continuously and rejects fractional closed winding', () => {
  const f = fixture(1, [160, 175, 190, 205]);
  f.rotations.set('hand', f.rotations.get('hand')!.map((n, i) => Math.floor(i / 4) % 2 ? -n : n));
  redistributeForearmTwist([pair], f.references, f.rotations, f.positions, f.samples);
  for (const name of ['arm', 'hand']) {
    const values = f.rotations.get(name)!;
    for (let i = 1; i < f.samples; i++) assert.ok(new THREE.Quaternion().fromArray(values, (i - 1) * 4).dot(new THREE.Quaternion().fromArray(values, i * 4)) > .99);
  }
  const closed = fixture(1, [0, 90, 180, 270, 360]);
  assert.throws(() => redistributeForearmTwist([pair], closed.references, closed.rotations, closed.positions, closed.samples), /seam/);
});

test('invalid wrist calibration fails transactionally without replacing tracks', () => {
  const mutations = [
    (f: ReturnType<typeof fixture>) => { f.bones[1].add(new THREE.Bone()); },
    (f: ReturnType<typeof fixture>) => { f.references.get('torso')!.localScale.y = 2; },
    (f: ReturnType<typeof fixture>) => { f.references.get('hand')!.localPosition.set(0, 0, 0); },
    (f: ReturnType<typeof fixture>) => { f.references.get('hand')!.localQuaternion.set(0, 0, 0, 0); },
    (f: ReturnType<typeof fixture>) => { f.rotations.delete('hand'); },
    (f: ReturnType<typeof fixture>) => { f.rotations.get('arm')![0] = NaN; },
    (f: ReturnType<typeof fixture>) => { f.positions.set('hand', []); },
    (f: ReturnType<typeof fixture>) => { f.rotations.set('hand', Array(4).fill(rotation(180, new THREE.Vector3(0, 1, 0)).multiply(f.references.get('hand')!.localQuaternion).toArray()).flat()); },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f); const before = structuredClone(f.rotations);
    assert.throws(() => redistributeForearmTwist([pair], f.references, f.rotations, f.positions, f.samples));
    assert.deepEqual(f.rotations, before);
  }
  const f = fixture(), before = structuredClone(f.rotations);
  assert.throws(() => redistributeForearmTwist([pair, { forearm: 'missing', hand: 'other', share: .5 }], f.references, f.rotations, f.positions, f.samples));
  assert.deepEqual(f.rotations, before);
});

test('per-clip wrist settings roundtrip through the saved profile and actual retarget core', () => {
  const input = { $schema: RETARGET_PROFILE_SCHEMA, retarget: {
    clips: ['motion'], manualMap: Object.fromEntries(['torso', 'arm', 'hand', 'finger'].map(name => [name, name])),
    sourceReferencePose: 'rest', alignMappedBoneDirections: false, scaleRootMotion: false,
    interpolation: 'step', clipForearmTwist: { motion: [pair] },
  } };
  const profile = parseRetargetProfile(JSON.stringify(input));
  assert.deepEqual(parseRetargetProfile(JSON.stringify(profile)), profile);
  const source = fixture(), target = fixture();
  const sourceSkeleton = new THREE.Skeleton(source.bones), targetSkeleton = new THREE.Skeleton(target.bones);
  const clip = new THREE.AnimationClip('motion', 1, [...source.rotations].map(([name, values]) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, .25, .75, 1], values, THREE.InterpolateDiscrete)));
  const options = profileClipOptions(profile, clip, [clip], []);
  assert.deepEqual(options.forearmTwist, [pair]);
  const mapping = buildRigMap(sourceSkeleton, targetSkeleton, { manualMap: input.retarget.manualMap });
  const baseline = retargetAnimationClip(clip, sourceSkeleton, targetSkeleton, mapping, { ...options, forearmTwist: undefined });
  const result = retargetAnimationClip(clip, sourceSkeleton, targetSkeleton, mapping, options);
  assert.ok(result.report.forearmTwist![0].maximumTransferredDegrees > 60);
  for (const track of baseline.clip.tracks) {
    const actual = result.clip.tracks.find(candidate => candidate.name === track.name)!;
    assert.deepEqual(actual.times, track.times);
    if (!['arm.quaternion', 'hand.quaternion'].includes(track.name)) assert.deepEqual(actual.values, track.values);
  }
  for (const f of [source, target]) for (const bone of f.bones) assert.deepEqual(bone.quaternion.toArray(), f.references.get(bone.name)!.localQuaternion.toArray());
  for (const change of [{ interpolation: 'linear' }, { alignMappedBoneDirections: true }, { preserveTargetRotations: ['hand'] }, { clips: ['elsewhere'] }]) {
    assert.throws(() => parseRetargetProfile(JSON.stringify({ ...input, retarget: { ...input.retarget, ...change } })));
  }
  assert.equal(profileClipOptions(profile, new THREE.AnimationClip('other', 1, []), [], []).forearmTwist, undefined);
});

test('wrist settings reject unknown fields, nonfinite shares and ambiguous pairs', () => {
  assert.deepEqual(parseClipForearmTwist(undefined), {});
  for (const value of [null, [], { '': [] }, { motion: null }, { motion: [pair, pair] },
    ...[0, 1, NaN, Infinity, '0.5'].map(share => ({ motion: [{ ...pair, share }] })),
    { motion: [{ ...pair, ignored: true }] }, { motion: [{ ...pair, hand: 'arm' }] }]) assert.throws(() => parseClipForearmTwist(value));
});
