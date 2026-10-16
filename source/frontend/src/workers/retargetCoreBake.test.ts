import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coreBakeFixtures, CORE_OPTIONS, CORE_REPORTS } from '../../scripts/retarget-bake-fixtures';
import { portableBakeRequest } from './retargetPortable';
import { samplerFixtures } from '../../scripts/retarget-sampler-fixtures';
import * as THREE from 'three';
import { snapshotSkeleton, snapshotClip } from './retargetSnapshot';
import { buildRigMap } from '../utils/rigMapping';
import type { BakeInput } from './retargetProtocol';

test('core bake corpus covers all 19 options and 26 reports with independent motion anchors', () => {
  const corpus = coreBakeFixtures();
  assert.equal(CORE_OPTIONS.length, 19); assert.equal(CORE_REPORTS.length, 26);
  assert.ok(corpus.positives.length >= 25 && corpus.negatives.length >= 32);
  assert.ok(corpus.positives.every(c => c.expected.status === 'baked' && c.expected.clips.every(c => c.clip.tracks.length > 0)));
  const expected = corpus.positives.find(c => c.name === 'known-root-and-rotation')!.expected;
  assert.deepEqual(expected.clips[0].clip.tracks.find(ch => ch.property === 'position')!.values, [0, 2, 0, 2, 2, 0]);
  const rotation = expected.clips[0].clip.tracks.find(ch => ch.property === 'quaternion')!.values;
  assert.ok(Math.abs(rotation[6] - Math.SQRT1_2) < 1e-6 && Math.abs(rotation[7] - Math.SQRT1_2) < 1e-6);
  assert.deepEqual(expected.clips[0].report.rootMotionScale, 2);
});

test('bake request retains owned map decisions, roles, diagnostics and frame corrections', () => {
  const bone = new THREE.Bone(); bone.name = 'Root'; bone.updateMatrixWorld(true);
  const rig = new THREE.Skeleton([bone]);
  try {
    const mapping = buildRigMap(rig, rig, {manualMap: {Root: 'Root'}});
    mapping.decisions[0].canonical = 'hips';
    mapping.diagnostics = [{level: 'warning', code: 'REVIEW', message: 'Review this mapping.', sourceBone: 'Root'}];
    mapping.upCorrection = [0, 0, 1, 0];
    mapping.orientationCorrection = [0, 1, 0, 0];
    mapping.sourceUp = [0, 1, 0]; mapping.targetLateral = [1, 0, 0];
    const clip = new THREE.AnimationClip('Owned', 1, [new THREE.VectorKeyframeTrack('Root.position', [0, 1], [0, 0, 0, 1, 0, 0])]);
    const input: BakeInput = {source: snapshotSkeleton(rig, 'current'), target: snapshotSkeleton(rig, 'current'), mapping,
      clips: [{clip: snapshotClip(clip), options: {preserveTargetRotations: ['Root']}}]};
    const before = structuredClone(input);
    const request = portableBakeRequest(input, [0, .5, 1], 'bake');
    assert.deepEqual(input, before);
    assert.deepEqual(request.mappingDetails, input.mapping);
    assert.deepEqual(request.mappingDetails!.map, request.mapping);
    assert.equal(request.clips[0].clip.tracks[0].name, 'Root.position');
    assert.equal(request.clips[0].clip.tracks[0].boneChannel, true);
    const captured = structuredClone(request);
    input.mapping.map.Root = 'SourceEdit';
    input.mapping.decisions[0].canonical = 'SourceEdit';
    input.mapping.diagnostics[0].message = 'SourceEdit';
    input.mapping.upCorrection![0] = 1;
    input.mapping.orientationCorrection![1] = 0;
    input.mapping.sourceUp![1] = 0;
    input.mapping.targetLateral![0] = 0;
    input.clips[0].options.preserveTargetRotations![0] = 'SourceEdit';
    assert.deepEqual(request, captured, 'later authoring edits cannot alter the captured request');
    const edited = structuredClone(input);
    request.mapping.Root = 'RequestEdit';
    request.mappingDetails!.map.Root = 'DetailsEdit';
    request.mappingDetails!.decisions[0].target = 'RequestEdit';
    request.mappingDetails!.diagnostics[0].message = 'RequestEdit';
    request.mappingDetails!.upCorrection![0] = 2;
    request.mappingDetails!.orientationCorrection![1] = 2;
    request.mappingDetails!.sourceUp![1] = 2;
    request.mappingDetails!.targetLateral![0] = 2;
    assert.deepEqual(input, edited, 'request mutation cannot reach canonical authoring data');
    assert.equal(request.mapping.Root, 'RequestEdit', 'explicit map and mapping metadata own separate copies');
  } finally { rig.dispose(); }
});

test('sample-v1 envelopes remain free of bake metadata and binding additions', () => {
  const request = samplerFixtures().positives[0].input;
  assert.equal(request.mappingDetails, undefined);
  assert.ok(request.clips[0].clip.tracks.every(ch => ch.name === undefined));
  assert.ok(request.clips[0].clip.tracks.every(ch => ch.boneChannel === undefined));
});
