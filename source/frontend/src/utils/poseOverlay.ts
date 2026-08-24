import * as THREE from 'three';
import type { AnimationPoseSnapshot } from './animationCreation';

export interface PoseOverlaySegments {
  rest: Float32Array;
  trails: Float32Array;
}

function restWorldPositions(
  skeleton: THREE.Skeleton,
  snapshot: AnimationPoseSnapshot,
): Map<THREE.Bone, THREE.Vector3> {
  const positions = new Map<THREE.Bone, THREE.Vector3>();
  const visit = (bone: THREE.Bone): void => {
    const pose = snapshot[bone.name];
    const local = new THREE.Matrix4().compose(
      pose ? new THREE.Vector3(...pose.position) : bone.position,
      pose ? new THREE.Quaternion(...pose.quaternion).normalize() : bone.quaternion,
      bone.scale,
    );
    const parentBone = bone.parent instanceof THREE.Bone ? bone.parent : null;
    const parentMatrix = parentBone
      ? new THREE.Matrix4().makeTranslation(0, 0, 0)
      : (bone.parent?.matrixWorld ?? new THREE.Matrix4());
    if (parentBone) {
      const parentPosition = positions.get(parentBone);
      if (parentPosition) {
        parentMatrix.compose(parentPosition, parentBone.quaternion, parentBone.scale);
      }
    }
    const world = local.clone();
    if (parentBone) {
      const parentWorld = new THREE.Matrix4();
      let cursor: THREE.Bone | null = parentBone;
      const ancestors: THREE.Bone[] = [];
      while (cursor) {
        ancestors.unshift(cursor);
        cursor = cursor.parent instanceof THREE.Bone ? cursor.parent : null;
      }
      parentWorld.copy(parentBone.parent?.matrixWorld ?? new THREE.Matrix4());
      for (const ancestor of ancestors) {
        const ancestorPose = snapshot[ancestor.name];
        parentWorld.multiply(new THREE.Matrix4().compose(
          ancestorPose ? new THREE.Vector3(...ancestorPose.position) : ancestor.position,
          ancestorPose ? new THREE.Quaternion(...ancestorPose.quaternion).normalize() : ancestor.quaternion,
          ancestor.scale,
        ));
      }
      world.copy(parentWorld).multiply(local);
    } else {
      world.copy(parentMatrix).multiply(local);
    }
    positions.set(bone, new THREE.Vector3().setFromMatrixPosition(world));
    for (const child of bone.children) {
      if (child instanceof THREE.Bone && skeleton.bones.includes(child)) visit(child);
    }
  };
  for (const bone of skeleton.bones) {
    if (!(bone.parent instanceof THREE.Bone) || !skeleton.bones.includes(bone.parent)) visit(bone);
  }
  return positions;
}

function toFloat32(values: number[]): Float32Array {
  return new Float32Array(values);
}

export function createPoseOverlaySegments(
  skeleton: THREE.Skeleton | null | undefined,
  snapshot: AnimationPoseSnapshot | null | undefined,
): PoseOverlaySegments {
  if (!skeleton || !snapshot) return { rest: new Float32Array(), trails: new Float32Array() };
  const restPositions = restWorldPositions(skeleton, snapshot);
  const rest: number[] = [];
  const trails: number[] = [];
  for (const bone of skeleton.bones) {
    const restPosition = restPositions.get(bone);
    if (!restPosition) continue;
    const currentPosition = bone.getWorldPosition(new THREE.Vector3());
    if (bone.parent instanceof THREE.Bone && restPositions.has(bone.parent)) {
      const restParent = restPositions.get(bone.parent)!;
      rest.push(restParent.x, restParent.y, restParent.z, restPosition.x, restPosition.y, restPosition.z);
    }
    if (currentPosition.distanceToSquared(restPosition) > 1e-10) {
      trails.push(restPosition.x, restPosition.y, restPosition.z, currentPosition.x, currentPosition.y, currentPosition.z);
    }
  }
  return { rest: toFloat32(rest), trails: toFloat32(trails) };
}
