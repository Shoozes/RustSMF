import * as THREE from 'three';
import { isThreeMesh, isThreeSkinnedMesh } from './threeTypeGuards';

export type PrepareStaticSkinFailureReason =
  | 'missing-root'
  | 'already-skinned'
  | 'no-static-meshes'
  | 'empty-geometry'
  | 'unparented-mesh';

export interface StaticMeshSkinReplacement {
  original: THREE.Mesh;
  skinned: THREE.SkinnedMesh;
  parent: THREE.Object3D;
  index: number;
  skinIndexBefore: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  skinWeightBefore: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
}

export interface StaticMeshSkinPreparation {
  root: THREE.Object3D;
  rootBone: THREE.Bone;
  skeleton: THREE.Skeleton;
  replacements: StaticMeshSkinReplacement[];
}

export type PrepareStaticSkinResult =
  | {
    ok: true;
    skeleton: THREE.Skeleton;
    skinnedMeshes: THREE.SkinnedMesh[];
    convertedCount: number;
    rootBoneName: string;
    preparation: StaticMeshSkinPreparation;
  }
  | {
    ok: false;
    reason: PrepareStaticSkinFailureReason;
    message: string;
  };

const DEFAULT_ROOT_BONE_NAME = 'Root';

function collectStaticMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (!isThreeMesh(object) || isThreeSkinnedMesh(object)) return;
    meshes.push(object);
  });
  return meshes;
}

function ensureSkinAttributes(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  if (!position || position.count <= 0) return 0;
  const count = position.count;

  const skinIndex = new THREE.BufferAttribute(new Uint16Array(count * 4), 4);
  const skinWeight = new THREE.BufferAttribute(new Float32Array(count * 4), 4);
  for (let index = 0; index < count; index += 1) {
    skinIndex.setXYZW(index, 0, 0, 0, 0);
    skinWeight.setXYZW(index, 1, 0, 0, 0);
  }
  geometry.setAttribute('skinIndex', skinIndex);
  geometry.setAttribute('skinWeight', skinWeight);
  return count;
}

function replaceWithSkinnedMesh(
  mesh: THREE.Mesh,
  skeleton: THREE.Skeleton,
): THREE.SkinnedMesh {
  const skinned = new THREE.SkinnedMesh(mesh.geometry, mesh.material);
  skinned.name = mesh.name;
  skinned.uuid = mesh.uuid;
  skinned.visible = mesh.visible;
  skinned.frustumCulled = mesh.frustumCulled;
  skinned.castShadow = mesh.castShadow;
  skinned.receiveShadow = mesh.receiveShadow;
  skinned.renderOrder = mesh.renderOrder;
  skinned.userData = { ...mesh.userData };
  skinned.layers.mask = mesh.layers.mask;
  skinned.position.copy(mesh.position);
  skinned.quaternion.copy(mesh.quaternion);
  skinned.scale.copy(mesh.scale);
  skinned.matrix.copy(mesh.matrix);
  skinned.matrixWorld.copy(mesh.matrixWorld);
  skinned.matrixAutoUpdate = mesh.matrixAutoUpdate;

  const parent = mesh.parent;
  if (parent) {
    const index = parent.children.indexOf(mesh);
    parent.remove(mesh);
    parent.add(skinned);
    if (index >= 0) {
      parent.children.splice(parent.children.indexOf(skinned), 1);
      parent.children.splice(index, 0, skinned);
      skinned.parent = parent;
    }
  }

  skinned.bind(skeleton, new THREE.Matrix4());
  skinned.normalizeSkinWeights();
  return skinned;
}

function restoreReplacement(replacement: StaticMeshSkinReplacement): void {
  const { original, skinned, parent, index } = replacement;
  if (skinned.parent) skinned.parent.remove(skinned);
  if (original.parent) original.parent.remove(original);
  parent.add(original);
  parent.children.splice(parent.children.indexOf(original), 1);
  parent.children.splice(Math.min(index, parent.children.length), 0, original);
  original.parent = parent;

  if (replacement.skinIndexBefore) {
    original.geometry.setAttribute('skinIndex', replacement.skinIndexBefore);
  } else {
    original.geometry.deleteAttribute('skinIndex');
  }
  if (replacement.skinWeightBefore) {
    original.geometry.setAttribute('skinWeight', replacement.skinWeightBefore);
  } else {
    original.geometry.deleteAttribute('skinWeight');
  }
}

