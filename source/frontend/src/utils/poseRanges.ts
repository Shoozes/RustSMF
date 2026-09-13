import * as THREE from 'three';

type Vector = [number, number, number];
type Rotation = [number, number, number, number];
type Range = [number, number];
export interface PoseJointRange {
  bone: string;
  referenceRotation: Rotation;
  /** Axes in the calibrated bone's reference-local frame. */
  twistAxis: Vector;
  bendAxis: Vector;
  flexionDegrees: Range;
  lateralDegrees: Range;
  twistDegrees: Range;
  maximumSwingDegrees: number;
}
export interface PoseRangeProfile {
  schema: 'rustsmf.pose-ranges.v1';
  id: string;
  policy: 'report' | 'reject';
  joints: PoseJointRange[];
}
export interface PoseRangeIssue {
  bone: string;
  component: string;
  limits: Range;
  firstFrame: number;
  lastFrame: number;
  worstFrame: number;
  worstDegrees: number;
  excessDegrees: number;
  samples: number;
}
export interface PoseRangeReport {
  profile: string;
  clip: string;
  status: 'within-profile' | 'review-required';
  sampleCount: number;
  checkedJoints: number;
  issues: PoseRangeIssue[];
}
const fail = (message: string): never => { throw new Error(`Body range profile: ${message}`); };
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('expected an object');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key))) fail('unknown field');
  return result;
}
function numbers(value: unknown, count: number): number[] {
  if (!Array.isArray(value) || value.length !== count || !value.every(n => typeof n === 'number' && Number.isFinite(n))) return fail('non-finite or malformed calibration');
  return [...value];
}
function unit(value: unknown, count: number): number[] {
  const result = numbers(value, count);
  if (Math.abs(Math.hypot(...result) - 1) > 1e-4) fail('axes and reference rotations must be unit length');
  return result;
}
function range(value: unknown): Range {
  const result = numbers(value, 2) as Range;
  if (result[0] < -180 || result[1] > 180 || result[0] >= result[1]) fail('angle ranges must increase within [-180, 180]');
  return result;
}
export function parsePoseRangeProfile(value: unknown): PoseRangeProfile {
  const p = record(value, ['schema', 'id', 'policy', 'joints']);
  if (p.schema !== 'rustsmf.pose-ranges.v1' || typeof p.id !== 'string' || !/^[\w.-]{1,80}$/.test(p.id)) fail('invalid identity');
  if (p.policy !== 'report' && p.policy !== 'reject') fail('policy must be report or reject');
  if (!Array.isArray(p.joints) || !p.joints.length || p.joints.length > 64) fail('expected 1–64 joints');
  const joints = (p.joints as unknown[]).map(value => {
    const j = record(value, ['bone', 'referenceRotation', 'twistAxis', 'bendAxis', 'flexionDegrees', 'lateralDegrees', 'twistDegrees', 'maximumSwingDegrees']);
    if (typeof j.bone !== 'string' || !j.bone.trim() || j.bone.length > 160) fail('invalid bone name');
    const twistAxis = unit(j.twistAxis, 3) as Vector, bendAxis = unit(j.bendAxis, 3) as Vector;
    if (Math.abs(new THREE.Vector3(...twistAxis).dot(new THREE.Vector3(...bendAxis))) > 1e-4) fail('bend and twist axes must be perpendicular');
    if (typeof j.maximumSwingDegrees !== 'number' || !Number.isFinite(j.maximumSwingDegrees) || j.maximumSwingDegrees <= 0 || j.maximumSwingDegrees > 180) fail('invalid swing cone');
    return {bone:j.bone as string, referenceRotation:unit(j.referenceRotation,4) as Rotation, twistAxis, bendAxis,
      flexionDegrees:range(j.flexionDegrees), lateralDegrees:range(j.lateralDegrees), twistDegrees:range(j.twistDegrees), maximumSwingDegrees:j.maximumSwingDegrees as number};
  });
  if (new Set(joints.map(j=>j.bone)).size !== joints.length) fail('duplicate joint');
  return {schema:'rustsmf.pose-ranges.v1',id:p.id as string,policy:p.policy as PoseRangeProfile['policy'],joints};
}

