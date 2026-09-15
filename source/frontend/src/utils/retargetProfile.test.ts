import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeRetargetClips, parseRetargetProfile, profileClipOptions, RETARGET_PROFILE_SCHEMA } from './retargetProfile';

const document = () => ({ $schema: RETARGET_PROFILE_SCHEMA, targetClipNames: { Idle: 'wolf_source_idle' }, retarget: {
  manualMap: { 'joint-12': 'mixamorigHead' },
  clips: ['walk'], sourceReferencePose: 'clip', sourceReferenceClip: 'idle', targetReferenceClip: 'Idle',
  directionTransfer: 'relative', clipDirectionTransfer: { walk: 'absolute' },
  directionTransferBones: ['mixamorigHead'], clipPreserveTargetRotations: { walk: ['mixamorigLeftHand'] },
  sampleRateHz: 60, interpolation: 'step', nextDownRationalTimes: true,
  extractRootMotionBone: 'TransN', clipVisualTiming: {walk:{durationFrames:40,cycles:2}},
} });

test('browser profile keeps explicit mapping, references and per-clip overrides through JSON roundtrip', () => {
  const profile = parseRetargetProfile(JSON.stringify(document()));
  assert.deepEqual(parseRetargetProfile(JSON.stringify(profile)), profile);
  const idle = new THREE.AnimationClip('idle', 1, []), walk = new THREE.AnimationClip('walk', 1, []);
  const target = new THREE.AnimationClip('wolf_source_idle', 1, []);
  const options = profileClipOptions(profile, walk, [idle, walk], [target]);
  assert.equal(options.sourceReferenceClip, idle);
  assert.equal(options.targetReferenceClip, target);
  assert.equal(options.directionTransferMode, 'absolute');
  assert.equal(options.interpolation, 'step');
  assert.equal(options.nextDownRationalTimes, true);
  assert.equal(options.extractRootMotionBone,'TransN');
  assert.deepEqual(options.visualTiming,{durationFrames:40,cycles:2});
  assert.deepEqual(options.preserveTargetRotations, ['mixamorigLeftHand']);
  assert.deepEqual(profile.retarget.manualMap, { 'joint-12': 'mixamorigHead' });
  assert.throws(() => profileClipOptions(profile, walk, [walk], [target]), /missing reference clip idle/);
  assert.throws(() => profileClipOptions(profile, walk, [idle, walk], []), /missing reference clip wolf_source_idle/);
});

test('portable local reference corrections roundtrip into shared clip options', () => {
  const input = document();
  const corrections = { mixamorigHead: { from: [0, 0, 0, 1], to: [0, 1, 0, 0] } };
  const profile = parseRetargetProfile(JSON.stringify({ ...input, retarget: { ...input.retarget, localReferenceCorrections: corrections } }));
  assert.deepEqual(parseRetargetProfile(JSON.stringify(profile)), profile);
  const idle = new THREE.AnimationClip('idle', 1, []), walk = new THREE.AnimationClip('walk', 1, []);
  const target = new THREE.AnimationClip('wolf_source_idle', 1, []);
  assert.deepEqual(profileClipOptions(profile, walk, [idle, walk], [target]).localReferenceCorrections, corrections);
});

test('calibration controls survive portable normalization and reach shared clip options', () => {
  const input = document();
  const settings = { ...input.retarget, rootMotionScale: 2.5, directionAlignmentBones: ['mixamorigHead'] };
  const profile = parseRetargetProfile(JSON.stringify({ ...input, retarget: settings }));
  assert.deepEqual(parseRetargetProfile(JSON.stringify(profile)), profile);
  const idle = new THREE.AnimationClip('idle', 1, []), walk = new THREE.AnimationClip('walk', 1, []);
  const target = new THREE.AnimationClip('wolf_source_idle', 1, []);
  const options = profileClipOptions(profile, walk, [idle, walk], [target]);
  assert.equal(options.rootMotionScale, 2.5);
  assert.deepEqual(options.directionAlignmentBones, ['mixamorigHead']);
  const omitted = parseRetargetProfile(JSON.stringify(input));
  assert.equal(omitted.retarget.rootMotionScale, undefined);
  assert.equal(omitted.retarget.directionAlignmentBones, undefined);
  for (const change of [{ rootMotionScale: 0 }, { rootMotionScale: -1 }, { rootMotionScale: '2' }, { rootMotionScale: null },
    { scaleRootMotion: false }, { directionAlignmentBones: [] }, { directionAlignmentBones: [''] },
    { directionAlignmentBones: ['mixamorigHead', 'mixamorigHead'] }, { alignMappedBoneDirections: false },
    { directionTransferBones: ['other'] }, { clipDirectionTransferBones: { walk: ['other'] } }]) {
    assert.throws(() => parseRetargetProfile(JSON.stringify({ ...input, retarget: { ...settings, ...change } })), /rootMotionScale|directionAlignmentBones/);
  }
});

