import { test, expect } from '@playwright/test';
import { createSkinnedGlbFixtureInput } from './helpers/skinned-glb-fixture';
import { expectAssetContinuity, expectMotion, expectNumbersClose, readAssetEvidence, sampleTrack } from './helpers/asset-evidence';

test('independent evidence decodes known indexed geometry, raw skin tuples, and moving poses', async () => {
  const fixture = await createSkinnedGlbFixtureInput();
  const asset = readAssetEvidence(fixture.buffer);
  expect(asset.joints).toEqual(['FixtureRoot', 'FixtureTip']);
  expect(asset.hierarchy).toEqual([{ name: 'FixtureRoot', parent: null }, { name: 'FixtureTip', parent: 'FixtureRoot' }]);
  expect(asset.primitives[0].indices).toEqual([0, 1, 2, 0, 2, 3]);
  expect(asset.primitives[0].attributes.WEIGHTS_0).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  expect(asset.primitives[0].attributes.JOINTS_0).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  expectMotion(asset.clips[0]);
  const root = asset.clips[0].tracks.find(t => t.bone === 'FixtureRoot')!;
  expectNumbersClose(sampleTrack(root, 0.25), [0.025, 0, 0]);
  expectAssetContinuity(readAssetEvidence(fixture.buffer), asset);
});

test('independent evidence rejects changed weights, hierarchy, motion, and malformed containers', async () => {
  const fixture = await createSkinnedGlbFixtureInput();
  const expected = readAssetEvidence(fixture.buffer);
  for (const mutate of [
    (a: typeof expected) => { a.primitives[0].attributes.WEIGHTS_0[0] = 0.25; },
    (a: typeof expected) => { a.hierarchy[1].parent = null; },
    (a: typeof expected) => { a.clips[0].tracks[0].values.fill(0); },
  ]) {
    const changed = structuredClone(expected);
    mutate(changed);
    expect(() => expectAssetContinuity(changed, expected)).toThrow();
  }
  const truncated = fixture.buffer.subarray(0, fixture.buffer.length - 4);
  expect(() => readAssetEvidence(truncated)).toThrow();
});
