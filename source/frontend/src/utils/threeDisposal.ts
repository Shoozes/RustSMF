import * as THREE from 'three';

interface DisposableResource {
  dispose: () => void;
}

function isDisposableResource(value: unknown): value is DisposableResource {
  return typeof value === 'object'
    && value !== null
    && typeof Reflect.get(value, 'dispose') === 'function';
}

function getNodeMaterials(node: THREE.Object3D): THREE.Material[] {
  const value = Reflect.get(node, 'material');
  if (value instanceof THREE.Material) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((material): material is THREE.Material => material instanceof THREE.Material);
}

/**
 * disposeThreeObject: safe recursive dispose for three subtrees (geometries, materials, textures).
 * Used by viewport on model clear to avoid leaks. Extend as needed (e.g. for skeletons).
 */
export function disposeThreeObject(obj: THREE.Object3D | null | undefined) {
  if (!obj) return;
  const disposed = new Set<DisposableResource>();
  const disposeOnce = (resource: unknown): void => {
    if (!isDisposableResource(resource) || disposed.has(resource)) return;
    disposed.add(resource);
    resource.dispose();
  };

  obj.traverse((node) => {
    disposeOnce(Reflect.get(node, 'geometry'));
    disposeOnce(Reflect.get(node, 'skeleton'));

    getNodeMaterials(node).forEach((material) => {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) {
          disposeOnce(value);
        }
      }
      disposeOnce(material);
    });
  });
}

export default disposeThreeObject;
