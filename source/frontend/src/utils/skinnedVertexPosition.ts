import * as THREE from 'three';

export type SkinnedVertexPositionFailure =
  | 'missing-position'
  | 'missing-skin-attributes'
  | 'missing-skeleton'
  | 'invalid-vertex'
  | 'invalid-skin-data'
  | 'non-finite-world-position';

export function getSkinnedVertexWorldPosition(
  mesh: THREE.SkinnedMesh,
  vertexIndex: number,
  target: THREE.Vector3,
): SkinnedVertexPositionFailure | null {
  const position = mesh.geometry.getAttribute('position');
  if (!position || position.itemSize < 3) return 'missing-position';
  if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= position.count) return 'invalid-vertex';

  const skinIndex = mesh.geometry.getAttribute('skinIndex');
  const skinWeight = mesh.geometry.getAttribute('skinWeight');
  if (!skinIndex || !skinWeight || skinIndex.itemSize < 4 || skinWeight.itemSize < 4) {
    return 'missing-skin-attributes';
  }
  if (!mesh.skeleton || !mesh.bindMatrix || !mesh.bindMatrixInverse) return 'missing-skeleton';

  for (let influence = 0; influence < 4; influence += 1) {
    const boneIndex = skinIndex.getComponent(vertexIndex, influence);
    const weight = skinWeight.getComponent(vertexIndex, influence);
    if (!Number.isInteger(boneIndex) || boneIndex < 0 || boneIndex >= mesh.skeleton.bones.length || !Number.isFinite(weight)) {
      return 'invalid-skin-data';
    }
  }

  try {
    mesh.getVertexPosition(vertexIndex, target);
    target.applyMatrix4(mesh.matrixWorld);
  } catch {
    return 'invalid-skin-data';
  }

  if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) {
    return 'non-finite-world-position';
  }
  return null;
}
