// Basic unit tests for the critical coordinate/DQ math layer.
// Run with: npm --prefix source/frontend run test:unit (or node --test)

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  smfVecToThree,
  smfMatrixToThree,
  dqCreateFromMatrix,
  dqNegate,
  dqNormalize,
  dqFlipSign,
  dqToMatrix,
} from './coord';

describe('coord.ts - SMF <-> Three coordinate and dual-quat math', () => {
  it('vec swizzle (to three) is stable', () => {
    const v = smfVecToThree([1, 2, 3]);
    assert.strictEqual(v.x, 1);
    assert.strictEqual(v.y, 3);
    assert.strictEqual(v.z, -2);
  });

  it('matrix transform normalizes and swaps (smoke)', () => {
    const m = new Float32Array(16).fill(0);
    // identity-ish with scale
    m[0] = 2; m[5] = 2; m[10] = 2; m[15] = 1;
    const out = smfMatrixToThree(m);
    // after norm + swap the diagonal should be sensible
    assert.ok(Math.abs(out[0]) > 0.9);
  });

  it('dq roundtrip basic (create -> toMatrix -> create) produces similar rotation part', () => {
    const mat = new Float32Array(16);
    // simple rotation around Y
    mat[0] = 0.707; mat[2] = 0.707;
    mat[5] = 1;
    mat[8] = -0.707; mat[10] = 0.707;
    mat[15] = 1;

    const dq1 = dqCreateFromMatrix(mat);
    const m2 = dqToMatrix(dq1);
    const dq2 = dqCreateFromMatrix(m2);

    // quaternions should be close (within float error)
    const dot = dq1[0]*dq2[0] + dq1[1]*dq2[1] + dq1[2]*dq2[2] + dq1[3]*dq2[3];
    assert.ok(Math.abs(dot) > 0.99, `quaternion dot too low: ${dot}`);
  });

  it('flip_sign prevents pops (continuity)', () => {
    const dqA = new Float32Array([0.1, 0.2, 0.3, 0.9, 0,0,0,0]);
    const dqB = dqNegate(dqA); // opposite sign version
    const fixed = dqFlipSign(dqB, dqA);
    const dot = fixed[0]*dqA[0] + fixed[1]*dqA[1] + fixed[2]*dqA[2] + fixed[3]*dqA[3];
    assert.ok(dot >= 0, 'flip_sign should make consecutive DQs same hemisphere');
  });

  it('normalize is idempotent on unit DQ', () => {
    const dq = new Float32Array([0.1, 0.2, 0.3, 0.9, 0.01, 0.02, 0.03, 0.04]);
    dqNormalize(dq);
    const len = Math.hypot(dq[0],dq[1],dq[2],dq[3]);
    assert.ok(Math.abs(len - 1) < 1e-6);
  });
});

// Smoke for SMF export (prep for full roundtrip tests in next backlog item)
import { exportSMF, ImportedSmf } from './smf';

describe('smf export smoke (data-driven)', () => {
  it('exportSMF on minimal ImportedSmf produces a blob URL without crashing', () => {
    const minimal: ImportedSmf = {
      meshes: [{
        name: 'test',
        verts: 3,
        triangles: [[0,1,2]],
        texIdx: -1,
        positions: new Float32Array([0,0,0, 1,0,0, 0,1,0]),
        normals: new Float32Array([0,0,1, 0,0,1, 0,0,1]),
        uvs: new Float32Array([0,0, 0,0, 0,0]),
        tangents: new Float32Array([0,0,0,0, 0,0,0,0, 0,0,0,0]),
        skinIndices: new Uint16Array([0,0,0,0, 0,0,0,0, 0,0,0,0]),
        skinWeights: new Float32Array([1,0,0,0, 1,0,0,0, 1,0,0,0]),
        visible: 1
      }],
      textures: [],
      bones: [{ index: 0, parent: -1, isBone: 1, dq: new Float32Array([0,0,0,1,0,0,0,0]), axis: [0,1,0] }],
      animations: []
    };

    const url = exportSMF(minimal);
    assert.ok(typeof url === 'string' && url.startsWith('blob:'), 'should return blob URL');
    URL.revokeObjectURL(url);
  });
});
