import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coreBakeFixtures, CORE_OPTIONS, CORE_REPORTS } from '../../scripts/retarget-bake-fixtures';
import { portableBakeRequest } from './retargetPortable';
import { samplerFixtures } from '../../scripts/retarget-sampler-fixtures';

test('core bake corpus covers all 19 options and 26 reports with independent motion anchors', () => {
  const corpus = coreBakeFixtures();
  assert.equal(CORE_OPTIONS.length, 19); assert.equal(CORE_REPORTS.length, 26);
  assert.ok(corpus.positives.length >= 25 && corpus.negatives.length >= 32);
  assert.ok(corpus.positives.every(c => c.expected.status === 'baked' && c.expected.clips.every(c => c.clip.tracks.length > 0)));
  const expected = corpus.positives.find(c => c.name === 'known-root-and-rotation')!.expected;
  const changed = structuredClone(expected);
  changed.clips[0].clip.tracks[0].values[6] += .1;
  assert.notDeepEqual(changed, expected, 'changed baked terminal rotation must be observable');
  assert.deepEqual(expected.clips[0].report.rootMotionScale, 2);
});

test('bake request retains owned map decisions, roles, diagnostics and frame corrections', () => {
  const corpus = coreBakeFixtures(), request = corpus.positives.find(c => c.name === 'frame-correction')!.input;
  const before = structuredClone(request);
  const copy = structuredClone(request);
  copy.mappingDetails!.decisions[0].target = 'Changed';
  copy.mappingDetails!.orientationCorrection![1] = 0;
  copy.mappingDetails!.diagnostics.push({level: 'warning', code: 'TEST', message: 'independent'});
  assert.deepEqual(request, before);
  assert.ok(request.mappingDetails!.decisions.length > 0);
  assert.deepEqual(request.mappingDetails!.map, request.mapping);
  assert.equal(request.clips[0].clip.tracks[0].name, 'STravel.position');
});

test('sample-v1 envelopes remain free of bake metadata and binding additions', () => {
  const request = samplerFixtures().positives[0].input;
  assert.equal(request.mappingDetails, undefined);
  assert.ok(request.clips[0].clip.tracks.every(ch => ch.name === undefined));
  assert.equal(typeof portableBakeRequest, 'function');
});
