import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { parseRetargetProfile, profileClipOptions, RETARGET_PROFILE_SCHEMA } from './retargetProfile';

const document = () => ({ $schema: RETARGET_PROFILE_SCHEMA, targetClipNames: { Idle: 'wolf_source_idle' }, retarget: {
  manualMap: { 'joint-12': 'mixamorigHead' },
  clips: ['walk'], sourceReferencePose: 'clip', sourceReferenceClip: 'idle', targetReferenceClip: 'Idle',
  directionTransfer: 'relative', clipDirectionTransfer: { walk: 'absolute' },
  directionTransferBones: ['mixamorigHead'], clipPreserveTargetRotations: { walk: ['mixamorigLeftHand'] },
  sampleRateHz: 60, interpolation: 'step', nextDownRationalTimes: true,
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
  assert.deepEqual(options.preserveTargetRotations, ['mixamorigLeftHand']);
  assert.deepEqual(profile.retarget.manualMap, { 'joint-12': 'mixamorigHead' });
  assert.throws(() => profileClipOptions(profile, walk, [walk], [target]), /missing reference clip idle/);
  assert.throws(() => profileClipOptions(profile, walk, [idle, walk], []), /missing reference clip wolf_source_idle/);
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
