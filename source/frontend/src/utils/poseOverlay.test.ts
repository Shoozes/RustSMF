import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import { captureAnimationPose } from './animationCreation';
import { createPoseOverlaySegments } from './poseOverlay';

describe('pose overlays', () => {
  it('builds rest skeleton and current-to-rest trail segments without mutating the pose', () => {
    const root = new THREE.Bone();
    root.name = 'root';
    const child = new THREE.Bone();
    child.name = 'child';
    child.position.x = 1;
    root.add(child);
    const skeleton = new THREE.Skeleton([root, child]);
    root.updateMatrixWorld(true);
    const snapshot = captureAnimationPose(skeleton);
    root.rotation.z = Math.PI / 2;
    root.updateMatrixWorld(true);
    const before = child.quaternion.clone();
    const segments = createPoseOverlaySegments(skeleton, snapshot);
    assert.equal(segments.rest.length, 6);
    assert.equal(segments.trails.length, 6);
    assert.ok(before.angleTo(child.quaternion) <= 1e-8);
  });
});
