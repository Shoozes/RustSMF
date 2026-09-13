import * as THREE from 'three';
import { isThreeMesh, isThreeSkinnedMesh } from './threeTypeGuards';
import {
  createResourceUrlRegistry,
  normalizeResourceName,
  resolveModelResource,
  type ModelResourceBundle,
  type ModelResourceFile,
} from './modelResourceBundle';

export type MaterialTextureSemantic = 'baseColor' | 'normal' | 'roughness' | 'metallic';

export interface ReferenceMaterialDefinition {
  name: string;
  color: [number, number, number];
  opacity: number;
  roughness: number;
  metallic: number;
  textures: Partial<Record<MaterialTextureSemantic, string>>;
}

export interface ReferenceMeshDescriptor {
  name: string;
  triangleVertexCount: number;
  materialNames: string[];
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

export interface ObjMaterialReference {
  materialLibrary: string;
  meshes: ReferenceMeshDescriptor[];
  materials: ReferenceMaterialDefinition[];
  warnings: string[];
}

export interface TargetMeshDescriptor {
  id: string;
  name: string;
  triangleVertexCount: number;
  materialSlotCount: number;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

export interface MaterialRepairAssignment {
  targetMeshId: string;
  targetMeshName: string;
  referenceMeshName: string;
  referenceMaterialNames: string[];
  method: 'name-and-geometry' | 'geometry';
}

export interface MaterialRepairDiagnostic {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  targetMesh?: string;
  referenceMesh?: string;
}

export interface MaterialRepairPlan {
  ok: boolean;
  assignments: MaterialRepairAssignment[];
  diagnostics: MaterialRepairDiagnostic[];
}

export interface PreparedMaterialRepair {
  plan: MaterialRepairPlan;
  replacements: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  textureSemantics: Array<{
    material: string;
    semantic: MaterialTextureSemantic;
    resource: string;
    colorSpace: 'srgb' | 'linear';
  }>;
}

interface MutableReferenceMesh {
  name: string;
  triangleVertexCount: number;
  materialNames: string[];
  min: THREE.Vector3;
  max: THREE.Vector3;
}

interface ProtectedModelFingerprint {
  bones: Array<{
    name: string;
    parent: string | null;
  }>;
  skinnedMeshes: Array<{
    name: string;
    geometryId: string;
    skeletonId: string;
    bindMatrix: number[];
    bindMatrixInverse: number[];
    boneInverseHashes: string[];
    skinIndexHash: string;
    skinWeightHash: string;
  }>;
  clips: Array<{
    name: string;
    duration: number;
    tracks: Array<{ name: string; times: string; values: string }>;
  }>;
}

const MAP_OPTION_ARITY: Readonly<Record<string, number>> = {
  '-blendu': 1,
  '-blendv': 1,
  '-boost': 1,
  '-mm': 2,
  '-o': 3,
  '-s': 3,
  '-t': 3,
  '-texres': 1,
  '-clamp': 1,
  '-bm': 1,
  '-imfchan': 1,
  '-type': 1,
};

function tokenizeMtlLine(value: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function mapFilename(value: string): string {
  const tokens = tokenizeMtlLine(value);
  let index = 0;
  while (index < tokens.length && tokens[index].startsWith('-')) {
    const arity = MAP_OPTION_ARITY[tokens[index].toLocaleLowerCase('en-US')];
    if (arity === undefined) {
      throw new Error(`Unsupported MTL texture option ${tokens[index]}.`);
    }
    index += 1 + arity;
  }
  const filename = tokens.slice(index).join(' ').trim();
  if (!filename) throw new Error('MTL texture map is missing a filename.');
  return filename;
}

function clamp01(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

function parseColor(value: string, fallback: [number, number, number]): [number, number, number] {
  const parts = value.trim().split(/\s+/).slice(0, 3).map(Number);
  return parts.length === 3 && parts.every(Number.isFinite)
    ? [clamp01(parts[0], fallback[0]), clamp01(parts[1], fallback[1]), clamp01(parts[2], fallback[2])]
    : fallback;
}

function setTextureReference(
  material: ReferenceMaterialDefinition,
  semantic: MaterialTextureSemantic,
  resource: string,
): void {
  const prior = material.textures[semantic];
  if (prior && normalizeResourceName(prior).toLocaleLowerCase('en-US') !== normalizeResourceName(resource).toLocaleLowerCase('en-US')) {
    throw new Error(`Material ${material.name} has conflicting ${semantic} maps: ${prior} and ${resource}.`);
  }
  material.textures[semantic] = resource;
}

function textureSemanticFromFilename(name: string): MaterialTextureSemantic | null {
  const stem = name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').toLocaleLowerCase('en-US');
  if (/(?:^|[_ .-])(basecolor|base_color|albedo|diffuse)(?:$|[_ .-])/.test(stem)) return 'baseColor';
  if (/(?:^|[_ .-])(normal|norm)(?:$|[_ .-])/.test(stem)) return 'normal';
  if (/(?:^|[_ .-])(roughness|rough)(?:$|[_ .-])/.test(stem)) return 'roughness';
  if (/(?:^|[_ .-])(metallic|metalness|metal)(?:$|[_ .-])/.test(stem)) return 'metallic';
  return null;
}

function inferMissingTextureReferences(
  materials: ReferenceMaterialDefinition[],
  availableResourceNames: readonly string[],
  warnings: string[],
): void {
  const candidates = new Map<MaterialTextureSemantic, string[]>();
  for (const name of availableResourceNames) {
    if (!/\.(?:jpe?g|png)$/i.test(name)) continue;
    const semantic = textureSemanticFromFilename(name);
    if (!semantic) continue;
    candidates.set(semantic, [...(candidates.get(semantic) ?? []), name]);
  }
  for (const material of materials) {
    for (const semantic of ['baseColor', 'normal', 'roughness', 'metallic'] as MaterialTextureSemantic[]) {
      if (material.textures[semantic]) continue;
      const matches = candidates.get(semantic) ?? [];
      if (matches.length > 1) {
        throw new Error(`Material ${material.name} has multiple inferred ${semantic} texture candidates: ${matches.join(', ')}.`);
      }
      if (matches.length === 1) {
        material.textures[semantic] = matches[0];
        warnings.push(`Inferred ${semantic} map ${matches[0]} for material ${material.name} from its filename.`);
      }
    }
  }
}

export function parseMtlMaterialDefinitions(
  text: string,
  availableResourceNames: readonly string[] = [],
): { materials: ReferenceMaterialDefinition[]; warnings: string[] } {
  const materials: ReferenceMaterialDefinition[] = [];
  const warnings: string[] = [];
  let current: ReferenceMaterialDefinition | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const space = line.search(/\s/);
    const command = (space < 0 ? line : line.slice(0, space)).toLocaleLowerCase('en-US');
    const value = space < 0 ? '' : line.slice(space + 1).trim();
    if (command === 'newmtl') {
      if (!value) throw new Error('MTL contains an empty material name.');
      if (materials.some((material) => material.name === value)) {
        throw new Error(`MTL contains duplicate material ${value}.`);
      }
      current = {
        name: value,
        color: [1, 1, 1],
        opacity: 1,
        roughness: 1,
        metallic: 0,
        textures: {},
      };
      materials.push(current);
      continue;
    }
    if (!current) continue;
    if (command === 'kd') current.color = parseColor(value, current.color);
    else if (command === 'd') current.opacity = clamp01(Number(value), current.opacity);
    else if (command === 'tr') current.opacity = 1 - clamp01(Number(value), 0);
    else if (command === 'pr') current.roughness = clamp01(Number(value), current.roughness);
    else if (command === 'pm') current.metallic = clamp01(Number(value), current.metallic);
    else if (command === 'ns' && Number.isFinite(Number(value))) {
      current.roughness = Math.sqrt(2 / (Math.max(0, Number(value)) + 2));
    } else if (command === 'map_kd') setTextureReference(current, 'baseColor', mapFilename(value));
    else if (command === 'map_bump' || command === 'bump' || command === 'norm') setTextureReference(current, 'normal', mapFilename(value));
    else if (command === 'map_pr' || command === 'map_ns') setTextureReference(current, 'roughness', mapFilename(value));
    else if (command === 'map_pm') setTextureReference(current, 'metallic', mapFilename(value));
  }

  if (materials.length === 0) throw new Error('MTL contains no material definitions.');
  inferMissingTextureReferences(materials, availableResourceNames, warnings);
  return { materials, warnings };
}

function parseObjIndex(token: string, vertexCount: number): number {
  const raw = Number(token.split('/')[0]);
  if (!Number.isInteger(raw) || raw === 0) throw new Error(`OBJ face contains invalid vertex index ${token}.`);
  const index = raw > 0 ? raw - 1 : vertexCount + raw;
  if (index < 0 || index >= vertexCount) throw new Error(`OBJ face vertex index ${raw} is out of range.`);
  return index;
}

export function parseObjReference(text: string): { materialLibrary: string; meshes: ReferenceMeshDescriptor[] } {
  const vertices: THREE.Vector3[] = [];
  const materialLibraries: string[] = [];
  const meshes: MutableReferenceMesh[] = [];
  let currentObject: MutableReferenceMesh | null = null;
  let currentMaterial = '';

  const ensureObject = (): MutableReferenceMesh => {
    if (!currentObject) {
      currentObject = {
        name: 'OBJ_Mesh',
        triangleVertexCount: 0,
        materialNames: [],
        min: new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
        max: new THREE.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY),
      };
      meshes.push(currentObject);
    }
    return currentObject;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^mtllib\s+/i.test(line)) {
      const name = line.replace(/^mtllib\s+/i, '').trim();
      if (name) materialLibraries.push(name);
      continue;
    }
    if (/^o\s+/i.test(line)) {
      const name = line.replace(/^o\s+/i, '').trim() || `OBJ_Mesh_${meshes.length}`;
      currentObject = {
        name,
        triangleVertexCount: 0,
        materialNames: [],
        min: new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
        max: new THREE.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY),
      };
      meshes.push(currentObject);
      continue;
    }
    if (/^v\s+/i.test(line)) {
      const values = line.replace(/^v\s+/i, '').trim().split(/\s+/).slice(0, 3).map(Number);
      if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
        throw new Error(`OBJ contains an invalid vertex line: ${line}.`);
      }
      vertices.push(new THREE.Vector3(values[0], values[1], values[2]));
      continue;
    }
    if (/^usemtl\s+/i.test(line)) {
      currentMaterial = line.replace(/^usemtl\s+/i, '').trim();
      if (!currentMaterial) throw new Error('OBJ contains an empty usemtl statement.');
      continue;
    }
    if (/^f\s+/i.test(line)) {
      const object = ensureObject();
      const face = line.replace(/^f\s+/i, '').trim().split(/\s+/);
      if (face.length < 3) throw new Error(`OBJ face contains fewer than three vertices: ${line}.`);
      const indexes = face.map((token) => parseObjIndex(token, vertices.length));
      object.triangleVertexCount += (indexes.length - 2) * 3;
      for (const index of indexes) {
        object.min.min(vertices[index]);
        object.max.max(vertices[index]);
      }
      if (currentMaterial && !object.materialNames.includes(currentMaterial)) object.materialNames.push(currentMaterial);
    }
  }

  const libraries = [...new Set(materialLibraries)];
  if (libraries.length !== 1) {
    throw new Error(libraries.length === 0
      ? 'OBJ does not reference an MTL material library.'
      : `OBJ references multiple MTL libraries: ${libraries.join(', ')}.`);
  }
  const nonEmptyMeshes = meshes.filter((mesh) => mesh.triangleVertexCount > 0);
  if (nonEmptyMeshes.length === 0) throw new Error('OBJ contains no triangle geometry.');
  return {
    materialLibrary: libraries[0],
    meshes: nonEmptyMeshes.map((mesh) => ({
      name: mesh.name,
      triangleVertexCount: mesh.triangleVertexCount,
      materialNames: mesh.materialNames,
      bounds: {
        min: mesh.min.toArray(),
        max: mesh.max.toArray(),
      },
    })),
  };
}

