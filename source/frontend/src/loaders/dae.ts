import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { ensureGeometryAttributes } from './geometryAttributes';
import { disposeThreeObject } from '../utils/threeDisposal';
import { isThreeBone, isThreeMesh, isThreeSkinnedMesh } from '../utils/threeTypeGuards';
import { createResourceUrlRegistry, type ModelResourceBundle } from '../utils/modelResourceBundle';
import { withSourceMaterialState } from '../utils/materialPreview';
import {
  collectMaterialTextures,
  MODEL_TEXTURE_IMAGE_WAIT_MS,
  removeUnavailableMaterialTextures,
  waitForTextureImages,
} from '../utils/textureImageReadiness';

const DAE_TEXTURE_SLOTS = ['map'] as const;

export interface DaeLoadSummary {
  meshCount: number;
  skinnedMeshCount: number;
  boneCount: number;
  vertexCount: number;
  clipCount: number;
  textureMapCount: number;
  removedTextureMaps: number;
  primaryMeshName: string | null;
  notes: string[];
}

export interface DaeLoadedModel {
  root: THREE.Group;
  skeleton?: THREE.Skeleton;
  skinnedMeshes: THREE.SkinnedMesh[];
  clips: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
  summary: DaeLoadSummary;
}

function resourceBasePath(name: string): string {
  const slash = name.lastIndexOf('/');
  return slash >= 0 ? name.slice(0, slash + 1) : '';
}

/** Collada files may omit normals; compute them so shaded/skinned meshes remain visible. */
export function ensureDaeGeometryNormals(geometry: THREE.BufferGeometry): boolean {
  if (!geometry.getAttribute('position') || geometry.getAttribute('normal')) return false;
  geometry.computeVertexNormals();
  return true;
}

export async function loadDAE(
  urlOrBuffer: string | ArrayBuffer | ModelResourceBundle,
): Promise<DaeLoadedModel> {
  const isBundle = typeof urlOrBuffer === 'object' && !(urlOrBuffer instanceof ArrayBuffer);
  const bundle = isBundle ? urlOrBuffer as ModelResourceBundle : null;
  const registry = bundle && bundle.files.length > 1 ? createResourceUrlRegistry(bundle) : null;
  const manager = new THREE.LoadingManager();
  if (registry) manager.setURLModifier((url) => registry.resolve(url));
  const loader = new ColladaLoader(manager);
  let root: THREE.Group | null = null;
  try {
    const collada = typeof urlOrBuffer === 'string'
      ? await loader.loadAsync(urlOrBuffer)
      : loader.parse(
        new TextDecoder().decode(bundle ? bundle.primary.data : new Uint8Array(urlOrBuffer as ArrayBuffer)),
        bundle ? resourceBasePath(bundle.primary.name) : '',
      );
    if (!collada?.scene) throw new Error('Collada file did not contain a visual scene.');
    root = collada.scene as unknown as THREE.Group;
    root.name = 'DAE_Root';
    const textures = collectMaterialTextures(root, DAE_TEXTURE_SLOTS);
    await waitForTextureImages(textures, MODEL_TEXTURE_IMAGE_WAIT_MS);
    const { removed: removedTextureMaps } = removeUnavailableMaterialTextures(root, DAE_TEXTURE_SLOTS);
    const textureMapCount = collectMaterialTextures(root, DAE_TEXTURE_SLOTS).length;
    const skinnedMeshes: THREE.SkinnedMesh[] = [];
    let meshCount = 0;
    let vertexCount = 0;
    let boneCount = 0;
    let computedNormalCount = 0;
    root.traverse((object) => {
      if (isThreeBone(object)) boneCount += 1;
      if (!isThreeMesh(object)) return;
      meshCount += 1;
      const position = object.geometry.getAttribute('position');
      vertexCount += position?.count ?? 0;
      if (position && ensureDaeGeometryNormals(object.geometry)) computedNormalCount += 1;
      if (isThreeSkinnedMesh(object)) {
        ensureGeometryAttributes(object.geometry);
        skinnedMeshes.push(object);
      }
    });
    const clips = (collada.scene as THREE.Scene & { animations?: THREE.AnimationClip[] }).animations ?? [];
    const skeleton = skinnedMeshes[0]?.skeleton;
    const notes: string[] = [];
    if (meshCount === 0) notes.push('No mesh geometry was found in the Collada file.');
    if (computedNormalCount > 0) notes.push(`Computed vertex normals for ${computedNormalCount} Collada mesh${computedNormalCount === 1 ? '' : 'es'} that omitted them.`);
    if (meshCount > 0 && skinnedMeshes.length === 0) notes.push('Static mesh only; rig and weight-paint tools need a root skeleton first.');
    if (clips.length === 0 && skinnedMeshes.length > 0) notes.push('No animation clips were found in the Collada file.');
    if (removedTextureMaps > 0) {
      notes.push(`${removedTextureMaps} Collada texture map${removedTextureMaps === 1 ? '' : 's'} could not be loaded; geometry remains available with solid materials.`);
    }
    return {
      root,
      skeleton,
      skinnedMeshes,
      clips,
      mixer: new THREE.AnimationMixer(root),
      summary: { meshCount, skinnedMeshCount: skinnedMeshes.length, boneCount, vertexCount, clipCount: clips.length, textureMapCount, removedTextureMaps, primaryMeshName: root.getObjectByProperty('isMesh', true)?.name || null, notes },
    };
  } catch (error) {
    if (root) disposeThreeObject(root);
    throw error;
  } finally {
    registry?.dispose();
  }
}

