import * as THREE from 'three';
import type { LoadedModel } from '../loaders/glb';
import { createTrackInterpolant } from './animationTrackInterpolation';
import { chordRotationTrack, validateChordRotation } from './skeletalChordRotation';
import { rotationDifferenceDegrees } from './skeletalTerminalRotation';
import { bakeTransitionFloor, type TransitionFloorRecipe, type TransitionFloorReport } from './skeletalTransitionFloor';
import type { TwoKeyRotationBakeRecipe } from './skeletalTwoKeyRotation';
import type { RotationSpanBakeRecipe } from './skeletalRotationSpan';

export const STANCE_TRAJECTORY_POLICY = 'walkSlow-left-sole-23-key-trajectory.v1' as const;
export const STANCE_JOINTS = ['mixamorigLeftUpLeg', 'mixamorigLeftLeg', 'mixamorigLeftFoot'] as const;
export interface StanceTrajectoryRecipe {
  policy: typeof STANCE_TRAJECTORY_POLICY;
  clipId: 'walkSlow';
  anchorTick: 0;
  startTick: 2;
  maxRotationDegrees: number;
  rotations: Array<{ joint: string; values: number[][] }>;
}

export function parseStanceTrajectory(value: unknown, gaitIds: readonly string[], clipIds: readonly string[]): StanceTrajectoryRecipe {
  const fail = (): never => { throw new Error('stanceTrajectoryBake requires walkSlow left sole anchor 0, exactly ticks 2–24, three ordered left-leg joints, 23 unit quaternions each and a bound up to 65 degrees.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'anchorTick,clipId,maxRotationDegrees,policy,rotations,startTick'
    || v.policy !== STANCE_TRAJECTORY_POLICY || v.clipId !== 'walkSlow'
    || !gaitIds.includes('walkSlow') || !clipIds.includes('walkSlow')
    || v.anchorTick !== 0 || v.startTick !== 2
    || typeof v.maxRotationDegrees !== 'number' || !Number.isFinite(v.maxRotationDegrees)
    || v.maxRotationDegrees <= 0 || v.maxRotationDegrees > 65
    || !Array.isArray(v.rotations) || v.rotations.length !== 3) fail();
  const rotations = Array.from(v.rotations as unknown[], (entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail();
    const r = entry as Record<string, unknown>;
    if (Object.keys(r).sort().join(',') !== 'joint,values' || r.joint !== STANCE_JOINTS[index]
      || !Array.isArray(r.values) || r.values.length !== 23) fail();
    return { joint: r.joint as string, values: Array.from(r.values as unknown[], q => {
      if (!Array.isArray(q) || q.length !== 4 || !q.every(n => typeof n === 'number' && Number.isFinite(n))
        || Math.abs(Math.hypot(...q) - 1) > 1e-6) fail();
      return [...q as number[]];
    }) };
  });
  return { policy: STANCE_TRAJECTORY_POLICY, clipId: 'walkSlow', anchorTick: 0, startTick: 2,
    maxRotationDegrees: v.maxRotationDegrees as number, rotations };
}

export function assertDisjointStanceTrajectory(spec: StanceTrajectoryRecipe, pairs: readonly TwoKeyRotationBakeRecipe[], span?: RotationSpanBakeRecipe): void {
  if (pairs.some(pair => pair.clipId === spec.clipId && pair.startTick <= 25 && pair.startTick + 1 >= 1
    && pair.rotations.some(r => STANCE_JOINTS.includes(r.joint as typeof STANCE_JOINTS[number]))))
    throw new Error('stanceTrajectoryBake overlaps a selected left-leg two-key footprint.');
  if (span?.clipId === spec.clipId && span.startTick <= 25 && span.startTick + span.rotations[0].values.length - 1 >= 1
    && span.rotations.some(r => STANCE_JOINTS.includes(r.joint as typeof STANCE_JOINTS[number])))
    throw new Error('stanceTrajectoryBake overlaps a selected left-leg rotation-span footprint.');
}

export function bakeStanceTrajectory(clip: THREE.AnimationClip, value: StanceTrajectoryRecipe, bones: readonly THREE.Bone[], signal?: AbortSignal) {
  signal?.throwIfAborted();
  const spec = parseStanceTrajectory(value, [clip.name], [clip.name]);
  const duration = Math.round(clip.duration * 60);
  if (duration !== 90 || Math.abs(clip.duration * 60 - 90) > 1e-3) throw new Error('stanceTrajectoryBake requires the 90-tick walkSlow clip.');
  const chain = spec.rotations.map(r => bones.filter(b => b.name === r.joint));
  if (chain.some((matches, i) => matches.length !== 1 || (i > 0 && matches[0].parent !== chain[i - 1][0]))) throw new Error('stanceTrajectoryBake requires the existing left hip/knee/foot parent chain.');
  const replacements = new Map<string, THREE.QuaternionKeyframeTrack>();
  const corrections = spec.rotations.map(rotation => {
    signal?.throwIfAborted();
    const name = rotation.joint + '.quaternion', matches = clip.tracks.filter(t => t.name === name);
    if (matches.length !== 1) throw new Error('stanceTrajectoryBake requires one quaternion channel per left-leg joint.');
    const original = matches[0]; validateChordRotation(original, duration);
    if (original.times.length !== 91) throw new Error('stanceTrajectoryBake requires the complete stored tick grid.');
    const keys = Array.from({ length: 91 }, (_, tick) => Array.from(original.values.slice(tick * 12 + 4, tick * 12 + 8)));
    const before = keys.slice(2, 25).map(q => [...q]);
    rotation.values.forEach((q, i) => { keys[i + 2] = q; });
    const track = chordRotationTrack(name, Array.from(original.times), keys.flat()); validateChordRotation(track, duration);
    const values = rotation.values.map((requested, i) => {
      const tick = i + 2, after = Array.from(track.values.slice(tick * 12 + 4, tick * 12 + 8));
      const storedCorrectionDegrees = rotationDifferenceDegrees(before[i], after);
      if (!Number.isFinite(storedCorrectionDegrees) || storedCorrectionDegrees > spec.maxRotationDegrees)
        throw new Error('Stored stance-trajectory correction exceeds its declared bound.');
      return { tick, before: before[i], requested: [...requested], after, storedCorrectionDegrees };
    });
    for (let tick = 0; tick <= 90; tick++) if ((tick < 2 || tick > 24)
      && track.values.slice(tick * 12 + 4, tick * 12 + 8).some((v, i) => v !== original.values[tick * 12 + 4 + i]))
      throw new Error('stanceTrajectoryBake changed an unselected stored rotation.');
    if (track.values.slice(0, 1 * 12 + 8).some((v, i) => v !== original.values[i])
      || track.values.slice(25 * 12 + 4).some((v, i) => v !== original.values[25 * 12 + 4 + i]))
      throw new Error('stanceTrajectoryBake changed a nonadjacent tangent.');
    replacements.set(name, track);
    return { joint: rotation.joint, values };
  });
  signal?.throwIfAborted();
  return { clip: new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.map(t => replacements.get(t.name) ?? t)),
    report: { policy: STANCE_TRAJECTORY_POLICY, clipId: spec.clipId, anchorTick: 0 as const,
      ticks: Array.from({ length: 23 }, (_, i) => i + 2), maxRotationDegrees: spec.maxRotationDegrees, corrections } };
}

