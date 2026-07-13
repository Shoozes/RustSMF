import * as THREE from 'three';
import { isThreeSkinnedMesh } from './threeTypeGuards';
import { getSkinAttributes, readVertexSkinWeights } from './skinWeights';

type ColorAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

function getStoredColorAttribute(mesh: THREE.SkinnedMesh): ColorAttribute | undefined {
  const value = Reflect.get(mesh.userData, '_origColorAttr');
  return value instanceof THREE.BufferAttribute || value instanceof THREE.InterleavedBufferAttribute
    ? value
    : undefined;
}

function setMaterialVertexColors(material: THREE.Material, enabled: boolean): void {
  Reflect.set(material, 'vertexColors', enabled);
}

function getSkinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((child) => {
    if (isThreeSkinnedMesh(child)) meshes.push(child);
  });
  return meshes;
}

function restoreMeshColorState(mesh: THREE.SkinnedMesh, geometry: THREE.BufferGeometry): void {
  const originalColorAttr = getStoredColorAttribute(mesh);

  if (originalColorAttr) {
    geometry.setAttribute('color', originalColorAttr);
    delete mesh.userData._origColorAttr;
  } else if (geometry.getAttribute('color')) {
    geometry.deleteAttribute('color');
  }

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => {
    if (!material) {
      return;
    }
    setMaterialVertexColors(material, false);
    material.needsUpdate = true;
  });
}

/**
 * Weight preview helpers (extracted from ThreeViewport for modularity).
 * Non-destructive: backups original color attr on first apply, restores on disable.
 * Used for selected bone skin influence viz (blue=0 -> red=full).
 * Called from viewport effect only; no public API change to ThreeViewport.
 */

export function restoreWeightPreview(attachedModel: THREE.Object3D | null): void {
  if (!attachedModel) {
    return;
  }

  const meshes = getSkinnedMeshes(attachedModel);
  meshes.forEach((mesh) => {
    restoreMeshColorState(mesh, mesh.geometry);
  });
}

export function applyWeightPreviewForBone(
  attachedModel: THREE.Object3D | null,
  selectedBoneName: string,
  skeleton: THREE.Skeleton | undefined
): void {
  if (!selectedBoneName || !skeleton) {
    restoreWeightPreview(attachedModel);
    return;
  }

  const boneIndex = skeleton.bones.findIndex((bone) => bone.name === selectedBoneName);
  if (boneIndex < 0) {
    restoreWeightPreview(attachedModel);
    return;
  }

  if (!attachedModel) {
    return;
  }

  const meshes = getSkinnedMeshes(attachedModel);
  meshes.forEach((mesh) => {
    const geometry = mesh.geometry;
    const positionAttr = geometry.getAttribute('position');
    if (!positionAttr) {
      return;
    }

    const skinAttributes = getSkinAttributes(geometry);
    if (!skinAttributes) {
      return;
    }

    const existingColor = geometry.getAttribute('color');

    if (!mesh.userData._origColorAttr && existingColor) {
      if ('clone' in existingColor) {
        mesh.userData._origColorAttr = existingColor.clone();
      }
    }

    const colors = new Float32Array(positionAttr.count * 3);
    for (let vertexIndex = 0; vertexIndex < positionAttr.count; vertexIndex++) {
      const weights = readVertexSkinWeights(skinAttributes, vertexIndex);
      const w = weights
        ? weights.weights.reduce((maxWeight, weight, slot) => (
          weights.indices[slot] === boneIndex ? Math.max(maxWeight, weight) : maxWeight
        ), 0)
        : 0;
      colors[vertexIndex * 3 + 0] = w;
      colors[vertexIndex * 3 + 1] = 0;
      colors[vertexIndex * 3 + 2] = 1 - w;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (!material) {
        return;
      }
      setMaterialVertexColors(material, true);
      material.needsUpdate = true;
    });
  });
}
