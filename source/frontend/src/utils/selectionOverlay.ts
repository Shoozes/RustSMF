import * as THREE from 'three';

export type SelectionOverlay = THREE.BoxHelper;

export function getSelectionOverlayTargetName(overlay: SelectionOverlay): string {
  const value = Reflect.get(overlay.userData, 'targetName');
  return typeof value === 'string' ? value : '';
}

export function createSelectionOverlays(
  root: THREE.Object3D | null,
  selectedObjectIds: readonly string[],
  color = 0x3399ff,
): SelectionOverlay[] {
  if (!root || selectedObjectIds.length === 0) return [];

  const uniqueIds = [...new Set(selectedObjectIds.filter(Boolean))];
  return uniqueIds.flatMap((id) => {
    const object = root.getObjectByProperty('uuid', id);
    if (!object || object.visible === false) return [];

    const helper = new THREE.BoxHelper(object, color);
    helper.name = `selection-overlay:${object.name || object.type || id}`;
    helper.renderOrder = 1000;
    helper.userData = {
      ...helper.userData,
      targetId: id,
      targetName: object.name || object.type || 'Object',
    };
    if (helper.material instanceof THREE.Material) {
      helper.material.depthTest = false;
      helper.material.transparent = true;
      helper.material.opacity = 0.85;
    }
    return [helper];
  });
}

export function updateSelectionOverlays(overlays: readonly SelectionOverlay[]): void {
  for (const overlay of overlays) {
    overlay.update();
  }
}

export function disposeSelectionOverlays(overlays: readonly SelectionOverlay[]): void {
  for (const overlay of overlays) {
    overlay.parent?.remove(overlay);
    overlay.geometry.dispose();
    if (Array.isArray(overlay.material)) {
      overlay.material.forEach((material) => material.dispose());
    } else {
      overlay.material.dispose();
    }
  }
}