function resourceBasePath(name: string): string {
  const slash = name.lastIndexOf('/');
  return slash >= 0 ? name.slice(0, slash + 1) : '';
}

function resolveRelativeName(baseFile: string, reference: string): string {
  return normalizeResourceName(`${resourceBasePath(baseFile)}${reference}`);
}

export function parseObjMaterialReference(
  objText: string,
  mtlText: string,
  availableResourceNames: readonly string[] = [],
): ObjMaterialReference {
  const obj = parseObjReference(objText);
  const mtl = parseMtlMaterialDefinitions(mtlText, availableResourceNames);
  const defined = new Set(mtl.materials.map((material) => material.name));
  for (const mesh of obj.meshes) {
    if (mesh.materialNames.length === 0) {
      throw new Error(`Reference mesh ${mesh.name} has no usemtl assignment.`);
    }
    for (const materialName of mesh.materialNames) {
      if (!defined.has(materialName)) {
        throw new Error(`Reference mesh ${mesh.name} uses undefined material ${materialName}.`);
      }
    }
  }
  return {
    materialLibrary: obj.materialLibrary,
    meshes: obj.meshes,
    materials: mtl.materials,
    warnings: mtl.warnings,
  };
}

function meshMaterialSlotCount(mesh: THREE.Mesh): number {
  if (Array.isArray(mesh.material)) return mesh.material.length;
  if (mesh.geometry.groups.length > 0) {
    return new Set(mesh.geometry.groups.map((group) => group.materialIndex ?? 0)).size;
  }
  return 1;
}

