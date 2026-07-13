import * as THREE from 'three';

export function isThreeBone(value: THREE.Object3D | null | undefined): value is THREE.Bone {
  return value instanceof THREE.Bone;
}

export function isThreeMesh(value: THREE.Object3D | null | undefined): value is THREE.Mesh {
  return value instanceof THREE.Mesh;
}

export function isThreeSkinnedMesh(value: THREE.Object3D | null | undefined): value is THREE.SkinnedMesh {
  return value instanceof THREE.SkinnedMesh;
}
