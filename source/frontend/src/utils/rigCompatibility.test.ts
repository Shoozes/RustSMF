import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { compareMappedRigProportions } from './rigCompatibility';
import { buildRigMap } from './rigMapping';

function makeRig(prefix: string, forearmLength: number): THREE.Skeleton {
  const root = new THREE.Bone();
  root.name = `${prefix}Root`;
  const spine = new THREE.Bone();
  spine.name = `${prefix}Spine`;
  spine.position.y = 4;
  const arm = new THREE.Bone();
  arm.name = `${prefix}Arm`;
  arm.position.x = 1;
  const forearm = new THREE.Bone();
  forearm.name = `${prefix}Forearm`;
  forearm.position.x = forearmLength;
  root.add(spine, arm);
  arm.add(forearm);
  root.updateWorldMatrix(true, true);
  return new THREE.Skeleton([root, spine, arm, forearm]);
}

test('rig compatibility reports normalized segment mismatches independently of whole-rig scale', () => {
  const source = makeRig('source', 1);
  const target = makeRig('target', 2);
  const mapping = buildRigMap(source, target, {
    manualMap: {
      sourceRoot: 'targetRoot',
      sourceSpine: 'targetSpine',
      sourceArm: 'targetArm',
      sourceForearm: 'targetForearm',
    },
  });
  const report = compareMappedRigProportions(source, target, mapping);
  const forearm = report.segments.find((segment) => segment.targetChild === 'targetForearm');
  assert.ok(forearm);
  assert.ok(forearm!.normalizedTargetToSourceRatio > 1.5);
  assert.equal(forearm!.warning, true);
  assert.ok(report.warningCount >= 1);
  assert.ok(report.maximumNormalizedRatio! >= forearm!.normalizedTargetToSourceRatio);
});

test('rig compatibility rejects invalid thresholds and insufficient maps', () => {
  const source = makeRig('source', 1);
  const target = makeRig('target', 1);
  const mapping = buildRigMap(source, target, { manualMap: { sourceRoot: 'targetRoot' } });
  assert.throws(() => compareMappedRigProportions(source, target, mapping), /at least two mapped bones/);
  const complete = buildRigMap(source, target, {
    manualMap: {
      sourceRoot: 'targetRoot',
      sourceSpine: 'targetSpine',
    },
  });
  assert.throws(() => compareMappedRigProportions(source, target, complete, 1), /threshold/);
});
