import * as THREE from 'three';
import {
  smfVecToThree,
  dqNegate,
  dqNormalize,
  dqFlipSign,
  dqToMatrix,
  smfMatrixToThree,
  decomposeMatrix,
} from './coord';
import {
  bytesToArrayBuffer,
  BinaryReader,
  BinaryWriter,
  checkedAdd,
  checkedMultiply,
  SMF_LIMITS,
} from './smfBinary';
import { buildSmfNodeList, buildRigHierarchy, findEffectiveBoneParentIndex } from './smfRig';

/**
 * SMF binary loader (ported/adapted from docs/references/old-src/GLBtoSMF/importer.js)
 * Supports SMF_v11 and SMF_v12.
 *
 * After import, call buildThreeScene(imported) to get usable Three.js objects
 * with proper Y-up conversion and DQ -> quat/pos for skinning.
 */

type Float32Buffer = Float32Array<ArrayBufferLike>;
type Uint16Buffer = Uint16Array<ArrayBufferLike>;
type Uint8Buffer = Uint8Array<ArrayBufferLike>;

export interface SmfCodecProgress {
  phase: 'header' | 'textures' | 'meshes' | 'rig' | 'animations' | 'finalize';
  percent: number;
}

export type SmfCodecProgressHandler = (progress: SmfCodecProgress) => void;

export interface ImportedSmf {
  meshes: Array<{
    name: string;
    verts: number;
    triangles: number[][];
    texIdx: number;
    positions: Float32Buffer;
    normals: Float32Buffer;
    uvs: Float32Buffer;
    tangents: Float32Buffer;
    skinIndices: Uint16Buffer;
    skinWeights: Float32Buffer;
    visible: number;
  }>;
  textures: Array<{
    name: string;
    width: number;
    height: number;
    pixels: Uint8Buffer;
  }>;
  bones: Array<{ index: number; parent: number; isBone: number; dq: Float32Buffer; axis: number[] }>;
  animations: Array<{
    name: string;
    duration: number;
    times: number[];
    frames: Float32Buffer[][]; // per-frame per-node DQ
    nodeCount: number;
    // v12+ per-anim metadata (Blender exporter etc moved locked bones here; carry for fidelity)
    loop: number;
    interpolation: number;
    sampleFrameMultiplier: number;
    lockedBones: number[];
  }>;
}

function makeProgressReporter(handler?: SmfCodecProgressHandler) {
  let lastPercent = -1;
  return (phase: SmfCodecProgress['phase'], rawPercent: number): void => {
    if (!handler) return;
    const percent = Math.max(lastPercent, Math.min(100, Math.round(rawPercent)));
    if (percent === lastPercent && percent !== 100) return;
    lastPercent = percent;
    handler({ phase, percent });
  };
}

