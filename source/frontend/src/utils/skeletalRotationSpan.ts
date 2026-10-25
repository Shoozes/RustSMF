import * as THREE from 'three';
import { chordRotationTrack, validateChordRotation } from './skeletalChordRotation';
import { rotationDifferenceDegrees } from './skeletalTerminalRotation';
import type { TwoKeyRotationBakeRecipe } from './skeletalTwoKeyRotation';

export interface RotationSpanBakeRecipe {
  clipId: string;
  startTick: number;
  maxRotationDegrees: number;
  rotations: Array<{ joint: string; values: number[][] }>;
}

export function parseRotationSpanBake(value: unknown, gaitIds: readonly string[], clipIds: readonly string[], roots: readonly string[]): RotationSpanBakeRecipe {
  const fail = (): never => { throw new Error('rotationSpanBake requires one selected gait, three unique non-root joints, 3–18 interior unit-quaternion keys per joint and a rotation bound up to 25 degrees.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const v = value as Record<string, unknown>, id = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(x);
  if (Object.keys(v).sort().join(',') !== 'clipId,maxRotationDegrees,rotations,startTick'
    || !id(v.clipId) || !gaitIds.includes(v.clipId) || !clipIds.includes(v.clipId)
    || !Number.isInteger(v.startTick) || (v.startTick as number) < 1 || (v.startTick as number) > 3597
    || typeof v.maxRotationDegrees !== 'number' || !Number.isFinite(v.maxRotationDegrees) || v.maxRotationDegrees <= 0 || v.maxRotationDegrees > 25
    || !Array.isArray(v.rotations) || v.rotations.length !== 3) fail();
  let count = 0;
  const rotations = Array.from(v.rotations as unknown[], entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail();
    const r = entry as Record<string, unknown>;
    if (Object.keys(r).sort().join(',') !== 'joint,values' || !id(r.joint) || roots.includes(r.joint)
      || !Array.isArray(r.values) || r.values.length < 3 || r.values.length > 18 || (count && r.values.length !== count)) fail();
    count = (r.values as unknown[]).length;
    const values = Array.from(r.values as unknown[], q => {
      if (!Array.isArray(q) || q.length !== 4 || !Array.from(q).every(n => typeof n === 'number' && Number.isFinite(n)) || Math.abs(Math.hypot(...q) - 1) > 1e-6) fail();
      return Array.from(q as number[]);
    });
    return { joint: r.joint as string, values };
  });
  if (new Set(rotations.map(r => r.joint)).size !== 3 || (v.startTick as number) + count > 3600) fail();
  return { clipId: v.clipId as string, startTick: v.startTick as number, maxRotationDegrees: v.maxRotationDegrees as number, rotations };
}

export function assertDisjointRotationSpan(span: RotationSpanBakeRecipe, others: readonly TwoKeyRotationBakeRecipe[]): void {
  const end = span.startTick + span.rotations[0].values.length - 1;
  if (others.some(s => s.clipId === span.clipId && span.startTick <= s.startTick + 2 && end >= s.startTick - 1
    && s.rotations.some(r => span.rotations.some(t => t.joint === r.joint)))) throw new Error('rotationSpanBake cannot overlap or adjoin another rotation footprint.');
}

/** Author only the declared rotation values and their adjacent canonical chords. */
export function bakeRotationSpan(clip: THREE.AnimationClip, recipe: RotationSpanBakeRecipe, bones: readonly THREE.Bone[], roots: readonly string[], signal?: AbortSignal) {
  signal?.throwIfAborted();
  const spec = parseRotationSpanBake(recipe, [clip.name], [clip.name], [...roots, ...bones.filter(b => !bones.includes(b.parent as THREE.Bone)).map(b => b.name)]);
  const duration = Math.round(clip.duration * 60), count = spec.rotations[0].values.length, end = spec.startTick + count - 1;
  if (duration < 4 || duration > 3600 || Math.abs(duration - clip.duration * 60) > 1e-3 || end >= duration) throw new Error('rotationSpanBake requires a strictly interior stored tick span.');
  const chain = spec.rotations.map(r => bones.filter(b => b.name === r.joint));
  if (chain.some((matches, i) => matches.length !== 1 || (i > 0 && matches[0].parent !== chain[i - 1][0]))) throw new Error('rotationSpanBake requires three existing joints in direct parent order.');
  const replacements = new Map<string, THREE.QuaternionKeyframeTrack>();
  const corrections = spec.rotations.map(r => {
    signal?.throwIfAborted();
    const name = r.joint + '.quaternion', matches = clip.tracks.filter(t => t.name === name);
    if (matches.length !== 1) throw new Error('rotationSpanBake requires one existing quaternion channel per joint.');
    const original = matches[0]; validateChordRotation(original, duration);
    if (original.times.length !== duration + 1) throw new Error('rotationSpanBake requires the complete stored tick grid.');
    const keys = Array.from({ length: duration + 1 }, (_, tick) => Array.from(original.values.slice(tick * 12 + 4, tick * 12 + 8)));
    const before = keys.slice(spec.startTick, end + 1).map(q => [...q]);
    r.values.forEach((q, i) => { keys[spec.startTick + i] = q; });
    const track = chordRotationTrack(name, Array.from(original.times), keys.flat()); validateChordRotation(track, duration);
    const values = r.values.map((requested, i) => {
      const tick = spec.startTick + i, after = Array.from(track.values.slice(tick * 12 + 4, tick * 12 + 8)), storedCorrectionDegrees = rotationDifferenceDegrees(before[i], after);
      if (!Number.isFinite(storedCorrectionDegrees) || storedCorrectionDegrees > spec.maxRotationDegrees) throw new Error('Stored rotation-span correction exceeds its declared bound.');
      return { tick, before: before[i], requested: [...requested], after, storedCorrectionDegrees };
    });
    for (let tick = 0; tick <= duration; tick++) if ((tick < spec.startTick || tick > end) && track.values.slice(tick * 12 + 4, tick * 12 + 8).some((v, i) => v !== original.values[tick * 12 + 4 + i])) throw new Error('rotationSpanBake changed an unselected stored rotation.');
    const prefix = (spec.startTick - 1) * 12 + 8, suffix = (end + 1) * 12 + 4;
    if (track.values.slice(0, prefix).some((v, i) => v !== original.values[i]) || track.values.slice(suffix).some((v, i) => v !== original.values[suffix + i])) throw new Error('rotationSpanBake changed a nonadjacent tangent.');
    replacements.set(name, track); return { joint: r.joint, values };
  });
  signal?.throwIfAborted();
  return { clip: new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.map(t => replacements.get(t.name) ?? t)),
    report: { clipId: clip.name, policy: 'bounded-interior-rotation-span.v1' as const, ticks: Array.from({ length: count }, (_, i) => spec.startTick + i), maxRotationDegrees: spec.maxRotationDegrees, corrections } };
}
