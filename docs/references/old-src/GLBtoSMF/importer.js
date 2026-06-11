// importer.js
import { DebugLogger } from './DebugLogger.js';
import {
  smf_dq_to_matrix,
  smf_transform_to_yup
} from './smf_dq_math.js';

// BinaryReader: Chainable little-endian reader.
class BinaryReader {
  constructor(buffer) {
    this.dv = new DataView(buffer);
    this.off = 0;
  }

  u8()  { const v = this.dv.getUint8 (this.off); this.off += 1; return v; }
  u16() { const v = this.dv.getUint16(this.off, true); this.off += 2; return v; }
  u32() { const v = this.dv.getUint32(this.off, true); this.off += 4; return v; }
  f32() { const v = this.dv.getFloat32(this.off, true); this.off += 4; return v; }

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

// Parse SMF file from ArrayBuffer into structured data.
export function importSMF(buffer) {
  const reader = new BinaryReader(buffer);
  DebugLogger.log('Starting SMF import');

  // Header: version strZ + 4 offsets (TEXTURE, MODEL, RIG, ANIM)
  const version = reader.strZ();
  let isV12 = version === 'SMF_v12_by_Snidr_and_Bart';
  let isV11 = version === 'SMF_v11_by_Snidr_and_Bart';
  if (!isV12 && !isV11) {
    throw new Error(`Unsupported SMF version: ${version}`);
  }
  DebugLogger.log(`Detected SMF version: ${version}`);
  const offTex = reader.u32();
  const offModel = reader.u32();
  const offRig = reader.u32();
  const offAnim = reader.u32();
  DebugLogger.log('Header parsed:', { version, offTex, offModel, offRig, offAnim });

  // TEXTURE chunk
  reader.off = offTex;
  const texCount = reader.u8();
  const textures = [];
  for (let i = 0; i < texCount; i++) {
    const name = reader.strZ();
    const w = reader.u16();
    const h = reader.u16();
    const size = w * h * 4;
    const data = new Uint8Array(buffer, reader.off, size);
    reader.off += size;

    // Create Image from RGBA bytes via Canvas
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    imgData.data.set(data);
    ctx.putImageData(imgData, 0, 0);
    const image = new Image();
    image.src = canvas.toDataURL('image/png');
    const previewUrl = image.src;
    textures.push({ name, image, previewUrl });
    DebugLogger.log(`Texture[${i}] "${name}": ${w}x${h}`);
  }

  // MODEL chunk
  reader.off = offModel;
  const modelCount = reader.u8();
  const meshes = [];
  const texNameToIdx = new Map(textures.map((t, i) => [t.name, i]));
  for (let i = 0; i < modelCount; i++) {
    const bytes = reader.u32();
    const verts = bytes / 44;  // 44 bytes per vertex
    if (!Number.isInteger(verts)) {
      throw new Error(`Invalid vertex bytes for model[${i}]: ${bytes}`);
    }
    const triangles = [];
    const positions = new Float32Array(verts * 3);
    const normals = new Float32Array(verts * 3);
    const uvs = new Float32Array(verts * 2);
    const tangents = new Float32Array(verts * 4);
    const skinIndices = new Uint16Array(verts * 4);  // Use u16 for Three.js
    const skinWeights = new Float32Array(verts * 4);
    for (let v = 0; v < verts; v++) {
      // Read + convert to Three.js coords
      let pos = [reader.f32(), reader.f32(), reader.f32()];
      pos = smf_transform_to_yup(pos, false);
      positions[v*3+0] = pos[0]; positions[v*3+1] = pos[1]; positions[v*3+2] = pos[2];

      let nor = [reader.f32(), reader.f32(), reader.f32()];
      nor = smf_transform_to_yup(nor, false);
      normals[v*3+0] = nor[0]; normals[v*3+1] = nor[1]; normals[v*3+2] = nor[2];

      uvs[v*2+0] = reader.f32();
      uvs[v*2+1] = reader.f32();

      // Tangent: unpack [0..255] to [-1..1]
      tangents[v*4+0] = (reader.u8() / 127) - 1;
      tangents[v*4+1] = (reader.u8() / 127) - 1;
      tangents[v*4+2] = (reader.u8() / 127) - 1;
      tangents[v*4+3] = reader.u8();  // Unused?

      // Skin: node indices + weights [0..255] to [0..1]
      for (let j = 0; j < 4; j++) {
        skinIndices[v*4 + j] = reader.u8();
      }
      for (let j = 0; j < 4; j++) {
        skinWeights[v*4 + j] = reader.u8() / 255;
      }
    }

    // Non-indexed triangles: every 3 verts
    for (let t = 0; t < verts / 3; t++) {
      triangles.push([t*3, t*3+1, t*3+2]);
    }

    // Skip empty nameZ, get tex name, visible
    reader.strZ();  // Empty
    const texName = reader.strZ();
    const visible = reader.u8();
    const texIdx = texNameToIdx.get(texName) ?? -1;

    meshes.push({
      name: `Mesh_${i}`,
      verts,
      triangles,
      texIdx,
      positions,
      normals,
      uvs,
      tangents,
      skinIndices,
      skinWeights,
      visible
    });
    DebugLogger.log(`Model[${i}]: verts=${verts}, tex="${texName}"`);
  }

  // RIG chunk
  reader.off = offRig;
  const nodeCount = reader.u32();
  const bones = [];
  for (let i = 0; i < nodeCount; i++) {
    const dq = new Float32Array(8);
    for (let j = 0; j < 8; j++) dq[j] = reader.f32();
    for (let j = 0; j < 8; j++) dq[j] = -dq[j];
    const parent = reader.u32();
    const isBone = reader.u8();
    if (!isV12) {
      const locked = reader.u8(); // Ignore for v11
    }
    const axis = [reader.f32(), reader.f32(), reader.f32()];

    bones.push({
      index: i,
      parent,
      isBone,
      dq,
      axis
    });
    DebugLogger.log(`Node[${i}]: parent=${parent}, isBone=${isBone}`);
  }

  // ANIM chunk
  reader.off = offAnim;
  const animCount = reader.u8();
  const animations = [];
  for (let i = 0; i < animCount; i++) {
    const name = reader.strZ();
    const loop = reader.u8();
    const duration = reader.f32() / 1000;  // ms to seconds
    const interp = reader.u8();
    const mult = reader.u8();
    if (isV12) {
      const locked = reader.u16(); // lockedBonesNum
      for (let l = 0; l < locked; l++) {
        reader.u16(); // Ignore individual locked bones
      }
    }
    const frameCount = reader.u32();

    const times = [];
    const frames = [];  // Per-frame: array of node DQs
    for (let f = 0; f < frameCount; f++) {
      const normTime = reader.f32();
      times.push(normTime * duration);
      const frameDqs = [];
      for (let n = 0; n < nodeCount; n++) {
        const dq = new Float32Array(8);
        for (let j = 0; j < 8; j++) dq[j] = reader.f32();
        for (let j = 0; j < 8; j++) dq[j] = -dq[j];
        frameDqs.push(dq);
      }
      frames.push(frameDqs);
    }

    animations.push({
      name,
      duration,
      times,
      frames,
      nodeCount
    });
    DebugLogger.log(`Anim[${i}] "${name}": frames=${frameCount}, duration=${duration}s`);
  }

  return { meshes, textures, bones, animations };
}