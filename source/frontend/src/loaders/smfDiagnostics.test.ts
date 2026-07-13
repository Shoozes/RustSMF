import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareSmfRoundtrip } from './smfDiagnostics';
import { exportSMFToBuffer, importSMF, type ImportedSmf } from './smf';
import { bytesToArrayBuffer } from './smfBinary';
import { installImageTestPolyfill } from '../test/installImageTestPolyfill';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    assert.equal(report.skinIndexMismatchCount, 0);
    assert.equal(report.skinWeightMaxDelta, 0);
    assert.equal(report.meshBoundsMaxDelta, 0);
    assert.ok(report.bonePoseSamplesChecked > 0);
    assert.deepStrictEqual(report.poseDeltaDetails, []);
  });

  it('fails when skin indices or weights drift after roundtrip', () => {
    const before = makeImportedSmf();
    const skinIndices = new Uint16Array(before.meshes[0].skinIndices);
    const skinWeights = new Float32Array(before.meshes[0].skinWeights);
    skinIndices[0] = 1;
    skinWeights[0] = 0.5;
    const after = {
      ...before,
      meshes: [{ ...before.meshes[0], skinIndices, skinWeights }],
    };

    const report = compareSmfRoundtrip(before, after);
    assert.equal(report.ok, false);
    assert.equal(report.skinIndexMismatchCount, 1);
    assert.ok(report.skinWeightMaxDelta >= 0.5);
    assert.ok(report.checks.some((check) => check.code === 'SMF_ROUNDTRIP_SKIN_INDEX_DELTA'));
    assert.ok(report.checks.some((check) => check.code === 'SMF_ROUNDTRIP_SKIN_WEIGHT_DELTA'));
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
    assert.equal(report.poseDeltaDetails.length, 1);
    const detail = report.poseDeltaDetails[0];
    assert.equal(detail.animationIndex, 0);
    assert.equal(detail.animationName, 'Idle');
    assert.equal(detail.frameIndex, 0);
    assert.equal(detail.frameLabel, 'first');
    assert.equal(detail.boneIndex, 0);
    assert.equal(detail.beforeParent, -1);
    assert.equal(detail.afterParent, -1);
    assert.equal(detail.beforeIsBone, 1);
    assert.equal(detail.afterIsBone, 1);
    assert.equal(detail.maxComponentDelta, report.bonePoseMaxDelta);
    assert.equal(detail.componentDeltas.length, 8);
    assert.ok(Math.abs(detail.componentDeltas[0] - 0.01) < 1e-6);
    assert.ok(detail.componentDeltas.slice(1).every((delta) => delta === 0));
  });

  it('treats negated dual quaternions as the same pose', () => {
    const before = makeImportedSmf();
    const after = {
      ...before,
      animations: [
        {
          ...before.animations[0],
          frames: before.animations[0].frames.map((frame) => (
            frame.map((dq) => new Float32Array(Array.from(dq, (value) => -value)))
          )),
        },
      ],
    };

    const report = compareSmfRoundtrip(before, after);

    assert.strictEqual(report.ok, true);
    assert.strictEqual(report.bonePoseMaxDelta, 0);
    assert.deepStrictEqual(report.poseDeltaDetails, []);
  });

  it('keeps only the top 20 pose delta detail rows', () => {
    const before = makeImportedSmf();
    const boneCount = 25;
    const bones = Array.from({ length: boneCount }, (_, index) => ({
      index,
      parent: index === 0 ? -1 : index - 1,
      isBone: 1,
      dq: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]),
      axis: [0, 1, 0] as [number, number, number],
    }));
    const beforeFrames = [
      Array.from({ length: boneCount }, () => new Float32Array([0, 0, 0, 1, 0, 0, 0, 0])),
    ];
    const afterFrames = [
      Array.from({ length: boneCount }, (_, index) => (
        new Float32Array([(index + 1) / 1000, 0, 0, 1, 0, 0, 0, 0])
      )),
    ];
    const expandedBefore: ImportedSmf = {
      ...before,
      bones,
      animations: [
        {
          ...before.animations[0],
          times: [0],
          frames: beforeFrames,
          nodeCount: boneCount,
        },
      ],
    };
    const expandedAfter: ImportedSmf = {
      ...expandedBefore,
      animations: [
        {
          ...expandedBefore.animations[0],
          frames: afterFrames,
        },
      ],
    };

    const report = compareSmfRoundtrip(expandedBefore, expandedAfter);
    assert.equal(report.poseDeltaDetails.length, 20);
    assert.equal(report.poseDeltaDetails[0].boneIndex, 24);
    assert.equal(report.poseDeltaDetails[19].boneIndex, 5);
    assert.ok(report.poseDeltaDetails.every((detail, index, list) => (
      index === 0 || list[index - 1].maxComponentDelta >= detail.maxComponentDelta
    )));
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
      poseDeltaDetails: Array<{ animationName: string; frameLabel: string; boneIndex: number; componentDeltas: number[] }>;
    };

    assert.strictEqual(parsed.status, 'failed');
    assert.ok(parsed.checks.some((check) => (
      check.code === 'SMF_ROUNDTRIP_FIRST_POSE_DELTA'
      && check.level === 'error'
      && check.label === 'Animation pose'
    )));
    assert.equal(parsed.poseDeltaDetails[0].animationName, 'Idle');
    assert.equal(parsed.poseDeltaDetails[0].frameLabel, 'first');
    assert.equal(parsed.poseDeltaDetails[0].boneIndex, 0);
    assert.equal(parsed.poseDeltaDetails[0].componentDeltas.length, 8);
    assert.ok(Math.abs(parsed.poseDeltaDetails[0].componentDeltas[0] - 0.01) < 1e-6);
  });

  it('passes import/export/reimport diagnostics for real SMF samples with head nodes and sign flips', () => {
    installImageTestPolyfill();
    const sampleFiles = [
      path.resolve(__dirname, '../../../tests/mixamo_smf_baldguy.smf'),
      path.resolve(__dirname, '../../../../docs/references/old-src/datafiles/SMF/spider_TEST.smf'),
    ].filter((file) => fs.existsSync(file));

    assert.ok(sampleFiles.length > 0, 'expected at least one real SMF fixture');

    for (const sampleFile of sampleFiles) {
      const imported = importSMF(bytesToArrayBuffer(fs.readFileSync(sampleFile)));
      const reimported = importSMF(bytesToArrayBuffer(exportSMFToBuffer(imported)));
      const report = compareSmfRoundtrip(imported, reimported);

      assert.strictEqual(report.status, 'passed', `${path.basename(sampleFile)}: ${report.messages.join('; ')}`);
      assert.strictEqual(report.ok, true);
    }
  });
});
