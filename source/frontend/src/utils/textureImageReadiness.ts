import * as THREE from 'three';
import { isThreeMesh } from './threeTypeGuards';

export const MODEL_TEXTURE_IMAGE_WAIT_MS = 2000;

type LoadableTextureImage = {
  complete?: boolean;
  naturalWidth?: number;
  naturalHeight?: number;
  width?: number;
  height?: number;
  addEventListener?: (type: string, listener: () => void, options?: { once?: boolean }) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

export function collectMaterialTextures(
  root: THREE.Object3D,
  slots: readonly string[],
): THREE.Texture[] {
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!isThreeMesh(object)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const slot of slots) {
        const texture = Reflect.get(material, slot);
        if (texture instanceof THREE.Texture) textures.add(texture);
      }
    }
  });
  return [...textures];
}

export function hasUsableTextureImage(texture: THREE.Texture): boolean {
  const image = texture.image as LoadableTextureImage | undefined;
  if (!image) return false;

  if (typeof image.naturalWidth === 'number' || typeof image.naturalHeight === 'number') {
    return image.naturalWidth !== undefined
      && image.naturalHeight !== undefined
      && image.naturalWidth > 0
      && image.naturalHeight > 0;
  }

  return typeof image.width === 'number'
    && typeof image.height === 'number'
    && image.width > 0
    && image.height > 0;
}

async function waitForTextureImage(texture: THREE.Texture, timeoutMs: number): Promise<void> {
  const image = texture.image as LoadableTextureImage | undefined;
  if (
    !image
    || hasUsableTextureImage(texture)
    || image.complete === true
    || typeof image.addEventListener !== 'function'
  ) return;

  await new Promise<void>((resolve) => {
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      image.removeEventListener?.('load', settle);
      image.removeEventListener?.('error', settle);
      resolve();
    };

    const timeoutId = setTimeout(settle, timeoutMs);
    image.addEventListener?.('load', settle, { once: true });
    image.addEventListener?.('error', settle, { once: true });
    if (hasUsableTextureImage(texture) || image.complete === true) settle();
  });
}

export async function waitForTextureImages(
  textures: readonly THREE.Texture[],
  timeoutMs = MODEL_TEXTURE_IMAGE_WAIT_MS,
): Promise<void> {
  const boundedTimeout = Number.isFinite(timeoutMs)
    ? Math.max(0, timeoutMs)
    : MODEL_TEXTURE_IMAGE_WAIT_MS;
  await Promise.all([...new Set(textures)].map((texture) => waitForTextureImage(texture, boundedTimeout)));
}

export function removeUnavailableMaterialTextures(
  root: THREE.Object3D,
  slots: readonly string[],
): { removed: number; changedMaterials: THREE.Material[] } {
  let removed = 0;
  const changedMaterials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!isThreeMesh(object)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      let changed = false;
      for (const slot of slots) {
        const texture = Reflect.get(material, slot);
        if (!(texture instanceof THREE.Texture) || hasUsableTextureImage(texture)) continue;
        texture.dispose();
        Reflect.set(material, slot, null);
        removed += 1;
        changed = true;
      }
      if (changed) {
        material.needsUpdate = true;
        changedMaterials.add(material);
      }
    }
  });
  return { removed, changedMaterials: [...changedMaterials] };
}