function boundsForGeometry(geometry: THREE.BufferGeometry): { min: [number, number, number]; max: [number, number, number] } {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds || !bounds.min.toArray().every(Number.isFinite) || !bounds.max.toArray().every(Number.isFinite)) {
    throw new Error('Target mesh has invalid finite geometry bounds.');
  }
  return { min: bounds.min.toArray(), max: bounds.max.toArray() };
}

export function describeTargetMeshes(root: THREE.Object3D): TargetMeshDescriptor[] {
  const meshes: TargetMeshDescriptor[] = [];
  root.traverse((object) => {
    if (!isThreeMesh(object)) return;
    const position = object.geometry.getAttribute('position');
    if (!position) return;
    meshes.push({
      id: object.uuid,
      name: object.name || `mesh_${meshes.length}`,
      triangleVertexCount: object.geometry.index?.count ?? position.count,
      materialSlotCount: meshMaterialSlotCount(object),
      bounds: boundsForGeometry(object.geometry),
    });
  });
  return meshes;
}

function normalizedMeshName(name: string): string {
  return name.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '');
}

function sizeVector(bounds: TargetMeshDescriptor['bounds'] | ReferenceMeshDescriptor['bounds']): THREE.Vector3 {
  return new THREE.Vector3().fromArray(bounds.max).sub(new THREE.Vector3().fromArray(bounds.min));
}

