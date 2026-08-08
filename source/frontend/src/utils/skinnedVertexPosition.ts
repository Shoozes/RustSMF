import * as THREE from 'three';

export type SkinnedVertexPositionFailure =
  | 'missing-position'
  | 'missing-skin-attributes'
  | 'missing-skeleton'
  | 'invalid-vertex'
  | 'invalid-skin-data'
  | 'non-finite-world-position';

export interface SkinPaintPoseSnapshot {
  mode: 'rest' | 'frozen' | 'live';
  boneMatrices?: Float32Array;
}

function validateSkinData(
  mesh: THREE.SkinnedMesh,
  vertexIndex: number,
): SkinnedVertexPositionFailure | null {
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
  return null;
}

export function captureSkinPaintPose(mesh: THREE.SkinnedMesh): SkinPaintPoseSnapshot | null {
  if (!mesh.skeleton) return null;
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  if (!mesh.skeleton.boneMatrices) return null;
  return {
    mode: 'frozen',
    boneMatrices: new Float32Array(mesh.skeleton.boneMatrices),
  };
}

function getPaintPoseVertexPosition(
  mesh: THREE.SkinnedMesh,
  vertexIndex: number,
  target: THREE.Vector3,
  pose: SkinPaintPoseSnapshot,
): SkinnedVertexPositionFailure | null {
  const position = mesh.geometry.getAttribute('position');
  if (!position || position.itemSize < 3) return 'missing-position';
  const validationFailure = validateSkinData(mesh, vertexIndex);
  if (validationFailure) return validationFailure;

  if (pose.mode === 'live') {
    try {
      mesh.skeleton?.update();
      mesh.getVertexPosition(vertexIndex, target);
    } catch {
      return 'invalid-skin-data';
    }
    target.applyMatrix4(mesh.matrixWorld);
  } else if (pose.mode === 'rest') {
    target.fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.matrixWorld);
  } else {
    const boneMatrices = pose.boneMatrices;
    const skeleton = mesh.skeleton;
    if (!boneMatrices || boneMatrices.length < skeleton.bones.length * 16) return 'missing-skeleton';

    const skinIndex = mesh.geometry.getAttribute('skinIndex')!;
    const skinWeight = mesh.geometry.getAttribute('skinWeight')!;
    const bindPosition = new THREE.Vector3().fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.bindMatrix);
    const transformed = new THREE.Vector3();
    const bonePosition = new THREE.Vector3();
    const boneMatrix = new THREE.Matrix4();
    for (let influence = 0; influence < 4; influence += 1) {
      const boneIndex = skinIndex.getComponent(vertexIndex, influence);
      const weight = skinWeight.getComponent(vertexIndex, influence);
      boneMatrix.fromArray(boneMatrices, boneIndex * 16);
      bonePosition.copy(bindPosition).applyMatrix4(boneMatrix).multiplyScalar(weight);
      transformed.add(bonePosition);
    }
    target.copy(transformed).applyMatrix4(mesh.bindMatrixInverse).applyMatrix4(mesh.matrixWorld);
  }

  if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) {
    return 'non-finite-world-position';
  }
  return null;
}

export function getSkinPaintVertexWorldPosition(
  mesh: THREE.SkinnedMesh,
  vertexIndex: number,
  target: THREE.Vector3,
  pose: SkinPaintPoseSnapshot,
): SkinnedVertexPositionFailure | null {
  const position = mesh.geometry.getAttribute('position');
  if (!position || position.itemSize < 3) return 'missing-position';
  if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= position.count) return 'invalid-vertex';
  return getPaintPoseVertexPosition(mesh, vertexIndex, target, pose);
}

export function getSkinnedVertexWorldPosition(
  mesh: THREE.SkinnedMesh,
  vertexIndex: number,
  target: THREE.Vector3,
): SkinnedVertexPositionFailure | null {
  const position = mesh.geometry.getAttribute('position');
  if (!position || position.itemSize < 3) return 'missing-position';
  if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= position.count) return 'invalid-vertex';

  const validationFailure = validateSkinData(mesh, vertexIndex);
  if (validationFailure) return validationFailure;

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
