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

type StaticMeshSkinCandidate = Omit<StaticMeshSkinReplacement, 'skinned'>;

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

function makeUniqueObjectName(root: THREE.Object3D, requestedName: string): string {
  const names = new Set<string>();
  root.traverse((object) => {
    if (object.name) names.add(object.name);
  });
  if (!names.has(requestedName)) return requestedName;

  let suffix = 2;
  while (names.has(`${requestedName}_${suffix}`)) suffix += 1;
  return `${requestedName}_${suffix}`;
}

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

  skinned.updateWorldMatrix(true, false);
  skinned.bind(skeleton, skinned.matrixWorld);
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
  preparation.root.updateWorldMatrix(true, true);
  for (const replacement of preparation.replacements) {
    const { original, skinned, parent, index } = replacement;
    if (original.parent) original.parent.remove(original);
    if (skinned.parent) skinned.parent.remove(skinned);
    ensureSkinAttributes(original.geometry);
    parent.add(skinned);
    parent.children.splice(parent.children.indexOf(skinned), 1);
    parent.children.splice(Math.min(index, parent.children.length), 0, skinned);
    skinned.parent = parent;
    skinned.updateWorldMatrix(true, false);
    skinned.bind(preparation.skeleton, skinned.matrixWorld);
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
    return {
      ok: false,
      reason: 'already-skinned',
      message: 'This model already contains skinned geometry. Validate or edit its existing rig instead.',
    };
  }

  const staticMeshes = collectStaticMeshes(root);
  if (staticMeshes.length === 0) {
    return {
      ok: false,
      reason: 'no-static-meshes',
      message: 'No static meshes are available to prepare for skinning.',
    };
  }

  const candidates: StaticMeshSkinCandidate[] = [];
  for (const mesh of staticMeshes) {
    const parent = mesh.parent;
    const index = parent?.children.indexOf(mesh) ?? -1;
    if (!parent || index < 0) {
      return {
        ok: false,
        reason: 'unparented-mesh',
        message: `Mesh "${mesh.name || 'unnamed'}" is not attached to the loaded model root.`,
      };
    }
    const position = mesh.geometry.getAttribute('position');
    if (!position || position.count <= 0) {
      return {
        ok: false,
        reason: 'empty-geometry',
        message: `Mesh "${mesh.name || 'unnamed'}" has no vertex positions to skin.`,
      };
    }
    candidates.push({
      original: mesh,
      parent,
      index,
      skinIndexBefore: mesh.geometry.getAttribute('skinIndex'),
      skinWeightBefore: mesh.geometry.getAttribute('skinWeight'),
    });
  }

  for (const mesh of staticMeshes) {
    ensureSkinAttributes(mesh.geometry);
  }

  const requestedName = (options?.rootBoneName ?? DEFAULT_ROOT_BONE_NAME).trim() || DEFAULT_ROOT_BONE_NAME;
  const rootBone = new THREE.Bone();
  rootBone.name = makeUniqueObjectName(root, requestedName);
  root.add(rootBone);
  root.updateWorldMatrix(true, true);

  const skeleton = new THREE.Skeleton([rootBone]);
  skeleton.calculateInverses();
  const replacements = candidates.map((candidate): StaticMeshSkinReplacement => ({
    ...candidate,
    skinned: replaceWithSkinnedMesh(candidate.original, skeleton),
  }));
  const skinnedMeshes = replacements.map((replacement) => replacement.skinned);

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
