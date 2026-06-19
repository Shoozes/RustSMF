import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { inspectMeshMaterialCompatibility } from './textureCompat';

function makeSkinnedQuadMesh(material: THREE.Material | THREE.Material[]): THREE.SkinnedMesh {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'DiagnosticMesh';
  mesh.add(new THREE.Bone());
  return mesh;
}

function makeTexturedMaterial(width: number, height: number): THREE.MeshStandardMaterial {
  const size = width * height * 4;
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    data[i] = i % 256;
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: texture });
}

describe('textureCompat.inspectMeshMaterialCompatibility', () => {
  it('warns on non-power-of-two textures', () => {
    const mesh = makeSkinnedQuadMesh(makeTexturedMaterial(3, 2));
    const diagnostics = inspectMeshMaterialCompatibility(mesh);
    assert.ok(diagnostics.some((d) => d.code === 'SMF_NON_POT_TEXTURE'), 'expected non-POT texture warning');
  });

  it('warns when a skinned mesh has multiple materials', () => {
    const mesh = makeSkinnedQuadMesh([
      new THREE.MeshStandardMaterial({ color: 0x3366ff }),
      makeTexturedMaterial(4, 4),
    ]);
    const diagnostics = inspectMeshMaterialCompatibility(mesh);
    assert.ok(diagnostics.some((d) => d.code === 'SMF_MULTI_MATERIAL'), 'expected multi-material warning');
  });

  it('warns when multiple texture maps are present across material slots', () => {
    const mesh = makeSkinnedQuadMesh([
      makeTexturedMaterial(4, 4),
      makeTexturedMaterial(4, 4),
    ]);
    const diagnostics = inspectMeshMaterialCompatibility(mesh);
    assert.ok(diagnostics.some((d) => d.code === 'SMF_MULTI_TEXTURE'), 'expected multi-texture warning');
  });
});
