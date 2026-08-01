import * as THREE from 'three';
import type { ImportedSmf } from './smf';
import { threeMatrixToSmf, dqCreateFromMatrix, dqNegate } from './coord';
import { cloneImportedSmf } from './smfData';
import {
  makeDiagnosticReport,
  pushDiagnostic,
  type SmfDiagnostic,
  type SmfDiagnosticReport,
} from './smfDiagnostics';
import { inspectMeshMaterialCompatibility, summarizeMeshTextures, toSmfDiagnosticList } from '../utils/textureCompat';

/**
 * Converts Three.js skinned scene data to an ImportedSmf structure for SMF export.
 * Core of the SMF export path for non-SMF sources (GLB/FBX loaded models).
 * Guards against unsupported cases (no skeleton, scale animation, static roots).
 *
 * Coordinate transform: Three.js (Y-up RH) -> SMF (Z-up LH) via coord helpers.
 * DQ storage convention matches importSMF (negated on read, negated on store).
 */

export class SmfConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmfConversionError';
  }
}

export interface SmfConversionSource {
  root?: THREE.Object3D | null;
  skeleton?: THREE.Skeleton | null;
  skinnedMeshes?: THREE.SkinnedMesh[];
  clips?: THREE.AnimationClip[];
}

export function collectSkinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) {
      skinnedMeshes.push(object);
    }
  });
  return skinnedMeshes;
}

interface MeshSkinPayload {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  tangents: Float32Array;
  skinIndices: Uint16Array;
  skinWeights: Float32Array;
  vertices: number;
}

function readComponent(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertexIndex: number,
  component: number,
): number {
  if (component === 0) return attribute.getX(vertexIndex);
  if (component === 1) return attribute.getY(vertexIndex);
  if (component === 2) return attribute.getZ(vertexIndex);
  return attribute.getW(vertexIndex);
}

function flattenVertexAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined | null,
  sourceVertexCount: number,
  vertexMap: Uint32Array | null,
  itemSize: number,
  outputItemSize: number,
): Float32Array {
  const vertexCount = vertexMap?.length ?? sourceVertexCount;
  const out = new Float32Array(vertexCount * outputItemSize);
  if (!attribute || attribute.itemSize < itemSize) return out;

  for (let i = 0; i < vertexCount; i++) {
    const sourceIndex = vertexMap?.[i] ?? i;
    if (sourceIndex >= attribute.count) continue;
    for (let c = 0; c < outputItemSize; c++) {
      out[i * outputItemSize + c] = c < itemSize
        ? readComponent(attribute, sourceIndex, c)
        : 0;
    }
  }
  return out;
}

function makeTriangleVertexMap(
  geometry: THREE.BufferGeometry,
  sourceVertexCount: number,
): Uint32Array | null {
  const index = geometry.getIndex();
  const exportVertexCount = index?.count ?? sourceVertexCount;
  if (exportVertexCount % 3 !== 0) {
    throw new SmfConversionError(
      `SMF conversion requires complete triangles; received ${exportVertexCount} triangle vertices.`,
    );
  }
  if (!index) return null;

  const vertexMap = new Uint32Array(index.count);
  for (let i = 0; i < index.count; i++) {
    const sourceIndex = index.getX(i);
    if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= sourceVertexCount) {
      throw new SmfConversionError(
        `SMF conversion found invalid triangle index ${sourceIndex} at offset ${i}.`,
      );
    }
    vertexMap[i] = sourceIndex;
  }
  return vertexMap;
}

function readSkinPayload(
  geometry: THREE.BufferGeometry,
  sourceVertexCount: number,
  vertexMap: Uint32Array | null,
): { skinIndices: Uint16Array; skinWeights: Float32Array } {
  const vertices = vertexMap?.length ?? sourceVertexCount;
  const skinIndex = geometry.getAttribute('skinIndex');
  const skinWeight = geometry.getAttribute('skinWeight');
  const skinIndices = new Uint16Array(vertices * 4);
  const skinWeights = new Float32Array(vertices * 4);

  if (!skinIndex || !skinWeight || skinIndex.itemSize < 4 || skinWeight.itemSize < 4) {
    return { skinIndices, skinWeights };
  }

  for (let i = 0; i < vertices; i++) {
    const sourceIndex = vertexMap?.[i] ?? i;
    if (sourceIndex >= skinIndex.count || sourceIndex >= skinWeight.count) continue;
    const base = i * 4;
    skinIndices[base] = Math.max(0, Math.round(skinIndex.getX(sourceIndex)));
    skinIndices[base + 1] = Math.max(0, Math.round(skinIndex.getY(sourceIndex)));
    skinIndices[base + 2] = Math.max(0, Math.round(skinIndex.getZ(sourceIndex)));
    skinIndices[base + 3] = Math.max(0, Math.round(skinIndex.getW(sourceIndex)));
    skinWeights[base] = Math.max(0, Math.min(1, skinWeight.getX(sourceIndex)));
    skinWeights[base + 1] = Math.max(0, Math.min(1, skinWeight.getY(sourceIndex)));
    skinWeights[base + 2] = Math.max(0, Math.min(1, skinWeight.getZ(sourceIndex)));
    skinWeights[base + 3] = Math.max(0, Math.min(1, skinWeight.getW(sourceIndex)));
  }
  return { skinIndices, skinWeights };
}

