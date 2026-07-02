import * as THREE from 'three';

export function isRigBone(object: THREE.Object3D): object is THREE.Bone {
  return (object as THREE.Bone).isBone === true;
}

export function collectRigHierarchyBones(
  root: THREE.Object3D | null | undefined,
  skeleton?: THREE.Skeleton | null,
): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  const seen = new Set<string>();
  const addBone = (bone: THREE.Bone): void => {
    if (seen.has(bone.uuid)) return;
    seen.add(bone.uuid);
    bones.push(bone);
  };

  root?.traverse((object) => {
    if (isRigBone(object)) addBone(object);
  });
  skeleton?.bones.forEach(addBone);

  return bones;
}

export function collectRigDeformBoneNames(skeleton?: THREE.Skeleton | null): string[] {
  return skeleton?.bones.map((bone) => bone.name).filter(Boolean) ?? [];
}

export function getRigRootBones(bones: readonly THREE.Bone[]): THREE.Bone[] {
  return bones.filter((bone) => !bone.parent || !bones.includes(bone.parent as THREE.Bone));
}

export function isRigBoneDetached(bone: THREE.Bone, skeleton?: THREE.Skeleton | null): boolean {
  return bone.userData.rustsmfDetached === true
    || (!!skeleton && !skeleton.bones.includes(bone));
}
