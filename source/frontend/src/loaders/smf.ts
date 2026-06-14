import * as THREE from 'three';
import {
  smfVecToThree,
  dqToLocalTransform,
  dqNegate,
  dqNormalize,
  dqFlipSign,
} from './coord';

/**
 * SMF binary loader (ported/adapted from docs/references/old-src/GLBtoSMF/importer.js)
 * Supports SMF_v11 and SMF_v12.
 *
 * After import, call buildThreeScene(imported) to get usable Three.js objects
 * with proper Y-up conversion and DQ -> quat/pos for skinning.
 */

type Float32Buffer = Float32Array<ArrayBufferLike>;
type Uint16Buffer = Uint16Array<ArrayBufferLike>;

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

class BinaryReader {
  private dv: DataView;
  off = 0;

  constructor(buffer: ArrayBuffer) {
    this.dv = new DataView(buffer);
  }

  private check(n: number) {
    if (this.off + n > this.dv.byteLength) {
      throw new Error(`Unexpected end of SMF binary at offset ${this.off} (need ${n} bytes, have ${this.dv.byteLength - this.off})`);
    }
  }

  u8() { this.check(1); const v = this.dv.getUint8(this.off); this.off += 1; return v; }
  u16() { this.check(2); const v = this.dv.getUint16(this.off, true); this.off += 2; return v; }
  u32() { this.check(4); const v = this.dv.getUint32(this.off, true); this.off += 4; return v; }
  f32() { this.check(4); const v = this.dv.getFloat32(this.off, true); this.off += 4; return v; }

  strZ() {
    let s = '';
    while (true) {
      const c = this.u8();
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
}

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
  textures: Array<{ name: string; image: HTMLImageElement; previewUrl: string }>;
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

export function importSMF(buffer: ArrayBuffer): ImportedSmf {
  const reader = new BinaryReader(buffer);

  const version = reader.strZ();
  const isV12 = version === 'SMF_v12_by_Snidr_and_Bart';
  const isV11 = version === 'SMF_v11_by_Snidr_and_Bart';
  if (!isV12 && !isV11) {
    throw new Error(`Unsupported SMF version: ${version}`);
  }

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
    const data = new Uint8Array(buffer, reader.off, size);
    reader.off += size;

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(w, h);
    imgData.data.set(data);
    ctx.putImageData(imgData, 0, 0);

    const image = new Image();
    image.src = canvas.toDataURL('image/png');
    const previewUrl = image.src;
    textures.push({ name, image, previewUrl });
  }

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
      let pos = [reader.f32(), reader.f32(), reader.f32()];
      const tpos = smfVecToThree(pos); // or use matrix path if needed
      positions[v*3+0] = tpos.x; positions[v*3+1] = tpos.y; positions[v*3+2] = tpos.z;

      let nor = [reader.f32(), reader.f32(), reader.f32()];
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
  }

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
  }

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
    let lockedBones: number[] = [];
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
    }
    animations.push({ name, duration, times, frames, nodeCount, loop, interpolation: interp, sampleFrameMultiplier: mult, lockedBones });
  }

  return { meshes, textures, bones, animations };
}

