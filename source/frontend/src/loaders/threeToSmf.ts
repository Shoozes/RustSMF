import * as THREE from 'three';
import type { ImportedSmf } from './smf';
import { threeVecToSmf, threeMatrixToSmf, dqCreateFromMatrix, dqNegate } from './coord';
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

// Convert a Three.js bone's current local matrix to SMF-space DQ (negated storage convention).
function boneLocalToDq(bone: THREE.Bone): Float32Array {
  bone.updateMatrix();
  const smfMat = threeMatrixToSmf(bone.matrix);
  const raw = dqCreateFromMatrix(smfMat);
  return dqNegate(raw);
}

// Linear-interpolate a single component from a flat keyframe track at time t.
function sampleTrackComponent(
  values: ArrayLike<number>,
  times: ArrayLike<number>,
  t: number,
  stride: number,
  component: number
): number {
  const n = times.length;
  if (n === 0) return 0;
  if (t <= times[0]) return values[component];
  if (t >= times[n - 1]) return values[(n - 1) * stride + component];
  let i = 0;
  while (i < n - 1 && times[i + 1] < t) i++;
  const alpha = (t - times[i]) / (times[i + 1] - times[i]);
  return values[i * stride + component] * (1 - alpha) + values[(i + 1) * stride + component] * alpha;
}

export function buildImportedSmfFromThree(src: SmfConversionSource): ImportedSmf {
  const { skeleton, skinnedMeshes = [], clips = [] } = src;
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

  // Build SMF bones from skeleton using current local transforms
  const bones: ImportedSmf['bones'] = exportSkeleton.bones.map((b, i) => {
    const parentBone = b.parent instanceof THREE.Bone ? b.parent : null;
    const parentIdx = parentBone ? exportSkeleton.bones.indexOf(parentBone) : -1;
    return {
      index: i,
      parent: parentIdx,
      isBone: 1,
      dq: boneLocalToDq(b),
      axis: [0, 1, 0],
    };
  });

  // Build mesh data from skinned meshes
  const meshes: ImportedSmf['meshes'] = [];
  skinnedMeshes.forEach((mesh, meshIndex) => {
    const payload = extractMeshPayload(mesh);
    const { positions, normals, uvs, tangents, skinIndices, skinWeights, vertices: verts } = payload;

    const smfPos = new Float32Array(positions.length);
    const smfNor = new Float32Array(normals.length);
    for (let v = 0; v < verts; v++) {
      const sp = threeVecToSmf(new THREE.Vector3(
        positions[v * 3],
        positions[v * 3 + 1],
        positions[v * 3 + 2],
      ));
      smfPos[v * 3] = sp[0];
      smfPos[v * 3 + 1] = sp[1];
      smfPos[v * 3 + 2] = sp[2];

      if (normals.length > 0) {
        const sn = threeVecToSmf(new THREE.Vector3(
          normals[v * 3],
          normals[v * 3 + 1],
          normals[v * 3 + 2],
        ));
        smfNor[v * 3] = sn[0];
        smfNor[v * 3 + 1] = sn[1];
        smfNor[v * 3 + 2] = sn[2];
      }
    }

    const triangles: number[][] = [];
    for (let i = 0; i < verts; i += 3) {
      triangles.push([i, i + 1, i + 2]);
    }

    meshes.push({
      name: mesh.name || `Mesh_${meshIndex}`,
      verts,
      triangles,
      texIdx: -1,
      positions: smfPos,
      normals: smfNor,
      uvs,
      tangents,
      skinIndices,
      skinWeights,
      visible: mesh.visible ? 1 : 0,
    });
  });

  // Build animations from clip track data (no mixer, direct track interpolation)
  const animations: ImportedSmf['animations'] = clips.map((clip, ci) => {
    // Collect all unique keyframe times across all tracks
    const timeSet = new Set<number>();
    for (const track of clip.tracks) {
      for (let i = 0; i < track.times.length; i++) timeSet.add(track.times[i]);
    }
    const times = Array.from(timeSet).sort((a, b) => a - b);
    if (times.length === 0) times.push(0);

    // Build per-bone position and quaternion track lookups
    const boneQuatTimes = new Map<string, ArrayLike<number>>();
    const boneQuatValues = new Map<string, ArrayLike<number>>();
    const bonePosTime = new Map<string, ArrayLike<number>>();
    const bonePosValues = new Map<string, ArrayLike<number>>();

    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf('.');
      const boneName = track.name.slice(0, dot);
      const prop = track.name.slice(dot + 1);
      if (prop === 'quaternion') {
        boneQuatTimes.set(boneName, track.times);
        boneQuatValues.set(boneName, track.values);
      } else if (prop === 'position') {
        bonePosTime.set(boneName, track.times);
        bonePosValues.set(boneName, track.values);
      }
    }

    const frames: Float32Array[][] = times.map(t =>
      exportSkeleton.bones.map(bone => {
        const qtimes = boneQuatTimes.get(bone.name);
        const qvals = boneQuatValues.get(bone.name);
        const ptimes = bonePosTime.get(bone.name);
        const pvals = bonePosValues.get(bone.name);

        const qx = qtimes ? sampleTrackComponent(qvals!, qtimes, t, 4, 0) : bone.quaternion.x;
        const qy = qtimes ? sampleTrackComponent(qvals!, qtimes, t, 4, 1) : bone.quaternion.y;
        const qz = qtimes ? sampleTrackComponent(qvals!, qtimes, t, 4, 2) : bone.quaternion.z;
        const qw = qtimes ? sampleTrackComponent(qvals!, qtimes, t, 4, 3) : bone.quaternion.w;
        const px = ptimes ? sampleTrackComponent(pvals!, ptimes, t, 3, 0) : bone.position.x;
        const py = ptimes ? sampleTrackComponent(pvals!, ptimes, t, 3, 1) : bone.position.y;
        const pz = ptimes ? sampleTrackComponent(pvals!, ptimes, t, 3, 2) : bone.position.z;

        const tmp = new THREE.Bone();
        tmp.position.set(px, py, pz);
        tmp.quaternion.set(qx, qy, qz, qw);
        return boneLocalToDq(tmp);
      })
    );

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