const xmlEscape = (value: string): string => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character] as string));
const number = (value: number): string => Number.isFinite(value) ? `${Math.fround(value)}` : '0';
const numbers = (values: Iterable<number>): string => [...values].map(number).join(' ');
const rowMajorMatrix = (matrix: THREE.Matrix4): number[] => {
  const e = matrix.elements;
  return [e[0], e[4], e[8], e[12], e[1], e[5], e[9], e[13], e[2], e[6], e[10], e[14], e[3], e[7], e[11], e[15]];
};
const idFor = (prefix: string, value: string, used: Set<string>): string => {
  let base = `${prefix}-${value.replace(/[^A-Za-z0-9_-]/g, '_') || 'node'}`;
  if (!/^[A-Za-z_]/.test(base)) base = `_${base}`;
  let result = base; let suffix = 1;
  while (used.has(result)) result = `${base}-${suffix++}`;
  used.add(result); return result;
};

function attrValue(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, index: number, component: number): number {
  if (component === 0) return attribute.getX(index);
  if (component === 1) return attribute.getY(index);
  if (component === 2) return attribute.getZ(index);
  return attribute.getW(index);
}

function sourceBlock(id: string, values: Iterable<number>, count: number, stride: number, params: string): string {
  return `<source id="${id}"><float_array id="${id}-array" count="${count * stride}">${numbers(values)}</float_array><technique_common><accessor source="#${id}-array" count="${count}" stride="${stride}">${params}</accessor></technique_common></source>`;
}

function nameSourceBlock(id: string, values: string[]): string {
  return `<source id="${id}"><Name_array id="${id}-array" count="${values.length}">${values.map(xmlEscape).join(' ')}</Name_array><technique_common><accessor source="#${id}-array" count="${values.length}" stride="1"><param name="JOINT" type="Name"/></accessor></technique_common></source>`;
}