function compatibleBounds(target: TargetMeshDescriptor, reference: ReferenceMeshDescriptor): boolean {
  const targetSize = sizeVector(target.bounds);
  const referenceSize = sizeVector(reference.bounds);
  for (const axis of ['x', 'y', 'z'] as const) {
    const scale = Math.max(Math.abs(targetSize[axis]), Math.abs(referenceSize[axis]), 1e-8);
    if (Math.abs(targetSize[axis] - referenceSize[axis]) / scale > 0.02) return false;
  }
  return true;
}

function compatibleSignature(target: TargetMeshDescriptor, reference: ReferenceMeshDescriptor): boolean {
  return target.triangleVertexCount === reference.triangleVertexCount
    && target.materialSlotCount === reference.materialNames.length
    && compatibleBounds(target, reference);
}

export function planMaterialRepair(
  targets: readonly TargetMeshDescriptor[],
  references: readonly ReferenceMeshDescriptor[],
): MaterialRepairPlan {
  const diagnostics: MaterialRepairDiagnostic[] = [];
  const assignments: MaterialRepairAssignment[] = [];
  const occupiedReferences = new Set<string>();
  if (targets.length === 0) {
    diagnostics.push({ level: 'error', code: 'MATERIAL_REPAIR_NO_TARGET_MESH', message: 'The rigged model contains no mesh geometry.' });
  }
  if (references.length === 0) {
    diagnostics.push({ level: 'error', code: 'MATERIAL_REPAIR_NO_REFERENCE_MESH', message: 'The OBJ reference contains no mesh geometry.' });
  }

  for (const target of targets) {
    const exactName = references.filter((reference) => (
      !occupiedReferences.has(reference.name)
      && normalizedMeshName(reference.name) === normalizedMeshName(target.name)
    ));
    let candidates = exactName;
    let method: MaterialRepairAssignment['method'] = 'name-and-geometry';
    if (exactName.length > 0 && exactName.every((reference) => !compatibleSignature(target, reference))) {
      diagnostics.push({
        level: 'error',
        code: 'MATERIAL_REPAIR_NAME_GEOMETRY_MISMATCH',
        message: `Name-matched reference ${exactName.map((item) => item.name).join(', ')} does not share ${target.name}'s triangle/material/bounds signature.`,
        targetMesh: target.name,
      });
      continue;
    }
    candidates = candidates.filter((reference) => compatibleSignature(target, reference));
    if (candidates.length === 0) {
      method = 'geometry';
      candidates = references.filter((reference) => (
        !occupiedReferences.has(reference.name) && compatibleSignature(target, reference)
      ));
    }
    if (candidates.length === 0) {
      diagnostics.push({
        level: 'error',
        code: 'MATERIAL_REPAIR_NO_MATCH',
        message: `No reference mesh uniquely matches ${target.name}'s triangle/material/bounds signature.`,
        targetMesh: target.name,
      });
      continue;
    }
    if (candidates.length > 1) {
      diagnostics.push({
        level: 'error',
        code: 'MATERIAL_REPAIR_AMBIGUOUS_MATCH',
        message: `Multiple reference meshes match ${target.name}: ${candidates.map((item) => item.name).join(', ')}.`,
        targetMesh: target.name,
      });
      continue;
    }
    const reference = candidates[0];
    occupiedReferences.add(reference.name);
    assignments.push({
      targetMeshId: target.id,
      targetMeshName: target.name,
      referenceMeshName: reference.name,
      referenceMaterialNames: reference.materialNames,
      method,
    });
    diagnostics.push({
      level: 'info',
      code: method === 'name-and-geometry' ? 'MATERIAL_REPAIR_MATCHED_NAME_GEOMETRY' : 'MATERIAL_REPAIR_MATCHED_GEOMETRY',
      message: `Matched ${target.name} to ${reference.name} by ${method === 'geometry' ? 'geometry signature' : 'name and geometry signature'}.`,
      targetMesh: target.name,
      referenceMesh: reference.name,
    });
  }

  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.level === 'error') && assignments.length === targets.length,
    assignments,
    diagnostics,
  };
}