export function importSMF(buffer: ArrayBuffer, onProgress?: SmfCodecProgressHandler): ImportedSmf {
  const report = makeProgressReporter(onProgress);
  report('header', 0);
  const reader = new BinaryReader(buffer);

  const version = reader.strZ();
  const isV12 = version === 'SMF_v12_by_Snidr_and_Bart';
  const isV11 = version === 'SMF_v11_by_Snidr_and_Bart';
  if (!isV12 && !isV11) {
    throw new Error(`Unsupported SMF version: ${version}`);
  }
  report('header', 4);

  const offTex = reader.u32();
  const offModel = reader.u32();
  const offRig = reader.u32();
  const offAnim = reader.u32();

  const headerEnd = reader.off;
  const offsets = [offTex, offModel, offRig, offAnim];
  if (offsets.some((offset) => offset < headerEnd || offset > buffer.byteLength)) {
    throw new Error('Invalid SMF binary: section offset is outside the input');
  }
  if (!(offTex < offModel && offModel < offRig && offRig < offAnim)) {
    throw new Error('Invalid SMF binary: section offsets are not strictly ordered');
  }

  // TEXTURES
  reader.seek(offTex, 'textures').setLimit(offModel, 'textures');
  const texCount = reader.u8();
  if (texCount > SMF_LIMITS.maxTextures) {
    throw new Error(`Invalid SMF binary: texture count ${texCount} exceeds ${SMF_LIMITS.maxTextures}`);
  }
  const textures: ImportedSmf['textures'] = [];
  let texturePixels = 0;
  for (let i = 0; i < texCount; i++) {
    const name = reader.strZ();
    const w = reader.u16();
    const h = reader.u16();
    if (w < 1 || w > SMF_LIMITS.maxTextureWidth || h < 1 || h > SMF_LIMITS.maxTextureHeight) {
      throw new Error(`Invalid SMF binary: texture ${i} dimensions ${w}x${h} exceed limits`);
    }
    const size = checkedMultiply(checkedMultiply(w, h, `texture ${i} pixels`), 4, `texture ${i} RGBA bytes`);
    texturePixels = checkedAdd(texturePixels, size, 'texture pixel budget');
    if (texturePixels > SMF_LIMITS.maxTexturePixels * 4) {
      throw new Error(`Invalid SMF binary: texture pixel budget exceeds ${SMF_LIMITS.maxTexturePixels} pixels`);
    }
    const pixels = reader.bytes(size, `texture ${i} pixels`);
    textures.push({ name, width: w, height: h, pixels });
    report('textures', 4 + (11 * (i + 1)) / Math.max(1, texCount));
  }
  report('textures', 15);

  // MODEL
  reader.seek(offModel, 'models').setLimit(offRig, 'models');
  const modelCount = reader.u8();
  if (modelCount > SMF_LIMITS.maxMeshes) {
    throw new Error(`Invalid SMF binary: mesh count ${modelCount} exceeds ${SMF_LIMITS.maxMeshes}`);
  }
  const meshes: ImportedSmf['meshes'] = [];
  const texNameToIdx = new Map(textures.map((t, i) => [t.name, i]));
  let totalMeshVertices = 0;

  for (let i = 0; i < modelCount; i++) {
    const bytes = reader.u32();
    if (bytes % 44 !== 0) throw new Error('Invalid vertex bytes');
    const verts = bytes / 44;
    if (verts > SMF_LIMITS.maxMeshVertices || bytes > reader.remaining) {
      throw new Error(`Invalid SMF binary: mesh ${i} vertex payload exceeds limits`);
    }
    totalMeshVertices = checkedAdd(totalMeshVertices, verts, 'mesh vertex budget');
    if (totalMeshVertices > SMF_LIMITS.maxMeshVertices) {
      throw new Error(`Invalid SMF binary: total mesh vertices exceed ${SMF_LIMITS.maxMeshVertices}`);
    }

    const positions = new Float32Array(verts * 3);
    const normals = new Float32Array(verts * 3);
    const uvs = new Float32Array(verts * 2);
    const tangents = new Float32Array(verts * 4);
    const skinIndices = new Uint16Array(verts * 4);
    const skinWeights = new Float32Array(verts * 4);

    for (let v = 0; v < verts; v++) {
      // positions + normals go through coord transform (Y-up)
      const pos = [reader.f32(), reader.f32(), reader.f32()];
      const tpos = smfVecToThree(pos); // or use matrix path if needed
      positions[v*3+0] = tpos.x; positions[v*3+1] = tpos.y; positions[v*3+2] = tpos.z;

      const nor = [reader.f32(), reader.f32(), reader.f32()];
      const tnor = smfVecToThree(nor);
      normals[v*3+0] = tnor.x; normals[v*3+1] = tnor.y; normals[v*3+2] = tnor.z;

      uvs[v*2+0] = reader.f32();
      uvs[v*2+1] = reader.f32();

      tangents[v*4+0] = (reader.u8() / 127) - 1;
      tangents[v*4+1] = (reader.u8() / 127) - 1;
      tangents[v*4+2] = (reader.u8() / 127) - 1;
      tangents[v*4+3] = (reader.u8() / 127) - 1;

      for (let j = 0; j < 4; j++) skinIndices[v*4 + j] = reader.u8();
      for (let j = 0; j < 4; j++) skinWeights[v*4 + j] = reader.u8() / 255;
      if (v % Math.max(1, Math.floor(verts / 50)) === 0) {
        report('meshes', 15 + 45 * (i + (v + 1) / Math.max(1, verts)) / Math.max(1, modelCount));
      }
    }

    const triangles: number[][] = [];
    for (let t = 0; t < verts / 3; t++) {
      triangles.push([t*3, t*3+1, t*3+2]);
    }

    reader.strZ(); // empty name
    const texName = reader.strZ();
    const visible = reader.u8();
    const texIdx = texNameToIdx.get(texName) ?? -1;

    meshes.push({
      name: `Mesh_${i}`,
      verts,
      triangles,
      texIdx,
      positions, normals, uvs, tangents,
      skinIndices, skinWeights,
      visible
    });
    report('meshes', 15 + 45 * (i + 1) / Math.max(1, modelCount));
  }
  report('meshes', 60);

  // RIG (bones)
  reader.seek(offRig, 'rig').setLimit(offAnim, 'rig');
  const nodeCount = reader.u32();
  if (nodeCount > SMF_LIMITS.maxRigNodes) {
    throw new Error(`Invalid SMF binary: rig node count ${nodeCount} exceeds ${SMF_LIMITS.maxRigNodes}`);
  }
  const bones: ImportedSmf['bones'] = [];
  for (let i = 0; i < nodeCount; i++) {
    let dq: Float32Buffer = new Float32Array(8);
    for (let j = 0; j < 8; j++) dq[j] = reader.f32();
    dq = dqNegate(dq); // as per reference read path
    const parent = reader.u32();
    const isBone = reader.u8();
    if (!isV12) {
      reader.u8(); // locked (ignored)
    }
    const axis = [reader.f32(), reader.f32(), reader.f32()];
    if (parent >= nodeCount) {
      throw new Error(`Invalid SMF binary: rig node ${i} has parent ${parent} outside the rig`);
    }
    if (isBone !== 0 && isBone !== 1) {
      throw new Error(`Invalid SMF binary: rig node ${i} has invalid isBone flag ${isBone}`);
    }
    bones.push({ index: i, parent, isBone, dq, axis });
    report('rig', 60 + 10 * (i + 1) / Math.max(1, nodeCount));
  }
  report('rig', 70);

  // ANIM
  reader.seek(offAnim, 'animations').clearLimit();
  const animCount = reader.u8();
  if (animCount > SMF_LIMITS.maxAnimations) {
    throw new Error(`Invalid SMF binary: animation count ${animCount} exceeds ${SMF_LIMITS.maxAnimations}`);
  }
  const animations: ImportedSmf['animations'] = [];
  for (let i = 0; i < animCount; i++) {
    const name = reader.strZ();
    const loop = reader.u8();
    const duration = reader.f32() / 1000;
    if (duration < 0) throw new Error(`Invalid SMF binary: animation ${i} has a negative duration`);
    const interp = reader.u8();
    const mult = reader.u8();
    const lockedBones: number[] = [];
    if (isV12) {
      const locked = reader.u16();
      if (locked > nodeCount) throw new Error(`Invalid SMF binary: animation ${i} locks too many nodes`);
      for (let l = 0; l < locked; l++) lockedBones.push(reader.u16());
    }
    const frameCount = reader.u32();
    if (frameCount > SMF_LIMITS.maxAnimationFrames) {
      throw new Error(`Invalid SMF binary: animation ${i} has too many frames`);
    }
    const frameDqCount = checkedMultiply(frameCount, nodeCount, `animation ${i} frame DQ count`);
    if (frameDqCount > SMF_LIMITS.maxAnimationFrameDqs) {
      throw new Error(`Invalid SMF binary: animation ${i} frame DQ budget exceeds ${SMF_LIMITS.maxAnimationFrameDqs}`);
    }

    const times: number[] = [];
    const frames: Float32Buffer[][] = [];
    for (let f = 0; f < frameCount; f++) {
      const normTime = reader.f32();
      if (normTime < 0 || normTime > 1) {
        throw new Error(`Invalid SMF binary: animation ${i} frame ${f} has normalized time ${normTime}`);
      }
      times.push(normTime * duration);
      const frameDqs: Float32Buffer[] = [];
      for (let n = 0; n < nodeCount; n++) {
        let dq: Float32Buffer = new Float32Array(8);
        for (let j = 0; j < 8; j++) dq[j] = reader.f32();
        dq = dqNegate(dq);
        frameDqs.push(dq);
      }
      frames.push(frameDqs);
      report('animations', 70 + 29 * (i + (f + 1) / Math.max(1, frameCount)) / Math.max(1, animCount));
    }
    animations.push({ name, duration, times, frames, nodeCount, loop, interpolation: interp, sampleFrameMultiplier: mult, lockedBones });
  }

  report('finalize', 100);
  return { meshes, textures, bones, animations };
}

