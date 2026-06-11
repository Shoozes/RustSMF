// smf_dq_math.js
import { vec3 } from 'gl-matrix';

/*───────────────────────────────────────────────────────────────────────────────
  smf_transform_to_zup(src, isMatrix = true)

  • Three.js uses a right–handed Y-up system.
  • SMF uses a left-handed Z-up system.

  This helper either:
    – swaps Y↔Z on a vector  [x,y,z]  →  [x,z,y]   (isMatrix=false)
    – strips scale + swaps columns 1↔2 on a 4×4 matrix (isMatrix=true)

  Returns a *new* Float32Array(16) for matrices or a new vec3 for vectors.
───────────────────────────────────────────────────────────────────────────────*/
export function smf_transform_to_zup(src, isMatrix = true) {
  if (!isMatrix) {
    return vec3.fromValues(src[0], src[2], src[1]);          // vector swizzle
  }

  const out = new Float32Array(src);                         // clone

  const norm = (i0, i1, i2) => {
    const l = Math.hypot(out[i0], out[i1], out[i2]) || 1;
    out[i0] /= l; out[i1] /= l; out[i2] /= l;
  };
  norm(0, 4,  8);   // X-axis
  norm(1, 5,  9);   // Y-axis
  norm(2, 6, 10);   // Z-axis

  for (const i of [1, 5, 9, 13]) {                          // swap Y↔Z columns
    const t      = out[i];
    out[i]       = out[i + 1];
    out[i + 1]   = t;
  }
  return out;
}

/*───────────────────────────────────────────────────────────────────────────────
  smf_dq_create_from_matrix(M [, dst])

  From SMF-space 4×4 matrix → dual quaternion
  dst defaults to a new Float32Array(8).

  Layout: [ qr_x qr_y qr_z qr_w  qd_x qd_y qd_z qd_w ]
───────────────────────────────────────────────────────────────────────────────*/
export function smf_dq_create_from_matrix(M, dst = new Float32Array(8)) {
  const t = 1 + M[0] + M[5] + M[10];
  let S;
  if (t > 0) {
    S = Math.sqrt(t) * 2;
    dst[0] = (M[ 9] - M[ 6]) / S;
    dst[1] = (M[ 2] - M[ 8]) / S;
    dst[2] = (M[ 4] - M[ 1]) / S;
    dst[3] = -0.25 * S;
  } else if (M[0] > M[5] && M[0] > M[10]) {
    S      = Math.sqrt(1 + M[0] - M[5] - M[10]) * 2;
    dst[0] =  0.25 * S;
    dst[1] = (M[ 4] + M[ 1]) / S;
    dst[2] = (M[ 2] + M[ 8]) / S;
    dst[3] = (M[ 9] - M[ 6]) / S;
  } else if (M[5] > M[10]) {
    S      = Math.sqrt(1 + M[5] - M[0] - M[10]) * 2;
    dst[0] = (M[ 4] + M[ 1]) / S;
    dst[1] =  0.25 * S;
    dst[2] = (M[ 9] + M[ 6]) / S;
    dst[3] = (M[ 2] - M[ 8]) / S;
  } else {
    S      = Math.sqrt(1 + M[10] - M[0] - M[5]) * 2;
    dst[0] = (M[ 2] + M[ 8]) / S;
    dst[1] = (M[ 9] + M[ 6]) / S;
    dst[2] =  0.25 * S;
    dst[3] = (M[ 4] - M[ 1]) / S;
  }

  const tx = M[12], ty = M[13], tz = M[14];
  dst[4] =  0.5 * ( tx*dst[3] + ty*dst[2] - tz*dst[1] );
  dst[5] =  0.5 * ( ty*dst[3] + tz*dst[0] - tx*dst[2] );
  dst[6] =  0.5 * ( tz*dst[3] + tx*dst[1] - ty*dst[0] );
  dst[7] = -0.5 * ( tx*dst[0] + ty*dst[1] + tz*dst[2] );

  return dst;
}

