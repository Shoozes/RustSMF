// Unit tests for threeToSmf.ts - Three.js scene to ImportedSmf conversion.
// Run manually with: tsx --test src/loaders/threeToSmf.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { buildImportedSmfFromThree, SmfConversionError } from './threeToSmf';

describe('threeToSmf - buildImportedSmfFromThree', () => {
  it('throws SmfConversionError for source without skeleton bones', () => {
    const emptySkeleton = new THREE.Skeleton([], []);
    assert.throws(
      () => buildImportedSmfFromThree({ skeleton: emptySkeleton }),
      (err: Error) => {
        assert.ok(err instanceof SmfConversionError, 'should be SmfConversionError');
        assert.ok(err.message.includes('skinned skeleton'), `unexpected message: ${err.message}`);
        return true;
      }
    );
  });

  it('throws SmfConversionError when a clip has scale tracks', () => {
    const bone = new THREE.Bone();
    bone.name = 'Bone_0';
    const skeleton = new THREE.Skeleton([bone]);
    const scaleTrack = new THREE.VectorKeyframeTrack('Bone_0.scale', [0, 1], [1, 1, 1, 2, 2, 2]);
    const clip = new THREE.AnimationClip('TestClip', 1, [scaleTrack]);
    assert.throws(
      () => buildImportedSmfFromThree({ skeleton, clips: [clip] }),
      (err: Error) => {
        assert.ok(err instanceof SmfConversionError, 'should be SmfConversionError');
        assert.ok(err.message.includes('scale track'), `unexpected message: ${err.message}`);
        return true;
      }
    );
  });

  it('converts a minimal single-bone skeleton to ImportedSmf shape', () => {
    const bone = new THREE.Bone();
    bone.name = 'Bone_0';
    const skeleton = new THREE.Skeleton([bone]);
    const result = buildImportedSmfFromThree({ skeleton });

    assert.strictEqual(result.bones.length, 1, 'one bone');
    assert.strictEqual(result.bones[0].index, 0);
    assert.strictEqual(result.bones[0].isBone, 1);
    assert.strictEqual(result.bones[0].dq.length, 8, 'DQ is 8 floats');
    assert.strictEqual(result.meshes.length, 0, 'no mesh when no skinnedMeshes');
    assert.strictEqual(result.animations.length, 0, 'no animations when no clips');
    assert.strictEqual(result.textures.length, 0);
  });

  it('preserves parent-child bone hierarchy', () => {
    const parent = new THREE.Bone();
    parent.name = 'Bone_0';
    const child = new THREE.Bone();
    child.name = 'Bone_1';
    parent.add(child);
    const skeleton = new THREE.Skeleton([parent, child]);
    const result = buildImportedSmfFromThree({ skeleton });

    assert.strictEqual(result.bones.length, 2);
    assert.strictEqual(result.bones[0].parent, -1, 'root has no parent');
    assert.strictEqual(result.bones[1].parent, 0, 'child parent is index 0');
  });

  it('produces an animation with correct frame count from clip tracks', () => {
    const bone = new THREE.Bone();
    bone.name = 'Bone_0';
    const skeleton = new THREE.Skeleton([bone]);

    const quatTrack = new THREE.QuaternionKeyframeTrack(
      'Bone_0.quaternion',
      [0, 0.5, 1.0],
      [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]
    );
    const clip = new THREE.AnimationClip('Walk', 1.0, [quatTrack]);
    const result = buildImportedSmfFromThree({ skeleton, clips: [clip] });

    assert.strictEqual(result.animations.length, 1);
    assert.strictEqual(result.animations[0].name, 'Walk');
    assert.strictEqual(result.animations[0].duration, 1.0);
    assert.strictEqual(result.animations[0].frames.length, 3, '3 keyframe times');
    assert.strictEqual(result.animations[0].frames[0].length, 1, 'one DQ per frame per bone');
    assert.strictEqual(result.animations[0].frames[0][0].length, 8, 'DQ is 8 floats');
  });
});
