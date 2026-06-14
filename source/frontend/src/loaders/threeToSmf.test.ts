// Unit tests for threeToSmf.ts - Three.js scene to ImportedSmf conversion.
// Run manually with: tsx --test src/loaders/threeToSmf.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { buildImportedSmfFromThree, SmfConversionError } from './threeToSmf';
import { exportSMFToBuffer, importSMF, ImportedSmf } from './smf';
import { dqToLocalTransform } from './coord';

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

  it('roundtrips through SMF export/import and captures live bone pose edits (for non-SMF Export SMF path)', () => {
    const bone = new THREE.Bone();
    bone.name = 'Bone_0';
    bone.position.set(0.1, 0.2, 0.3); // simulate live gizmo/pose edit
    const skeleton = new THREE.Skeleton([bone]);

    const converted = buildImportedSmfFromThree({ skeleton });
    assert.strictEqual(converted.bones.length, 1);

    const buf = exportSMFToBuffer(converted);
    const reimported: ImportedSmf = importSMF(toArrayBuffer(buf)); // reuse helper if present, or direct

    // Basic fidelity
    assert.strictEqual(reimported.bones.length, 1);
    const endTransform = dqToLocalTransform(reimported.bones[0].dq);
    // The pose mutation should be reflected (within coord transform tolerance)
    assert.ok(Math.abs(endTransform.pos.x - 0.1) < 1e-4 || Math.abs(endTransform.pos.y - 0.2) < 1e-4, 'live bone pose edit captured in SMF roundtrip');

    // The reimported should have captured the edited transform in its DQ (via coord).
    const reEnd = dqToLocalTransform(reimported.bones[0].dq);
    assert.ok(Math.abs(reEnd.pos.x) > 0.05 || Math.abs(reEnd.pos.y) > 0.05, 'edited pose visible after SMF roundtrip from threeToSmf result');
  });
});

// Local helper (mirrors coord.test.ts for buffer)
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