function isValidParent(parent: number, index: number, count: number): boolean {
  return parent >= 0 && parent < count && parent !== index;
}

function validateAnimationFrame(
  nodeList: Array<{ boneIndex: number }>,
  frame: Float32Buffer[] | undefined,
  animationIndex: number,
  frameIndex: number,
): void {
  if (!frame) throw new Error(`Cannot export SMF: animation ${animationIndex} frame ${frameIndex} is missing`);
  nodeList.forEach((node) => {
    const dq = frame[node.boneIndex];
    if (!dq || dq.length < 8) {
      throw new Error(`Cannot export SMF: animation ${animationIndex} frame ${frameIndex} is missing node ${node.boneIndex}`);
    }
  });
}

function dqToThreeMatrix(dq: Float32Buffer): THREE.Matrix4 {
  const smfMatrix = dqToMatrix(dq);
  const threeMatrix = smfMatrixToThree(smfMatrix);
  return new THREE.Matrix4().fromArray(threeMatrix);
}

function makeLocalMatrix(
  worldMatrix: THREE.Matrix4,
  parentWorldMatrix: THREE.Matrix4 | null
): THREE.Matrix4 {
  if (!parentWorldMatrix) {
    return worldMatrix.clone();
  }
  return parentWorldMatrix.clone().invert().multiply(worldMatrix);
}