function geometryBlock(mesh: THREE.Mesh, geometryId: string, materialId: string): string {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  if (!position) throw new Error(`DAE export requires position data on ${mesh.name || 'unnamed mesh'}.`);
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const index = geometry.getIndex();
  const vertexCount = position.count;
  const positions = Array.from({ length: vertexCount }, (_, i) => [0, 1, 2].map(component => attrValue(position, i, component))).flat();
  const normals = normal ? Array.from({ length: vertexCount }, (_, i) => [0, 1, 2].map(component => attrValue(normal, i, component))).flat() : [];
  const uvs = uv ? Array.from({ length: vertexCount }, (_, i) => [attrValue(uv, i, 0), attrValue(uv, i, 1)]).flat() : [];
  const indices = index ? Array.from(index.array as ArrayLike<number>) : Array.from({ length: vertexCount }, (_, i) => i);
  if (indices.length % 3 !== 0) throw new Error(`DAE export requires triangle geometry on ${mesh.name || 'unnamed mesh'}.`);
  const inputs = ['<input semantic="VERTEX" source="#__VERTICES__" offset="0"/>'];
  if (normal) inputs.push(`<input semantic="NORMAL" source="#${geometryId}-normals" offset="${inputs.length}"/>`);
  if (uv) inputs.push(`<input semantic="TEXCOORD" source="#${geometryId}-uvs" offset="${inputs.length}" set="0"/>`);
  const p: number[] = [];
  indices.forEach((vertex) => inputs.forEach(() => p.push(vertex)));
  const params3 = '<param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>';
  const params2 = '<param name="S" type="float"/><param name="T" type="float"/>';
  const sources = sourceBlock(`${geometryId}-positions`, positions, vertexCount, 3, params3)
    + (normal ? sourceBlock(`${geometryId}-normals`, normals, vertexCount, 3, params3) : '')
    + (uv ? sourceBlock(`${geometryId}-uvs`, uvs, vertexCount, 2, params2) : '');
  const verticesId = `${geometryId}-vertices`;
  return `<geometry id="${geometryId}" name="${xmlEscape(mesh.name || geometryId)}"><mesh>${sources}<vertices id="${verticesId}"><input semantic="POSITION" source="#${geometryId}-positions"/></vertices><triangles count="${indices.length / 3}" material="${materialId}">${inputs.join('').replace('__VERTICES__', verticesId)}<p>${p.join(' ')}</p></triangles></mesh></geometry>`;
}

function materialBlocks(materialId: string, material: THREE.Material | THREE.Material[] | undefined): { material: string; effect: string } {
  const source = Array.isArray(material) ? material[0] : material;
  const color = source && 'color' in source && source.color instanceof THREE.Color ? source.color : new THREE.Color(0.7, 0.7, 0.7);
  const effectId = `${materialId}-effect`;
  return {
    effect: `<effect id="${effectId}"><profile_COMMON><technique sid="common"><lambert><diffuse><color>${numbers([color.r, color.g, color.b, 1])}</color></diffuse></lambert></technique></profile_COMMON></effect>`,
    material: `<material id="${materialId}" name="${materialId}"><instance_effect url="#${effectId}"/></material>`,
  };
}

function controllerBlock(mesh: THREE.SkinnedMesh, controllerId: string, geometryId: string, boneIds: Map<THREE.Object3D, string>): string {
  const skeleton = mesh.skeleton;
  const bones = skeleton.bones;
  const joints = bones.map((bone) => bone.name || boneIds.get(bone) || 'bone');
  if (new Set(joints).size !== joints.length) throw new Error(`DAE export requires unique joint names on ${mesh.name || 'unnamed mesh'}.`);
  const inverseBind = bones.flatMap((_, i) => rowMajorMatrix(skeleton.boneInverses[i] ?? new THREE.Matrix4()));
  const weightAttribute = mesh.geometry.getAttribute('skinWeight');
  const indexAttribute = mesh.geometry.getAttribute('skinIndex');
  if (!weightAttribute || !indexAttribute) throw new Error(`DAE export requires skin weights on ${mesh.name || 'unnamed mesh'}.`);
  const weights: number[] = [];
  const vertexPairs: number[] = [];
  const vcount: number[] = [];
  for (let vertex = 0; vertex < weightAttribute.count; vertex += 1) {
    let count = 0;
    for (let slot = 0; slot < Math.min(4, weightAttribute.itemSize); slot += 1) {
      const weight = attrValue(weightAttribute, vertex, slot);
      const joint = Math.trunc(attrValue(indexAttribute, vertex, slot));
      if (!Number.isFinite(weight) || weight <= 0 || joint < 0 || joint >= bones.length) continue;
      const weightIndex = weights.length; weights.push(weight); vertexPairs.push(joint, weightIndex); count += 1;
    }
    if (count === 0 && bones.length > 0) {
      const weightIndex = weights.length;
      weights.push(1);
      vertexPairs.push(0, weightIndex);
      count = 1;
    }
    vcount.push(count);
  }
  const params4 = '<param name="TRANSFORM" type="float4x4"/>';
  const params1 = '<param name="WEIGHT" type="float"/>';
  return `<controller id="${controllerId}" name="${xmlEscape(mesh.name || controllerId)}"><skin source="#${geometryId}"><bind_shape_matrix>${numbers(rowMajorMatrix(mesh.bindMatrix))}</bind_shape_matrix>${nameSourceBlock(`${controllerId}-joints`, joints)}${sourceBlock(`${controllerId}-bindposes`, inverseBind, bones.length, 16, params4)}${sourceBlock(`${controllerId}-weights`, weights, weights.length, 1, params1)}<joints><input semantic="JOINT" source="#${controllerId}-joints"/><input semantic="INV_BIND_MATRIX" source="#${controllerId}-bindposes"/></joints><vertex_weights count="${weightAttribute.count}"><input semantic="JOINT" source="#${controllerId}-joints" offset="0"/><input semantic="WEIGHT" source="#${controllerId}-weights" offset="1"/><vcount>${vcount.join(' ')}</vcount><v>${vertexPairs.join(' ')}</v></vertex_weights></skin></controller>`;
}

