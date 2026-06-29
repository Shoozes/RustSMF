import * as THREE from 'three';

export type ModelOutlinerItemKind = 'group' | 'mesh' | 'skinnedMesh';

export interface ModelOutlinerItem {
  id: string;
  name: string;
  kind: ModelOutlinerItemKind;
  depth: number;
  visible: boolean;
  vertexCount: number;
  materialCount: number;
  color: string | null;
}

const unnamedCounts = new Map<string, number>();

const getFallbackName = (type: string): string => {
  const count = (unnamedCounts.get(type) ?? 0) + 1;
  unnamedCounts.set(type, count);
  return `${type || 'Object'} ${count}`;
};

const isMeshLike = (object: THREE.Object3D): object is THREE.Mesh | THREE.SkinnedMesh => {
  return object.type === 'Mesh' || object.type === 'SkinnedMesh';
};

const isGroupLike = (object: THREE.Object3D): boolean => {
  return object.type === 'Group' || object.children.some((child) => isMeshLike(child));
};

const getItemKind = (object: THREE.Object3D): ModelOutlinerItemKind | null => {
  if (object.type === 'SkinnedMesh') return 'skinnedMesh';
  if (object.type === 'Mesh') return 'mesh';
  if (isGroupLike(object)) return 'group';
  return null;
};

const getMaterialList = (material: THREE.Material | THREE.Material[] | undefined): THREE.Material[] => {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
};

const getMaterialColor = (material: THREE.Material | THREE.Material[] | undefined): string | null => {
  const firstWithColor = getMaterialList(material).find((item) => {
    return item && 'color' in item && (item as THREE.MeshBasicMaterial).color instanceof THREE.Color;
  });
  if (!firstWithColor || !('color' in firstWithColor)) return null;
  return `#${(firstWithColor as THREE.MeshBasicMaterial).color.getHexString()}`;
};

const getVertexCount = (object: THREE.Object3D): number => {
  if (!isMeshLike(object)) return 0;
  const position = object.geometry?.getAttribute('position');
  return position?.count ?? 0;
};

const getDepth = (object: THREE.Object3D, root: THREE.Object3D): number => {
  let depth = 0;
  let cursor = object.parent;
  while (cursor && cursor !== root) {
    depth += 1;
    cursor = cursor.parent;
  }
  return depth;
};

export const collectModelOutlinerItems = (root: THREE.Object3D | null): ModelOutlinerItem[] => {
  if (!root) return [];

  unnamedCounts.clear();
  const items: ModelOutlinerItem[] = [];

  root.traverse((object) => {
    if (object === root) return;

    const kind = getItemKind(object);
    if (!kind) return;

    const mesh = isMeshLike(object) ? object : null;
    items.push({
      id: object.uuid,
      name: object.name || getFallbackName(object.type),
      kind,
      depth: getDepth(object, root),
      visible: object.visible,
      vertexCount: getVertexCount(object),
      materialCount: mesh ? getMaterialList(mesh.material).length : 0,
      color: mesh ? getMaterialColor(mesh.material) : null,
    });
  });

  return items;
};
