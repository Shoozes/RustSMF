import * as THREE from 'three';

type DisposableObject = THREE.Object3D & {
  geometry?: { dispose?: () => void };
  material?: THREE.Material | THREE.Material[];
};

/**
 * disposeThreeObject: safe recursive dispose for three subtrees (geometries, materials, textures).
 * Used by viewport on model clear to avoid leaks. Extend as needed (e.g. for skeletons).
 */
export function disposeThreeObject(obj: THREE.Object3D | null | undefined) {
  if (!obj) return;
  obj.traverse((node) => {
    const disposable = node as DisposableObject;
    if (disposable.geometry) {
      disposable.geometry.dispose?.();
    }
    if (disposable.material) {
      const mats = Array.isArray(disposable.material) ? disposable.material : [disposable.material];
      mats.forEach((material) => {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) {
            value.dispose();
          }
        }
        material.dispose();
      });
    }
  });
}

export default disposeThreeObject;
