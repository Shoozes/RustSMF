import * as THREE from 'three';
import { getSourceMaterials } from './materialPreview';
import { isThreeMesh } from './threeTypeGuards';

export interface GeometryDiagnosticEntry {
  objectId: string;
  objectName: string;
  submodelId: string;
  vertexCount: number;
  normalCount: number;
  tangentCount: number;
  uvCount: number;
  materialNames: string[];
  normalStatus: 'present' | 'missing' | 'invalid';
  tangentStatus: 'present' | 'missing' | 'invalid';
  uvStatus: 'present' | 'missing' | 'invalid';
  handedness: 'right-handed' | 'left-handed' | 'degenerate';
}

export interface ShaderCapabilityDiagnostic {
  webgl2: boolean;
  standardMaterials: boolean;
  legacyShaderPreview: boolean;
  notes: string[];
}

export interface GeometryDiagnosticsReport {
  meshes: GeometryDiagnosticEntry[];
  totalVertices: number;
  missingNormals: number;
  missingTangents: number;
  missingUvs: number;
  leftHandedMeshes: number;
  shader: ShaderCapabilityDiagnostic;
}

function attributeStatus(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  vertexCount: number,
  itemSize: number,
): 'present' | 'missing' | 'invalid' {
  if (!attribute) return 'missing';
  if (attribute.count !== vertexCount || attribute.itemSize < itemSize) return 'invalid';
  for (let index = 0; index < attribute.count * attribute.itemSize; index += 1) {
    if (!Number.isFinite(attribute.array[index])) return 'invalid';
  }
  return 'present';
}

function materialNames(mesh: THREE.Mesh): string[] {
  return getSourceMaterials(mesh).map((material, index) => material.name || `material_${index}`);
}

function handedness(object: THREE.Object3D): GeometryDiagnosticEntry['handedness'] {
  const determinant = new THREE.Matrix3().setFromMatrix4(object.matrixWorld).determinant();
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= 1e-8) return 'degenerate';
  return determinant < 0 ? 'left-handed' : 'right-handed';
}

export function diagnoseGeometry(root: THREE.Object3D | null): GeometryDiagnosticsReport {
  const meshes: GeometryDiagnosticEntry[] = [];
  if (root) {
    root.updateMatrixWorld(true);
    root.traverse((object) => {
      if (!isThreeMesh(object)) return;
      const geometry = object.geometry;
      const position = geometry.getAttribute('position');
      const vertexCount = position?.count ?? 0;
      meshes.push({
        objectId: object.uuid,
        objectName: object.name || object.uuid,
        submodelId: String(object.userData.submodelId ?? object.userData.rustsmfSubmodelId ?? object.uuid),
        vertexCount,
        normalCount: geometry.getAttribute('normal')?.count ?? 0,
        tangentCount: geometry.getAttribute('tangent')?.count ?? 0,
        uvCount: geometry.getAttribute('uv')?.count ?? 0,
        materialNames: materialNames(object),
        normalStatus: attributeStatus(geometry.getAttribute('normal'), vertexCount, 3),
        tangentStatus: attributeStatus(geometry.getAttribute('tangent'), vertexCount, 4),
        uvStatus: attributeStatus(geometry.getAttribute('uv'), vertexCount, 2),
        handedness: handedness(object),
      });
    });
  }

  const webgl2 = typeof window !== 'undefined' && 'WebGL2RenderingContext' in window;
  return {
    meshes,
    totalVertices: meshes.reduce((total, mesh) => total + mesh.vertexCount, 0),
    missingNormals: meshes.filter((mesh) => mesh.normalStatus !== 'present').length,
    missingTangents: meshes.filter((mesh) => mesh.tangentStatus !== 'present').length,
    missingUvs: meshes.filter((mesh) => mesh.uvStatus !== 'present').length,
    leftHandedMeshes: meshes.filter((mesh) => mesh.handedness === 'left-handed').length,
    shader: {
      webgl2,
      standardMaterials: true,
      legacyShaderPreview: meshes.length > 0,
      notes: [
        webgl2 ? 'WebGL2 is available for standard material shaders.' : 'WebGL2 is unavailable; standard materials use the browser fallback lane.',
        'Diagnostics are read-only; export bytes and source geometry are not rewritten.',
      ],
    },
  };
}
