import * as THREE from 'three';
import { isThreeMesh } from './threeTypeGuards';

export type TextureFilterPreview = 'source' | 'nearest' | 'linear';

export interface MaterialPreviewState {
  textureEnabled: boolean;
  modelOpacity: number;
  repeatTextures: boolean;
  textureFilter: TextureFilterPreview;
}

interface MeshSourceState {
  mesh: THREE.Mesh;
  material: THREE.Material | THREE.Material[];
  colorAttribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null;
  sourceMaterials: MaterialSourceState[];
}

interface MaterialSourceState {
  material: THREE.Material;
  map: THREE.Texture | null | undefined;
  hasMap: boolean;
  sourceMaps: Map<string, THREE.Texture | null | undefined>;
  opacity: number;
  transparent: boolean;
  vertexColors: boolean;
}

interface TextureSourceState {
  texture: THREE.Texture;
  wrapS: THREE.Wrapping;
  wrapT: THREE.Wrapping;
  magFilter: THREE.MagnificationTextureFilter;
  minFilter: THREE.MinificationTextureFilter;
}

interface RootMaterialState {
  meshes: MeshSourceState[];
  materials: MaterialSourceState[];
  textures: TextureSourceState[];
  preview: MaterialPreviewState;
}

const DEFAULT_PREVIEW_STATE: MaterialPreviewState = {
  textureEnabled: true,
  modelOpacity: 1,
  repeatTextures: false,
  textureFilter: 'source',
};

const TEXTURE_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'lightMap',
  'displacementMap',
  'bumpMap',
] as const;

const roots = new WeakMap<THREE.Object3D, RootMaterialState>();
const meshes = new WeakMap<THREE.Mesh, MeshSourceState>();
const sourceReaders = new WeakMap<RootMaterialState, { count: number; restore: () => void }>();

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function materialList(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material.filter(Boolean) : material ? [material] : [];
}

function materialMap(material: THREE.Material): { hasMap: boolean; map: THREE.Texture | null | undefined } {
  if (!('map' in material)) return { hasMap: false, map: undefined };
  const value = Reflect.get(material, 'map');
  return {
    hasMap: true,
    map: value instanceof THREE.Texture || value === null ? value : undefined,
  };
}

function setMaterialMap(material: THREE.Material, map: THREE.Texture | null | undefined): void {
  Reflect.set(material, 'map', map);
}

function collectTextures(material: THREE.Material): THREE.Texture[] {
  return TEXTURE_KEYS.flatMap((key) => {
    const value = Reflect.get(material, key);
    return value instanceof THREE.Texture ? [value] : [];
  });
}

function restoreSourceState(entry: RootMaterialState): void {
  entry.materials.forEach((source) => {
    if (source.hasMap) {
      setMaterialMap(source.material, source.map);
    }
    source.material.opacity = source.opacity;
    source.material.transparent = source.transparent;
    source.material.needsUpdate = true;
  });

  entry.textures.forEach((source) => {
    source.texture.wrapS = source.wrapS;
    source.texture.wrapT = source.wrapT;
    source.texture.magFilter = source.magFilter;
    source.texture.minFilter = source.minFilter;
    source.texture.needsUpdate = true;
  });
}

function restoreSourceAssignments(entry: RootMaterialState): void {
  entry.meshes.forEach((source) => {
    source.mesh.material = source.material;
  });
}

function restoreExportSourceState(entry: RootMaterialState): void {
  restoreSourceState(entry);
  entry.meshes.forEach((source) => {
    if (source.colorAttribute) {
      source.mesh.geometry.setAttribute('color', source.colorAttribute);
    } else {
      source.mesh.geometry.deleteAttribute('color');
    }
  });
  entry.materials.forEach((source) => {
    source.material.vertexColors = source.vertexColors;
    source.material.needsUpdate = true;
  });
}

function applyPreviewState(entry: RootMaterialState): void {
  restoreSourceState(entry);
  const opacityScale = clamp01(entry.preview.modelOpacity);

  entry.materials.forEach((source) => {
    if (source.hasMap) {
      setMaterialMap(source.material, entry.preview.textureEnabled
        ? source.map
        : null);
    }
    source.material.opacity = source.opacity * opacityScale;
    source.material.transparent = source.transparent || source.material.opacity < 1;
    source.material.needsUpdate = true;
  });

  entry.textures.forEach((source) => {
    if (entry.preview.repeatTextures) {
      source.texture.wrapS = THREE.RepeatWrapping;
      source.texture.wrapT = THREE.RepeatWrapping;
    }
    if (entry.preview.textureFilter === 'nearest') {
      source.texture.magFilter = THREE.NearestFilter;
      source.texture.minFilter = THREE.NearestFilter;
    } else if (entry.preview.textureFilter === 'linear') {
      source.texture.magFilter = THREE.LinearFilter;
      source.texture.minFilter = THREE.LinearFilter;
    }
    source.texture.needsUpdate = true;
  });
}

