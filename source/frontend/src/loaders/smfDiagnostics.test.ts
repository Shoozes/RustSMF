import { describe, it } from 'node:test';
import assert from 'node:assert';
import { compareSmfRoundtrip } from './smfDiagnostics';
import type { ImportedSmf } from './smf';

function makeImportedSmf(): ImportedSmf {
  return {
    meshes: [
      {
        name: 'Mesh_0',
        verts: 3,
        triangles: [[0, 1, 2]],
        texIdx: -1,
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
        tangents: new Float32Array(12),
        skinIndices: new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        skinWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
        visible: 1,
      },
    ],
    textures: [],
    bones: [
      {
        index: 0,
        parent: -1,
        isBone: 1,
        dq: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]),
        axis: [0, 1, 0],
      },
    ],
    animations: [
      {
        name: 'Idle',
        duration: 1,
        times: [0, 1],
        frames: [
          [new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]), new Float32Array([0, 0, 0, 1, 0, 0, 0])],
          [new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]), new Float32Array([0, 0, 0, 1, 0, 0, 0])],
        ],
        nodeCount: 1,
        loop: 1,
        interpolation: 1,
        sampleFrameMultiplier: 1,
        lockedBones: [],
      },
    ],
  };
}

describe('smfDiagnostics.compareSmfRoundtrip', () => {
  it('passes for stable reimport-like samples and reports low delta', () => {
    const base = makeImportedSmf();
    const clone: ImportedSmf = {
      ...base,
      meshes: base.meshes.map((mesh) => ({
        ...mesh,
        positions: new Float32Array(mesh.positions),
        normals: new Float32Array(mesh.normals),
        uvs: new Float32Array(mesh.uvs),
        tangents: new Float32Array(mesh.tangents),
        skinIndices: new Uint16Array(mesh.skinIndices),
        skinWeights: new Float32Array(mesh.skinWeights),
      })),
      textures: [...base.textures],
      bones: base.bones.map((bone) => ({ ...bone, dq: new Float32Array(bone.dq), axis: [...bone.axis] })),
      animations: base.animations.map((anim) => ({
        ...anim,
        times: [...anim.times],
        frames: anim.frames.map((frame) => frame.map((dq) => new Float32Array(dq)),
        ),
      })),
    };

    const report = compareSmfRoundtrip(base, clone);
    assert.strictEqual(report.ok, true);
    assert.strictEqual(report.status, 'passed');
    assert.ok(report.checks.some((check) => check.code === 'SMF_ROUNDTRIP_COUNTS_OK'));
    assert.ok(report.checks.some((check) => check.code === 'SMF_ROUNDTRIP_BOUNDS_OK'));
    assert.ok(report.checks.some((check) => check.code === 'SMF_ROUNDTRIP_ANIMATION_POSE_OK'));
    assert.equal(report.vertexPositionMaxDelta, 0);
    assert.equal(report.vertexNormalMaxDelta, 0);
    assert.equal(report.meshBoundsMaxDelta, 0);
    assert.ok(report.bonePoseSamplesChecked > 0);
  });

  it('fails when vertex position/normal data drifts after roundtrip', () => {
    const before = makeImportedSmf();
    const after = {
      ...before,
      meshes: [
        {
          ...before.meshes[0],
          positions: new Float32Array([0.01, 0, 0, 1, 0, 0, 0, 1, 0]),
          normals: new Float32Array([0, 0.2, 1, 0, 0, 1, 0, 0, 1]),
        },
      ],
    };

    const report = compareSmfRoundtrip(before, after);
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.status, 'failed');
    assert.ok(report.vertexPositionMaxDelta > 0);
    assert.ok(report.checks.some((check) => check.code === 'SMF_ROUNDTRIP_POSITION_DELTA'));
    assert.ok(report.checks.some((check) => check.code === 'SMF_ROUNDTRIP_NORMAL_DELTA'));
    assert.ok(report.messages.some((line) => line.includes('positions differ')));
  });

  it('fails when first-frame pose drifts beyond tolerance', () => {
    const before = makeImportedSmf();
    const movedPose = new Float32Array(before.animations[0].frames[0][0]);
    movedPose[0] = 0.01;
    const after = {
      ...before,
      animations: [
        {
          ...before.animations[0],
          frames: [
            [movedPose, new Float32Array(before.animations[0].frames[0][1])],
            [
              new Float32Array(before.animations[0].frames[1][0]),
              new Float32Array(before.animations[0].frames[1][1]),
            ],
          ],
        },
      ],
    };

    const report = compareSmfRoundtrip(before, after);
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.status, 'failed');
    assert.ok(report.bonePoseSamplesChecked > 0);
    assert.ok(report.bonePoseMaxDelta > 0.009);
    assert.ok(report.checks.some((check) => check.code === 'SMF_ROUNDTRIP_FIRST_POSE_DELTA'));
    assert.ok(report.messages.some((line) => line.includes('pose delta exceeds tolerance')));
  });

  it('fails when geometry bounds drift beyond tolerance', () => {
    const before = makeImportedSmf();
    const after = {
      ...before,
      meshes: [
        {
          ...before.meshes[0],
          positions: new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0]),
          normals: new Float32Array(before.meshes[0].normals),
        },
      ],
    };

    const report = compareSmfRoundtrip(before, after);
    assert.strictEqual(report.ok, false);
    assert.strictEqual(report.status, 'failed');
    assert.ok(report.meshBoundsMaxDelta > 0.9);
    assert.ok(report.checks.some((check) => check.code === 'SMF_ROUNDTRIP_BOUNDS_DELTA'));
    assert.ok(report.messages.some((line) => line.includes('bounds differ beyond tolerance')));
    assert.ok(report.messages.some((line) => line.includes('positions differ beyond tolerance')));
  });

  it('serializes structured roundtrip checks for saved cockpit reports', () => {
    const before = makeImportedSmf();
    const movedPose = new Float32Array(before.animations[0].frames[0][0]);
    movedPose[0] = 0.01;
    const after = {
      ...before,
      animations: [
        {
          ...before.animations[0],
          frames: [
            [movedPose, new Float32Array(before.animations[0].frames[0][1])],
            [
              new Float32Array(before.animations[0].frames[1][0]),
              new Float32Array(before.animations[0].frames[1][1]),
            ],
          ],
        },
      ],
    };

    const parsed = JSON.parse(JSON.stringify(compareSmfRoundtrip(before, after))) as {
      status: string;
      checks: Array<{ code: string; level: string; label: string }>;
    };

    assert.strictEqual(parsed.status, 'failed');
    assert.ok(parsed.checks.some((check) => (
      check.code === 'SMF_ROUNDTRIP_FIRST_POSE_DELTA'
      && check.level === 'error'
      && check.label === 'Animation pose'
    )));
  });
});
