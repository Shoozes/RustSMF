import * as THREE from 'three';
import { getSourceMaterials } from './materialPreview';
import { isThreeMesh, isThreeSkinnedMesh } from './threeTypeGuards';

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
  texture: THREE.Texture | null;
}

const unnamedCounts = new Map<string, number>();

const getFallbackName = (type: string): string => {
  const count = (unnamedCounts.get(type) ?? 0) + 1;
  unnamedCounts.set(type, count);
  return `${type || 'Object'} ${count}`;
};

const isMeshLike = (object: THREE.Object3D): object is THREE.Mesh | THREE.SkinnedMesh => {
  return isThreeMesh(object);
};

const isGroupLike = (object: THREE.Object3D): boolean => {
  return object.type === 'Group' || object.children.some((child) => isMeshLike(child));
};

export const getModelOutlinerItemKind = (object: THREE.Object3D): ModelOutlinerItemKind | null => {
  if (isThreeSkinnedMesh(object)) return 'skinnedMesh';
  if (isThreeMesh(object)) return 'mesh';
  if (isGroupLike(object)) return 'group';
  return null;
};

const getMaterialColor = (materials: THREE.Material[]): string | null => {
  const color = materials
    .map((item) => Reflect.get(item, 'color'))
    .find((value): value is THREE.Color => value instanceof THREE.Color);
  return color ? `#${color.getHexString()}` : null;
};

const getMaterialTexture = (materials: THREE.Material[]): THREE.Texture | null => {
  const texture = materials
    .map((item) => Reflect.get(item, 'map'))
    .find((value): value is THREE.Texture => value instanceof THREE.Texture);
  return texture ?? null;
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

    const kind = getModelOutlinerItemKind(object);
    if (!kind) return;

    const mesh = isMeshLike(object) ? object : null;
    const materials = mesh ? getSourceMaterials(mesh) : [];
    items.push({
      id: object.uuid,
      name: object.name || getFallbackName(object.type),
      kind,
      depth: getDepth(object, root),
      visible: object.visible,
      vertexCount: getVertexCount(object),
      materialCount: materials.length,
      color: getMaterialColor(materials),
      texture: getMaterialTexture(materials),
    });
  });

  return items;
};