/*───────────────────────────────────────────────────────────────────────────────*/
export function smf_dq_negate(dq, dst = new Float32Array(8)) {
  for (let i = 0; i < 8; i++) dst[i] = -dq[i];
  return dst;
}
/*───────────────────────────────────────────────────────────────────────────────*/
export function smf_dq_normalize(dq, dst = dq) {
  const invLen = 1 / Math.hypot(dq[0],dq[1],dq[2],dq[3]);
  dst[0]=dq[0]*invLen; dst[1]=dq[1]*invLen;
  dst[2]=dq[2]*invLen; dst[3]=dq[3]*invLen;
  const d = dst[0]*dq[4] + dst[1]*dq[5] + dst[2]*dq[6] + dst[3]*dq[7];
  dst[4]=(dq[4]-dst[0]*d)*invLen;
  dst[5]=(dq[5]-dst[1]*d)*invLen;
  dst[6]=(dq[6]-dst[2]*d)*invLen;
  dst[7]=(dq[7]-dst[3]*d)*invLen;
  return dst;
}
/*───────────────────────────────────────────────────────────────────────────────*/
export function smf_dq_flip_sign(cur, prev) {
  if (!prev) return cur;
  const dot = cur[0]*prev[0]+cur[1]*prev[1]+cur[2]*prev[2]+cur[3]*prev[3];
  return dot < 0 ? smf_dq_negate(cur) : cur;
}

// Add: DQ to 4x4 matrix (SMF space)
export function smf_dq_to_matrix(dq, dst = new Float32Array(16)) {
  const qr_x = dq[0], qr_y = dq[1], qr_z = dq[2], qr_w = dq[3];
  const qd_x = dq[4], qd_y = dq[5], qd_z = dq[6], qd_w = dq[7];

  const tx = 2 * (-qd_w * qr_x + qd_x * qr_w - qd_y * qr_z + qd_z * qr_y);
  const ty = 2 * (-qd_w * qr_y + qd_x * qr_z + qd_y * qr_w - qd_z * qr_x);
  const tz = 2 * (-qd_w * qr_z - qd_x * qr_y + qd_y * qr_x + qd_z * qr_w);

  dst[0]  = qr_w * qr_w + qr_x * qr_x - qr_y * qr_y - qr_z * qr_z;
  dst[1]  = 2 * qr_x * qr_y + 2 * qr_w * qr_z;
  dst[2]  = 2 * qr_x * qr_z - 2 * qr_w * qr_y;
  dst[3]  = 0;
  dst[4]  = 2 * qr_x * qr_y - 2 * qr_w * qr_z;
  dst[5]  = qr_w * qr_w - qr_x * qr_x + qr_y * qr_y - qr_z * qr_z;
  dst[6]  = 2 * qr_y * qr_z + 2 * qr_w * qr_x;
  dst[7]  = 0;
  dst[8]  = 2 * qr_x * qr_z + 2 * qr_w * qr_y;
  dst[9]  = 2 * qr_y * qr_z - 2 * qr_w * qr_x;
  dst[10] = qr_w * qr_w - qr_x * qr_x - qr_y * qr_y + qr_z * qr_z;
  dst[11] = 0;
  dst[12] = tx;
  dst[13] = ty;
  dst[14] = tz;
  dst[15] = 1;
  return dst;
}

// Add: Inverse of smf_transform_to_zup: Z-up LH to Y-up RH.
export function smf_transform_to_yup(src, isMatrix = true) {
  if (!isMatrix) {
    return [src[0], src[2], -src[1]];  // Swap Y↔Z, negate new Z
  }

  const out = new Float32Array(src);

  // Normalize axes
  const norm = (i0, i1, i2) => {
    const l = Math.hypot(out[i0], out[i1], out[i2]) || 1;
    out[i0] /= l; out[i1] /= l; out[i2] /= l;
  };
  norm(0, 4, 8);   // X
  norm(1, 5, 9);   // Y
  norm(2, 6, 10);  // Z

  // Swap Y↔Z columns
  for (const i of [1, 5, 9, 13]) {
    const t = out[i];
    out[i] = out[i + 1];
    out[i + 1] = t;
  }

  // Negate Z column for handedness
  for (const i of [2, 6, 10, 14]) out[i] = -out[i];

  return out;
}