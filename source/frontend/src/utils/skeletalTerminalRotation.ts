import * as THREE from 'three';
import { chordRotationTrack, validateChordRotation } from './skeletalChordRotation';

export interface TerminalRotationClosureRecipe {
  clipId: string;
  startTick: number;
  joints: string[];
  maxRotationDegrees: number;
}

export function parseTerminalRotationClosure(value: unknown, gaitIds: readonly string[], clipIds: readonly string[], roots: readonly string[]): TerminalRotationClosureRecipe {
  const fail = (): never => { throw new Error('terminalRotationClosure requires a selected gait, final integer startTick, unique non-root joints and a finite rotation bound.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const v = value as Record<string, unknown>;
  const id = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(x);
  if (Object.keys(v).sort().join(',') !== 'clipId,joints,maxRotationDegrees,startTick'
    || !id(v.clipId) || !gaitIds.includes(v.clipId) || !clipIds.includes(v.clipId)
    || !Number.isInteger(v.startTick) || (v.startTick as number) < 1 || (v.startTick as number) > 3599
    || !Array.isArray(v.joints) || v.joints.length < 1 || v.joints.length > 63
    || !v.joints.every(j => id(j) && !roots.includes(j)) || new Set(v.joints).size !== v.joints.length
    || typeof v.maxRotationDegrees !== 'number' || !Number.isFinite(v.maxRotationDegrees)
    || v.maxRotationDegrees <= 0 || v.maxRotationDegrees > 180) fail();
  return { clipId: v.clipId as string, startTick: v.startTick as number, joints: [...v.joints as string[]], maxRotationDegrees: v.maxRotationDegrees as number };
}

export function rotationDifferenceDegrees(a: readonly number[], b: readonly number[]): number {
  return new THREE.Quaternion().fromArray(a).normalize().angleTo(new THREE.Quaternion().fromArray(b).normalize()) * 180 / Math.PI;
}

/** Replace only selected terminal rotation values; never mutate source tracks. */
export function closeTerminalRotations(clip: THREE.AnimationClip, spec: TerminalRotationClosureRecipe, signal?: AbortSignal) {
  signal?.throwIfAborted();
  spec = parseTerminalRotationClosure(spec, [clip.name], [clip.name], []);
  const ticks = Math.round(clip.duration * 60);
  if (clip.name !== spec.clipId || ticks < 2 || ticks > 3600 || Math.abs(ticks - clip.duration * 60) > 1e-3 || spec.startTick !== ticks - 1) throw new Error('terminalRotationClosure requires the final one-tick interval.');
  const replacements = new Map<string, THREE.QuaternionKeyframeTrack>();
  const corrections = spec.joints.map(joint => {
    signal?.throwIfAborted();
    const name = `${joint}.quaternion`, selected = clip.tracks.filter(t => t.name === name);
    if (selected.length !== 1) throw new Error(`terminalRotationClosure needs one quaternion channel for ${joint}.`);
    const original = selected[0];
    validateChordRotation(original, ticks);
    if (original.times.length !== ticks + 1) throw new Error('terminalRotationClosure needs the complete stored tick grid.');
    const keys = Array.from({ length: ticks + 1 }, (_, i) => Array.from(original.values.slice(i * 12 + 4, i * 12 + 8)));
    const before = [...keys[ticks]], entry = [...keys[0]];
    keys[ticks] = entry;
    const track = chordRotationTrack(name, Array.from(original.times), keys.flat());
    const after = Array.from(track.values.slice(ticks * 12 + 4, ticks * 12 + 8));
    const degrees = rotationDifferenceDegrees(before, after);
    if (!Number.isFinite(degrees) || degrees > spec.maxRotationDegrees) throw new Error('Stored terminal rotation correction exceeds its declared bound.');
    const preserved = spec.startTick * 12 + 8;
    if (track.values.slice(0, preserved).some((v, i) => v !== original.values[i])) throw new Error('Terminal closure changed a preceding value or tangent.');
    replacements.set(name, track);
    return { joint, before, entry, after, storedCorrectionDegrees: degrees };
  });
  signal?.throwIfAborted();
  return {
    clip: new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.map(t => replacements.get(t.name) ?? t)),
    report: { clipId: clip.name, policy: 'final-tick-entry-rotation.v1', interval: [spec.startTick, ticks], maxRotationDegrees: spec.maxRotationDegrees, corrections },
  };
}
