import * as THREE from 'three';
import { createLegacySmfMaterial } from './legacySmfLighting';
import {
  registerMaterialPreviewRoot,
  unregisterMaterialPreviewRoot,
  updateMaterialPreview,
  type MaterialPreviewState,
} from './materialPreview';

type MaterialWithMap = THREE.Material & { map?: THREE.Texture | null };

type MeshMaterialEntry = {
  mesh: THREE.Mesh;
  materials: THREE.Material[];
  materialWasArray: boolean;
};

const isMaterialWithMap = (material: THREE.Material): material is MaterialWithMap => 'map' in material;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Owns viewport-only material substitutions while source materials remain export-safe. */
export interface ViewportDisplayController {
  captureRoot(root: THREE.Object3D): void;
  updatePreview(preview: Partial<MaterialPreviewState>): void;
  setTextureEnabled(enabled: boolean): void;
  setShaderEnabled(enabled: boolean, textureEnabled: boolean, modelOpacity: number): void;
  setModelOpacity(value: number): void;
  detachRoot(root: THREE.Object3D | null): void;
  dispose(): void;
}

export function createViewportDisplayController(): ViewportDisplayController {
  let root: THREE.Object3D | null = null;
  const meshMaterials = new Map<string, MeshMaterialEntry>();
  const textureBackup = new Map<string, THREE.Texture | null>();
  const opacityBackup = new Map<string, number>();
  const transparentBackup = new Map<string, boolean>();
  const legacyMaterials = new Map<string, THREE.Material>();

  const disposeLegacyMaterials = (): void => {
    legacyMaterials.forEach((material) => material.dispose());
    legacyMaterials.clear();
  };

  const restoreSourceAssignments = (): void => {
    meshMaterials.forEach(({ mesh, materials, materialWasArray }) => {
      if (materials.length > 0) mesh.material = materialWasArray ? [...materials] : materials[0];
    });
  };

  const applyTextureToMaterial = (
    material: THREE.Material,
    sourceMaterialUuid: string,
    enabled: boolean,
  ): void => {
    if (!isMaterialWithMap(material)) return;
    const map = textureBackup.get(sourceMaterialUuid);
    if (typeof map === 'undefined') return;
    material.map = enabled ? map : null;
    material.needsUpdate = true;
  };

  const applyTextureToLegacyMaterials = (enabled: boolean): void => {
    meshMaterials.forEach(({ materials }) => {
      materials.forEach((material) => {
        const legacy = legacyMaterials.get(material.uuid);
        if (legacy) applyTextureToMaterial(legacy, material.uuid, enabled);
      });
    });
  };

  const applyOpacityToMaterial = (
    material: THREE.Material,
    sourceMaterialUuid: string,
    opacity: number,
  ): void => {
    const defaultOpacity = opacityBackup.get(sourceMaterialUuid);
    if (typeof defaultOpacity === 'undefined') return;
    material.opacity = defaultOpacity * opacity;
    material.transparent = material.opacity < 1
      ? true
      : (transparentBackup.get(sourceMaterialUuid) ?? false);
    material.needsUpdate = true;
  };

  const applyOpacityToLegacyMaterials = (value: number): void => {
    const opacity = clamp01(value);
    meshMaterials.forEach(({ materials }) => {
      materials.forEach((material) => {
        const legacy = legacyMaterials.get(material.uuid);
        if (legacy) applyOpacityToMaterial(legacy, material.uuid, opacity);
      });
    });
  };

  const updateSourcePreview = (preview: Partial<MaterialPreviewState>): void => {
    if (root) updateMaterialPreview(root, preview);
  };

  const clearCapturedState = (): void => {
    meshMaterials.clear();
    textureBackup.clear();
    opacityBackup.clear();
    transparentBackup.clear();
  };

  return {
    captureRoot(nextRoot) {
      if (root && root !== nextRoot) {
        restoreSourceAssignments();
        disposeLegacyMaterials();
        unregisterMaterialPreviewRoot(root);
      }
      root = nextRoot;
      registerMaterialPreviewRoot(nextRoot);
      clearCapturedState();
      nextRoot.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materialWasArray = Array.isArray(object.material);
        const materials: THREE.Material[] = materialWasArray
          ? object.material.filter((material: THREE.Material): material is THREE.Material => !!material)
          : [object.material];
        if (materials.length === 0) return;
        meshMaterials.set(object.uuid, { mesh: object, materials, materialWasArray });
        materials.forEach((material) => {
          if (textureBackup.has(material.uuid)) return;
          textureBackup.set(material.uuid, isMaterialWithMap(material) ? material.map ?? null : null);
          opacityBackup.set(material.uuid, material.opacity);
          transparentBackup.set(material.uuid, material.transparent);
        });
      });
    },

    updatePreview(preview) {
      updateSourcePreview(preview);
    },

    setTextureEnabled(enabled) {
      updateSourcePreview({ textureEnabled: enabled });
      applyTextureToLegacyMaterials(enabled);
    },

    setShaderEnabled(enabled, textureEnabled, modelOpacity) {
      if (!enabled) {
        restoreSourceAssignments();
        disposeLegacyMaterials();
        updateSourcePreview({ textureEnabled, modelOpacity });
        return;
      }

      meshMaterials.forEach(({ mesh, materials, materialWasArray }) => {
        const displayMaterials = materials.map((source) => {
          let legacy = legacyMaterials.get(source.uuid);
          if (!legacy) {
            legacy = createLegacySmfMaterial(source, {
              mapEnabled: textureEnabled,
              opacity: clamp01(modelOpacity),
            });
            legacyMaterials.set(source.uuid, legacy);
          }
          return legacy;
        });
        mesh.material = materialWasArray ? displayMaterials : displayMaterials[0];
      });
      updateSourcePreview({ textureEnabled, modelOpacity });
      applyTextureToLegacyMaterials(textureEnabled);
      applyOpacityToLegacyMaterials(modelOpacity);
    },

    setModelOpacity(value) {
      const opacity = clamp01(value);
      updateSourcePreview({ modelOpacity: opacity });
      applyOpacityToLegacyMaterials(opacity);
    },

    detachRoot(targetRoot) {
      if (!targetRoot || targetRoot !== root) return;
      restoreSourceAssignments();
      disposeLegacyMaterials();
      unregisterMaterialPreviewRoot(targetRoot);
      clearCapturedState();
      root = null;
    },

    dispose() {
      if (root) {
        restoreSourceAssignments();
        disposeLegacyMaterials();
        unregisterMaterialPreviewRoot(root);
      } else {
        disposeLegacyMaterials();
      }
      clearCapturedState();
      root = null;
    },
  };
}
