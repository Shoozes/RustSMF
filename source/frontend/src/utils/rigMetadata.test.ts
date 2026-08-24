import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as THREE from 'three';
import {
  createRigMetadata,
  lockedRigBoneNames,
  normalizeRigMetadata,
  parseRigMetadata,
  serializeRigMetadata,
  updateRigBoneMetadata,
} from './rigMetadata';

describe('rig metadata', () => {
  it('normalizes, updates, serializes, and restores explicit axis/lock/pin fields', () => {
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    bone.name = 'Arm';
    root.add(bone);
    const metadata = createRigMetadata(root, new THREE.Skeleton([bone]));
    const updated = updateRigBoneMetadata(metadata, 'Arm', { primaryAxis: 'x', locked: true, pinned: true });
    assert.deepEqual(updated.bones.Arm, { primaryAxis: 'x', locked: true, pinned: true });
    assert.deepEqual(lockedRigBoneNames(updated), ['Arm']);
    assert.deepEqual(parseRigMetadata(serializeRigMetadata(updated)), updated);
    assert.equal(normalizeRigMetadata({ schemaVersion: 99 }, root, new THREE.Skeleton([bone])).bones.Arm.locked, false);
  });
});