function extractMeshPayload(mesh: THREE.SkinnedMesh): MeshSkinPayload {
  const geometry = mesh.geometry;
  const sourceVertexCount = geometry.getAttribute('position')?.count ?? 0;
  const vertexMap = makeTriangleVertexMap(geometry, sourceVertexCount);
  const vertices = vertexMap?.length ?? sourceVertexCount;
  const positions = flattenVertexAttribute(
    geometry.getAttribute('position'),
    sourceVertexCount,
    vertexMap,
    3,
    3,
  );
  const normals = flattenVertexAttribute(
    geometry.getAttribute('normal'),
    sourceVertexCount,
    vertexMap,
    3,
    3,
  );
  const uvs = flattenVertexAttribute(
    geometry.getAttribute('uv'),
    sourceVertexCount,
    vertexMap,
    2,
    2,
  );
  const tangents = flattenVertexAttribute(
    geometry.getAttribute('tangent'),
    sourceVertexCount,
    vertexMap,
    4,
    4,
  );
  const { skinIndices, skinWeights } = readSkinPayload(
    geometry,
    sourceVertexCount,
    vertexMap,
  );

  return {
    positions,
    normals,
    uvs,
    tangents,
    skinIndices,
    skinWeights,
    vertices,
  };
}

function transformMeshPayloadToRoot(
  payload: MeshSkinPayload,
  mesh: THREE.SkinnedMesh,
  rootInverse: THREE.Matrix4 | null,
): MeshSkinPayload {
  mesh.updateMatrixWorld(true);
  const modelMatrix = mesh.matrixWorld.clone();
  if (rootInverse) modelMatrix.premultiply(rootInverse);

  const normalMatrix = new THREE.Matrix3().getNormalMatrix(modelMatrix);
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const positions = new Float32Array(payload.positions);
  const normals = new Float32Array(payload.normals);
  const tangents = new Float32Array(payload.tangents);

  for (let v = 0; v < payload.vertices; v += 1) {
    const vertexOffset = v * 3;
    position
      .set(payload.positions[vertexOffset], payload.positions[vertexOffset + 1], payload.positions[vertexOffset + 2])
      .applyMatrix4(modelMatrix);
    positions[vertexOffset] = position.x;
    positions[vertexOffset + 1] = position.y;
    positions[vertexOffset + 2] = position.z;

    normal
      .set(payload.normals[vertexOffset], payload.normals[vertexOffset + 1], payload.normals[vertexOffset + 2])
      .applyMatrix3(normalMatrix)
      .normalize();
    normals[vertexOffset] = normal.x;
    normals[vertexOffset + 1] = normal.y;
    normals[vertexOffset + 2] = normal.z;

    const tangentOffset = v * 4;
    tangent
      .set(payload.tangents[tangentOffset], payload.tangents[tangentOffset + 1], payload.tangents[tangentOffset + 2])
      .applyMatrix3(normalMatrix)
      .normalize();
    tangents[tangentOffset] = tangent.x;
    tangents[tangentOffset + 1] = tangent.y;
    tangents[tangentOffset + 2] = tangent.z;
  }

  return { ...payload, positions, normals, tangents };
}

