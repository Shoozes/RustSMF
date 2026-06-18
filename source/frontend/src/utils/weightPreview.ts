import * as THREE from 'three';

type VertexColorMaterial = THREE.Material & { vertexColors?: boolean | undefined };

function getSkinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((child) => {
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
      meshes.push(child as THREE.SkinnedMesh);
    }
  });
  return meshes;
}

function toNumberArray(value: THREE.TypedArray | ArrayLike<number>): ArrayLike<number> {
  if (value instanceof Float32Array || value instanceof Float64Array || value instanceof Int8Array || value instanceof Int16Array || value instanceof Int32Array || value instanceof Uint8Array || value instanceof Uint8ClampedArray || value instanceof Uint16Array || value instanceof Uint32Array) {
    return value;
  }
  return value;
}

function readBoneWeightForVertex(
  skinIndexAttr: ArrayLike<number>,
  skinWeightAttr: ArrayLike<number>,
  vertexIndex: number,
  targetBoneIndex: number
): number {
  let maxWeight = 0;
  for (let slot = 0; slot < 4; slot++) {
    const boneIndex = skinIndexAttr[vertexIndex * 4 + slot];
    if (boneIndex === targetBoneIndex) {
      maxWeight = Math.max(maxWeight, skinWeightAttr[vertexIndex * 4 + slot]);
    }
  }
  return maxWeight;
}

function restoreMeshColorState(mesh: THREE.SkinnedMesh, geometry: THREE.BufferGeometry): void {
  const originalColorAttr = mesh.userData._origColorAttr as THREE.BufferAttribute | undefined;

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
    const vertexColorMaterial = material as VertexColorMaterial;
    vertexColorMaterial.vertexColors = false;
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
    restoreMeshColorState(mesh, mesh.geometry as THREE.BufferGeometry);
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
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const positionAttr = geometry.getAttribute('position');
    if (!positionAttr) {
      return;
    }

    const skinIndex = geometry.getAttribute('skinIndex') as THREE.BufferAttribute | null;
    const skinWeight = geometry.getAttribute('skinWeight') as THREE.BufferAttribute | null;
    if (!skinIndex || !skinWeight) {
      return;
    }

    const skinIndexArray = toNumberArray(skinIndex.array);
    const skinWeightArray = toNumberArray(skinWeight.array);
    const existingColor = geometry.getAttribute('color');

    if (!mesh.userData._origColorAttr && existingColor) {
      if ('clone' in existingColor) {
        mesh.userData._origColorAttr = existingColor.clone() as THREE.BufferAttribute;
      }
    }

    const colors = new Float32Array(positionAttr.count * 3);
    for (let vertexIndex = 0; vertexIndex < positionAttr.count; vertexIndex++) {
      const w = readBoneWeightForVertex(skinIndexArray, skinWeightArray, vertexIndex, boneIndex);
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
      const vertexColorMaterial = material as VertexColorMaterial;
      vertexColorMaterial.vertexColors = true;
      material.needsUpdate = true;
    });
  });
}