function visualNode(object: THREE.Object3D, ids: Map<THREE.Object3D, string>, geometryIds: Map<THREE.Object3D, string>, controllerIds: Map<THREE.Object3D, string>, materialIds: Map<THREE.Object3D, string>, rootBoneId: string | undefined): string {
  const id = ids.get(object)!;
  const type = isThreeBone(object) ? ' type="JOINT"' : '';
  const matrix = rowMajorMatrix(object.matrixAutoUpdate ? new THREE.Matrix4().compose(object.position, object.quaternion, object.scale) : object.matrix);
  const children = object.children.map((child) => visualNode(child, ids, geometryIds, controllerIds, materialIds, rootBoneId)).join('');
  let instance = '';
  if (isThreeSkinnedMesh(object)) instance = `<instance_controller url="#${controllerIds.get(object)}"><skeleton>#${rootBoneId || id}</skeleton><bind_material><technique_common><instance_material symbol="${materialIds.get(object)}" target="#${materialIds.get(object)}"/></technique_common></bind_material></instance_controller>`;
  else if (isThreeMesh(object)) instance = `<instance_geometry url="#${geometryIds.get(object)}"><bind_material><technique_common><instance_material symbol="${materialIds.get(object)}" target="#${materialIds.get(object)}"/></technique_common></bind_material></instance_geometry>`;
  return `<node id="${id}" name="${xmlEscape(object.name || id)}"${type}><matrix sid="transform">${numbers(matrix)}</matrix>${instance}${children}</node>`;
}

function animationBlocks(root: THREE.Group, clips: THREE.AnimationClip[], ids: Map<THREE.Object3D, string>): string {
  if (clips.length === 0) return '';
  const mixer = new THREE.AnimationMixer(root);
  return clips.map((clip, clipIndex) => {
    const nodes = new Map<THREE.Object3D, number[]>();
    clip.tracks.forEach((track) => {
      const object = THREE.PropertyBinding.findNode(root, THREE.PropertyBinding.parseTrackName(track.name).nodeName) as THREE.Object3D | undefined;
      if (!object) return;
      const times = nodes.get(object) ?? [0]; track.times.forEach((time) => times.push(time)); nodes.set(object, times);
    });
    const action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    const blocks = [...nodes.entries()].map(([object, times]) => {
      const uniqueTimes = [...new Set(times)].sort((a, b) => a - b); mixer.setTime(0);
      const values: number[] = [];
      uniqueTimes.forEach((time) => { mixer.setTime(time); object.updateMatrix(); values.push(...rowMajorMatrix(object.matrix)); });
      const base = `dae-anim-${clipIndex}-${ids.get(object)}`;
      const params = Array.from({ length: 16 }, (_, i) => `<param name="m${i}" type="float"/>`).join('');
      return `<animation id="${base}">${sourceBlock(`${base}-input`, uniqueTimes, uniqueTimes.length, 1, '<param name="TIME" type="float"/>')}${sourceBlock(`${base}-output`, values, uniqueTimes.length, 16, params)}<sampler id="${base}-sampler"><input semantic="INPUT" source="#${base}-input"/><input semantic="OUTPUT" source="#${base}-output"/></sampler><channel source="#${base}-sampler" target="${ids.get(object)}/transform"/></animation>`;
    }).join('');
    action.stop();
    return blocks;
  }).join('');
}