export function applyLiveSkinEditsToImportedSmf(
  source: ImportedSmf,
  skinnedMeshes: THREE.SkinnedMesh[],
): ImportedSmf {
  if (!source.meshes.length || !skinnedMeshes.length) {
    return cloneImportedSmf(source);
  }

  const result = cloneImportedSmf(source);
  const unusedByIndex = skinnedMeshes.map((_, index) => index);
  const byName = new Map<string, number[]>();

  skinnedMeshes.forEach((mesh, index) => {
    const key = mesh.name || `mesh-${index}`;
    const bucket = byName.get(key) ?? [];
    bucket.push(index);
    byName.set(key, bucket);
  });

  const consumeByName = (name: string): THREE.SkinnedMesh | null => {
    const bucket = byName.get(name);
    if (!bucket || bucket.length === 0) return null;
    const nextIndex = bucket.shift()!;
    byName.set(name, bucket);
    const foundAt = unusedByIndex.indexOf(nextIndex);
    if (foundAt >= 0) unusedByIndex.splice(foundAt, 1);
    return skinnedMeshes[nextIndex];
  };

  const consumeNextByIndex = (): THREE.SkinnedMesh | null => {
    const next = unusedByIndex.shift();
    if (next === undefined) return null;
    return skinnedMeshes[next];
  };

  for (let meshIndex = 0; meshIndex < result.meshes.length; meshIndex++) {
    const mesh = result.meshes[meshIndex];
    let sourceMesh: THREE.SkinnedMesh | null = consumeByName(mesh.name);
    if (!sourceMesh) {
      sourceMesh = consumeNextByIndex();
    }
    if (!sourceMesh) continue;

    const payload = extractMeshPayload(sourceMesh);
    if (payload.vertices !== mesh.verts) {
      throw new SmfConversionError(
        `SMF export skin mismatch: live mesh "${sourceMesh.name}" has ${payload.vertices} vertices, expected ${mesh.verts}.`
      );
    }

    const expectedWeightCount = mesh.verts * 4;
    if (payload.skinIndices.length !== expectedWeightCount || payload.skinWeights.length !== expectedWeightCount) {
      throw new SmfConversionError(
        `SMF export skin mismatch for mesh "${mesh.name}" while applying viewport edits.`
      );
    }

    mesh.skinIndices = payload.skinIndices;
    mesh.skinWeights = payload.skinWeights;
  }

  return result;
}

export function inspectThreeToSmfSource(src: SmfConversionSource): SmfDiagnosticReport {
  const diagnostics: SmfDiagnostic[] = [];
  const materialTextures: NonNullable<SmfDiagnosticReport['materialTextures']> = [];
  const { skeleton, skinnedMeshes = [], clips = [] } = src;

  if (!skeleton || skeleton.bones.length === 0) {
    pushDiagnostic(
      diagnostics,
      'error',
      'SMF_NO_SKINNED_SKELETON',
      'SMF export requires a skinned skeleton. Static models should stay GLB.',
    );
  }

  for (const clip of clips) {
    for (const track of clip.tracks) {
      if (/\.scale(\.|$)/.test(track.name)) {
        pushDiagnostic(
          diagnostics,
          'error',
          'SMF_SCALE_ANIMATION',
          `Clip "${clip.name}" has unsupported scale track "${track.name}".`,
          track.name,
        );
      }
    }
  }

  for (const mesh of skinnedMeshes) {
    const geo = mesh.geometry;
    const meshName = mesh.name || 'mesh';
    const position = geo.getAttribute('position');
    const skinIndex = geo.getAttribute('skinIndex');
    const skinWeight = geo.getAttribute('skinWeight');
    const triangleVertexCount = geo.getIndex()?.count ?? position?.count ?? 0;

    if (!position || position.itemSize < 3 || position.count === 0) {
      pushDiagnostic(
        diagnostics,
        'error',
        'SMF_MISSING_POSITION',
        `${meshName} has no usable position attribute.`,
        meshName,
      );
    } else if (triangleVertexCount % 3 !== 0) {
      pushDiagnostic(
        diagnostics,
        'error',
        'SMF_INVALID_TRIANGLES',
        `${meshName} has ${triangleVertexCount} triangle vertices; SMF requires complete triangles.`,
        meshName,
      );
    }

    if (!geo.attributes.uv) {
      pushDiagnostic(
        diagnostics,
        'warning',
        'SMF_MISSING_UV',
        `${meshName} has no UVs. Export will use empty UV data.`,
        meshName,
      );
    }

    if (!geo.attributes.normal) {
      pushDiagnostic(
        diagnostics,
        'warning',
        'SMF_MISSING_NORMALS',
        `${meshName} has no normals. Lighting may be wrong after export.`,
        meshName,
      );
    }

    if (!skinIndex
      || !skinWeight
      || skinIndex.itemSize < 4
      || skinWeight.itemSize < 4
      || skinIndex.count < (position?.count ?? 0)
      || skinWeight.count < (position?.count ?? 0)) {
      pushDiagnostic(
        diagnostics,
        'error',
        'SMF_MISSING_SKIN_ATTRIBUTES',
        `${meshName} has missing or incomplete four-component skinIndex/skinWeight attributes.`,
        meshName,
      );
    }

    const textureDiagnostics = inspectMeshMaterialCompatibility(mesh);
    toSmfDiagnosticList(textureDiagnostics).forEach((item) => {
      diagnostics.push(item);
    });
    summarizeMeshTextures(mesh).forEach((item) => {
      materialTextures.push(item);
    });
  }

  return makeDiagnosticReport(diagnostics, materialTextures);
}

