import * as THREE from 'three';

/** Default max distance for bone raycast picking (world units). Tuned for typical rigged models. */
export const DEFAULT_MAX_BONE_PICK_DIST = 1.5;

/**
 * Pure raycast helper for closest bone selection.
 * Complements Inspector list selection. Uses world positions + ray distance.
 * No scene mutations. Mechanical extract from ThreeViewport onCanvasClick; behavior preserved.
 * Use DEFAULT_MAX_BONE_PICK_DIST for the tuned default or pass custom for flexibility.
 */
export function findClosestBone(
  raycaster: THREE.Raycaster,
  skeleton: THREE.Skeleton | null | undefined,
  maxDist = DEFAULT_MAX_BONE_PICK_DIST
): THREE.Bone | null {
  if (!skeleton?.bones?.length) return null;

  let closest: THREE.Bone | null = null;
  let minDist = Infinity;
  const worldPos = new THREE.Vector3();

  for (const bone of skeleton.bones) {
    if (!bone) continue;
    bone.getWorldPosition(worldPos);
    const dist = raycaster.ray.distanceToPoint(worldPos);
    if (dist < minDist && dist < maxDist) {
      minDist = dist;
      closest = bone;
    }
  }

  return closest;
}

/**
 * Shared pure helper to locate a bone by name in a Three Skeleton (promotes modularity).
 * Used across viewport (marker, transform, raycast follow), hook (selection), poseEdits.
 * Returns the first matching bone or undefined.
 */
export function findBoneByName(skeleton: THREE.Skeleton | null | undefined, name: string): THREE.Bone | undefined {
  if (!skeleton?.bones?.length || !name) return undefined;
  return skeleton.bones.find((b: THREE.Bone) => b.name === name);
}
