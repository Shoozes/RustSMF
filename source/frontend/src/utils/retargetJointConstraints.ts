import * as THREE from 'three';
import { measurePoseJoint, type PoseJointRange } from './poseRanges';

export interface HeadJointConstraint {
  neck: string;
  head: string;
  transitionDegrees: number;
}

export function parseClipJointConstraints(value: unknown): Record<string, HeadJointConstraint> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Joint constraints require a clip map.');
  const entries = Object.entries(value);
  if (entries.length > 128) throw new Error('Joint constraints exceed 128 clips.');
  return Object.fromEntries(entries.map(([clip, raw]) => {
    if (!clip.trim() || clip.length > 160 || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid joint constraint clip.');
    const c = raw as Record<string, unknown>;
    if (Object.keys(c).some(key => !['neck', 'head', 'transitionDegrees'].includes(key))) throw new Error('Unknown joint constraint field.');
    if ([c.neck, c.head].some(name => typeof name !== 'string' || !name.trim() || name.length > 160) || c.neck === c.head) throw new Error('Joint constraints require distinct neck/head bones.');
    if (typeof c.transitionDegrees !== 'number' || !Number.isFinite(c.transitionDegrees) || c.transitionDegrees <= 0 || c.transitionDegrees > 20) throw new Error('Joint transition requires 0-20 positive degrees.');
    return [clip, { neck: c.neck as string, head: c.head as string, transitionDegrees: c.transitionDegrees }];
  }));
}

function upperLimit(value: number, upper: number, margin: number): number {
  if (!margin) return Math.min(value, upper);
  const distance = value - (upper - margin);
  if (distance <= 0) return value;
  if (distance >= 2 * margin) return upper;
  return upper - margin + distance - distance * distance / (4 * margin);
}

/** Projection uses the detector's calibrated swing-vector/twist coordinates. */
export function constrainJointRotation(rotation: THREE.Quaternion, joint: PoseJointRange, margin = 0): THREE.Quaternion {
  const values = measurePoseJoint(joint, rotation);
  const limit = (value: number, range: [number, number]) => {
    const width = Math.min(margin, (range[1] - range[0]) / 4);
    return -upperLimit(-upperLimit(value, range[1], width), -range[0], width);
  };
  const flexion = limit(values.flexion, joint.flexionDegrees);
  const lateral = limit(values.lateral, joint.lateralDegrees);
  const twist = limit(values.twist, joint.twistDegrees);
  const axis = new THREE.Vector3(...joint.twistAxis), bend = new THREE.Vector3(...joint.bendAxis);
  const swingVector = bend.multiplyScalar(flexion).add(axis.clone().cross(new THREE.Vector3(...joint.bendAxis)).multiplyScalar(lateral));
  const angle = swingVector.length();
  const boundedAngle = upperLimit(angle, joint.maximumSwingDegrees, Math.min(margin, joint.maximumSwingDegrees / 4));
  const swing = angle > 1e-10 ? new THREE.Quaternion().setFromAxisAngle(swingVector.divideScalar(angle), THREE.MathUtils.degToRad(boundedAngle)) : new THREE.Quaternion();
  return new THREE.Quaternion(...joint.referenceRotation).multiply(swing)
    .multiply(new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(twist))).normalize();
}

/** Stateless bounded redistribution; residual is evidence, never implicit acceptance. */
export function constrainHeadChain(neck: THREE.Quaternion, head: THREE.Quaternion,
  neckRange: PoseJointRange, headRange: PoseJointRange, transitionDegrees: number) {
  const intended = neck.clone().multiply(head).normalize();
  let correctedNeck = constrainJointRotation(neck, neckRange, transitionDegrees);
  let correctedHead = constrainJointRotation(correctedNeck.clone().invert().multiply(intended).normalize(), headRange, transitionDegrees);
  for (let iteration = 0; iteration < 64; iteration++) {
    if (correctedNeck.clone().multiply(correctedHead).angleTo(intended) < 1e-7) break;
    correctedNeck = constrainJointRotation(intended.clone().multiply(correctedHead.clone().invert()).normalize(), neckRange);
    correctedHead = constrainJointRotation(correctedNeck.clone().invert().multiply(intended).normalize(), headRange);
  }
  return { neck: correctedNeck, head: correctedHead,
    residualDegrees: THREE.MathUtils.radToDeg(correctedNeck.clone().multiply(correctedHead).angleTo(intended)),
    maximumCorrectionDegrees: THREE.MathUtils.radToDeg(Math.max(neck.angleTo(correctedNeck), head.angleTo(correctedHead))) };
}