export function registerMaterialPreviewRoot(root: THREE.Object3D): void {
  if (roots.has(root)) return;

  const meshStates: MeshSourceState[] = [];
  const materialStates = new Map<string, MaterialSourceState>();
  const textureStates = new Map<string, TextureSourceState>();

  root.traverse((node) => {
    if (!isThreeMesh(node)) return;
    const mesh = node;
    const meshState: MeshSourceState = {
      mesh,
      material: mesh.material,
      colorAttribute: mesh.geometry.getAttribute('color') ?? null,
      sourceMaterials: [],
    };
    meshStates.push(meshState);
    meshes.set(mesh, meshState);

    materialList(mesh.material).forEach((material) => {
      let sourceState = materialStates.get(material.uuid);
      if (!sourceState) {
        const map = materialMap(material);
        sourceState = {
          material,
          map: map.map,
          hasMap: map.hasMap,
          sourceMaps: new Map(TEXTURE_KEYS.map((key) => [key, Reflect.get(material, key)])),
          opacity: material.opacity,
          transparent: material.transparent,
          vertexColors: material.vertexColors,
        };
        materialStates.set(material.uuid, sourceState);
      }
      meshState.sourceMaterials.push(sourceState);
      collectTextures(material).forEach((texture) => {
        if (!textureStates.has(texture.uuid)) {
          textureStates.set(texture.uuid, {
            texture,
            wrapS: texture.wrapS,
            wrapT: texture.wrapT,
            magFilter: texture.magFilter,
            minFilter: texture.minFilter,
          });
        }
      });
    });
  });

  roots.set(root, {
    meshes: meshStates,
    materials: [...materialStates.values()],
    textures: [...textureStates.values()],
    preview: { ...DEFAULT_PREVIEW_STATE },
  });
}

export function updateMaterialPreview(
  root: THREE.Object3D,
  preview: Partial<MaterialPreviewState>,
): void {
  const entry = roots.get(root);
  if (!entry) return;
  entry.preview = { ...entry.preview, ...preview };
  if (!sourceReaders.has(entry)) applyPreviewState(entry);
}

export function unregisterMaterialPreviewRoot(root: THREE.Object3D): void {
  const entry = roots.get(root);
  if (!entry) return;
  restoreExportSourceState(entry);
  restoreSourceAssignments(entry);
  entry.meshes.forEach(({ mesh }) => meshes.delete(mesh));
  roots.delete(root);
}

export function getSourceMaterials(mesh: THREE.Mesh): THREE.Material[] {
  const source = meshes.get(mesh);
  return materialList(source?.material ?? mesh.material);
}

export function getSourceMaterialAssignment(mesh: THREE.Mesh): THREE.Material | THREE.Material[] {
  return meshes.get(mesh)?.material ?? mesh.material;
}

export function withMaterialSourceMutation<T>(
  root: THREE.Object3D,
  operation: () => T,
): T {
  const entry = roots.get(root);
  if (!entry) return operation();
  const preview = { ...entry.preview };
  unregisterMaterialPreviewRoot(root);
  try {
    const result = operation();
    registerMaterialPreviewRoot(root);
    updateMaterialPreview(root, preview);
    return result;
  } catch (error) {
    registerMaterialPreviewRoot(root);
    updateMaterialPreview(root, preview);
    throw error;
  }
}

export interface SourceMaterialView {
  material: THREE.Material;
  sourceMaps: ReadonlyMap<string, THREE.Texture | null | undefined>;
}

export function getSourceMaterialViews(mesh: THREE.Mesh): SourceMaterialView[] {
  const source = meshes.get(mesh);
  if (!source) {
    return materialList(mesh.material).map((material) => ({
      material,
      sourceMaps: new Map<string, THREE.Texture | null | undefined>(),
    }));
  }
  return source.sourceMaterials.map(({ material, sourceMaps }) => ({ material, sourceMaps }));
}

function exposeSourceMaterialState(root: THREE.Object3D): () => void {
  const entry = roots.get(root);
  if (!entry) return () => {};
  const existing = sourceReaders.get(entry);
  const release = () => {
    const readers = sourceReaders.get(entry);
    if (!readers || --readers.count > 0) return;
    sourceReaders.delete(entry);
    readers.restore();
  };
  if (existing) {
    existing.count++;
    restoreExportSourceState(entry);
    restoreSourceAssignments(entry);
    return release;
  }

  const previewAssignments = entry.meshes.map(({ mesh }) => ({ mesh, material: mesh.material }));
  const previewColors = entry.meshes.map(({ mesh }) => ({
    mesh,
    colorAttribute: mesh.geometry.getAttribute('color') ?? null,
  }));
  const previewVertexColors = new Map<THREE.Material, boolean>();
  entry.materials.forEach(({ material }) => previewVertexColors.set(material, material.vertexColors));
  previewAssignments.forEach(({ material }) => {
    materialList(material).forEach((item) => previewVertexColors.set(item, item.vertexColors));
  });

  restoreExportSourceState(entry);
  restoreSourceAssignments(entry);
  sourceReaders.set(entry, { count: 1, restore: () => {
    if (roots.get(root) === entry) {
      applyPreviewState(entry);
      previewColors.forEach(({ mesh, colorAttribute }) => {
        if (colorAttribute) {
          mesh.geometry.setAttribute('color', colorAttribute);
        } else {
          mesh.geometry.deleteAttribute('color');
        }
      });
      previewVertexColors.forEach((vertexColors, material) => {
        material.vertexColors = vertexColors;
        material.needsUpdate = true;
      });
      previewAssignments.forEach(({ mesh, material }) => {
        mesh.material = material;
      });
    }
  } });
  return release;
}

/** Capture owned export inputs without leaving source materials exposed across an await. */
export function withSourceMaterialStateSync<T>(root: THREE.Object3D, operation: () => T): T {
  const restore = exposeSourceMaterialState(root);
  try { return operation(); } finally { restore(); }
}

export async function withSourceMaterialState<T>(
  root: THREE.Object3D,
  operation: () => Promise<T>,
): Promise<T> {
  const restore = exposeSourceMaterialState(root);
  try { return await operation(); } finally { restore(); }
}
