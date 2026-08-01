import * as THREE from 'three';
import { isThreeSkinnedMesh } from './threeTypeGuards';
import { getSkinAttributes, readVertexSkinWeights } from './skinWeights';

type ColorAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

const WEIGHT_PREVIEW_BACKUP_KEY = '_weightPreviewBackup';

interface WeightPreviewBackup {
  colorAttribute: ColorAttribute | null;
  materialVertexColors: boolean[];
}

function isColorAttribute(value: unknown): value is ColorAttribute {
  return value instanceof THREE.BufferAttribute || value instanceof THREE.InterleavedBufferAttribute;
}

function getColorAttribute(geometry: THREE.BufferGeometry): ColorAttribute | null {
  const value = geometry.getAttribute('color');
  return isColorAttribute(value) ? value : null;
}

function getStoredBackup(mesh: THREE.SkinnedMesh): WeightPreviewBackup | undefined {
  const value = Reflect.get(mesh.userData, WEIGHT_PREVIEW_BACKUP_KEY);
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const colorAttribute = Reflect.get(value, 'colorAttribute');
  const materialVertexColors = Reflect.get(value, 'materialVertexColors');
  if (!Array.isArray(materialVertexColors) || materialVertexColors.some((enabled) => typeof enabled !== 'boolean')) {
    return undefined;
  }

  return {
    colorAttribute: isColorAttribute(colorAttribute) ? colorAttribute : null,
    materialVertexColors,
  };
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

function getMaterials(mesh: THREE.SkinnedMesh): THREE.Material[] {
  return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(
    (material): material is THREE.Material => Boolean(material),
  );
}

function restoreMeshColorState(mesh: THREE.SkinnedMesh, geometry: THREE.BufferGeometry): void {
  const backup = getStoredBackup(mesh);
  if (!backup) {
    return;
  }

  if (backup.colorAttribute) {
    geometry.setAttribute('color', backup.colorAttribute);
  } else {
    geometry.deleteAttribute('color');
  }

  getMaterials(mesh).forEach((material, index) => {
    setMaterialVertexColors(material, backup.materialVertexColors[index] ?? false);
    material.needsUpdate = true;
  });
  delete mesh.userData[WEIGHT_PREVIEW_BACKUP_KEY];
}

/**
 * Weight preview helpers (extracted from ThreeViewport for modularity).
 * Non-destructive: snapshots original color/material state on first apply and restores on disable.
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

    if (!getStoredBackup(mesh)) {
      Reflect.set(mesh.userData, WEIGHT_PREVIEW_BACKUP_KEY, {
        colorAttribute: getColorAttribute(geometry),
        materialVertexColors: getMaterials(mesh).map((material) => material.vertexColors),
      } satisfies WeightPreviewBackup);
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

    getMaterials(mesh).forEach((material) => {
      setMaterialVertexColors(material, true);
      material.needsUpdate = true;
    });
  });
}
