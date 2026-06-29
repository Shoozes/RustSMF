import * as THREE from 'three';
import type { SkinnedMesh, Material } from 'three';

import type { SmfDiagnostic, SmfDiagnosticLevel } from '../loaders/smfDiagnostics';

export interface TextureDiagnostic {
  level: SmfDiagnosticLevel;
  code: string;
  message: string;
  target?: string;
}

export interface TextureSummary {
  meshName: string;
  materialIndex: number;
  mapType: string;
  textureName: string;
  width: number | null;
  height: number | null;
  source: string;
  isPowerOfTwo: boolean | null;
}

interface MaterialTextureMap {
  materialIndex: number;
  mapType: string;
  texture: THREE.Texture;
}

const POT_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'lightMap', 'displacementMap', 'bumpMap'] as const;

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

function textureImageSize(texture: THREE.Texture): { width: number; height: number } | null {
  const image = texture.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | { width?: unknown; height?: unknown }
    | null
    | undefined;

  if (!image) return null;

  const width = Number((image as { width?: unknown }).width);
  const height = Number((image as { height?: unknown }).height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}

function textureImageSource(texture: THREE.Texture): string {
  const image = texture.image as Record<string, unknown> | null | undefined;

  const currentSrc = typeof image?.currentSrc === 'string' ? image.currentSrc : '';
  if (currentSrc) return currentSrc;

  const src = typeof image?.src === 'string' ? image.src : '';
  if (src) return src;

  const dataset = image?.dataset as { source?: unknown } | undefined;
  const datasetSource = typeof dataset?.source === 'string' ? dataset.source : '';
  if (datasetSource) return datasetSource;

  if (texture.source?.uuid) return `three-source:${texture.source.uuid}`;
  if (texture.uuid) return `three-texture:${texture.uuid}`;
  return 'runtime texture';
}

function textureDisplayName(texture: THREE.Texture): string {
  if (texture.name) return texture.name;
  return texture.uuid ? `Texture ${texture.uuid.slice(0, 8)}` : 'Texture';
}

function addDiagnostic(
  diagnostics: TextureDiagnostic[],
  level: SmfDiagnosticLevel,
  code: string,
  message: string,
  target?: string,
): void {
  diagnostics.push({ level, code, message, target });
}

function collectTextureMapsFromMaterial(material: Material, materialIndex: number): MaterialTextureMap[] {
  const maps: MaterialTextureMap[] = [];
  const source = material as unknown as Record<string, unknown>;

  POT_KEYS.forEach((key) => {
    const value = source[key];
    if (value instanceof THREE.Texture) {
      maps.push({ materialIndex, mapType: key, texture: value });
    }
  });

  return maps;
}

function dedupeTextureEntries(entries: MaterialTextureMap[]): MaterialTextureMap[] {
  const seen = new Set<string>();
  const out: MaterialTextureMap[] = [];
  for (const entry of entries) {
    const key = entry.texture.uuid;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

export function inspectMeshMaterialCompatibility(mesh: SkinnedMesh): TextureDiagnostic[] {
  const diagnostics: TextureDiagnostic[] = [];
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const meshName = mesh.name || 'mesh';

  if (materials.length > 1) {
    addDiagnostic(
      diagnostics,
      'warning',
      'SMF_MULTI_MATERIAL',
      `Mesh "${meshName}" has multiple materials; SMF export keeps no multi-slot material routing. Use GLB export for fidelity.`,
      meshName,
    );
  }

  const textureMaps: MaterialTextureMap[] = [];
  materials.forEach((material, materialIndex) => {
    if (!material) return;
    collectTextureMapsFromMaterial(material, materialIndex).forEach((entry) => {
      textureMaps.push(entry);
    });
  });

  const uniqueTextureMaps = dedupeTextureEntries(textureMaps);
  if (uniqueTextureMaps.length > 1) {
    addDiagnostic(
      diagnostics,
      'warning',
      'SMF_MULTI_TEXTURE',
      `Mesh "${meshName}" references multiple texture maps; texture-rich materials are not fully preserved in SMF export.`,
      meshName,
    );
  }

  for (const map of uniqueTextureMaps) {
    const size = textureImageSize(map.texture);
    if (!size) {
      addDiagnostic(
        diagnostics,
        'warning',
        'SMF_TEXTURE_SOURCE_UNAVAILABLE',
        `Material texture for "${meshName}" (${map.mapType}, material ${map.materialIndex}) has no readable image source in this runtime path.`,
        meshName,
      );
      continue;
    }

    if (!isPowerOfTwo(size.width) || !isPowerOfTwo(size.height)) {
      addDiagnostic(
        diagnostics,
        'warning',
        'SMF_NON_POT_TEXTURE',
        `Material texture on "${meshName}" (${size.width}x${size.height}) is non-power-of-two; SMF export compatibility may vary.`,
        meshName,
      );
    }
  }

  return diagnostics;
}

export function summarizeMeshTextures(mesh: SkinnedMesh): TextureSummary[] {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const meshName = mesh.name || 'mesh';
  const summaries: TextureSummary[] = [];

  materials.forEach((material, materialIndex) => {
    if (!material) return;
    collectTextureMapsFromMaterial(material, materialIndex).forEach((entry) => {
      const size = textureImageSize(entry.texture);
      summaries.push({
        meshName,
        materialIndex,
        mapType: entry.mapType,
        textureName: textureDisplayName(entry.texture),
        width: size?.width ?? null,
        height: size?.height ?? null,
        source: textureImageSource(entry.texture),
        isPowerOfTwo: size ? isPowerOfTwo(size.width) && isPowerOfTwo(size.height) : null,
      });
    });
  });

  return summaries;
}

export function toSmfDiagnosticList(
  meshDiagnostics: TextureDiagnostic[],
): SmfDiagnostic[] {
  return meshDiagnostics.map((item) => ({
    level: item.level,
    code: item.code,
    message: item.message,
    target: item.target,
  }));
}
