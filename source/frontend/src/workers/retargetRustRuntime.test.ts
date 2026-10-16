import assert from 'node:assert/strict';
import {test} from 'node:test';
import {advancedFixtures, advancedReference} from '../../scripts/retarget-advanced-fixtures';
import {coreBakeFixtures} from '../../scripts/retarget-bake-fixtures';
import {productionInput} from '../../scripts/retarget-production-fixtures';
import {restoreRustBake, rustBakeRequest} from './retargetRustRuntime';

test('production adapters preserve all advanced fixture reports, clip values, references and ownership', () => {
  for (const fixture of advancedFixtures().positives) {
    const input = productionInput(fixture.input), before = structuredClone(input);
    assert.deepEqual(rustBakeRequest(input), fixture.input, fixture.name);
    const output = restoreRustBake(fixture.expected, fixture.input);
    assert.deepEqual(input, before); assert.deepEqual(output.reports, fixture.expected.clips.map(c => c.report));
    output.clips.forEach((clip, i) => clip.tracks.forEach((track, j) => {
      assert.deepEqual(track.times, new Float32Array(fixture.expected.clips[i].clip.tracks[j].times));
      assert.deepEqual(track.values, new Float32Array(fixture.expected.clips[i].clip.tracks[j].values));
    }));
    output.reports[0].mappedBones.length = 0;
    assert.ok(fixture.expected.clips[0].report.mappedBones.length > 0);
  }
  for (const fixture of coreBakeFixtures().positives) {
    const input = productionInput(fixture.input);
    assert.deepEqual(rustBakeRequest(input), fixture.input, fixture.name);
  }
});

test('production boundary rejects malformed versions, partial batches, tracks and reports atomically', () => {
  const f = advancedFixtures().positives.find(c => c.name === 'range-flags')!;
  const mutations: Array<(value: Record<string, unknown>) => void> = [
    r => {r.apiVersion = 2;}, r => {r.capabilities = ['core-bake-v1'];}, r => {r.clips = [];},
    r => {r.status = 'error';}, r => {r.stage = 'core-bake';},
  ];
  for (const change of mutations) {const bad = structuredClone(f.expected); change(bad); assert.throws(() => restoreRustBake(bad, f.input), /invalid/);}
  for (const key of ['duration', 'sampleCount', 'poseRanges', 'mappedBones', 'naturalMotion', 'poseRecovery']) {
    const bad = structuredClone(f.expected); delete (bad.clips[0].report as Record<string, unknown>)[key];
    assert.throws(() => restoreRustBake(bad, f.input), /invalid/, key);
  }
  for (const mutate of [(t: {values:number[]}) => {t.values[0] = Infinity;}, (t: {values:number[]}) => {t.values.pop();}]) {
    const bad = structuredClone(f.expected); mutate(bad.clips[0].clip.tracks[0]); assert.throws(() => restoreRustBake(bad, f.input), /invalid/);
  }
  const bad = structuredClone(f.expected); bad.clips[0].clip.tracks[0].times[1] = 0;
  assert.throws(() => restoreRustBake(bad, f.input), /invalid/);
  assert.throws(() => restoreRustBake({apiVersion:1,stage:'advanced-bake',capabilities:['core-bake-v1','advanced-bake-v1'],status:'error',clips:[],
    error:{code:'BAKE_INPUT_INVALID',path:'options',message:'Unsupported options'}}, f.input), /Unsupported options.*BAKE_INPUT_INVALID/);
});

test('valid bone-name keys in correction reports remain owned data without prototype mutation', () => {
  const f = advancedFixtures().positives.find(c => c.name === 'local-correction')!;
  for (const name of ['constructor', 'prototype', '__proto__']) {
    const input = productionInput(f.input);
    input.target.nodes.find(n => n.name === 'hand')!.name = name;
    input.mapping.map.hand = name;
    input.mapping.decisions.find(d => d.target === 'hand')!.target = name;
    input.clips[0].options.localReferenceCorrections = {[name]: input.clips[0].options.localReferenceCorrections!.hand};
    const request = rustBakeRequest(input), result = advancedReference(input);
    const restored = restoreRustBake(result, request).reports[0].localReferenceCorrections!;
    assert.deepEqual(restored, result.clips[0].report.localReferenceCorrections);
    assert.equal(Object.prototype.hasOwnProperty.call(restored, name), true);
    assert.equal(Object.getPrototypeOf(restored), Object.prototype);
    assert.notEqual(restored, result.clips[0].report.localReferenceCorrections);
  }
});
