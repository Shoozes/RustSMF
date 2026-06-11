import * as THREE from 'three';

/**
 * disposeThreeObject: safe recursive dispose for three subtrees (geometries, materials, textures).
 * Used by viewport on model clear to avoid leaks. Extend as needed (e.g. for skeletons).
 */
export function disposeThreeObject(obj: THREE.Object3D | null | undefined) {
  if (!obj) return;
  obj.traverse((o: any) => {
    if (o.geometry) {
      o.geometry.dispose?.();
    }
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m: any) => {
        if (m.map) m.map.dispose?.();
        m.dispose?.();
      });
    }
  });
}

export default disposeThreeObject;
