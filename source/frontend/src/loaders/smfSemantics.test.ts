import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ImportedSmf } from './smf';
import { SmfSemanticValidationError, validateImportedSmfSemantics } from './smfSemantics';

const identityDq = () => new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]);

function makeValidSmf(): ImportedSmf {
  return {
    meshes: [{
      name: 'mesh',
      verts: 3,
      triangles: [[0, 1, 2]],
      texIdx: -1,
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
      tangents: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]),
      skinIndices: new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      skinWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
      visible: 1,
    }],
    textures: [],
    bones: [{ index: 0, parent: 0, isBone: 1, dq: identityDq(), axis: [0, 1, 0] }],
    animations: [{
      name: 'idle',
      duration: 1,
      times: [0, 1],
      frames: [[identityDq()], [identityDq()]],
      nodeCount: 1,
      loop: 1,
      interpolation: 1,
      sampleFrameMultiplier: 1,
      lockedBones: [],
    }],
  };
}

describe('smfSemantics', () => {
  it('accepts a structurally and relationally valid payload', () => {
    assert.doesNotThrow(() => validateImportedSmfSemantics(makeValidSmf()));
  });

  it('rejects non-finite geometry and skin indices outside deform bones', () => {
    const nonFinite = makeValidSmf();
    nonFinite.meshes[0].positions[0] = Number.NaN;
    assert.throws(
      () => validateImportedSmfSemantics(nonFinite),
      (error: unknown) => error instanceof SmfSemanticValidationError
        && error.message.includes('positions[0] is not finite'),
    );

    const invalidSkin = makeValidSmf();
    invalidSkin.meshes[0].skinIndices[0] = 1;
    assert.throws(
      () => validateImportedSmfSemantics(invalidSkin),
      /skin index 1 is outside the deform-bone range/,
    );
  });

  it('rejects cyclic rigs and non-monotonic animation times', () => {
    const cyclic = makeValidSmf();
    cyclic.bones.push({ index: 1, parent: 0, isBone: 1, dq: identityDq(), axis: [0, 1, 0] });
    cyclic.bones[0].parent = 1;
    cyclic.animations[0].nodeCount = 2;
    cyclic.animations[0].frames = [[identityDq(), identityDq()], [identityDq(), identityDq()]];
    assert.throws(() => validateImportedSmfSemantics(cyclic), /rig parent cycle/);

    const nonMonotonic = makeValidSmf();
    nonMonotonic.animations[0].times = [0.8, 0.2];
    assert.throws(() => validateImportedSmfSemantics(nonMonotonic), /non-monotonic/);
  });
});