export async function exportDAE(root: THREE.Group, clips: THREE.AnimationClip[] = []): Promise<Uint8Array> {
  return withSourceMaterialState(root, async () => {
    const used = new Set<string>(); const ids = new Map<THREE.Object3D, string>(); const geometryIds = new Map<THREE.Object3D, string>(); const controllerIds = new Map<THREE.Object3D, string>(); const materialIds = new Map<THREE.Object3D, string>();
    const meshes: THREE.Mesh[] = []; const skinnedMeshes: THREE.SkinnedMesh[] = []; const materials = new Map<string, { material: string; effect: string }>();
    root.traverse((object) => { ids.set(object, idFor('node', object.name || object.uuid, used)); if (isThreeMesh(object)) { meshes.push(object); geometryIds.set(object, idFor('geom', object.uuid, used)); const materialId = idFor('mat', (Array.isArray(object.material) ? object.material[0] : object.material)?.name || object.uuid, used); materialIds.set(object, materialId); if (!materials.has(materialId)) materials.set(materialId, materialBlocks(materialId, object.material)); if (isThreeSkinnedMesh(object)) { skinnedMeshes.push(object); controllerIds.set(object, idFor('ctrl', object.uuid, used)); } } });
    const rootBone = skinnedMeshes[0]?.skeleton.bones.find((bone) => !bone.parent || !isThreeBone(bone.parent));
    const geometries = meshes.map((mesh) => geometryBlock(mesh, geometryIds.get(mesh)!, materialIds.get(mesh)!)).join('');
    const controllers = skinnedMeshes.map((mesh) => controllerBlock(mesh, controllerIds.get(mesh)!, geometryIds.get(mesh)!, ids)).join('');
    const dae = `<?xml version="1.0" encoding="utf-8"?><COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"><asset><contributor><authoring_tool>RustSMF</authoring_tool></contributor><unit name="meter" meter="1"/><up_axis>Y_UP</up_axis></asset><library_effects>${[...materials.values()].map((value) => value.effect).join('')}</library_effects><library_materials>${[...materials.values()].map((value) => value.material).join('')}</library_materials><library_geometries>${geometries}</library_geometries><library_controllers>${controllers}</library_controllers><library_animations>${animationBlocks(root, clips, ids)}</library_animations><library_visual_scenes><visual_scene id="scene" name="RustSMF">${visualNode(root, ids, geometryIds, controllerIds, materialIds, rootBone ? ids.get(rootBone) : undefined)}</visual_scene></library_visual_scenes><scene><instance_visual_scene url="#scene"/></scene></COLLADA>`;
    return new TextEncoder().encode(dae);
  });
}

export async function validateExportedDAE(bytes: Uint8Array, sourceRoot: THREE.Group, sourceClips: THREE.AnimationClip[] = []): Promise<DaeLoadSummary> {
  if (bytes.byteLength === 0 || !new TextDecoder().decode(bytes).includes('<COLLADA')) throw new Error('DAE roundtrip validation failed: COLLADA root is missing.');
  const copy = new Uint8Array(bytes.byteLength); copy.set(bytes);
  const loaded = await loadDAE(copy.buffer);
  try {
    const expectedMeshes: THREE.Object3D[] = []; sourceRoot.traverse((object) => { if (isThreeMesh(object)) expectedMeshes.push(object); });
    if (loaded.summary.meshCount !== expectedMeshes.length) throw new Error(`DAE roundtrip validation failed: mesh count changed from ${expectedMeshes.length} to ${loaded.summary.meshCount}.`);
    if (sourceClips.length > 0 && loaded.clips.length === 0) throw new Error('DAE roundtrip validation failed: animation clips were dropped.');
    return loaded.summary;
  } finally { loaded.mixer.stopAllAction(); disposeThreeObject(loaded.root); }
}
