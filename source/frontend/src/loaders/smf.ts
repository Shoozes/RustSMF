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
import { bytesToArrayBuffer, BinaryReader, BinaryWriter } from './smfBinary';
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

  // TEXTURES
  reader.off = offTex;
  const texCount = reader.u8();
  const textures: ImportedSmf['textures'] = [];
  for (let i = 0; i < texCount; i++) {
    const name = reader.strZ();
    const w = reader.u16();
    const h = reader.u16();
    const size = w * h * 4;
    const pixels = new Uint8Array(size);
    pixels.set(new Uint8Array(buffer, reader.off, size));
    reader.off += size;
    textures.push({ name, width: w, height: h, pixels });
    report('textures', 4 + (11 * (i + 1)) / Math.max(1, texCount));
  }
  report('textures', 15);

  // MODEL
  reader.off = offModel;
  const modelCount = reader.u8();
  const meshes: ImportedSmf['meshes'] = [];
  const texNameToIdx = new Map(textures.map((t, i) => [t.name, i]));

  for (let i = 0; i < modelCount; i++) {
    const bytes = reader.u32();
    const verts = bytes / 44;
    if (!Number.isInteger(verts)) throw new Error('Invalid vertex bytes');

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
      tangents[v*4+3] = reader.u8();

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
  reader.off = offRig;
  const nodeCount = reader.u32();
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
    bones.push({ index: i, parent, isBone, dq, axis });
    report('rig', 60 + 10 * (i + 1) / Math.max(1, nodeCount));
  }
  report('rig', 70);

  // ANIM
  reader.off = offAnim;
  const animCount = reader.u8();
  const animations: ImportedSmf['animations'] = [];
  for (let i = 0; i < animCount; i++) {
    const name = reader.strZ();
    const loop = reader.u8();
    const duration = reader.f32() / 1000;
    const interp = reader.u8();
    const mult = reader.u8();
    const lockedBones: number[] = [];
    if (isV12) {
      const locked = reader.u16();
      for (let l = 0; l < locked; l++) lockedBones.push(reader.u16());
    }
    const frameCount = reader.u32();

    const times: number[] = [];
    const frames: Float32Buffer[][] = [];
    for (let f = 0; f < frameCount; f++) {
      const normTime = reader.f32();
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

  // Build nodeList via the extracted rig helper while preserving export behavior and public API.
  const { nodeList } = buildSmfNodeList(importedBones);

  const versionString = 'SMF_v12_by_Snidr_and_Bart';
  const headerSize = versionString.length + 1 + 5 * 4;

  // Texture size
  let texSize = 1;
  textures.forEach((t, i) => {
    const nm = `texture${i}`;
    texSize += nm.length + 1 + 2 + 2 + (t.width * t.height * 4);
  });

  // Model size (use flat data, verts from first attr or triangles)
  let modelSize = 1;
  meshes.forEach(m => {
    const vcount = m.positions.length / 3;
    modelSize += 4 + vcount * 44 + 1 + (m.texIdx >= 0 ? (`texture${m.texIdx}`).length + 1 : 1) + 1;
  });

  const rigStride = 8 * 4 + 4 + 1 + 3 * 4;
  const rigSize = 4 + nodeList.length * rigStride;

  let animSize = 1;
  animations.forEach(a => {
    const perFrame = 4 + nodeList.length * 8 * 4;
    const lbsLen = (a.lockedBones?.length || 0) * 2;
    // loop u8 + dur f32 + interp u8 + mult u8 + locked u16 count + locked list + frameCount u32
    animSize += (a.name.length + 1) + (1 + 4 + 1 + 1 + 2 + lbsLen + 4) + a.times.length * perFrame;
  });

  // Header
  const hW = new BinaryWriter(headerSize, 'header');
  hW.strZ(versionString).u32(0).u32(0).u32(0).u32(0).u32(0);
  report('header', 5);

  // Textures
  const tW = new BinaryWriter(texSize, 'textures');
  tW.u8(textures.length);
  textures.forEach((t, i) => {
    const nm = `texture${i}`;
    const expectedSize = t.width * t.height * 4;
    if (t.pixels.length !== expectedSize) {
      throw new Error(`Texture ${t.name || i} has ${t.pixels.length} RGBA bytes; expected ${expectedSize}.`);
    }
    tW.strZ(nm).u16(t.width).u16(t.height);
    for (let b = 0; b < t.pixels.length; b++) tW.u8(t.pixels[b]);
    report('textures', 5 + 10 * (i + 1) / Math.max(1, textures.length));
  });
  report('textures', 15);

  // Models (reverse the import transforms)
  const mW = new BinaryWriter(modelSize, 'models');
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
      const tx = m.tangents[v*4], ty = m.tangents[v*4+1], tz = m.tangents[v*4+2];
      const pack = (f: number) => Math.round((f + 1) * 127);
      mW.u8(pack(tx)).u8(pack(ty)).u8(pack(tz)).u8(0);

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
  const rW = new BinaryWriter(rigSize, 'rig');
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
  const aW = new BinaryWriter(animSize, 'anim');
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
