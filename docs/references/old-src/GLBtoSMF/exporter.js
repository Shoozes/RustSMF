// exporter.js
// -----------------------------------------------------------------------------
// Full SMF exporter for Three.js.
// Writes meshes, textures, rig, and animations in Z-up LH + dual-quat format.
// Currently we only get MESH, TEXTURES, RIG, AND SKINNING CORRECT. Animation
// Tracks load, animation data per node loads, but bones are not correctly
// connected, missing the bone rotations for tail to head bone. Due to not
// correctly calculating and applying bone constraints.
// -----------------------------------------------------------------------------

import * as THREE from 'three';
import { vec3 } from 'gl-matrix';
import { DebugLogger } from './DebugLogger.js';
import {
  smf_transform_to_zup,
  smf_dq_create_from_matrix,
  smf_dq_negate,
  smf_dq_normalize,
  smf_dq_flip_sign
} from './smf_dq_math.js';

/**
 * BinaryWriter
 * Growing little-endian buffer writer with chainable methods.
 */
class BinaryWriter {
  constructor(initialSize = 1024, tag = 'buf') {
    this.buf = new ArrayBuffer(initialSize);
    this.dv  = new DataView(this.buf);
    this.off = 0;
    this.tag = tag;
  }

  ensure(n) {
    if (this.off + n <= this.buf.byteLength) return;
    const newSize = this.buf.byteLength + n + 1024;
    const bigger  = new ArrayBuffer(newSize);
    new Uint8Array(bigger).set(new Uint8Array(this.buf));
    this.buf = bigger;
    this.dv  = new DataView(this.buf);
    DebugLogger.log(`${this.tag}: grew to ${newSize} bytes`);
  }

  u8(v)  { this.ensure(1); this.dv.setUint8 (this.off, v); this.off += 1; return this; }
  u16(v) { this.ensure(2); this.dv.setUint16(this.off, v, true); this.off += 2; return this; }
  u32(v) { this.ensure(4); this.dv.setUint32(this.off, v, true); this.off += 4; return this; }
  f32(v) { this.ensure(4); this.dv.setFloat32(this.off, v, true); this.off += 4; return this; }

  // Zero-terminated UTF-8 string
  strZ(s) {
    for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i));
    this.u8(0);
    return this;
  }

  // Extract only the written portion
  getBuffer() {
    return this.buf.slice(0, this.off);
  }
}

/**
 * exportSMF
 * @param {Object} config
 * @param {Array}  config.meshes      // { mesh, verts, triangles, texIdx }
 * @param {Array}  config.textures    // { image }
 * @param {Array}  config.bones       // { mesh, index, parent }
 * @param {Array}  config.animations  // { mesh, clip, times, frames }
 * @returns {string} Blob URL to the SMF binary
 */