function makeRootInverse(root: THREE.Object3D | null | undefined): THREE.Matrix4 | null {
  if (!root) return null;
  root.updateMatrixWorld(true);
  return root.matrixWorld.clone().invert();
}

function makeRootRelativeWorldMatrix(
  object: THREE.Object3D,
  rootInverse: THREE.Matrix4 | null,
): THREE.Matrix4 {
  object.updateMatrixWorld(true);
  const world = object.matrixWorld.clone();
  if (rootInverse) world.premultiply(rootInverse);
  return world;
}

// SMF rig DQs contain root-relative world poses. Keeping this conversion at one
// boundary prevents local-vs-world and coordinate-space drift between bind and
// animation data.
function boneWorldToDq(
  bone: THREE.Bone,
  rootInverse: THREE.Matrix4 | null,
): Float32Array {
  const smfMat = threeMatrixToSmf(makeRootRelativeWorldMatrix(bone, rootInverse));
  return dqNegate(dqCreateFromMatrix(smfMat));
}

interface AnimationSampleRig {
  root: THREE.Object3D;
  rootInverse: THREE.Matrix4;
  bones: THREE.Bone[];
  mixer: THREE.AnimationMixer;
}

function copyBoneTransform(source: THREE.Bone, target: THREE.Bone): void {
  target.name = source.name;
  target.position.copy(source.position);
  target.quaternion.copy(source.quaternion);
  target.scale.copy(source.scale);
  target.userData = { ...source.userData };
}

function makeStandaloneAnimationSampleRig(skeleton: THREE.Skeleton): AnimationSampleRig {
  const root = new THREE.Group();
  root.name = 'SMF_AnimationSampleRoot';
  const boneMap = new Map<THREE.Bone, THREE.Bone>();

  skeleton.bones.forEach((sourceBone) => {
    const targetBone = new THREE.Bone();
    copyBoneTransform(sourceBone, targetBone);
    boneMap.set(sourceBone, targetBone);
  });

  skeleton.bones.forEach((sourceBone) => {
    const targetBone = boneMap.get(sourceBone)!;
    const targetParent = sourceBone.parent instanceof THREE.Bone
      ? boneMap.get(sourceBone.parent)
      : null;
    (targetParent ?? root).add(targetBone);
  });

  root.updateMatrixWorld(true);
  return {
    root,
    rootInverse: root.matrixWorld.clone().invert(),
    bones: skeleton.bones.map((bone) => boneMap.get(bone)!),
    mixer: new THREE.AnimationMixer(root),
  };
}

function makeAnimationSampleRig(
  sourceRoot: THREE.Object3D | null | undefined,
  skeleton: THREE.Skeleton,
): AnimationSampleRig {
  if (!sourceRoot) return makeStandaloneAnimationSampleRig(skeleton);

  const sourceObjects: THREE.Object3D[] = [];
  sourceRoot.traverse((object) => sourceObjects.push(object));
  const clonedRoot = sourceRoot.clone(true);
  const clonedObjects: THREE.Object3D[] = [];
  clonedRoot.traverse((object) => clonedObjects.push(object));

  if (sourceObjects.length !== clonedObjects.length) {
    return makeStandaloneAnimationSampleRig(skeleton);
  }

  const cloneBySource = new Map<THREE.Object3D, THREE.Object3D>();
  sourceObjects.forEach((sourceObject, index) => {
    cloneBySource.set(sourceObject, clonedObjects[index]);
  });
  const clonedBones = skeleton.bones.map((bone) => cloneBySource.get(bone));
  if (clonedBones.some((bone): bone is undefined => !bone || !(bone instanceof THREE.Bone))) {
    return makeStandaloneAnimationSampleRig(skeleton);
  }

  clonedRoot.updateMatrixWorld(true);
  return {
    root: clonedRoot,
    rootInverse: clonedRoot.matrixWorld.clone().invert(),
    bones: clonedBones as THREE.Bone[],
    mixer: new THREE.AnimationMixer(clonedRoot),
  };
}

