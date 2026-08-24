import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  createRigIkSession,
  isRigIkPoleAxis,
  isRigIkSessionCurrent,
  normalizeRigIkSettings,
  rigIkLocalLengthsUnchanged,
  solveRigIk,
} from './rigIk';

function makeChain(): { skeleton: THREE.Skeleton; root: THREE.Bone; middle: THREE.Bone; end: THREE.Bone } {
  const root = new THREE.Bone();
  root.name = 'root';
  const middle = new THREE.Bone();
  middle.name = 'middle';
  middle.position.set(1, 0, 0);
  const end = new THREE.Bone();
  end.name = 'end';
  end.position.set(1, 0, 0);
  root.add(middle);
  middle.add(end);
  root.updateMatrixWorld(true);
  return { skeleton: new THREE.Skeleton([root, middle, end]), root, middle, end };
}

describe('rigIk', () => {
  it('rejects unsupported pole-axis values at UI and persisted-state boundaries', () => {
    assert.equal(isRigIkPoleAxis('-y'), true);
    assert.equal(isRigIkPoleAxis('forward'), false);
    assert.equal(isRigIkPoleAxis(null), false);
  });

  it('normalizes settings onto supported bounded options', () => {
    assert.deepEqual(normalizeRigIkSettings({
      chainLength: 99,
      maxIterations: 20,
      tolerance: Number.NaN,
      maxJointAngleDegrees: 100,
      poleAxis: 'bad' as 'x',
    }), {
      chainLength: 6,
      maxIterations: 16,
      tolerance: 0.01,
      maxJointAngleDegrees: 90,
      poleAxis: 'z',
    });
  });

  it('reaches a bounded target using rotations without changing local bone lengths', () => {
    const { skeleton, end } = makeChain();
    const created = createRigIkSession(skeleton, end.name, 2);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.notEqual(created.session.chain[0], created.session.solverChain[0]);
    assert.equal(created.session.solverChain[1].parent, created.session.solverChain[0]);

    const result = solveRigIk(skeleton, created.session, new THREE.Vector3(1, 1, 0), {
      poleAxis: 'z',
      maxJointAngleDegrees: 180,
      tolerance: 0.001,
      maxIterations: 64,
    });

    assert.equal(result.status, 'reached');
    assert.ok(result.distanceToTarget <= 0.001);
    assert.ok(result.changedBoneNames.length > 0);
    assert.equal(rigIkLocalLengthsUnchanged(created.session), true);
    assert.ok(end.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(1, 1, 0)) <= 0.001);
  });

  it('reports unreachable targets and extends only to the original maximum reach', () => {
    const { skeleton, end } = makeChain();
    const created = createRigIkSession(skeleton, end.name, 2);
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const result = solveRigIk(skeleton, created.session, new THREE.Vector3(20, 10, 0), {
      poleAxis: 'none',
      maxJointAngleDegrees: 180,
    });
    const rootPosition = created.session.chain[0].getWorldPosition(new THREE.Vector3());
    const endPosition = end.getWorldPosition(new THREE.Vector3());

    assert.equal(result.status, 'unreachable');
    assert.ok(Math.abs(rootPosition.distanceTo(endPosition) - result.maxReach) <= 0.01);
    assert.equal(rigIkLocalLengthsUnchanged(created.session), true);
  });

  it('applies pole and joint-angle constraints from the drag-start pose', () => {
    const { skeleton, root, end } = makeChain();
    const created = createRigIkSession(skeleton, end.name, 2);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const reference = root.quaternion.clone();

    const result = solveRigIk(skeleton, created.session, new THREE.Vector3(-1, 1, 0.5), {
      poleAxis: 'z',
      maxJointAngleDegrees: 30,
      maxIterations: 64,
      tolerance: 0.001,
    });

    assert.equal(result.status, 'constrained');
    assert.equal(result.jointLimitApplied, true);
    assert.equal(result.poleApplied, true);
    assert.ok(THREE.MathUtils.radToDeg(reference.angleTo(root.quaternion)) <= 30.001);
    assert.equal(rigIkLocalLengthsUnchanged(created.session), true);
  });

  it('keeps locked and pinned chain joints unchanged while solving', () => {
    const { skeleton, root, middle, end } = makeChain();
    const created = createRigIkSession(skeleton, end.name, 2);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const rootBefore = root.quaternion.clone();
    const result = solveRigIk(skeleton, created.session, new THREE.Vector3(0.5, 1, 0), {
      poleAxis: 'z',
      maxJointAngleDegrees: 180,
      maxIterations: 64,
      tolerance: 0.001,
      lockedBoneNames: [root.name],
      pinnedBoneNames: [middle.name],
    });

    assert.notEqual(result.status, 'stale-chain');
    assert.ok(rootBefore.angleTo(root.quaternion) <= 1e-7);
    assert.ok(result.changedBoneNames.every((name) => name !== root.name && name !== middle.name));
  });

  it('rejects stale chains after hierarchy changes', () => {
    const { skeleton, root, middle, end } = makeChain();
    const created = createRigIkSession(skeleton, end.name, 2);
    assert.equal(created.ok, true);
    if (!created.ok) return;

    root.attach(end);
    root.updateMatrixWorld(true);
    assert.equal(isRigIkSessionCurrent(skeleton, created.session), false);
    const result = solveRigIk(skeleton, created.session, new THREE.Vector3(1, 1, 0));
    assert.equal(result.status, 'stale-chain');
    middle.updateMatrixWorld(true);
  });

  it('rejects non-finite targets and chains with too few ancestors', () => {
    const { skeleton, end } = makeChain();
    const tooLong = createRigIkSession(skeleton, end.name, 3);
    assert.deepEqual(tooLong.ok ? null : tooLong.reason, 'insufficient-chain');

    const created = createRigIkSession(skeleton, end.name, 2);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const invalid = solveRigIk(skeleton, created.session, new THREE.Vector3(Number.NaN, 0, 0));
    assert.equal(invalid.status, 'invalid-target');
  });
});
