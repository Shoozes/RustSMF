import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { installImageTestPolyfill } from '../test/installImageTestPolyfill';
import { editVertexBoneWeight, readVertexSkinWeights } from '../utils/skinWeights';
import { buildThreeScene, importSMF } from './smf';
import { bytesToArrayBuffer } from './smfBinary';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleFile = path.resolve(dirname, '../../tests/mixamo_smf_baldguy.smf');
const torsoSeamVertexIds = [
  19, 22, 24, 52, 55, 110, 111, 166,
  13, 16, 18, 108, 161, 171,
  7, 10, 12, 88, 91, 169, 172,
  56, 92, 106, 165, 168,
];
const upperSleeveEdgeVertexIds = [87, 89, 90, 109, 112, 113, 159, 160, 167, 173];

function poseWave(loaded: ReturnType<typeof buildThreeScene>): void {
  loaded.skeleton.bones.find((bone) => bone.name === 'SMF_Node_12')!.rotation.y -= 0.4;
  loaded.skeleton.bones.find((bone) => bone.name === 'SMF_Node_13')!.rotation.y += 1.2;
  loaded.skeleton.bones.find((bone) => bone.name === 'SMF_Node_14')!.rotation.y += 0.2;
  loaded.root.updateMatrixWorld(true);
  loaded.skeleton.update();
}

function worstTriangleDistortion(mesh: THREE.SkinnedMesh): number {
  const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  let worst = 1;
  for (let start = 0; start < position.count; start += 3) {
    const rest = [0, 1, 2].map((offset) => (
      new THREE.Vector3().fromBufferAttribute(position, start + offset).applyMatrix4(mesh.matrixWorld)
    ));
    const posed = [0, 1, 2].map((offset) => {
      const point = new THREE.Vector3().fromBufferAttribute(position, start + offset);
      mesh.applyBoneTransform(start + offset, point);
      return point.applyMatrix4(mesh.matrixWorld);
    });
    const restEdges = [rest[0].distanceTo(rest[1]), rest[1].distanceTo(rest[2]), rest[2].distanceTo(rest[0])];
    const posedEdges = [posed[0].distanceTo(posed[1]), posed[1].distanceTo(posed[2]), posed[2].distanceTo(posed[0])];
    for (let edge = 0; edge < 3; edge += 1) {
      worst = Math.max(
        worst,
        posedEdges[edge] / Math.max(restEdges[edge], 1e-6),
        restEdges[edge] / Math.max(posedEdges[edge], 1e-6),
      );
    }
  }
  return worst;
}

describe('real SMF hand-wave weight repair', () => {
  it('removes the torso wing deformation without replacing the torso blend', () => {
    assert.ok(fs.existsSync(sampleFile), `required hand-wave fixture is missing: ${sampleFile}`);
    installImageTestPolyfill();
    const sample = bytesToArrayBuffer(fs.readFileSync(sampleFile));

    const raw = buildThreeScene(importSMF(sample));
    poseWave(raw);
    const rawShirt = raw.skinnedMeshes.find((mesh) => mesh.name === 'Mesh_4');
    assert.ok(rawShirt);
    assert.ok(worstTriangleDistortion(rawShirt) > 2.7, 'fixture should reproduce the visible torso wing');

    const repaired = buildThreeScene(importSMF(sample));
    const shirt = repaired.skinnedMeshes.find((mesh) => mesh.name === 'Mesh_4');
    assert.ok(shirt);
    const forearmIndex = repaired.skeleton.bones.findIndex((bone) => bone.name === 'SMF_Node_13');
    const upperArmIndex = repaired.skeleton.bones.findIndex((bone) => bone.name === 'SMF_Node_12');
    for (const vertexId of torsoSeamVertexIds) {
      assert.equal(editVertexBoneWeight(shirt, vertexId, forearmIndex, 'subtract', 1).ok, true);
    }
    for (const vertexId of upperSleeveEdgeVertexIds) {
      assert.equal(editVertexBoneWeight(shirt, vertexId, upperArmIndex, 'set', 1, 1).ok, true);
    }

    const skinIndex = shirt.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
    const skinWeight = shirt.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;
    const seam = readVertexSkinWeights({ skinIndex, skinWeight }, 52);
    const sleeve = readVertexSkinWeights({ skinIndex, skinWeight }, 109);
    assert.ok(seam);
    assert.ok(sleeve);
    assert.equal(seam.weights[seam.indices.indexOf(forearmIndex)], 0);
    assert.equal(sleeve.weights[sleeve.indices.indexOf(upperArmIndex)], 1);

    poseWave(repaired);
    assert.ok(
      worstTriangleDistortion(shirt) < 1.2,
      'corrected torso seam and upper sleeve should stay within 20% edge distortion',
    );
  });
});