function disposeMaterials(materials: Iterable<THREE.Material>): void {
  const textures = new Set<THREE.Texture>();
  for (const material of materials) {
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) {
      const texture = Reflect.get(material, key);
      if (texture instanceof THREE.Texture) textures.add(texture);
    }
    material.dispose();
  }
  textures.forEach((texture) => texture.dispose());
}

async function buildMaterial(
  definition: ReferenceMaterialDefinition,
  loadTexture?: (resource: string, semantic: MaterialTextureSemantic) => Promise<THREE.Texture>,
): Promise<THREE.MeshStandardMaterial> {
  const material = new THREE.MeshStandardMaterial({
    name: definition.name,
    color: new THREE.Color().fromArray(definition.color),
    opacity: definition.opacity,
    transparent: definition.opacity < 1,
    roughness: definition.roughness,
    metalness: definition.metallic,
  });
  try {
    if (!loadTexture) return material;
    const entries = Object.entries(definition.textures) as Array<[MaterialTextureSemantic, string]>;
    for (const [semantic, resource] of entries) {
      const texture = await loadTexture(resource, semantic);
      texture.colorSpace = semantic === 'baseColor' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.needsUpdate = true;
      if (semantic === 'baseColor') material.map = texture;
      else if (semantic === 'normal') material.normalMap = texture;
      else if (semantic === 'roughness') {
        material.roughnessMap = texture;
        material.roughness = 1;
      } else {
        material.metalnessMap = texture;
        material.metalness = 1;
      }
    }
    material.needsUpdate = true;
    return material;
  } catch (error) {
    disposeMaterials([material]);
    throw error;
  }
}

