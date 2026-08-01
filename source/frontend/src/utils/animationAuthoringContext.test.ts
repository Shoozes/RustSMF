import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  resolveAnimationEditContext,
  resolveAnimationMetadataContext,
} from './animationAuthoringContext';

function makeFixture() {
  const root = new THREE.Bone();
  root.name = 'Root';
  const child = new THREE.Bone();
  child.name = 'Child';
  root.add(child);
  return {
    skeleton: new THREE.Skeleton([root, child]),
    clips: [new THREE.AnimationClip('Walk', 1, [])],
  };
}

test('animation authoring context resolves the selected bone and active clip', () => {
  const fixture = makeFixture();
  const result = resolveAnimationEditContext({
    ...fixture,
    currentClipName: 'Walk',
    selectedBoneName: 'Child',
  });

  assert.equal(result.failure, undefined);
  assert.equal(result.context?.clipName, 'Walk');
  assert.equal(result.context?.boneName, 'Child');
  assert.equal(result.context?.bone.name, 'Child');
});

test('animation authoring context reports guarded selection failures', () => {
  const fixture = makeFixture();
  const cases = [
    [{ ...fixture, currentClipName: 'Walk', selectedBoneName: 'Scene' }, 'missing-bone-selection'],
    [{ ...fixture, currentClipName: 'Walk', selectedBoneName: 'Missing' }, 'invalid-bone-selection'],
    [{ skeleton: fixture.skeleton, clips: [], currentClipName: 'Walk', selectedBoneName: 'Child' }, 'missing-animated-model'],
  ] as const;

  for (const [input, failure] of cases) {
    const result = resolveAnimationEditContext(input);
    assert.equal(result.context, null);
    assert.equal(result.failure, failure);
  }
});

test('animation metadata context keeps clip fallback resolution pure', () => {
  const fixture = makeFixture();
  const fallback = { loop: false, sampleFrameMultiplier: 3 };
  const result = resolveAnimationMetadataContext({
    clips: fixture.clips,
    currentClipName: 'Missing',
    getFallback: () => fallback,
  });

  assert.deepEqual(result.context, { clipName: 'Walk', fallback });
  assert.equal(result.failure, undefined);
});