/** Swing/twist decomposition avoids Euler wrap and rig-axis assumptions. */
export function measurePoseJoint(joint: PoseJointRange, rotation: THREE.Quaternion) {
  if (![rotation.x,rotation.y,rotation.z,rotation.w].every(Number.isFinite) || Math.abs(rotation.length()-1)>1e-4) fail(`invalid animated rotation for ${joint.bone}`);
  const delta = new THREE.Quaternion(...joint.referenceRotation).invert().multiply(rotation).normalize();
  const sign = delta.w !== 0 ? Math.sign(delta.w) : Math.sign(delta.x || delta.y || delta.z);
  if (sign < 0) delta.set(-delta.x,-delta.y,-delta.z,-delta.w);
  const axis = new THREE.Vector3(...joint.twistAxis), bend = new THREE.Vector3(...joint.bendAxis);
  const projected = new THREE.Vector3(delta.x,delta.y,delta.z).dot(axis);
  const twist = new THREE.Quaternion(axis.x*projected,axis.y*projected,axis.z*projected,delta.w);
  if (twist.lengthSq()<1e-12) twist.identity(); else twist.normalize();
  const swing = delta.clone().multiply(twist.clone().invert()).normalize();
  const vector = new THREE.Vector3(swing.x,swing.y,swing.z);
  const angle = 2*Math.atan2(vector.length(),Math.max(0,swing.w));
  if (vector.lengthSq()>1e-12) vector.normalize().multiplyScalar(THREE.MathUtils.radToDeg(angle));
  const twistAngle = THREE.MathUtils.radToDeg(2*Math.atan2(new THREE.Vector3(twist.x,twist.y,twist.z).dot(axis),twist.w));
  return {flexion:vector.dot(bend), lateral:vector.dot(axis.clone().cross(bend)), twist:twistAngle, swing:THREE.MathUtils.radToDeg(angle)};
}

/** Read-only, bounded scan. Frame indices refer to the supplied sampling contract. */
export function auditPoseRanges(profile: PoseRangeProfile, clip: string, frames: number,
  availableBones: ReadonlySet<string>, rotationAt: (frame: number, bone: string) => THREE.Quaternion): PoseRangeReport {
  const p = parsePoseRangeProfile(profile);
  if (!Number.isInteger(frames) || frames < 1 || frames > 20000) fail('sample count outside 1–20000');
  for (const j of p.joints) if (!availableBones.has(j.bone)) fail(`missing bone ${j.bone}`);
  const issues = new Map<string,PoseRangeIssue>();
  for (let frame=0;frame<frames;frame++) for (const joint of p.joints) {
    const values = measurePoseJoint(joint,rotationAt(frame,joint.bone));
    for (const [component,limits] of Object.entries({flexion:joint.flexionDegrees,lateral:joint.lateralDegrees,twist:joint.twistDegrees,swing:[0,joint.maximumSwingDegrees] as Range})) {
      const value=values[component as keyof typeof values],excess=Math.max(limits[0]-value,value-limits[1]);
      if (excess<=1e-4) continue;
      const key=`${joint.bone}:${component}`, prior=issues.get(key);
      if (!prior) issues.set(key,{bone:joint.bone,component,limits,firstFrame:frame,lastFrame:frame,worstFrame:frame,worstDegrees:value,excessDegrees:excess,samples:1});
      else {prior.lastFrame=frame;prior.samples++;if(excess>prior.excessDegrees){prior.worstFrame=frame;prior.worstDegrees=value;prior.excessDegrees=excess;}}
    }
  }
  return {profile:p.id,clip,status:issues.size?'review-required':'within-profile',sampleCount:frames,checkedJoints:p.joints.length,issues:[...issues.values()]};
}
export function poseRangeSummary(report: PoseRangeReport): string {
  const first=report.issues[0];
  return first ? `${report.clip}: ${report.issues.length} body-range flags; ${first.bone} ${first.component} ${first.worstDegrees.toFixed(1)}° at frame ${first.worstFrame} (range ${first.limits.join(' to ')}°)` : `${report.clip}: within ${report.profile} ranges`;
}