// Build real Three.js objects from imported SMF data.
// This is the key function that turns raw SMF into SkinnedMesh + Skeleton + AnimationClips.
export function buildThreeScene(imported: ImportedSmf) {
  const sceneRoot = new THREE.Group();
  sceneRoot.name = 'SMF_Root';

  const threeBones: THREE.Bone[] = [];
  const boneInverses: THREE.Matrix4[] = [];
  const worldMats: THREE.Matrix4[] = [];

  // Build bones from DQ rig data (apply coord transform)
  imported.bones.forEach((b, i) => {
    const bone = new THREE.Bone();
    bone.name = `Bone_${i}`;

    // Convert DQ -> local transform in Y-up
    const { pos, quat } = dqToLocalTransform(b.dq);
    bone.position.copy(pos);
    bone.quaternion.copy(quat);

    threeBones.push(bone);
    worldMats.push(new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1,1,1)));
  });

  // Hierarchy + inverses. Support node 0 as real root + parent-0 semantics for children of root.
  // Heads (isBone=0) are modeled as extra nodes in the SMF rig list (parallel to threeBones for now).
  imported.bones.forEach((b, i) => {
    if (b.parent >= 0 && b.parent < threeBones.length && b.parent !== i) {
      threeBones[b.parent].add(threeBones[i]);
    }
    const inv = worldMats[i].clone().invert();
    boneInverses.push(inv);
  });

  const skeleton = new THREE.Skeleton(threeBones, boneInverses);

  // Add roots: node 0 (self p=0) is root; children with p=0 attach via hierarchy above; treat <=0 or invalid parent as root.
  threeBones.filter((_bone, i) => {
    const p = imported.bones[i].parent;
    return p < 0 || p === i || p >= threeBones.length || !threeBones[p];
  }).forEach(root => sceneRoot.add(root));

  // Textures
  const threeTextures = imported.textures.map(t => {
    const tex = new THREE.Texture(t.image);
    tex.flipY = false;
    tex.needsUpdate = true;
    return tex;
  });

  // Skin remap (SMF node indices -> three bone indices)
  const boneRemap: number[] = [];
  let sampleInd = 0;
  imported.bones.forEach((b, nodeInd) => {
    if (b.isBone) {
      boneRemap[sampleInd] = nodeInd;
      sampleInd++;
    }
  });

  const skinnedMeshes: THREE.SkinnedMesh[] = [];

  imported.meshes.forEach((m) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
    geometry.setAttribute('tangent', new THREE.BufferAttribute(m.tangents, 4));

    // Remap skin indices
    const skinIndicesNew = new Uint16Array(m.skinIndices.length);
    for (let k = 0; k < m.skinIndices.length; k++) {
      skinIndicesNew[k] = boneRemap[m.skinIndices[k]] ?? 0;
    }
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndicesNew, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(m.skinWeights, 4));

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

    for (let n = 0; n < a.nodeCount; n++) {
      const boneName = threeBones[n]?.name || `Bone_${n}`;
      const posValues = new Float32Array(a.times.length * 3);
      const quatValues = new Float32Array(a.times.length * 4);

      let prevDQ: Float32Array | null = null;

      a.frames.forEach((frame, f) => {
        let dq = frame[n];
        dq = dqFlipSign(dqNegate(dqNormalize(dq)), prevDQ); // continuity
        prevDQ = dq;

        const { pos, quat } = dqToLocalTransform(dq);

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

  // Attach clips to root for convenience
  (sceneRoot as any).animations = clips;

  return {
    root: sceneRoot,
    skeleton,
    skinnedMeshes,
    clips,
    mixer,
  };
}

/**
 * BinaryWriter for SMF export (ported/adapted from reference).
 */
class BinaryWriter {
  private buf: ArrayBuffer;
  private dv: DataView;
  private off = 0;

  constructor(initialSize = 1024, _tag = 'buf') {
    this.buf = new ArrayBuffer(initialSize);
    this.dv = new DataView(this.buf);
  }

  private ensure(n: number) {
    if (this.off + n <= this.buf.byteLength) return;
    const newSize = this.buf.byteLength + n + 1024;
    const bigger = new ArrayBuffer(newSize);
    new Uint8Array(bigger).set(new Uint8Array(this.buf));
    this.buf = bigger;
    this.dv = new DataView(this.buf);
  }

  u8(v: number) { this.ensure(1); this.dv.setUint8(this.off, v); this.off += 1; return this; }
  u16(v: number) { this.ensure(2); this.dv.setUint16(this.off, v, true); this.off += 2; return this; }
  u32(v: number) { this.ensure(4); this.dv.setUint32(this.off, v, true); this.off += 4; return this; }
  f32(v: number) { this.ensure(4); this.dv.setFloat32(this.off, v, true); this.off += 4; return this; }

  strZ(s: string) {
    for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i));
    this.u8(0);
    return this;
  }

  getBuffer() {
    return this.buf.slice(0, this.off);
  }

  patchU32(offset: number, value: number) {
    this.dv.setUint32(offset, value, true);
  }
}

/**
 * Export ImportedSmf data back to SMF binary (Blob URL).
 * Adapted from reference exporter for our data structures (flat arrays + dqs).
 * Handles coord transforms (Y-up data -> Z-up SMF), DQ negate/flip/normalize,
 * nodeList with head nodes for SMF rig convention, winding, skin remap, etc.
 *
 * Note: Follows the reference's known limitations for complex rigs/anim (head/tail bone rotations).
 * Good for basic roundtrips on the samples.
 * Edits (gizmos/nudges in UI) are preview-only; this exports the ImportedSmf as captured at load
 * (or constructed for GLB etc). See useLoadModel handleExport + Inspector notes (Task 6).
 */