function collectAnimationTimes(clip: THREE.AnimationClip): number[] {
  if (!Number.isFinite(clip.duration) || clip.duration < 0) {
    throw new SmfConversionError(`Animation "${clip.name || 'unnamed'}" has an invalid duration.`);
  }

  const timeSet = new Set<number>();
  for (const track of clip.tracks) {
    for (let i = 0; i < track.times.length; i += 1) {
      const time = track.times[i];
      if (!Number.isFinite(time) || time < 0) {
        throw new SmfConversionError(
          `Animation "${clip.name || 'unnamed'}" has an invalid keyframe time ${time}.`,
        );
      }
      timeSet.add(time);
    }
  }
  const times = Array.from(timeSet).sort((a, b) => a - b);
  if (times.length === 0) times.push(0);
  return times;
}

function sampleAnimationFrames(
  clip: THREE.AnimationClip,
  sourceRoot: THREE.Object3D | null | undefined,
  skeleton: THREE.Skeleton,
): { times: number[]; frames: Float32Array[][] } {
  const times = collectAnimationTimes(clip);
  const sampleRig = makeAnimationSampleRig(sourceRoot, skeleton);
  const action = sampleRig.mixer.clipAction(clip);
  action.reset();
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();

  const frames = times.map((time) => {
    sampleRig.mixer.setTime(time);
    sampleRig.root.updateMatrixWorld(true);
    const sampleRootInverse = sampleRig.rootInverse;
    return sampleRig.bones.map((bone) => boneWorldToDq(bone, sampleRootInverse));
  });

  sampleRig.mixer.stopAllAction();
  return { times, frames };
}

export function buildImportedSmfFromThree(src: SmfConversionSource): ImportedSmf {
  const { root = null, skeleton, skinnedMeshes = [], clips = [] } = src;
  const report = inspectThreeToSmfSource(src);

  const firstError = report.diagnostics.find((item) => item.level === 'error');
  if (firstError) {
    throw new SmfConversionError(
      firstError.code === 'SMF_NO_SKINNED_SKELETON'
        ? 'SMF conversion requires a skinned skeleton; static roots without bones should use GLB export'
        : firstError.message
    );
  }
  const exportSkeleton = skeleton;
  if (!exportSkeleton) {
    throw new SmfConversionError(
      'SMF conversion requires a skinned skeleton; static roots without bones should use GLB export'
    );
  }

  const rootInverse = makeRootInverse(root);

  // Build SMF bones from root-relative world transforms. SMF hierarchy import
  // derives local transforms from these world poses, so exporting local bone
  // matrices would double-apply parent transforms on reimport.
  const bones: ImportedSmf['bones'] = exportSkeleton.bones.map((b, i) => {
    const parentBone = b.parent instanceof THREE.Bone ? b.parent : null;
    const parentIdx = parentBone ? exportSkeleton.bones.indexOf(parentBone) : -1;
    return {
      index: i,
      parent: parentIdx,
      isBone: 1,
      dq: boneWorldToDq(b, rootInverse),
      axis: [0, 1, 0],
    };
  });

  // Build mesh data from skinned meshes
  const meshes: ImportedSmf['meshes'] = [];
  skinnedMeshes.forEach((mesh, meshIndex) => {
    const payload = transformMeshPayloadToRoot(extractMeshPayload(mesh), mesh, rootInverse);
    const { positions, normals, uvs, tangents, skinIndices, skinWeights, vertices: verts } = payload;

    const triangles: number[][] = [];
    for (let i = 0; i < verts; i += 3) {
      triangles.push([i, i + 1, i + 2]);
    }

    meshes.push({
      name: mesh.name || `Mesh_${meshIndex}`,
      verts,
      triangles,
      texIdx: -1,
      // ImportedSmf mesh arrays are Three/model-root space in memory. The
      // binary serializer owns the single Three -> SMF coordinate conversion.
      positions,
      normals,
      uvs,
      tangents,
      skinIndices,
      skinWeights,
      visible: mesh.visible ? 1 : 0,
    });
  });

  // Sample animations through Three's mixer so quaternion interpolation,
  // defaults, hierarchy, and track binding follow the source runtime.
  const animations: ImportedSmf['animations'] = clips.map((clip, ci) => {
    const { times, frames } = sampleAnimationFrames(clip, root, exportSkeleton);

    return {
      name: clip.name || `Anim_${ci}`,
      duration: clip.duration,
      times,
      frames,
      nodeCount: exportSkeleton.bones.length,
      loop: 1,
      interpolation: 1,
      sampleFrameMultiplier: 1,
      lockedBones: [],
    };
  });

  return { meshes, textures: [], bones, animations };
}
