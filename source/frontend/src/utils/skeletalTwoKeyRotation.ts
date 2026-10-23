import * as THREE from 'three';
import { chordRotationTrack, validateChordRotation } from './skeletalChordRotation';
import { rotationDifferenceDegrees } from './skeletalTerminalRotation';

export interface TwoKeyRotationBakeRecipe {
  clipId: string;
  startTick: number;
  maxRotationDegrees: number;
  rotations: Array<{ joint: string; values: number[][] }>;
}

export function parseTwoKeyRotationBake(value: unknown, gaitIds: readonly string[], clipIds: readonly string[], roots: readonly string[]): TwoKeyRotationBakeRecipe {
  const fail = (): never => { throw new Error('twoKeyRotationBake requires one selected gait, an internal adjacent tick pair, three unique non-root joints, two unit quaternions per joint and a finite rotation bound.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const v = value as Record<string, unknown>;
  const id = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(x);
  if (Object.keys(v).sort().join(',') !== 'clipId,maxRotationDegrees,rotations,startTick'
    || !id(v.clipId) || !gaitIds.includes(v.clipId) || !clipIds.includes(v.clipId)
    || !Number.isInteger(v.startTick) || (v.startTick as number) < 1 || (v.startTick as number) > 3598
    || typeof v.maxRotationDegrees !== 'number' || !Number.isFinite(v.maxRotationDegrees)
    || v.maxRotationDegrees <= 0 || v.maxRotationDegrees > 180
    || !Array.isArray(v.rotations) || v.rotations.length !== 3) fail();
  const rotations = (v.rotations as unknown[]).map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail();
    const r = entry as Record<string, unknown>;
    if (Object.keys(r).sort().join(',') !== 'joint,values' || !id(r.joint) || roots.includes(r.joint)
      || !Array.isArray(r.values) || r.values.length !== 2
      || !r.values.every(q => Array.isArray(q) && q.length === 4 && q.every(n => typeof n === 'number' && Number.isFinite(n)) && Math.abs(Math.hypot(...q) - 1) <= 1e-6)) fail();
    return { joint: r.joint as string, values: (r.values as number[][]).map(q => [...q]) };
  });
  if (new Set(rotations.map(r => r.joint)).size !== 3) fail();
  return { clipId: v.clipId as string, startTick: v.startTick as number, maxRotationDegrees: v.maxRotationDegrees as number, rotations };
}

/** Author only the selected values and their adjacent chord tangents. */
export function bakeTwoKeyRotations(clip: THREE.AnimationClip, spec: TwoKeyRotationBakeRecipe, bones: readonly THREE.Bone[], roots: readonly string[], signal?: AbortSignal) {
  signal?.throwIfAborted();
  spec = parseTwoKeyRotationBake(spec, [clip.name], [clip.name], [...roots, ...bones.filter(b => !bones.includes(b.parent as THREE.Bone)).map(b => b.name)]);
  const ticks = Math.round(clip.duration * 60);
  if (ticks < 3 || ticks > 3600 || Math.abs(ticks - clip.duration * 60) > 1e-3 || spec.startTick + 1 >= ticks) throw new Error('twoKeyRotationBake requires two adjacent internal stored ticks.');
  const chain = spec.rotations.map(r => bones.filter(b => b.name === r.joint));
  if (chain.some((matches, i) => matches.length !== 1 || (i > 0 && matches[0].parent !== chain[i - 1][0]))) throw new Error('twoKeyRotationBake requires three existing joints in direct parent order.');
  const replacements = new Map<string, THREE.QuaternionKeyframeTrack>();
  const corrections = spec.rotations.map(rotation => {
    signal?.throwIfAborted();
    const name = `${rotation.joint}.quaternion`, matches = clip.tracks.filter(t => t.name === name);
    if (matches.length !== 1) throw new Error(`twoKeyRotationBake needs one quaternion channel for ${rotation.joint}.`);
    const original = matches[0];
    validateChordRotation(original, ticks);
    if (original.times.length !== ticks + 1) throw new Error('twoKeyRotationBake needs the complete stored tick grid.');
    const keys = Array.from({ length: ticks + 1 }, (_, tick) => Array.from(original.values.slice(tick * 12 + 4, tick * 12 + 8)));
    const before = keys.slice(spec.startTick, spec.startTick + 2).map(q => [...q]);
    rotation.values.forEach((q, i) => { keys[spec.startTick + i] = q; });
    const track = chordRotationTrack(name, Array.from(original.times), keys.flat());
    validateChordRotation(track, ticks);
    const values = rotation.values.map((_, i) => {
      const tick = spec.startTick + i, after = Array.from(track.values.slice(tick * 12 + 4, tick * 12 + 8));
      const storedCorrectionDegrees = rotationDifferenceDegrees(before[i], after);
      if (!Number.isFinite(storedCorrectionDegrees) || storedCorrectionDegrees > spec.maxRotationDegrees) throw new Error('Stored two-key rotation correction exceeds its declared bound.');
      return { tick, before: before[i], requested: [...rotation.values[i]], after, storedCorrectionDegrees };
    });
    for (let tick = 0; tick <= ticks; tick++) {
      if (tick !== spec.startTick && tick !== spec.startTick + 1
        && track.values.slice(tick * 12 + 4, tick * 12 + 8).some((v, i) => v !== original.values[tick * 12 + 4 + i])) throw new Error('Two-key authoring changed an unselected stored rotation.');
    }
    const prefix = (spec.startTick - 1) * 12 + 8, suffix = (spec.startTick + 2) * 12 + 4;
    if (track.values.slice(0, prefix).some((v, i) => v !== original.values[i])
      || track.values.slice(suffix).some((v, i) => v !== original.values[suffix + i])) throw new Error('Two-key authoring changed a nonadjacent tangent.');
    replacements.set(name, track);
    return { joint: rotation.joint, values };
  });
  signal?.throwIfAborted();
  return {
    clip: new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.map(t => replacements.get(t.name) ?? t)),
    report: { clipId: clip.name, policy: 'two-adjacent-interior-rotations.v1', ticks: [spec.startTick, spec.startTick + 1], maxRotationDegrees: spec.maxRotationDegrees, corrections },
  };
}