export async function prepareMaterialRepair(
  root: THREE.Object3D,
  reference: ObjMaterialReference,
  loadTexture?: (resource: string, semantic: MaterialTextureSemantic) => Promise<THREE.Texture>,
): Promise<PreparedMaterialRepair> {
  const plan = planMaterialRepair(describeTargetMeshes(root), reference.meshes);
  if (!plan.ok) {
    throw new Error(plan.diagnostics.filter((item) => item.level === 'error').map((item) => item.message).join(' '));
  }
  const materials = new Map(reference.materials.map((material) => [material.name, material]));
  const replacements = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const textureSemantics: PreparedMaterialRepair['textureSemantics'] = [];
  const loadedTextureCache = new Map<string, Promise<THREE.Texture>>();
  const createdMaterials = new Set<THREE.Material>();
  const cachedLoader = loadTexture
    ? (resource: string, semantic: MaterialTextureSemantic): Promise<THREE.Texture> => {
      const key = `${semantic}:${normalizeResourceName(resource).toLocaleLowerCase('en-US')}`;
      const existing = loadedTextureCache.get(key);
      if (existing) return existing;
      const next = loadTexture(resource, semantic);
      loadedTextureCache.set(key, next);
      return next;
    }
    : undefined;

  try {
    for (const assignment of plan.assignments) {
      const target = root.getObjectByProperty('uuid', assignment.targetMeshId);
      if (!target || !isThreeMesh(target)) throw new Error(`Target mesh ${assignment.targetMeshName} disappeared before material repair.`);
      const built: THREE.Material[] = [];
      for (const materialName of assignment.referenceMaterialNames) {
        const definition = materials.get(materialName);
        if (!definition) throw new Error(`Reference material ${materialName} is missing.`);
        const material = await buildMaterial(definition, cachedLoader);
        createdMaterials.add(material);
        built.push(material);
        for (const [semantic, resource] of Object.entries(definition.textures) as Array<[MaterialTextureSemantic, string]>) {
          textureSemantics.push({
            material: definition.name,
            semantic,
            resource,
            colorSpace: semantic === 'baseColor' ? 'srgb' : 'linear',
          });
        }
      }
      replacements.set(target, built.length === 1 ? built[0] : built);
    }
    return { plan, replacements, textureSemantics };
  } catch (error) {
    disposeMaterials(createdMaterials);
    throw error;
  }
}

export function applyPreparedMaterialRepair(prepared: PreparedMaterialRepair): void {
  for (const [mesh, replacement] of prepared.replacements) mesh.material = replacement;
}

export function disposePreparedMaterialRepair(prepared: PreparedMaterialRepair): void {
  disposeMaterials([...prepared.replacements.values()].flatMap((replacement) => (
    Array.isArray(replacement) ? replacement : [replacement]
  )));
}

function textOf(file: ModelResourceFile): string {
  return new TextDecoder().decode(file.data);
}