export function restoreStaticMeshSkinPreparation(
  preparation: StaticMeshSkinPreparation,
): void {
  for (const replacement of preparation.replacements) {
    restoreReplacement(replacement);
  }
  preparation.rootBone.parent?.remove(preparation.rootBone);
}

export function reapplyStaticMeshSkinPreparation(
  preparation: StaticMeshSkinPreparation,
): void {
  preparation.root.add(preparation.rootBone);
  preparation.rootBone.updateMatrixWorld(true);
  for (const replacement of preparation.replacements) {
    const { original, skinned, parent, index } = replacement;
    if (original.parent) original.parent.remove(original);
    if (skinned.parent) skinned.parent.remove(skinned);
    ensureSkinAttributes(original.geometry);
    parent.add(skinned);
    parent.children.splice(parent.children.indexOf(skinned), 1);
    parent.children.splice(Math.min(index, parent.children.length), 0, skinned);
    skinned.parent = parent;
    skinned.bind(preparation.skeleton, new THREE.Matrix4());
    skinned.normalizeSkinWeights();
  }
  preparation.skeleton.update();
}

/**
 * Promote static Mesh nodes under a loaded root into SkinnedMeshes sharing one
 * root bone. Enables rig child creation and weight painting on FBX/OBJ geometry
 * that arrived without a skeleton.
 */
export function prepareStaticMeshesForSkinning(
  root: THREE.Object3D | null | undefined,
  options?: { rootBoneName?: string },
): PrepareStaticSkinResult {
  if (!root) {
    return {
      ok: false,
      reason: 'missing-root',
      message: 'Load a model before preparing a root skeleton.',
    };
  }

  const existingSkinned: THREE.SkinnedMesh[] = [];
  root.traverse((object) => {
    if (isThreeSkinnedMesh(object)) existingSkinned.push(object);
  });
  if (existingSkinned.length > 0) {
    const existingSkeleton = existingSkinned[0].skeleton;
    if (existingSkeleton?.bones.length) {
      return {
        ok: false,
        reason: 'already-skinned',
        message: 'This model already has a skeleton. Use Rig workspace to edit bones.',
      };
    }
  }

  const staticMeshes = collectStaticMeshes(root);
  if (staticMeshes.length === 0) {
    return {
      ok: false,
      reason: 'no-static-meshes',
      message: 'No static meshes are available to prepare for skinning.',
    };
  }

  const candidateReplacements = staticMeshes.map((mesh) => ({
    original: mesh,
    skinned: null as unknown as THREE.SkinnedMesh,
    parent: mesh.parent,
    index: mesh.parent?.children.indexOf(mesh) ?? -1,
    skinIndexBefore: mesh.geometry.getAttribute('skinIndex'),
    skinWeightBefore: mesh.geometry.getAttribute('skinWeight'),
  }));
  if (candidateReplacements.some((replacement) => !replacement.parent || replacement.index < 0)) {
    return {
      ok: false,
      reason: 'unparented-mesh',
      message: 'A static mesh is not attached to the loaded model root.',
    };
  }
  const replacements: StaticMeshSkinReplacement[] = candidateReplacements.map((replacement) => ({
    ...replacement,
    parent: replacement.parent!,
  }));

  for (const mesh of staticMeshes) {
    if (ensureSkinAttributes(mesh.geometry) <= 0) {
      return {
        ok: false,
        reason: 'empty-geometry',
        message: `Mesh "${mesh.name || 'unnamed'}" has no vertex positions to skin.`,
      };
    }
  }

  const requestedName = (options?.rootBoneName ?? DEFAULT_ROOT_BONE_NAME).trim() || DEFAULT_ROOT_BONE_NAME;
  const rootBone = new THREE.Bone();
  rootBone.name = requestedName;
  root.add(rootBone);
  rootBone.updateMatrixWorld(true);

  const skeleton = new THREE.Skeleton([rootBone]);
  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  for (const replacement of replacements) {
    const skinned = replaceWithSkinnedMesh(replacement.original, skeleton);
    replacement.skinned = skinned;
    skinnedMeshes.push(skinned);
  }

  skeleton.update();
  const preparation: StaticMeshSkinPreparation = {
    root,
    rootBone,
    skeleton,
    replacements,
  };
  return {
    ok: true,
    skeleton,
    skinnedMeshes,
    convertedCount: skinnedMeshes.length,
    rootBoneName: rootBone.name,
    preparation,
  };
}

export function countStaticMeshes(root: THREE.Object3D | null | undefined): number {
  if (!root) return 0;
  return collectStaticMeshes(root).length;
}
