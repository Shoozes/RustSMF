// Basic unit tests for the critical coordinate/DQ math layer.
// Run with: npm --prefix source/frontend run test:unit (or node --test)

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import {
  smfVecToThree,
  smfMatrixToThree,
  dqCreateFromMatrix,
  dqNegate,
  dqNormalize,
  dqFlipSign,
  dqToMatrix,
} from './coord';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// Roundtrip tests for SMF export fidelity (core to conversion).
// Unit: data-driven roundtrip on minimal (no DOM deps).
// + Real sample cycle using reference .smf files (fs in node test env).
// E2E in smoke.spec.ts for visuals + full UI flows.
import { exportSMFToBuffer, importSMF, ImportedSmf } from './smf';
import fs from 'fs';

const SMF_DIR = path.resolve(__dirname, '../../../docs/references/old-src/datafiles/SMF');

describe('smf export roundtrip (data-driven)', () => {
  it('minimal ImportedSmf export -> reimport preserves structure', () => {
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
      animations: [{
        name: 'testAnim',
        duration: 0.5,
        times: [0],
        frames: [[new Float32Array([0,0,0,1,0,0,0,0])]],
        nodeCount: 1,
        loop: 1,
        interpolation: 1,
        sampleFrameMultiplier: 2,
        lockedBones: [0]
      }]
    };

    const buf = exportSMFToBuffer(minimal);
    const reimported = importSMF(buf.buffer);

    assert.strictEqual(reimported.meshes.length, 1);
    assert.strictEqual(reimported.bones.length, 1);
    assert.strictEqual(reimported.animations.length, 1);
    // v12 anim metadata fidelity (Task 3)
    const ra = reimported.animations[0];
    assert.strictEqual(ra.loop, 1);
    assert.strictEqual(ra.interpolation, 1);
    assert.strictEqual(ra.sampleFrameMultiplier, 2);
    assert.deepStrictEqual(ra.lockedBones, [0]);
    // Positions roundtrip (within float eps, ignoring transform noise for minimal)
    const origPos = minimal.meshes[0].positions;
    const rePos = reimported.meshes[0].positions;
    for (let i = 0; i < origPos.length; i++) {
      assert.ok(Math.abs(origPos[i] - rePos[i]) < 1e-5, `pos[${i}] drift too large`);
    }
  });

  it('real sample SMF roundtrip (import -> exportToBuffer -> reimport) preserves counts and data fidelity', () => {
    if (!fs.existsSync(SMF_DIR)) {
      // Skip gracefully in harness without samples
      return;
    }
    const files = fs.readdirSync(SMF_DIR).filter(f => f.endsWith('.smf'));
    if (files.length === 0) return;

    const sampleFile = path.join(SMF_DIR, files[0]);
    const raw = fs.readFileSync(sampleFile);
    // Node Buffer/Uint8Array -> ArrayBuffer safe for the loader (BinaryReader DataView)
    const ab = new Uint8Array(raw).buffer;

    const imported = importSMF(ab);
    const exportedBuf = exportSMFToBuffer(imported);
    const reimported = importSMF(exportedBuf.buffer);

    assert.strictEqual(reimported.meshes.length, imported.meshes.length, 'mesh count drift');
    assert.strictEqual(reimported.bones.length, imported.bones.length, 'bone count drift');
    assert.strictEqual(reimported.animations.length, imported.animations.length, 'anim count drift');

    // Spot check first mesh positions (after full coord export/import cycle should be close)
    if (imported.meshes.length > 0 && reimported.meshes.length > 0) {
      const o = imported.meshes[0].positions;
      const r = reimported.meshes[0].positions;
      const len = Math.min(o.length, r.length, 12); // first few verts
      for (let i = 0; i < len; i++) {
        assert.ok(Math.abs(o[i] - r[i]) < 1e-3, `real sample pos drift at ${i}: ${o[i]} vs ${r[i]}`);
      }
    }
  });
});