function normalizeQuatHemisphere(
  quat: THREE.Quaternion,
  prev: THREE.Quaternion | null
): THREE.Quaternion {
  if (prev && quat.dot(prev) < 0) {
    quat.set(-quat.x, -quat.y, -quat.z, -quat.w);
  }
  return quat;
}

function normalizeSkinWeightsForThree(weights: Float32Buffer): Float32Array {
  const normalized = new Float32Array(weights.length);
  for (let i = 0; i < weights.length; i += 4) {
    const w0 = weights[i] ?? 0;
    const w1 = weights[i + 1] ?? 0;
    const w2 = weights[i + 2] ?? 0;
    const w3 = weights[i + 3] ?? 0;
    const sum = w0 + w1 + w2 + w3;
    if (sum > 0) {
      normalized[i] = w0 / sum;
      normalized[i + 1] = w1 / sum;
      normalized[i + 2] = w2 / sum;
      normalized[i + 3] = w3 / sum;
    } else {
      normalized[i] = 1;
      normalized[i + 1] = 0;
      normalized[i + 2] = 0;
      normalized[i + 3] = 0;
    }
  }
  return normalized;
}

export interface BuiltThreeSmfScene {
  root: THREE.Group;
  skeleton: THREE.Skeleton;
  skinnedMeshes: THREE.SkinnedMesh[];
  clips: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
  allBonesForDebug: THREE.Bone[];
}