test('per-clip neck/head constraints share profile validation and option routing', () => {
  const input = document();
  const joint = (bone: string) => ({ bone, referenceRotation: [0, 0, 0, 1], twistAxis: [0, 1, 0], bendAxis: [1, 0, 0],
    flexionDegrees: [-70, 70], lateralDegrees: [-70, 70], twistDegrees: [-90, 90], maximumSwingDegrees: 70 });
  const settings = { ...input.retarget, alignMappedBoneDirections: false,
    poseRanges: { schema: 'rustsmf.pose-ranges.v1', id: 'pair', policy: 'report', joints: [joint('neck'), joint('head')] },
    clipJointConstraints: { walk: { neck: 'neck', head: 'head', transitionDegrees: 5 } } };
  const profile = parseRetargetProfile(JSON.stringify({ ...input, retarget: settings }));
  assert.deepEqual(parseRetargetProfile(JSON.stringify(profile)), profile);
  const idle = new THREE.AnimationClip('idle', 1, []), walk = new THREE.AnimationClip('walk', 1, []);
  const target = new THREE.AnimationClip('wolf_source_idle', 1, []);
  assert.deepEqual(profileClipOptions(profile, walk, [idle, walk], [target]).jointConstraints, settings.clipJointConstraints.walk);
  assert.equal(profileClipOptions(profile, idle, [idle, walk], [target]).jointConstraints, undefined);
  for (const overrides of [{ alignMappedBoneDirections: true }, { poseRanges: undefined },
    { clipJointConstraints: { missing: settings.clipJointConstraints.walk } },
    { clipPoseRecovery: { walk: { peakFrame: 1, holdThroughFrame: 2, returnByFrame: 3 } } }]) {
    assert.throws(() => parseRetargetProfile(JSON.stringify({ ...input, retarget: { ...settings, ...overrides } })), /Joint constraints/);
  }
});

test('browser profile reuses strict job validation and rejects ignored settings', () => {
  const valid = document();
  assert.throws(() => parseRetargetProfile(JSON.stringify({ ...valid, ignored: true })), /Unknown/);
  assert.throws(() => parseRetargetProfile(JSON.stringify({ ...valid, retarget: { ...valid.retarget, inventedOption: true } })), /unknown/i);
  assert.throws(() => parseRetargetProfile(JSON.stringify({ ...valid, retarget: { ...valid.retarget, naturalMotion: { legs: {} } } })), /legs|left/i);
  assert.throws(() => parseRetargetProfile(' '.repeat(1024 * 1024 + 1)), /exceeds/);
});

test('complete CLI jobs import as portable profiles without opening their paths', () => {
  const expected = parseRetargetProfile(JSON.stringify(document()));
  const job = { $schema: 'rustsmf.game-ready-job.v2',
    input: { riggedModel: 'C:/absent/target.glb', referenceObj: 'C:/absent/model.obj', referenceMtl: 'C:/absent/model.mtl', textures: ['C:/absent/color.png'] },
    materialRepair: { mode: 'strict-auto', textureFlipY: true }, coordinates: { unitMeters: 1, up: '+Y', forward: '+Z', grounded: false },
    rig: { retarget: { ...document().retarget, sourceModel: 'C:/private/source.glb' }, clipNames: document().targetClipNames },
    output: { generationRoot: 'C:/absent/output' }, provenance: { ownership: 'fixture' },
  };
  assert.deepEqual(parseRetargetProfile(JSON.stringify(job)), expected);
  assert.equal(JSON.stringify(expected).includes('C:/private/source.glb'), false);
});

test('explicit replacement preserves untouched clips, order and immutable reference inputs', () => {
  const idle = new THREE.AnimationClip('idle', 1, []);
  const jab = new THREE.AnimationClip('jab', 0.3, []);
  const updated = new THREE.AnimationClip('idle', 2, []);
  const walk = new THREE.AnimationClip('walk', 3, []);
  const target = [idle, jab];
  assert.deepEqual(mergeRetargetClips(target, [walk, updated], ['idle']), [updated, jab, walk]);
  assert.equal(target[0], idle);
  assert.equal(mergeRetargetClips(target, [updated], ['idle'])[1], jab);
  assert.equal(jab.duration, 0.3);
  assert.throws(() => mergeRetargetClips(target, [updated]), /explicit replacement/);
  assert.throws(() => mergeRetargetClips(target, [walk], ['walk']), /target clip walk is missing/);
  assert.throws(() => mergeRetargetClips(target, [walk], ['idle']), /was not generated/);
  assert.throws(() => mergeRetargetClips(target, [updated, updated], ['idle']), /Duplicate/);
  assert.throws(() => mergeRetargetClips(target, [updated], ['idle', 'idle']), /Duplicate/);
});

test('portable profiles retain explicit replacements and reject duplicate names', () => {
  const input = document();
  const profile = parseRetargetProfile(JSON.stringify({...input, retarget:{...input.retarget,replaceClips:['walk']}}));
  assert.deepEqual(profile.retarget.replaceClips, ['walk']);
  assert.deepEqual(parseRetargetProfile(JSON.stringify(profile)), profile);
  assert.throws(() => parseRetargetProfile(JSON.stringify({...input, retarget:{...input.retarget,replaceClips:['walk','walk']}})), /duplicates/);
});


test('portable profile roundtrips exact output/source landmarks and rejects ignored fields',()=>{
 const input=document();input.retarget.clipVisualTiming.walk={durationFrames:40,cycles:1,landmarks:[{outputFrame:0,sourcePhase:0},{outputFrame:12,sourcePhase:0.2},{outputFrame:40,sourcePhase:1}]} as typeof input.retarget.clipVisualTiming.walk;
 const profile=parseRetargetProfile(JSON.stringify(input));
 assert.deepEqual(parseRetargetProfile(JSON.stringify(profile)),profile);
 assert.equal(profile.retarget.clipVisualTiming!.walk.landmarks![1].outputFrame,12);
 const invalid=JSON.parse(JSON.stringify(input));invalid.retarget.clipVisualTiming.walk.landmarks[1].ignored=true;
 assert.throws(()=>parseRetargetProfile(JSON.stringify(invalid)),/unknown/i);
});