export function exportSMFToBuffer(imported: ImportedSmf): Uint8Array {
  const { meshes, textures, bones: importedBones, animations } = imported;

  // Build nodeList for SMF rig/anim (nodeCount may include extra head nodes for disconnected bones).
  // Model SMF nodes (from imported.bones with isBone/head flags + parents in node space) separately from Three bones.
  // Track root (node 0 or p<=0), head (isBone=0), tail/bone (isBone=1), detached via parent links.
  // If input has isBone=0 entries (from SMF import/roundtrip), preserve 1:1 for fidelity (no re-insertion).
  // Otherwise (e.g. GLB constructed bones), expansion path can insert heads for disconnected (parent handling).
  const nodeList: Array<{ boneIndex: number; parent: number; isBone: number; isHead: boolean; name: string }> = [];
  const boneToNode = new Map<number, number>();
  let nodeIndex = 0;

  const hasPrebuiltHeads = importedBones.some(b => b.isBone === 0);
  if (hasPrebuiltHeads) {
    // SMF-sourced: bones array already encodes the full rig nodes (heads + bones); preserve structure/parents exactly.
    importedBones.forEach((b, bi) => {
      nodeList.push({
        boneIndex: bi,
        parent: b.parent,
        isBone: b.isBone,
        isHead: b.isBone === 0,
        name: b.isBone ? `Bone_${bi}` : `Head_${bi}`
      });
      boneToNode.set(bi, nodeIndex);
      nodeIndex++;
    });
  } else {
    // Constructed (e.g. from GLB): input are real bones; build with possible head insertion for disconnected children.
    importedBones.forEach((b, bi) => {
      const connected = b.parent >= 0; // declared parent link; refine with live hierarchy if available in future
      if (!connected && b.parent >= 0) {
        nodeList.push({
          boneIndex: -1,
          parent: boneToNode.get(b.parent) ?? 0,
          isBone: 0,
          isHead: true,
          name: `Head_${bi}`
        });
        nodeIndex++;
      }
      nodeList.push({
        boneIndex: bi,
        parent: connected ? (boneToNode.get(b.parent) ?? 0) : (nodeIndex - 1),
        isBone: 1,
        isHead: false,
        name: `Bone_${bi}`
      });
      boneToNode.set(bi, nodeIndex);
      nodeIndex++;
    });
  }

  // Clamp parents (node 0 as root target for orphans)
  nodeList.forEach((n) => {
    if (n.parent < 0 || n.parent >= nodeList.length) n.parent = 0;
  });

  const versionString = 'SMF_v12_by_Snidr_and_Bart';
  const headerSize = versionString.length + 1 + 5 * 4;

  // Texture size
  let texSize = 1;
  textures.forEach((t, i) => {
    const nm = `texture${i}`;
    const img = t.image;
    texSize += nm.length + 1 + 2 + 2 + (img.width * img.height * 4);
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

  // Textures
  const tW = new BinaryWriter(texSize, 'textures');
  tW.u8(textures.length);
  textures.forEach((t, i) => {
    const nm = `texture${i}`;
    const img = t.image;
    tW.strZ(nm).u16(img.width).u16(img.height);
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    for (let b = 0; b < data.length; b++) tW.u8(data[b]);
  });

  // Models (reverse the import transforms)
  const mW = new BinaryWriter(modelSize, 'models');
  mW.u8(meshes.length);

  // Build reverse skin map (three isBone index -> SMF node)
  const reverseSkinMap: number[] = [];
  let sIdx = 0;
  importedBones.forEach((b, node) => {
    if (b.isBone) {
      reverseSkinMap[sIdx] = node;
      sIdx++;
    }
  });

  meshes.forEach(m => {
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

      // Skin indices (map back)
      for (let j = 0; j < 4; j++) {
        const threeIdx = m.skinIndices[v*4 + j];
        const smfNode = reverseSkinMap[threeIdx] ?? 0;
        mW.u8(smfNode);
      }

      // Weights (already 0-1, to 0-255)
      for (let j = 0; j < 4; j++) {
        mW.u8(Math.round(m.skinWeights[v*4 + j] * 255));
      }
    }

    mW.strZ('').strZ(m.texIdx >= 0 ? `texture${m.texIdx}` : '').u8(m.visible ? 1 : 0);
  });

  // Rig (use dqs from imported, with proper export prep)
  const rW = new BinaryWriter(rigSize, 'rig');
  rW.u32(nodeList.length);

  nodeList.forEach((n) => {
    let dq: Float32Array;
    if (n.isHead) {
      dq = new Float32Array(8);
      dq[3] = 1;
    } else {
      dq = importedBones[n.boneIndex].dq.slice();
      dq = dqNegate(dqNormalize(dq));
    }

    dq.forEach(v => rW.f32(v));
    rW.u32(n.parent).u8(n.isBone);

    const ax = importedBones[n.boneIndex]?.axis || [0, 1, 0];
    rW.f32(ax[0]).f32(ax[1]).f32(ax[2]);
  });

  // Anim (use frames dqs directly, with flip)
  const aW = new BinaryWriter(animSize, 'anim');
  aW.u8(animations.length);

  const buildDQForExport = (dq: Float32Array, prev: Float32Array | null) => {
    let d = dqNegate(dqNormalize(dq));
    return dqFlipSign(d, prev);
  };

  animations.forEach((a) => {
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

    a.times.forEach((t, fi) => {
      aW.f32(t / a.duration);

      const frameDqs = a.frames[fi] || [];

      nodeList.forEach((n, ni) => {
        let dq: Float32Array;
        if (n.isHead) {
          dq = new Float32Array(8); dq[3] = 1;
        } else {
          const srcDq = frameDqs[n.boneIndex] || new Float32Array(8);
          dq = buildDQForExport(srcDq, prevDQs[ni]);
        }
        dq.forEach(v => aW.f32(v));
        prevDQs[ni] = dq;
      });
    });
  });

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

  return out;
}

export function exportSMF(imported: ImportedSmf): string {
  const buf = exportSMFToBuffer(imported);
  return URL.createObjectURL(new Blob([bytesToArrayBuffer(buf)], { type: 'application/octet-stream' }));
}
