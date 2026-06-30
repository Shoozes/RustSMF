import * as THREE from 'three';

/**
 * Coordinate system notes (critical for fidelity):
 * - Three.js: right-handed, +Y up.
 * - SMF (GameMaker era): left-handed, +Z up (per GLBtoSMF reference).
 *
 * All SMF <-> Three boundaries MUST go through these helpers.
 * Never hardcode swizzles elsewhere.
 *
 * Dual quaternions in SMF are 8 floats: [qr_x, qr_y, qr_z, qr_w, qd_x, qd_y, qd_z, qd_w]
 * Read path: often negate the DQ.
 * Write path: normalize, negate, flip_sign for continuity between keyframes.
 */

// Vector swizzle helpers (for positions, normals, etc.)
export function smfVecToThree(v: number[] | Float32Array): THREE.Vector3 {
  // From SMF [x, y, z] (Z-up LH) to Three [x, z, -y] or per reference to_yup
  // Using the reference implementation:
  return new THREE.Vector3(v[0], v[2], -v[1]); // matches smf_transform_to_yup vector path
}

export function threeVecToSmf(v: THREE.Vector3): number[] {
  // Reverse for export
  return [v.x, -v.z, v.y]; // approximate inverse; use matrix path for precision
}

// Matrix transform (used for bind pose, world matrices, etc.)
// The reference has full norm + swap + negate Z for handedness.
export function smfMatrixToThree(src: Float32Array | number[]): Float32Array {
  const out = new Float32Array(src);
  // normalize axes
  const norm = (i0: number, i1: number, i2: number) => {
    const l = Math.hypot(out[i0], out[i1], out[i2]) || 1;
    out[i0] /= l; out[i1] /= l; out[i2] /= l;
  };
  norm(0, 4, 8);
  norm(1, 5, 9);
  norm(2, 6, 10);

  // swap Y<->Z columns
  for (const i of [1, 5, 9, 13]) {
    const t = out[i];
    out[i] = out[i + 1];
    out[i + 1] = t;
  }
  // negate Z column (handedness)
  for (const i of [2, 6, 10, 14]) out[i] = -out[i];

  return out;
}

export function threeMatrixToSmf(src: THREE.Matrix4 | Float32Array): Float32Array {
  // For export, use the to_zup logic from reference (no handedness negate in that direction in some paths)
  const arr = src instanceof THREE.Matrix4 ? src.elements : src;
  const out = new Float32Array(arr);

  const norm = (i0: number, i1: number, i2: number) => {
    const l = Math.hypot(out[i0], out[i1], out[i2]) || 1;
    out[i0] /= l; out[i1] /= l; out[i2] /= l;
  };
  norm(0, 4, 8);
  norm(1, 5, 9);
  norm(2, 6, 10);

  for (const i of [1, 5, 9, 13]) {
    const t = out[i];
    out[i] = out[i + 1];
    out[i + 1] = t;
  }
  return out;
}

// Dual quaternion helpers (core of SMF skinning & animation)
export function dqCreateFromMatrix(M: Float32Array | number[], dst = new Float32Array(8)): Float32Array {
  const t = 1 + M[0] + M[5] + M[10];
  let S: number;
  if (t > 0) {
    S = Math.sqrt(t) * 2;
    dst[0] = (M[9] - M[6]) / S;
    dst[1] = (M[2] - M[8]) / S;
    dst[2] = (M[4] - M[1]) / S;
    dst[3] = -0.25 * S;
  } else if (M[0] > M[5] && M[0] > M[10]) {
    S = Math.sqrt(1 + M[0] - M[5] - M[10]) * 2;
    dst[0] = 0.25 * S;
    dst[1] = (M[4] + M[1]) / S;
    dst[2] = (M[2] + M[8]) / S;
    dst[3] = (M[9] - M[6]) / S;
  } else if (M[5] > M[10]) {
    S = Math.sqrt(1 + M[5] - M[0] - M[10]) * 2;
    dst[0] = (M[4] + M[1]) / S;
    dst[1] = 0.25 * S;
    dst[2] = (M[9] + M[6]) / S;
    dst[3] = (M[2] - M[8]) / S;
  } else {
    S = Math.sqrt(1 + M[10] - M[0] - M[5]) * 2;
    dst[0] = (M[2] + M[8]) / S;
    dst[1] = (M[9] + M[6]) / S;
    dst[2] = 0.25 * S;
    dst[3] = (M[4] - M[1]) / S;
  }

  const tx = M[12], ty = M[13], tz = M[14];
  dst[4] = 0.5 * (tx * dst[3] + ty * dst[2] - tz * dst[1]);
  dst[5] = 0.5 * (ty * dst[3] + tz * dst[0] - tx * dst[2]);
  dst[6] = 0.5 * (tz * dst[3] + tx * dst[1] - ty * dst[0]);
  dst[7] = -0.5 * (tx * dst[0] + ty * dst[1] + tz * dst[2]);
  return dst;
}

export function dqNegate(dq: Float32Array, dst = new Float32Array(8)): Float32Array {
  for (let i = 0; i < 8; i++) dst[i] = -dq[i];
  return dst;
}