export function exportSMF({ meshes, textures, bones, animations }) {
  DebugLogger.log('Starting SMF export:', {
    meshCount: meshes.length,
    textureCount: textures.length,
    boneCount: bones.length,
    animCount: animations.length
  });

  // ------------------------------------------------------------------------
  // 1) Build nodeList: tails + optional head nodes for disconnected bones
  // ------------------------------------------------------------------------
  const nodeList   = [];
  const boneToNode = new Map();
  let   nodeIndex  = 0;

  bones.forEach((b, bi) => {
    const boneObj   = b.mesh.skeleton.bones[b.index];
    const connected = (b.parent >= 0 &&
                       boneObj.parent === b.mesh.skeleton.bones[b.parent]);

    // If not connected, insert a head node first
    if (!connected && b.parent >= 0) {
      nodeList.push({
        boneIndex: -1,
        parent:    boneToNode.get(b.parent) ?? 0,
        isBone:    0,
        isHead:    true,
        boneObj,
        name:      `Head_${boneObj.name || bi}`
      });
      nodeIndex++;
    }

    // Then the tail node
    nodeList.push({
      boneIndex: bi,
      parent:    connected
                   ? (boneToNode.get(b.parent) ?? 0)
                   : (nodeIndex - 1),
      isBone:    1,
      isHead:    false,
      boneObj,
      name:      boneObj.name || `Bone_${bi}`
    });
    boneToNode.set(bi, nodeIndex);
    nodeIndex++;
  });

  // Clamp any invalid parent indices
  nodeList.forEach((n, i) => {
    if (n.parent < 0 || n.parent >= nodeList.length) {
      DebugLogger.log(`Fixing invalid parent ${n.parent} for node ${i}`);
      n.parent = 0;
    }
  });

  // ------------------------------------------------------------------------
  // 2) Measure chunk sizes to allocate headers
  // ------------------------------------------------------------------------
  const versionString = 'SMF_v12_by_Snidr_and_Bart';
  const headerSize    = versionString.length + 1 + 5 * 4; // strZ + five u32

  // TEXTURE chunk
  let texSize = 1; // count byte
  textures.forEach((t, i) => {
    const nm = `texture${i}`;
    texSize += nm.length + 1 + 2 + 2 + (t.image.width * t.image.height * 4);
  });

  // MODEL chunk
  let modelSize = 1; // count byte
  meshes.forEach(m => {
    modelSize += 4                // u32 byte-length
               + m.verts * 44     // each vertex = 44 bytes
               + 1                // empty stringZ
               + (m.texIdx >= 0
                  ? (`texture${m.texIdx}`).length + 1
                  : 1)
               + 1;               // u8 visible
  });

  // RIG chunk
  const rigStride = 8*4 + 4 + 1 + 3*4;   // 8 floats + u32 parent + u8 + 3 floats
  const rigSize   = 4 + nodeList.length * rigStride; // u32 count + per-node

  // ANIM chunk
  let animSize = 1; // count byte
  animations.forEach(a => {
    const perFrame = 4 + nodeList.length * 8 * 4;
    animSize += (a.name.length + 1) // name
              + (1 + 4 + 1 + 1 + 2) // header
              + a.frames * perFrame;
  });

  DebugLogger.log('Chunk sizes:', {
    headerSize, texSize, modelSize, rigSize, animSize,
    totalSize: headerSize+texSize+modelSize+rigSize+animSize
  });

  // ------------------------------------------------------------------------
  // 3) HEADER: write version + placeholder offsets
  // ------------------------------------------------------------------------
  const hW = new BinaryWriter(headerSize, 'header');
  hW.strZ(versionString)
    .u32(0).u32(0).u32(0).u32(0).u32(0);

  // ------------------------------------------------------------------------
  // 4) TEXTURE chunk
  // ------------------------------------------------------------------------
  const tW = new BinaryWriter(texSize, 'textures');
  tW.u8(textures.length);
  textures.forEach((t, i) => {
    const nm = `texture${i}`;
    tW.strZ(nm).u16(t.image.width).u16(t.image.height);

    // draw to canvas to extract RGBA
    const cv  = document.createElement('canvas');
    cv.width  = t.image.width;
    cv.height = t.image.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(t.image, 0, 0);
    const data = ctx.getImageData(0,0,cv.width,cv.height).data;
    data.forEach(b => tW.u8(b));
  });
  DebugLogger.log('Textures written:', tW.getBuffer().byteLength);

  // ------------------------------------------------------------------------
  // 5) MODEL chunk (with reversed winding to fix inside-out)
  // ------------------------------------------------------------------------
  const mW = new BinaryWriter(modelSize, 'models');
  mW.u8(meshes.length);

  meshes.forEach(m => {
    // total byte-length of this mesh’s vertex data
    mW.u32(m.verts * 44);
    const G = m.mesh.geometry.attributes;

    // For each triangle, write vertices in [i0, i2, i1] order
    // to undo the reflection’s winding reversal.
    m.triangles.forEach(tri => {
      const [i0,i1,i2] = tri;
      [i0, i2, i1].forEach(v => {
        // Position → SMF coords
        const pos = smf_transform_to_zup([
          G.position.getX(v),
          G.position.getY(v),
          G.position.getZ(v)
        ], false);
        mW.f32(pos[0]).f32(pos[1]).f32(pos[2]);

        // Normal → SMF coords
        const nor = smf_transform_to_zup([
          G.normal.getX(v),
          G.normal.getY(v),
          G.normal.getZ(v)
        ], false);
        mW.f32(nor[0]).f32(nor[1]).f32(nor[2]);

        // UV
        mW.f32(G.uv.getX(v)).f32(G.uv.getY(v));

        // Tangent → SMF coords + packed
        const tan = smf_transform_to_zup([
          G.tangent.getX(v),
          G.tangent.getY(v),
          G.tangent.getZ(v)
        ], false);
        const pack = f => Math.round((f + 1) * 127);
        mW.u8(pack(tan[0])).u8(pack(tan[1])).u8(pack(tan[2])).u8(0);

        // Skin indices → SMF node indices
        const inds = [
          G.skinIndex.getX(v),
          G.skinIndex.getY(v),
          G.skinIndex.getZ(v),
          G.skinIndex.getW(v)
        ].map(bi => boneToNode.get(bi) ?? 0);
        inds.forEach(ii => mW.u8(ii));

        // Skin weights → normalized to [0..255]
        const wts = [
          G.skinWeight.getX(v),
          G.skinWeight.getY(v),
          G.skinWeight.getZ(v),
          G.skinWeight.getW(v)
        ];
        const sum = wts.reduce((a,b)=>a+b,0)||1;
        wts.forEach(w => mW.u8(Math.round((w/sum)*255)));
      });
    });

    // empty name + texture name + visible flag
    mW.strZ('').strZ(m.texIdx>=0?`texture${m.texIdx}`:'').u8(1);
  });
  DebugLogger.log('Models written:', mW.getBuffer().byteLength);

  // ------------------------------------------------------------------------
  // 6) RIG chunk (bind-pose)
  // ------------------------------------------------------------------------
  const rW = new BinaryWriter(rigSize, 'rig');
  rW.u32(nodeList.length);

  nodeList.forEach((n, ni) => {
    // 6.1) world-matrix: head uses boneObj.matrixWorld;
    //     tail uses joint rotation + tail-endpoint position.
    let worldMat = new THREE.Matrix4();
    if (n.isHead) {
      worldMat.copy(n.boneObj.matrixWorld);
    } else {
      const tailL = new THREE.Vector3(0, n.boneObj.length||1, 0);
      const tailW = n.boneObj.localToWorld(tailL.clone());
      worldMat.makeRotationFromQuaternion(n.boneObj.quaternion)
              .setPosition(tailW);
    }

    // 6.2) strip scale
    const pos = new THREE.Vector3(), rot = new THREE.Quaternion(), scl = new THREE.Vector3();
    worldMat.decompose(pos, rot, scl);
    const noScaleMat = new THREE.Matrix4().compose(pos, rot, new THREE.Vector3(1,1,1));

    // 6.3) to SMF coords
    const smfM = smf_transform_to_zup(noScaleMat.elements);

    // 6.4) to dual-quat
    let dq = smf_dq_create_from_matrix(smfM);
    smf_dq_normalize(dq);
    dq = smf_dq_negate(dq);

    // 6.5) primary IK axis: for bones only; heads get [0,0,0]
    let axis = vec3.fromValues(0,0,0);
    if (n.isBone) {
      axis = vec3.fromValues(0,1,0);           // local Y
      vec3.transformMat4(axis, axis, smfM);
      vec3.normalize(axis, axis);
    }

    // 6.6) write node: 8 floats DQ, u32 parent, u8 isBone, 3 floats axis
    dq.forEach(v=>rW.f32(v));
    rW.u32(n.parent).u8(n.isBone);
    rW.f32(axis[0]).f32(axis[1]).f32(axis[2]);
  });
  DebugLogger.log('Rig written:', rW.getBuffer().byteLength);

  // ------------------------------------------------------------------------
  // 7) ANIM chunk (per-frame dual-quat keys)
  // ------------------------------------------------------------------------
  const aW = new BinaryWriter(animSize, 'anim');
  aW.u8(animations.length);

  // Helper: build + continuity-flip DQ for a given matrix
  const buildDQ = (mat, prev) => {
    const smfM = smf_transform_to_zup(mat.elements);
    let dq     = smf_dq_create_from_matrix(smfM);
    smf_dq_normalize(dq);
    dq         = smf_dq_negate(dq);
    return smf_dq_flip_sign(dq, prev);
  };

  animations.forEach((anim, ai) => {
    DebugLogger.log(`ANIM[${ai}] "${anim.name}", frames=${anim.frames}`);

    // 7.1) header: name, loop, duration, interp, multiplier, locked, frame count
    aW.strZ(anim.name)
      .u8(1)                           // loop
      .f32(anim.clip.duration*1000)    // playTime ms
      .u8(1)                           // interpolation: linear
      .u8(1)                           // multiplier
      .u16(0)                          // locked bones
      .u32(anim.frames);              // frame count

    // 7.2) play clip on mixer
    const mixer  = new THREE.AnimationMixer(anim.mesh);
    const action = mixer.clipAction(anim.clip);
    action.play();

    const prevDQs = new Array(nodeList.length).fill(null);
    let lastT = 0;

    // 7.3) sample at each time
    anim.times.forEach(t => {
      mixer.setTime(t);
      mixer.update(t - lastT);
      lastT = t;

      aW.f32(t / anim.clip.duration);  // normalized time

      // 7.4) per-node: same worldMat logic as bind-pose
      nodeList.forEach((n, ni) => {
        let worldMat;
        if (n.isHead) {
          worldMat = n.boneObj.matrixWorld.clone();
        } else {
          const tailL = new THREE.Vector3(0, n.boneObj.length||1, 0);
          const tailW = n.boneObj.localToWorld(tailL.clone());
          worldMat    = new THREE.Matrix4()
                           .makeRotationFromQuaternion(n.boneObj.quaternion)
                           .setPosition(tailW);
        }

        // strip scale
        const p = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3();
        worldMat.decompose(p, r, s);
        const noS = new THREE.Matrix4().compose(p, r, new THREE.Vector3(1,1,1));

        // build, normalize, negate, flip-sign
        const dq = buildDQ(noS, prevDQs[ni]);
        dq.forEach(v => aW.f32(v));
        prevDQs[ni] = dq;
      });
    });

    action.stop();
    mixer.stopAllAction();
  });
  DebugLogger.log('Animations written:', aW.getBuffer().byteLength);

  // ------------------------------------------------------------------------
  // 8) Patch header offsets & concatenate
  // ------------------------------------------------------------------------
  const offTex   = headerSize;
  const offModel = offTex   + texSize;
  const offRig   = offModel + modelSize;
  const offAnim  = offRig   + rigSize;

  // back-patch the four offset slots
  let ptr = versionString.length + 1;
  [offTex, offModel, offRig, offAnim].forEach(o => {
    hW.dv.setUint32(ptr, o, true);
    ptr += 4;
  });

  // assemble final buffer
  const parts = [
    new Uint8Array(hW.getBuffer()),
    new Uint8Array(tW.getBuffer()),
    new Uint8Array(mW.getBuffer()),
    new Uint8Array(rW.getBuffer()),
    new Uint8Array(aW.getBuffer())
  ];
  const total = parts.reduce((sum,p) => sum + p.length, 0);
  const out   = new Uint8Array(total);
  let  off2   = 0;
  parts.forEach(p => {
    out.set(p, off2);
    off2 += p.length;
  });

  // return a Blob URL to load in SMF viewer
  return URL.createObjectURL(new Blob([out], { type:'application/octet-stream' }));
}