/** Rebuild only the three dependent p25 clips from the corrected gait pose. */
export function rebuildStanceP25(model: LoadedModel, clips: readonly THREE.AnimationClip[], gait: THREE.AnimationClip,
  root: THREE.Bone, floor: TransitionFloorRecipe, previousFloor: readonly TransitionFloorReport[], height: number,
  signal?: AbortSignal): { clips: THREE.AnimationClip[]; floorBakes: TransitionFloorReport[] } {
  const ids = ['start', 'stop', 'reversal'].map(kind => `${kind}-walkSlow-p25`);
  if (!floor.clipIds.includes(ids[0]) || !floor.clipIds.includes(ids[1]) || ids.some(id => clips.filter(c => c.name === id).length !== 1))
    throw new Error('stanceTrajectoryBake requires all three p25 transitions and both selected floor bakes.');
  const times = Array.from({ length: 7 }, (_, tick) => Math.fround(tick / 60));
  const priorFloor = new Map(previousFloor.map(report => [report.clipId, report]));
  const replacements = new Map<string, THREE.AnimationClip>(), floorBakes: TransitionFloorReport[] = [];
  for (const id of ids) {
    signal?.throwIfAborted();
    const old = clips.find(c => c.name === id)!, kind = id.split('-')[0];
    const tracks = new Map<string, THREE.KeyframeTrack>();
    for (const joint of STANCE_JOINTS) {
      const name = joint + '.quaternion', previous = old.tracks.find(t => t.name === name), gaitTrack = gait.tracks.find(t => t.name === name);
      if (!previous || !gaitTrack) throw new Error('stanceTrajectoryBake requires selected p25/gait quaternion channels.');
      const target = new THREE.Quaternion().fromArray(createTrackInterpolant(gaitTrack).evaluate(Math.fround(22.5 / 60)));
      const idle = new THREE.Quaternion().fromArray(createTrackInterpolant(previous).evaluate(Math.fround((kind === 'start' ? 0 : 6) / 60)));
      const a = kind === 'start' ? idle : target, b = kind === 'stop' ? idle : target;
      tracks.set(name, chordRotationTrack(name, times, times.flatMap((_, tick) => a.clone().slerp(b, tick / 6).toArray())));
    }
    if (kind !== 'reversal') {
      const name = root.name + '.position', previous = old.tracks.find(t => t.name === name), bake = priorFloor.get(id);
      if (!previous || !bake || previous.times.length !== 7 || bake.rootYLiftByTick.length !== 7)
        throw new Error('stanceTrajectoryBake requires the prior six-tick floor provenance.');
      const values = Array.from(previous.values);
      for (let tick = 1; tick <= 5; tick++) values[tick * 3 + 1] -= bake.rootYLiftByTick[tick];
      tracks.set(name, new THREE.VectorKeyframeTrack(name, times, values));
    }
    const unbaked = new THREE.AnimationClip(id, old.duration, old.tracks.map(t => tracks.get(t.name) ?? t));
    if (kind === 'reversal') replacements.set(id, unbaked);
    else {
      const baked = bakeTransitionFloor(model, unbaked, root, floor, height, signal);
      replacements.set(id, baked.clip); floorBakes.push(baked.report);
    }
  }
  return { clips: clips.map(c => replacements.get(c.name) ?? c), floorBakes };
}