export async function prepareMaterialRepairFromBundle(
  root: THREE.Object3D,
  bundle: ModelResourceBundle,
): Promise<PreparedMaterialRepair> {
  if (!/\.obj$/i.test(bundle.primary.name)) throw new Error('Material repair reference must use an OBJ primary file.');
  const parsedObj = parseObjReference(textOf(bundle.primary));
  const mtlName = resolveRelativeName(bundle.primary.name, parsedObj.materialLibrary);
  const mtlFile = resolveModelResource(bundle, mtlName);
  if (!mtlFile) throw new Error(`OBJ material library ${parsedObj.materialLibrary} cannot be embedded.`);
  const reference = parseObjMaterialReference(
    textOf(bundle.primary),
    textOf(mtlFile),
    bundle.files.map((file) => file.name),
  );
  const registry = createResourceUrlRegistry(bundle);
  const loader = new THREE.TextureLoader();
  try {
    const prepared = await prepareMaterialRepair(root, reference, async (resource, semantic) => {
      const relative = resolveRelativeName(mtlFile.name, resource);
      const file = resolveModelResource(bundle, relative);
      if (!file) throw new Error(`Texture ${resource} cannot be embedded.`);
      const texture = await loader.loadAsync(registry.resolve(relative));
      texture.name = file.name;
      texture.userData = { ...texture.userData, sourceResource: file.name, semantic };
      texture.colorSpace = semantic === 'baseColor' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      // OBJ/MTL maps are loaded with the conventional TextureLoader Y flip.
      // Keep it explicit so browser repair and OBJ-to-glTF export agree.
      texture.flipY = true;
      return texture;
    });
    for (const warning of reference.warnings) {
      prepared.plan.diagnostics.push({ level: 'warning', code: 'MATERIAL_REPAIR_TEXTURE_INFERRED', message: warning });
    }
    return prepared;
  } finally {
    registry.dispose();
  }
}

function hashNumbers(values: Iterable<number>): string {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  let hash = 0x811c9dc5;
  for (const value of values) {
    view.setFloat64(0, value, true);
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

function attributeValues(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): number[] {
  const values: number[] = [];
  for (let index = 0; index < attribute.count; index += 1) {
    values.push(attribute.getX(index));
    if (attribute.itemSize > 1) values.push(attribute.getY(index));
    if (attribute.itemSize > 2) values.push(attribute.getZ(index));
    if (attribute.itemSize > 3) values.push(attribute.getW(index));
  }
  return values;
}

export function captureMaterialRepairFingerprint(
  root: THREE.Object3D,
  clips: readonly THREE.AnimationClip[],
): ProtectedModelFingerprint {
  const bones: ProtectedModelFingerprint['bones'] = [];
  const skinnedMeshes: ProtectedModelFingerprint['skinnedMeshes'] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Bone) {
      bones.push({
        name: object.name,
        parent: object.parent instanceof THREE.Bone ? object.parent.name : null,
      });
    }
    if (!isThreeSkinnedMesh(object)) return;
    const skinIndex = object.geometry.getAttribute('skinIndex');
    const skinWeight = object.geometry.getAttribute('skinWeight');
    if (!skinIndex || !skinWeight) throw new Error(`Skinned mesh ${object.name || '(unnamed)'} lacks skin attributes.`);
    skinnedMeshes.push({
      name: object.name,
      geometryId: object.geometry.uuid,
      skeletonId: object.skeleton.uuid,
      bindMatrix: object.bindMatrix.toArray(),
      bindMatrixInverse: object.bindMatrixInverse.toArray(),
      boneInverseHashes: object.skeleton.boneInverses.map((matrix) => hashNumbers(matrix.elements)),
      skinIndexHash: hashNumbers(attributeValues(skinIndex)),
      skinWeightHash: hashNumbers(attributeValues(skinWeight)),
    });
  });
  return {
    bones,
    skinnedMeshes,
    clips: clips.map((clip) => ({
      name: clip.name,
      duration: clip.duration,
      tracks: clip.tracks.map((track) => ({
        name: track.name,
        times: hashNumbers(track.times),
        values: hashNumbers(track.values),
      })),
    })),
  };
}

export function assertMaterialRepairPreservedModel(
  before: ProtectedModelFingerprint,
  root: THREE.Object3D,
  clips: readonly THREE.AnimationClip[],
): void {
  const after = captureMaterialRepairFingerprint(root, clips);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error('Material repair changed protected geometry, skin, skeleton, bind, or animation state.');
  }
}
