import * as THREE from 'three';

/**
 * Weight preview helpers (extracted from ThreeViewport for modularity).
 * Non-destructive: backups original color attr on first apply, restores on disable.
 * Used for selected bone skin influence viz (blue=0 -> red=full).
 * Called from viewport effect only; no public API change to ThreeViewport.
 */

export function restoreWeightPreview(attachedModel: THREE.Object3D | null): void {
  const meshes: any[] = [];
  if (attachedModel) {
    attachedModel.traverse((obj: any) => {
      if (obj.isSkinnedMesh) meshes.push(obj);
    });
  }
  meshes.forEach((mesh) => {
    const geo = mesh.geometry;
    if (!geo) return;
    const orig = (mesh as any)._origColorAttr;
    if (orig) {
      geo.setAttribute('color', orig);
      delete (mesh as any)._origColorAttr;
    } else if (geo.attributes.color) {
      geo.deleteAttribute('color');
    }
    if (mesh.material) {
      (mesh.material as any).vertexColors = false;
      (mesh.material as any).needsUpdate = true;
    }
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

  const boneIndex = skeleton.bones.findIndex((b: any) => b.name === selectedBoneName);
  if (boneIndex < 0) {
    restoreWeightPreview(attachedModel);
    return;
  }

  const meshes: any[] = [];
  if (attachedModel) {
    attachedModel.traverse((obj: any) => {
      if (obj.isSkinnedMesh) meshes.push(obj);
    });
  }

  meshes.forEach((mesh) => {
    const geo = mesh.geometry;
    if (!geo) return;
    const posAttr = geo.attributes.position;
    if (!posAttr) return;
    const count = posAttr.count;
    const skinIndices = geo.attributes.skinIndex?.array as any;
    const skinWeights = geo.attributes.skinWeight?.array as any;
    if (!skinIndices || !skinWeights) return;

    // backup original color once per mesh
    if (!(mesh as any)._origColorAttr && geo.attributes.color) {
      (mesh as any)._origColorAttr = geo.attributes.color.clone();
    }

    const colors = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) {
      let w = 0;
      for (let i = 0; i < 4; i++) {
        const idx = skinIndices[v * 4 + i];
        if (idx === boneIndex) {
          w = Math.max(w, skinWeights[v * 4 + i]);
        }
      }
      // blue (low) -> red (high)
      colors[v * 3 + 0] = w;     // r
      colors[v * 3 + 1] = 0;     // g
      colors[v * 3 + 2] = 1 - w; // b
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (mesh.material) {
      (mesh.material as any).vertexColors = true;
      (mesh.material as any).needsUpdate = true;
    }
  });
}
