// Unit tests for threeToSmf.ts - Three.js scene to ImportedSmf conversion.
// Run manually with: tsx --test src/loaders/threeToSmf.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { applyLiveSkinEditsToImportedSmf, buildImportedSmfFromThree, inspectThreeToSmfSource, SmfConversionError } from './threeToSmf';
import { exportSMFToBuffer, importSMF, ImportedSmf } from './smf';
import { dqToLocalTransform } from './coord';
import { buildSmfNodeList } from './smfRig';
import { compareSmfRoundtrip, summarizeImportedSmf } from './smfDiagnostics';

describe('threeToSmf - buildImportedSmfFromThree', () => {
  const makeSkeleton = () => {
    const bone = new THREE.Bone();
    bone.name = 'Bone_0';
    return new THREE.Skeleton([bone]);
  };

  const makeSkinnedMesh = (options: {
    normal?: boolean;
    uv?: boolean;
    skin?: boolean;
    material?: THREE.Material;
  } = {}) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ], 3));
    if (options.normal) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
      ], 3));
    }
    if (options.uv) {
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
        0, 0,
        1, 0,
        0, 1,
      ], 2));
    }
    if (options.skin) {
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ], 4));
      geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
        1, 0, 0, 0,
        1, 0, 0, 0,
        1, 0, 0, 0,
      ], 4));
    }
    const mesh = new THREE.SkinnedMesh(geometry, options.material ?? new THREE.MeshBasicMaterial());
    mesh.name = 'DiagnosticMesh';
    return mesh;
  };

  const makeNamedMesh = (name: string): THREE.SkinnedMesh => {
    const mesh = makeSkinnedMesh({ skin: true, normal: true, uv: true });
    mesh.name = name;
    return mesh;
  };

  const makeTexturedMaterial = (useNonPowerOfTwo = false): THREE.MeshStandardMaterial => {
    const width = useNonPowerOfTwo ? 3 : 4;
    const height = useNonPowerOfTwo ? 2 : 4;
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = i % 256;
    }
    const texture = new THREE.DataTexture(data, width, height);
    texture.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: texture });
  };

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

  it('reports diagnostic error for source without skeleton bones', () => {
    const report = inspectThreeToSmfSource({ skeleton: null });
    assert.strictEqual(report.canExportSmf, false);
    assert.ok(report.diagnostics.some((item) => item.code === 'SMF_NO_SKINNED_SKELETON'));
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

  it('reports diagnostic error for unsupported scale animation tracks', () => {
    const skeleton = makeSkeleton();
    const scaleTrack = new THREE.VectorKeyframeTrack('Bone_0.scale', [0, 1], [1, 1, 1, 2, 2, 2]);
    const clip = new THREE.AnimationClip('ScaleClip', 1, [scaleTrack]);
    const report = inspectThreeToSmfSource({ skeleton, clips: [clip] });

    assert.strictEqual(report.canExportSmf, false);
    assert.ok(report.diagnostics.some((item) => item.code === 'SMF_SCALE_ANIMATION'));
  });

  it('reports warnings for missing UVs and normals without blocking export', () => {
    const report = inspectThreeToSmfSource({
      skeleton: makeSkeleton(),
      skinnedMeshes: [makeSkinnedMesh({ skin: true })],
    });

    assert.strictEqual(report.canExportSmf, true);
    assert.ok(report.diagnostics.some((item) => item.code === 'SMF_MISSING_UV'));
    assert.ok(report.diagnostics.some((item) => item.code === 'SMF_MISSING_NORMALS'));
  });

  it('reports warning for non power-of-two material textures', () => {
    const report = inspectThreeToSmfSource({
      skeleton: makeSkeleton(),
      skinnedMeshes: [
        makeSkinnedMesh({
          normal: true,
          uv: true,
          skin: true,
          material: makeTexturedMaterial(true),
        }),
      ],
    });

    assert.strictEqual(report.canExportSmf, true);
    assert.ok(report.diagnostics.some((item) => item.code === 'SMF_NON_POT_TEXTURE'), 'expected non-POT texture warning');
    assert.strictEqual(report.materialTextures?.length, 1);
    assert.strictEqual(report.materialTextures?.[0]?.width, 3);
    assert.strictEqual(report.materialTextures?.[0]?.height, 2);
    assert.strictEqual(report.materialTextures?.[0]?.isPowerOfTwo, false);
  });

  it('reports warning for multi-material meshes', () => {
    const base = makeSkinnedMesh({ normal: true, uv: true, skin: true });
    const mesh = makeSkinnedMesh({ normal: true, uv: true, skin: true });
    mesh.material = [base.material, new THREE.MeshStandardMaterial({ color: 0x3366ff })] as unknown as THREE.Material;
    mesh.name = 'MultiMaterialMesh';

    const report = inspectThreeToSmfSource({
      skeleton: makeSkeleton(),
      skinnedMeshes: [mesh],
    });

    assert.strictEqual(report.canExportSmf, true);
    assert.ok(report.diagnostics.some((item) => item.code === 'SMF_MULTI_MATERIAL'), 'expected multi-material warning');
  });

  it('warns when multiple texture sources are used for a mesh and does not block', () => {
    const texturedA = makeTexturedMaterial();
    const texturedB = makeTexturedMaterial();
    texturedB.needsUpdate = true;

    const mesh = makeSkinnedMesh({
      normal: true,
      uv: true,
      skin: true,
    });
    mesh.material = [texturedA, texturedB] as unknown as THREE.Material;
    mesh.name = 'DualTextureMesh';

    const report = inspectThreeToSmfSource({
      skeleton: makeSkeleton(),
      skinnedMeshes: [mesh],
    });

    assert.strictEqual(report.canExportSmf, true);
    assert.ok(report.diagnostics.some((item) => item.code === 'SMF_MULTI_TEXTURE'), 'expected multi-texture warning');
    assert.strictEqual(report.materialTextures?.length, 2);
  });

  it('reports diagnostic error when skinned export mesh lacks skin attributes', () => {
    const report = inspectThreeToSmfSource({
      skeleton: makeSkeleton(),
      skinnedMeshes: [makeSkinnedMesh({ normal: true, uv: true })],
    });

    assert.strictEqual(report.canExportSmf, false);
    assert.ok(report.diagnostics.some((item) => item.code === 'SMF_MISSING_SKIN_ATTRIBUTES'));
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

  it('converts all skinned meshes, not just the first', () => {
    const bone = new THREE.Bone();
    bone.name = 'Bone_0';
    const skeleton = new THREE.Skeleton([bone]);
    const converted = buildImportedSmfFromThree({
      skeleton,
      skinnedMeshes: [
        makeNamedMesh('Mesh_A'),
        makeNamedMesh('Mesh_B'),
      ],
    });

    assert.strictEqual(converted.meshes.length, 2);
    assert.strictEqual(converted.meshes[0].name, 'Mesh_A');
    assert.strictEqual(converted.meshes[1].name, 'Mesh_B');
  });

  it('expands indexed geometry into SMF triangle soup with matching skin data', () => {
    const bone = new THREE.Bone();
    bone.name = 'Bone_0';
    const skeleton = new THREE.Skeleton([bone]);
    const mesh = makeSkinnedMesh({ skin: true, normal: true, uv: true });
    mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0,
      1, 0, 0,
      1, 1, 0,
      0, 1, 0,
    ], 3));
    mesh.geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ], 3));
    mesh.geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
      0, 0,
      1, 0,
      1, 1,
      0, 1,
    ], 2));
    mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ], 4));
    mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
      1, 0, 0, 0,
      1, 0, 0, 0,
      1, 0, 0, 0,
      1, 0, 0, 0,
    ], 4));
    mesh.geometry.setIndex([0, 1, 2, 0, 2, 3]);

    const converted = buildImportedSmfFromThree({
      skeleton,
      skinnedMeshes: [mesh],
    });
    const convertedMesh = converted.meshes[0];

    assert.strictEqual(convertedMesh.verts, 6);
    assert.deepStrictEqual(convertedMesh.triangles, [[0, 1, 2], [3, 4, 5]]);
    assert.strictEqual(convertedMesh.positions.length, 18);
    assert.strictEqual(convertedMesh.skinIndices.length, 24);
    assert.strictEqual(convertedMesh.skinWeights.length, 24);
    assert.deepStrictEqual(
      [...convertedMesh.positions.slice(9, 18)].map((value) => Object.is(value, -0) ? 0 : value),
      [0, 0, 0, 1, 0, 1, 0, 0, 1],
    );

    const reimported = importSMF(toArrayBuffer(exportSMFToBuffer(converted)));
    assert.strictEqual(reimported.meshes[0].verts, 6);
    assert.strictEqual(reimported.meshes[0].triangles.length, 2);
  });

  it('sizes missing optional vertex attributes to the exported triangle soup', () => {
    const skeleton = makeSkeleton();
    const mesh = makeSkinnedMesh({ skin: true });
    const converted = buildImportedSmfFromThree({
      skeleton,
      skinnedMeshes: [mesh],
    });

    assert.strictEqual(converted.meshes[0].normals.length, 9);
    assert.strictEqual(converted.meshes[0].uvs.length, 6);
    assert.strictEqual(converted.meshes[0].tangents.length, 12);
    assert.doesNotThrow(() => exportSMFToBuffer(converted));
  });

  it('blocks incomplete triangle and skin attribute layouts before conversion', () => {
    const skeleton = makeSkeleton();
    const incompleteTriangles = makeSkinnedMesh({ skin: true, normal: true, uv: true });
    incompleteTriangles.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0,
      1, 0, 0,
      1, 1, 0,
      0, 1, 0,
    ], 3));
    const triangleReport = inspectThreeToSmfSource({
      skeleton,
      skinnedMeshes: [incompleteTriangles],
    });
    assert.strictEqual(triangleReport.canExportSmf, false);
    assert.ok(triangleReport.diagnostics.some((item) => item.code === 'SMF_INVALID_TRIANGLES'));

    const incompleteSkin = makeSkinnedMesh({ skin: true, normal: true, uv: true });
    incompleteSkin.geometry.setAttribute(
      'skinWeight',
      new THREE.Float32BufferAttribute([1, 0, 0, 0], 4),
    );
    const skinReport = inspectThreeToSmfSource({
      skeleton,
      skinnedMeshes: [incompleteSkin],
    });
    assert.strictEqual(skinReport.canExportSmf, false);
    assert.ok(skinReport.diagnostics.some((item) => item.code === 'SMF_MISSING_SKIN_ATTRIBUTES'));
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

  it('keeps constructed skeleton node lists direct unless head nodes are explicit', () => {
    const dq = new Float32Array(8);
    dq[3] = 1;

    const { nodeList } = buildSmfNodeList([
      { index: 0, parent: -1, isBone: 1, dq, axis: [0, 1, 0] },
      { index: 1, parent: 0, isBone: 1, dq, axis: [0, 1, 0] },
    ]);

    assert.strictEqual(nodeList.length, 2, 'constructed skeleton has one SMF node per real bone');
    assert.deepStrictEqual(
      nodeList.map(n => ({ boneIndex: n.boneIndex, parent: n.parent, isBone: n.isBone, isHead: n.isHead })),
      [
        { boneIndex: 0, parent: 0, isBone: 1, isHead: false },
        { boneIndex: 1, parent: 0, isBone: 1, isHead: false },
      ]
    );
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

  it('summarizes and compares SMF roundtrip structure', () => {
    const bone = new THREE.Bone();
    bone.name = 'Bone_0';
    const skeleton = new THREE.Skeleton([bone]);
    const converted = buildImportedSmfFromThree({ skeleton });
    const reimported = importSMF(toArrayBuffer(exportSMFToBuffer(converted)));

    const summary = summarizeImportedSmf(converted);
    assert.deepStrictEqual(
      {
        meshes: summary.meshes,
        bones: summary.bones,
        animations: summary.animations,
      },
      {
        meshes: 0,
        bones: 1,
        animations: 0,
      }
    );

    const report = compareSmfRoundtrip(converted, reimported);
    assert.strictEqual(report.ok, true);
    assert.ok(report.messages[0].includes('matched'));
  });

  it('applies live skinned mesh weight edits to imported smf payload', () => {
    const bone = new THREE.Bone();
    bone.name = 'Bone_0';
    const skeleton = new THREE.Skeleton([bone]);
    const converted = buildImportedSmfFromThree({
      skeleton,
      skinnedMeshes: [makeNamedMesh('PaintTarget')],
    });

    const paintMesh = makeNamedMesh('PaintTarget');
    const weight = paintMesh.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;
    weight.setX(0, 0.7);
    weight.setY(0, 0.2);
    weight.setZ(0, 0.1);
    weight.setW(0, 0);
    weight.setX(1, 0);
    weight.setY(1, 1);
    weight.setZ(1, 0);
    weight.setW(1, 0);
    weight.setX(2, 0);
    weight.setY(2, 0);
    weight.setZ(2, 0);
    weight.setW(2, 1);
    const patched = applyLiveSkinEditsToImportedSmf(converted, [paintMesh]);

    assert.ok(Math.abs(patched.meshes[0].skinWeights[0] - 0.7) < 1e-6);
    assert.ok(Math.abs(patched.meshes[0].skinWeights[1] - 0.2) < 1e-6);
    assert.ok(Math.abs(patched.meshes[0].skinWeights[2] - 0.1) < 1e-6);
    assert.ok(Math.abs(patched.meshes[0].skinWeights[3] - 0) < 1e-6);

    assert.ok(Math.abs(patched.meshes[0].skinWeights[4] - 0) < 1e-6);
    assert.ok(Math.abs(patched.meshes[0].skinWeights[5] - 1) < 1e-6);
  });

  it('throws when applying live weight edits with mismatched mesh topology', () => {
    const bone = new THREE.Bone();
    bone.name = 'Bone_0';
    const skeleton = new THREE.Skeleton([bone]);
    const converted = buildImportedSmfFromThree({
      skeleton,
      skinnedMeshes: [makeNamedMesh('PaintTarget')],
    });

    const wrongMesh = makeSkinnedMesh({ skin: true, normal: true, uv: true });
    wrongMesh.name = 'PaintTarget';
    wrongMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      1, 1, 0,
    ], 3));

    assert.throws(
      () => applyLiveSkinEditsToImportedSmf(converted, [wrongMesh]),
      (err: Error) => {
        assert.ok(err instanceof SmfConversionError, 'should be SmfConversionError');
        return true;
      },
    );
  });
});

// Local helper (mirrors coord.test.ts for buffer)
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

