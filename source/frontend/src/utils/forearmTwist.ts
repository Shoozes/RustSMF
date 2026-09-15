import * as THREE from 'three';

export interface ForearmTwistShare { forearm: string; hand: string; share: number }
export interface ForearmTwistReport extends ForearmTwistShare {
  axis: [number, number, number];
  referenceRotation: [number, number, number, number];
  maximumTransferredDegrees: number;
}
interface Reference {
  bone: THREE.Bone;
  localPosition: THREE.Vector3;
  localQuaternion: THREE.Quaternion;
  localScale: THREE.Vector3;
}

export function parseForearmTwistShares(value: unknown): ForearmTwistShare[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 2) throw new Error('Forearm twist requires at most two pairs.');
  const names = new Set<string>();
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid forearm twist pair.');
    const entry = raw as Record<string, unknown>;
    if (Object.keys(entry).some(key => !['forearm', 'hand', 'share'].includes(key))) throw new Error('Unknown forearm twist field.');
    for (const key of ['forearm', 'hand']) {
      const name = entry[key];
      if (typeof name !== 'string' || !name.trim() || name.length > 160 || names.has(name)) throw new Error('Forearm twist requires distinct named bones.');
      names.add(name);
    }
    if (typeof entry.share !== 'number' || !Number.isFinite(entry.share) || entry.share <= 0 || entry.share >= 1) throw new Error('Forearm twist share must be between zero and one, exclusive.');
    return { forearm: entry.forearm as string, hand: entry.hand as string, share: entry.share };
  });
}

export function parseClipForearmTwist(value: unknown): Record<string, ForearmTwistShare[]> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 256) throw new Error('Invalid per-clip forearm twist settings.');
  return Object.fromEntries(Object.entries(value).map(([clip, pairs]) => {
    if (!clip.trim() || clip.length > 160) throw new Error('Forearm twist requires a named clip.');
    return [clip, parseForearmTwistShares(pairs)];
  }));
}

/** Offline axial redistribution: the hand's complete world transform is invariant. */
export function redistributeForearmTwist(
  settings: readonly ForearmTwistShare[], references: ReadonlyMap<string, Reference>,
  rotations: Map<string, number[]>, positions: ReadonlyMap<string, number[]>, samples: number,
): ForearmTwistReport[] {
  const pairs = parseForearmTwistShares(settings);
  if (!Number.isInteger(samples) || samples < 1 || samples > 20000) throw new Error('Invalid forearm twist sample count.');
  const replacements = new Map<string, number[]>();
  const reports = pairs.map(pair => {
    const forearm = references.get(pair.forearm), hand = references.get(pair.hand);
    if (!forearm || !hand || hand.bone.parent !== forearm.bone
      || forearm.bone.children.some(child => child !== hand.bone)) throw new Error('Forearm twist requires a direct unbranched forearm/hand chain.');
    for (let node: THREE.Object3D | null = hand.bone; node; node = node.parent) {
      const scale = references.get(node.name)?.localScale ?? node.scale;
      if (![scale.x, scale.y, scale.z].every(Number.isFinite) || scale.x <= 0
        || Math.abs(scale.x - scale.y) > 1e-8 || Math.abs(scale.x - scale.z) > 1e-8) throw new Error('Forearm twist requires positive uniform chain/ancestor scales.');
    }
    if (positions.has(pair.hand)) throw new Error('Forearm twist cannot redistribute an animated wrist offset.');
    const axis = hand.localPosition.clone();
    if (!Number.isFinite(axis.lengthSq()) || axis.lengthSq() < 1e-12) throw new Error('Forearm twist requires a nonzero elbow-to-wrist axis.');
    axis.normalize();
    const reference = hand.localQuaternion.clone();
    if (![reference.x, reference.y, reference.z, reference.w].every(Number.isFinite)
      || Math.abs(reference.length() - 1) > 1e-4) throw new Error('Forearm twist received an invalid reference rotation.');
    reference.normalize();
    const referenceAxis = axis.clone().applyQuaternion(reference.clone().invert());
    const sourceForearm = rotations.get(pair.forearm), sourceHand = rotations.get(pair.hand);
    if (!sourceForearm || !sourceHand || sourceForearm.length !== samples * 4 || sourceHand.length !== samples * 4) throw new Error('Forearm twist requires both emitted rotation tracks.');
    const resultForearm: number[] = [], resultHand: number[] = [];
    let previousAngle: number | undefined, maximumTransferredDegrees = 0;
    const read = (values: number[], frame: number) => {
      const q = new THREE.Quaternion().fromArray(values, frame * 4);
      if (![q.x, q.y, q.z, q.w].every(Number.isFinite) || Math.abs(q.length() - 1) > 1e-4) throw new Error('Forearm twist received an invalid rotation.');
      return q.normalize();
    };
    const append = (values: number[], q: THREE.Quaternion) => {
      if (values.length && new THREE.Quaternion().fromArray(values, values.length - 4).dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      values.push(q.x, q.y, q.z, q.w);
    };
    for (let frame = 0; frame < samples; frame++) {
      const arm = read(sourceForearm, frame), wrist = read(sourceHand, frame);
      const delta = reference.clone().invert().multiply(wrist).normalize();
      if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
      const projected = new THREE.Vector3(delta.x, delta.y, delta.z).dot(referenceAxis);
      if (Math.hypot(projected, delta.w) < 1e-8) throw new Error(`Forearm twist is undefined at sample ${frame}; review the reference/swing.`);
      let angle = 2 * Math.atan2(projected, delta.w);
      if (previousAngle !== undefined) angle += Math.round((previousAngle - angle) / (2 * Math.PI)) * 2 * Math.PI;
      previousAngle = angle;
      const transfer = new THREE.Quaternion().setFromAxisAngle(axis, angle * pair.share);
      append(resultForearm, arm.multiply(transfer).normalize());
      append(resultHand, transfer.clone().invert().multiply(wrist).normalize());
      maximumTransferredDegrees = Math.max(maximumTransferredDegrees, Math.abs(THREE.MathUtils.radToDeg(angle * pair.share)));
    }
    const closed = (values: number[]) => read(values, 0).angleTo(read(values, samples - 1)) < 1e-5;
    if (samples > 1 && closed(sourceForearm) && closed(sourceHand) && (!closed(resultForearm) || !closed(resultHand))) throw new Error('Forearm twist would open a closed rotational seam; review winding/share.');
    replacements.set(pair.forearm, resultForearm); replacements.set(pair.hand, resultHand);
    return { ...pair, axis: axis.toArray(), referenceRotation: reference.toArray(), maximumTransferredDegrees };
  });
  for (const [bone, values] of replacements) rotations.set(bone, values);
  return reports;
}
