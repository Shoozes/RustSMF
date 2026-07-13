import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { createSkinnedGlbFixtureInput } from '../../tests/helpers/skinned-glb-fixture';
import { disposeThreeObject } from '../utils/threeDisposal';
import { exportGLB, loadGLB, validateExportedGLB } from './glb';

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

describe('GLB recovery export validation', () => {
  it('reparses an exported skinned model and preserves its animation structure', async () => {
    const fixture = await createSkinnedGlbFixtureInput();
    const source = await loadGLB(toArrayBuffer(fixture.buffer));
    try {
      const bytes = await exportGLB(source.root, source.clips);
      const summary = await validateExportedGLB(bytes, source.root, source.clips);

      assert.equal(summary.boneCount, 2);
      assert.equal(summary.skinnedMeshCount, 1);
      assert.equal(summary.clipCount, 1);
      assert.deepEqual(summary.clipNames, ['FixtureBend']);
      assert.deepEqual(summary.trackCounts, [2]);
    } finally {
      source.mixer.stopAllAction();
      disposeThreeObject(source.root);
    }
  });

  it('blocks a file that drops an expected animation clip', async () => {
    const fixture = await createSkinnedGlbFixtureInput();
    const source = await loadGLB(toArrayBuffer(fixture.buffer));
    try {
      const bytes = await exportGLB(source.root, []);
      await assert.rejects(
        validateExportedGLB(bytes, source.root, source.clips),
        /clip count changed from 1 to 0/,
      );
    } finally {
      source.mixer.stopAllAction();
      disposeThreeObject(source.root);
    }
  });

  it('blocks non-finite animation data before save', async () => {
    const root = new THREE.Group();
    root.name = 'FiniteGuardRoot';
    const clip = new THREE.AnimationClip('Broken', 1, [
      new THREE.VectorKeyframeTrack('FiniteGuardRoot.position', [0, 1], [0, 0, 0, Number.NaN, 0, 0]),
    ]);

    await assert.rejects(
      validateExportedGLB(new Uint8Array([1]), root, [clip]),
      /non-finite value/,
    );
  });
});