export function dqNormalize(dq: Float32Array, dst = dq): Float32Array {
  const len = Math.hypot(dq[0], dq[1], dq[2], dq[3]);

  if (!Number.isFinite(len) || len <= 1e-8) {
    dst[0] = 0;
    dst[1] = 0;
    dst[2] = 0;
    dst[3] = 1;
    dst[4] = 0;
    dst[5] = 0;
    dst[6] = 0;
    dst[7] = 0;
    return dst;
  }

  const invLen = 1 / len;

  const qrX = dq[0] * invLen;
  const qrY = dq[1] * invLen;
  const qrZ = dq[2] * invLen;
  const qrW = dq[3] * invLen;

  const qdX = Number.isFinite(dq[4]) ? dq[4] : 0;
  const qdY = Number.isFinite(dq[5]) ? dq[5] : 0;
  const qdZ = Number.isFinite(dq[6]) ? dq[6] : 0;
  const qdW = Number.isFinite(dq[7]) ? dq[7] : 0;

  const dualDotRaw = qrX * qdX + qrY * qdY + qrZ * qdZ + qrW * qdW;
  const dualDot = Number.isFinite(dualDotRaw) ? dualDotRaw : 0;

  dst[0] = qrX;
  dst[1] = qrY;
  dst[2] = qrZ;
  dst[3] = qrW;
  dst[4] = (qdX - qrX * dualDot) * invLen;
  dst[5] = (qdY - qrY * dualDot) * invLen;
  dst[6] = (qdZ - qrZ * dualDot) * invLen;
  dst[7] = (qdW - qrW * dualDot) * invLen;
  return dst;
}

export function dqFlipSign(cur: Float32Array, prev: Float32Array | null): Float32Array {
  if (!prev) return cur;
  const dot = cur[0] * prev[0] + cur[1] * prev[1] + cur[2] * prev[2] + cur[3] * prev[3];
  return dot < 0 ? dqNegate(cur) : cur;
}

export function dqToMatrix(dq: Float32Array, dst = new Float32Array(16)): Float32Array {
  const qr_x = dq[0], qr_y = dq[1], qr_z = dq[2], qr_w = dq[3];
  const qd_x = dq[4], qd_y = dq[5], qd_z = dq[6], qd_w = dq[7];

  const tx = 2 * (-qd_w * qr_x + qd_x * qr_w - qd_y * qr_z + qd_z * qr_y);
  const ty = 2 * (-qd_w * qr_y + qd_x * qr_z + qd_y * qr_w - qd_z * qr_x);
  const tz = 2 * (-qd_w * qr_z - qd_x * qr_y + qd_y * qr_x + qd_z * qr_w);

  dst[0] = qr_w * qr_w + qr_x * qr_x - qr_y * qr_y - qr_z * qr_z;
  dst[1] = 2 * qr_x * qr_y + 2 * qr_w * qr_z;
  dst[2] = 2 * qr_x * qr_z - 2 * qr_w * qr_y;
  dst[3] = 0;
  dst[4] = 2 * qr_x * qr_y - 2 * qr_w * qr_z;
  dst[5] = qr_w * qr_w - qr_x * qr_x + qr_y * qr_y - qr_z * qr_z;
  dst[6] = 2 * qr_y * qr_z + 2 * qr_w * qr_x;
  dst[7] = 0;
  dst[8] = 2 * qr_x * qr_z + 2 * qr_w * qr_y;
  dst[9] = 2 * qr_y * qr_z - 2 * qr_w * qr_x;
  dst[10] = qr_w * qr_w - qr_x * qr_x - qr_y * qr_y + qr_z * qr_z;
  dst[11] = 0;
  dst[12] = tx;
  dst[13] = ty;
  dst[14] = tz;
  dst[15] = 1;
  return dst;
}

// Convenience: DQ -> THREE.Matrix4 (after any needed transform_to_yup)
export function dqToThreeMatrix(dq: Float32Array): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const arr = dqToMatrix(dq);
  // arr is in SMF space; caller should have applied transform if needed
  m.fromArray(arr);
  return m;
}

// Decompose a (already Y-up converted) matrix into pos/quat for Three.js bones and tracks
export function decomposeMatrix(m: THREE.Matrix4): { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 } {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  return { pos, quat, scale };
}

// On import: SMF DQ -> local THREE transform (apply to_yup on the matrix first in caller)
export function dqToLocalTransform(dq: Float32Array): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  const mat = dqToThreeMatrix(dq);
  const yupMatArr = smfMatrixToThree(new Float32Array(mat.elements)); // convert space
  const m = new THREE.Matrix4().fromArray(yupMatArr);
  const { pos, quat } = decomposeMatrix(m);
  return { pos, quat };
}

export const CoordUtils = {
  smfVecToThree,
  threeVecToSmf,
  smfMatrixToThree,
  threeMatrixToSmf,
  dqCreateFromMatrix,
  dqNegate,
  dqNormalize,
  dqFlipSign,
  dqToMatrix,
  dqToThreeMatrix,
  decomposeMatrix,
  dqToLocalTransform,
};