// Build real Three.js objects from imported SMF data.
// This is the key function that turns raw SMF into SkinnedMesh + Skeleton + AnimationClips.
export function buildThreeScene(imported: ImportedSmf): BuiltThreeSmfScene {
  const sceneRoot = new THREE.Group();
  sceneRoot.name = 'SMF_Root';

  // Hierarchy builder resolves flat nodes + head dummies (isBone=0) into correct direct real-bone tree.
  // Skeleton only gets deform bones in skin order; names use SMF_Node_N (roundtrip safe).
  const { skeleton } = buildRigHierarchy(imported, sceneRoot);

  const worldMats: THREE.Matrix4[] = imported.bones.map((b) => dqToThreeMatrix(b.dq));

  // Textures
  const threeTextures = imported.textures.map(t => {
    const tex = new THREE.DataTexture(t.pixels, t.width, t.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.name = t.name;
    tex.flipY = false;
    tex.needsUpdate = true;
    return tex;
  });

  // SMF stores sequential indices into deform bones (order of isBone=1 in the flat node list).
  // buildRigHierarchy produces skeleton.bones in that order, so the in-memory payload stays direct.
  const skinnedMeshes: THREE.SkinnedMesh[] = [];

  imported.meshes.forEach((m) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
    geometry.setAttribute('tangent', new THREE.BufferAttribute(m.tangents, 4));

    const skinIndicesNew = new Uint16Array(m.skinIndices);
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndicesNew, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(normalizeSkinWeightsForThree(m.skinWeights), 4));

    const material = new THREE.MeshStandardMaterial({
      map: m.texIdx >= 0 ? threeTextures[m.texIdx] : null,
      side: THREE.DoubleSide,
    });

    const skinned = new THREE.SkinnedMesh(geometry, material);
    skinned.name = m.name;
    skinned.bind(skeleton, new THREE.Matrix4());
    skinned.visible = !!m.visible;

    sceneRoot.add(skinned);
    skinnedMeshes.push(skinned);
  });

  // Animations -> Three AnimationClips (DQ -> pos/quat tracks)
  const clips: THREE.AnimationClip[] = [];

  imported.animations.forEach((a) => {
    const tracks: (THREE.VectorKeyframeTrack | THREE.QuaternionKeyframeTrack)[] = [];
    const frameWorldMats = a.frames.map(frame => frame.map(dqToThreeMatrix));

    for (let n = 0; n < a.nodeCount; n++) {
      const isB = imported.bones[n]?.isBone ?? 1;
      if (isB !== 1) continue;

      const boneName = `SMF_Node_${n}`;
      const posValues = new Float32Array(a.times.length * 3);
      const quatValues = new Float32Array(a.times.length * 4);
      let prevQuat: THREE.Quaternion | null = null;

      a.frames.forEach((_frame, f) => {
        const frameMatrices = frameWorldMats[f] ?? [];
        const worldMatrix = frameMatrices[n] ?? worldMats[n];
        const parent = imported.bones[n]?.parent ?? -1;
        const effectiveParent = findEffectiveBoneParentIndex(imported.bones, parent, n);
        const parentWorld = effectiveParent !== null && isValidParent(effectiveParent, n, frameMatrices.length)
          ? frameMatrices[effectiveParent]
          : null;
        const localMatrix = makeLocalMatrix(worldMatrix, parentWorld);
        const { pos, quat } = decomposeMatrix(localMatrix);
        normalizeQuatHemisphere(quat, prevQuat);
        prevQuat = quat.clone();

        posValues[f*3+0] = pos.x;
        posValues[f*3+1] = pos.y;
        posValues[f*3+2] = pos.z;

        quatValues[f*4+0] = quat.x;
        quatValues[f*4+1] = quat.y;
        quatValues[f*4+2] = quat.z;
        quatValues[f*4+3] = quat.w;
      });

      tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.position`, a.times, posValues));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, a.times, quatValues));
    }

    const clip = new THREE.AnimationClip(a.name, a.duration, tracks);
    clips.push(clip);
  });

  const mixer = new THREE.AnimationMixer(sceneRoot);

  return {
    root: sceneRoot,
    skeleton,
    skinnedMeshes,
    clips,
    mixer,
    allBonesForDebug: skeleton.bones, // hierarchy uses correct direct reals only (heads skipped)
  };
}

/**
 * Export ImportedSmf data back to SMF binary (Blob URL).
 * Adapted from reference exporter for our data structures (flat arrays + dqs).
 * Handles coord transforms (Y-up data -> Z-up SMF), DQ negate/flip/normalize,
 * nodeList with head nodes for SMF rig convention, winding, skin remap, etc.
 *
 * The caller supplies a fully prepared ImportedSmf candidate. SMF-source pose, skin, and animation
 * edit layers are applied in useLoadModel before this serializer runs.
 */
export function exportSMFToBuffer(
  imported: ImportedSmf,
  onProgress?: SmfCodecProgressHandler,
): Uint8Array {
  const report = makeProgressReporter(onProgress);
  report('header', 0);
  const { meshes, textures, bones: importedBones, animations } = imported;

  if (textures.length > SMF_LIMITS.maxTextures) {
    throw new Error(`Cannot export SMF: texture count exceeds ${SMF_LIMITS.maxTextures}`);
  }
  if (meshes.length > SMF_LIMITS.maxMeshes) {
    throw new Error(`Cannot export SMF: mesh count exceeds ${SMF_LIMITS.maxMeshes}`);
  }
  if (importedBones.length > SMF_LIMITS.maxRigNodes) {
    throw new Error(`Cannot export SMF: rig node count exceeds ${SMF_LIMITS.maxRigNodes}`);
  }
  if (animations.length > SMF_LIMITS.maxAnimations) {
    throw new Error(`Cannot export SMF: animation count exceeds ${SMF_LIMITS.maxAnimations}`);
  }

  let totalTexturePixels = 0;
  textures.forEach((texture, index) => {
    if (!Number.isInteger(texture.width) || !Number.isInteger(texture.height)
      || texture.width < 1 || texture.width > SMF_LIMITS.maxTextureWidth
      || texture.height < 1 || texture.height > SMF_LIMITS.maxTextureHeight) {
      throw new Error(`Cannot export SMF: texture ${index} dimensions are outside the supported limits`);
    }
    const expectedSize = checkedMultiply(
      checkedMultiply(texture.width, texture.height, `texture ${index} pixels`),
      4,
      `texture ${index} RGBA bytes`,
    );
    if (texture.pixels.length !== expectedSize) {
      throw new Error(`Texture ${texture.name || index} has ${texture.pixels.length} RGBA bytes; expected ${expectedSize}.`);
    }
    totalTexturePixels = checkedAdd(totalTexturePixels, texture.width * texture.height, 'texture pixel budget');
  });
  if (totalTexturePixels > SMF_LIMITS.maxTexturePixels) {
    throw new Error(`Cannot export SMF: texture pixel budget exceeds ${SMF_LIMITS.maxTexturePixels} pixels`);
  }

  // Build the node list before validating animation frames because export
  // remaps source bones through this exact list.
  const { nodeList } = buildSmfNodeList(importedBones);
  if (nodeList.length > SMF_LIMITS.maxRigNodes) {
    throw new Error(`Cannot export SMF: generated rig node count exceeds ${SMF_LIMITS.maxRigNodes}`);
  }

  let totalMeshVertices = 0;
  meshes.forEach((mesh, meshIndex) => {
    const vcount = mesh.positions.length / 3;
    if (!Number.isInteger(vcount) || vcount < 3 || vcount > SMF_LIMITS.maxMeshVertices || vcount % 3 !== 0) {
      throw new Error(`Cannot export SMF: mesh ${meshIndex} must contain a triangle-aligned vertex count`);
    }
    if (mesh.verts !== vcount) throw new Error(`Cannot export SMF: mesh ${meshIndex} vertex metadata is stale`);
    const requiredLengths = [
      ['normals', mesh.normals.length, vcount * 3],
      ['uvs', mesh.uvs.length, vcount * 2],
      ['tangents', mesh.tangents.length, vcount * 4],
      ['skinIndices', mesh.skinIndices.length, vcount * 4],
      ['skinWeights', mesh.skinWeights.length, vcount * 4],
    ] as const;
    for (const [label, actual, expected] of requiredLengths) {
      if (actual !== expected) throw new Error(`Cannot export SMF: mesh ${meshIndex} ${label} length is ${actual}; expected ${expected}`);
    }
    if (mesh.texIdx < -1 || mesh.texIdx >= textures.length) {
      throw new Error(`Cannot export SMF: mesh ${meshIndex} references texture ${mesh.texIdx}`);
    }
    totalMeshVertices = checkedAdd(totalMeshVertices, vcount, 'mesh vertex budget');
    for (let i = 0; i < mesh.skinIndices.length; i += 1) {
      if (!Number.isInteger(mesh.skinIndices[i]) || mesh.skinIndices[i] < 0 || mesh.skinIndices[i] > 0xff) {
        throw new Error(`Cannot export SMF: mesh ${meshIndex} skin index ${i} is outside the SMF byte range`);
      }
    }
    for (let i = 0; i < mesh.skinWeights.length; i += 1) {
      if (!Number.isFinite(mesh.skinWeights[i]) || mesh.skinWeights[i] < 0 || mesh.skinWeights[i] > 1) {
        throw new Error(`Cannot export SMF: mesh ${meshIndex} skin weight ${i} is outside 0..1`);
      }
    }
  });
  if (totalMeshVertices > SMF_LIMITS.maxMeshVertices) {
    throw new Error(`Cannot export SMF: total mesh vertices exceed ${SMF_LIMITS.maxMeshVertices}`);
  }

  animations.forEach((animation, animationIndex) => {
    if (!Number.isFinite(animation.duration) || animation.duration < 0) {
      throw new Error(`Cannot export SMF: animation ${animationIndex} has an invalid duration`);
    }
    if (animation.times.length !== animation.frames.length || animation.times.length > SMF_LIMITS.maxAnimationFrames) {
      throw new Error(`Cannot export SMF: animation ${animationIndex} has mismatched or excessive frame data`);
    }
    if (checkedMultiply(animation.times.length, importedBones.length, `animation ${animationIndex} frame DQ count`) > SMF_LIMITS.maxAnimationFrameDqs) {
      throw new Error(`Cannot export SMF: animation ${animationIndex} frame DQ budget is too large`);
    }
    if ((animation.lockedBones?.length || 0) > 0xffff) {
      throw new Error(`Cannot export SMF: animation ${animationIndex} has too many locked bones`);
    }
    animation.times.forEach((time, frameIndex) => {
      if (!Number.isFinite(time) || time < 0 || (animation.duration === 0 && time !== 0) || (animation.duration > 0 && time > animation.duration)) {
        throw new Error(`Cannot export SMF: animation ${animationIndex} frame ${frameIndex} has an invalid time`);
      }
      const frame = animation.frames[frameIndex];
      validateAnimationFrame(nodeList, frame, animationIndex, frameIndex);
    });
  });

  const versionString = 'SMF_v12_by_Snidr_and_Bart';
  const headerSize = versionString.length + 1 + 5 * 4;

  // Texture size
  let texSize = 1;
  textures.forEach((t, i) => {
    const nm = `texture${i}`;
    const entrySize = checkedAdd(
      checkedAdd(nm.length + 1 + 2 + 2, checkedMultiply(checkedMultiply(t.width, t.height, `texture ${i} pixels`), 4, `texture ${i} RGBA bytes`), `texture ${i} entry`),
      0,
      `texture ${i} entry`,
    );
    texSize = checkedAdd(texSize, entrySize, 'texture section size');
  });

  // Model size (use flat data, verts from first attr or triangles)
  let modelSize = 1;
  meshes.forEach(m => {
    const vcount = m.positions.length / 3;
    const nameSize = m.texIdx >= 0 ? `texture${m.texIdx}`.length + 1 : 1;
    modelSize = checkedAdd(modelSize, checkedAdd(4 + checkedMultiply(vcount, 44, 'mesh vertex bytes') + 1 + nameSize + 1, 0, 'mesh entry size'), 'model section size');
  });

  const rigStride = 8 * 4 + 4 + 1 + 3 * 4;
  const rigSize = checkedAdd(4, checkedMultiply(nodeList.length, rigStride, 'rig section size'), 'rig section size');

  let animSize = 1;
  animations.forEach(a => {
    const perFrame = 4 + nodeList.length * 8 * 4;
    const lbsLen = (a.lockedBones?.length || 0) * 2;
    // loop u8 + dur f32 + interp u8 + mult u8 + locked u16 count + locked list + frameCount u32
    animSize = checkedAdd(
      animSize,
      checkedAdd(
        checkedAdd(a.name.length + 1, 1 + 4 + 1 + 1 + 2 + lbsLen + 4, 'animation entry header'),
        checkedMultiply(a.times.length, perFrame, 'animation frame bytes'),
        'animation entry size',
      ),
      'animation section size',
    );
  });

  const totalSize = [headerSize, texSize, modelSize, rigSize, animSize]
    .reduce((sum, size) => checkedAdd(sum, size, 'SMF output size'), 0);
  if (totalSize > SMF_LIMITS.maxOutputBytes) {
    throw new Error(`Cannot export SMF: output exceeds ${SMF_LIMITS.maxOutputBytes} bytes`);
  }

  // Header
  const hW = new BinaryWriter(Math.min(headerSize, 1024 * 1024), 'header');
  hW.strZ(versionString).u32(0).u32(0).u32(0).u32(0).u32(0);
  report('header', 5);

  // Textures
  const tW = new BinaryWriter(Math.min(texSize, 1024 * 1024), 'textures');
  tW.u8(textures.length);
  textures.forEach((t, i) => {
    const nm = `texture${i}`;
    const expectedSize = checkedMultiply(checkedMultiply(t.width, t.height, `texture ${i} pixels`), 4, `texture ${i} RGBA bytes`);
    if (t.pixels.length !== expectedSize) {
      throw new Error(`Texture ${t.name || i} has ${t.pixels.length} RGBA bytes; expected ${expectedSize}.`);
    }
    tW.strZ(nm).u16(t.width).u16(t.height);
    for (let b = 0; b < t.pixels.length; b++) tW.u8(t.pixels[b]);
    report('textures', 5 + 10 * (i + 1) / Math.max(1, textures.length));
  });
  report('textures', 15);

  // Models (reverse the import transforms)
  const mW = new BinaryWriter(Math.min(modelSize, 1024 * 1024), 'models');
  mW.u8(meshes.length);

  meshes.forEach((m, meshIndex) => {
    const vcount = m.positions.length / 3;
    mW.u32(vcount * 44);

    for (let v = 0; v < vcount; v++) {
      // positions/normals: back to SMF Z-up from our Y-up flat data
      const px = m.positions[v*3], py = m.positions[v*3+1], pz = m.positions[v*3+2];
      const posSmf = [px, -pz, py]; // reverse of smfVecToThree approx [x,z,-y]
      mW.f32(posSmf[0]).f32(posSmf[1]).f32(posSmf[2]);

      const nx = m.normals[v*3], ny = m.normals[v*3+1], nz = m.normals[v*3+2];
      const norSmf = [nx, -nz, ny];
      mW.f32(norSmf[0]).f32(norSmf[1]).f32(norSmf[2]);

      mW.f32(m.uvs[v*2]).f32(m.uvs[v*2+1]);

      // Tangent pack (reverse)
      const tx = m.tangents[v*4], ty = m.tangents[v*4+1], tz = m.tangents[v*4+2], tw = m.tangents[v*4+3];
      const pack = (f: number) => Math.round((f + 1) * 127);
      mW.u8(pack(tx)).u8(pack(ty)).u8(pack(tz)).u8(pack(tw));

      // SMF skin indices use deform-bone order, not full node IDs. Head nodes do not consume an index.
      for (let j = 0; j < 4; j++) {
        mW.u8(m.skinIndices[v*4 + j]);
      }

      // Weights (already 0-1, to 0-255)
      for (let j = 0; j < 4; j++) {
        mW.u8(Math.round(m.skinWeights[v*4 + j] * 255));
      }
      if (v % Math.max(1, Math.floor(vcount / 50)) === 0) {
        report('meshes', 15 + 40 * (meshIndex + (v + 1) / Math.max(1, vcount)) / Math.max(1, meshes.length));
      }
    }

    mW.strZ('').strZ(m.texIdx >= 0 ? `texture${m.texIdx}` : '').u8(m.visible ? 1 : 0);
    report('meshes', 15 + 40 * (meshIndex + 1) / Math.max(1, meshes.length));
  });
  report('meshes', 55);

  // Rig (use dqs from imported, with proper export prep)
  const rW = new BinaryWriter(Math.min(rigSize, 1024 * 1024), 'rig');
  rW.u32(nodeList.length);

  nodeList.forEach((n, nodeIndex) => {
    let dq: Float32Array;
    const sourceDq = importedBones[n.boneIndex]?.dq;
    if (sourceDq) {
      dq = sourceDq.slice();
      dq = dqNegate(dqNormalize(dq));
    } else {
      dq = new Float32Array(8);
      dq[3] = 1;
    }

    dq.forEach(v => rW.f32(v));
    rW.u32(n.parent).u8(n.isBone);

    const ax = importedBones[n.boneIndex]?.axis || [0, 1, 0];
    rW.f32(ax[0]).f32(ax[1]).f32(ax[2]);
    report('rig', 55 + 15 * (nodeIndex + 1) / Math.max(1, nodeList.length));
  });
  report('rig', 70);

  // Anim (use frames dqs directly, with flip)
  const aW = new BinaryWriter(Math.min(animSize, 1024 * 1024), 'anim');
  aW.u8(animations.length);

  const buildDQForExport = (dq: Float32Array, prev: Float32Array | null) => {
    const normalized = dqNormalize(dq, new Float32Array(8));
    const d = dqNegate(normalized);
    return dqFlipSign(d, prev);
  };

  animations.forEach((a, animationIndex) => {
    const lbs = a.lockedBones || [];
    aW.strZ(a.name)
      .u8(a.loop ?? 0)
      .f32(a.duration * 1000)
      .u8(a.interpolation ?? 1)
      .u8(a.sampleFrameMultiplier ?? 1)
      .u16(lbs.length);
    lbs.forEach(lb => aW.u16(lb));
    aW.u32(a.times.length);

    const prevDQs: (Float32Array | null)[] = new Array(nodeList.length).fill(null);

    const duration = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0;
    a.times.forEach((t, fi) => {
      const normalizedTime = duration > 0 && Number.isFinite(t) ? t / duration : 0;
      aW.f32(normalizedTime);

      const frameDqs = a.frames[fi] || [];

      nodeList.forEach((n, ni) => {
        let dq: Float32Array;
        const srcDq = frameDqs[n.boneIndex];
        if (srcDq) {
          dq = buildDQForExport(srcDq, prevDQs[ni]);
        } else {
          dq = new Float32Array(8);
          dq[3] = 1;
        }
        dq.forEach(v => aW.f32(v));
        prevDQs[ni] = dq;
      });
      report('animations', 70 + 25 * (animationIndex + (fi + 1) / Math.max(1, a.times.length)) / Math.max(1, animations.length));
    });
  });
  report('animations', 95);

  // Patch header offsets
  const offTex = headerSize;
  const offModel = offTex + texSize;
  const offRig = offModel + modelSize;
  const offAnim = offRig + rigSize;

  let ptr = versionString.length + 1;
  [offTex, offModel, offRig, offAnim].forEach(o => {
    hW.patchU32(ptr, o);
    ptr += 4;
  });

  // Concat
  const parts = [
    new Uint8Array(hW.getBuffer()),
    new Uint8Array(tW.getBuffer()),
    new Uint8Array(mW.getBuffer()),
    new Uint8Array(rW.getBuffer()),
    new Uint8Array(aW.getBuffer()),
  ];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  parts.forEach(p => { out.set(p, off); off += p.length; });

  report('finalize', 100);
  return out;
}

export function exportSMF(imported: ImportedSmf): string {
  const buf = exportSMFToBuffer(imported);
  return URL.createObjectURL(new Blob([bytesToArrayBuffer(buf)], { type: 'application/octet-stream' }));
}
