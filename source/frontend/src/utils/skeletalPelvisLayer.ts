import * as THREE from 'three';
import { bakeTwoKeyRotations, type TwoKeyRotationBakeRecipe } from './skeletalTwoKeyRotation';
import { chordRotationTrack } from './skeletalChordRotation';

export const PELVIS_LAYER_POLICY = 'bounded-two-key-pelvis-layer.v1' as const;
export interface PelvisLayerRecipe {
  clipId: string;
  startTick: number;
  pelvisJoint: string;
  maxTranslationFraction: number;
  maxRotationDegrees: number;
  positions: number[][];
  rotations: TwoKeyRotationBakeRecipe['rotations'];
}
type RotationCorrection = ReturnType<typeof bakeTwoKeyRotations>['report']['corrections'][number];
export interface PelvisLayerReport {
  policy: typeof PELVIS_LAYER_POLICY;
  clipId: string;
  pelvisJoint: string;
  ticks: number[];
  height: number;
  maxTranslationFraction: number;
  maxTranslationMeters: number;
  maxRotationDegrees: number;
  positions: Array<{ tick: number; before: number[]; requested: number[]; after: number[]; requestedCorrectionMeters: number; storedCorrectionMeters: number }>;
  corrections: RotationCorrection[];
}

export function parsePelvisLayer(value: unknown, gaitIds: readonly string[], clipIds: readonly string[], sourceRoot: string, locomotionRoot: string): PelvisLayerRecipe {
  const fail = (): never => { throw new Error('pelvisLayerBake requires one selected gait, the source pelvis, two interior position keys, two direct three-joint leg chains, translation fraction up to 0.03 and rotation bound up to 25 degrees.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const v = value as Record<string, unknown>, id = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(x);
  if (Object.keys(v).sort().join(',') !== 'clipId,maxRotationDegrees,maxTranslationFraction,pelvisJoint,positions,rotations,startTick'
    || !id(v.clipId) || !gaitIds.includes(v.clipId) || !clipIds.includes(v.clipId)
    || !id(v.pelvisJoint) || v.pelvisJoint !== sourceRoot || v.pelvisJoint === locomotionRoot
    || !Number.isInteger(v.startTick) || (v.startTick as number) < 1 || (v.startTick as number) > 3598
    || typeof v.maxTranslationFraction !== 'number' || !Number.isFinite(v.maxTranslationFraction) || v.maxTranslationFraction <= 0 || v.maxTranslationFraction > .03
    || typeof v.maxRotationDegrees !== 'number' || !Number.isFinite(v.maxRotationDegrees) || v.maxRotationDegrees <= 0 || v.maxRotationDegrees > 25
    || !Array.isArray(v.positions) || v.positions.length !== 2 || !Array.isArray(v.rotations) || v.rotations.length !== 6) fail();
  const positions = Array.from(v.positions as unknown[], p => {
    if (!Array.isArray(p) || p.length !== 3 || !Array.from(p).every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100000)) fail();
    return Array.from(p as number[]);
  });
  const rotations = Array.from(v.rotations as unknown[], entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail();
    const r = entry as Record<string, unknown>;
    if (Object.keys(r).sort().join(',') !== 'joint,values' || !id(r.joint) || [sourceRoot, locomotionRoot].includes(r.joint)
      || !Array.isArray(r.values) || r.values.length !== 2) fail();
    const values = Array.from(r.values as unknown[], q => {
      if (!Array.isArray(q) || q.length !== 4 || !Array.from(q).every(n => typeof n === 'number' && Number.isFinite(n)) || Math.abs(Math.hypot(...q) - 1) > 1e-6) fail();
      return Array.from(q as number[]);
    });
    return { joint: r.joint as string, values };
  });
  if (new Set(rotations.map(r => r.joint)).size !== 6) fail();
  return { clipId: v.clipId as string, startTick: v.startTick as number, pelvisJoint: v.pelvisJoint as string,
    maxTranslationFraction: v.maxTranslationFraction as number, maxRotationDegrees: v.maxRotationDegrees as number, positions, rotations };
}

/** Compose only declared components after the existing authoring layers. */
export function bakePelvisLayer(clip: THREE.AnimationClip, recipe: PelvisLayerRecipe, bones: readonly THREE.Bone[], scene: THREE.Object3D, sourceRoot: string, locomotionRoot: string, height: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const spec = parsePelvisLayer(recipe, [clip.name], [clip.name], sourceRoot, locomotionRoot), duration = Math.round(clip.duration * 60);
  if (!Number.isFinite(height) || height <= 0 || duration > 3600 || Math.abs(duration - clip.duration * 60) > 1e-3 || spec.startTick + 1 >= duration) throw new Error('Invalid pelvis-layer height or interior duration.');
  const matches = bones.filter(b => b.name === spec.pelvisJoint), pelvis = matches[0];
  if (matches.length !== 1 || pelvis.parent?.name !== locomotionRoot || !bones.includes(pelvis.parent as THREE.Bone)) throw new Error('Pelvis layer requires the source pelvis directly below the locomotion root.');
  const chains = [spec.rotations.slice(0, 3), spec.rotations.slice(3)];
  for (const chain of chains) if (bones.filter(b => b.name === chain[0].joint && b.parent === pelvis).length !== 1) throw new Error('Pelvis layer requires two independent direct leg chains.');
  const tracks = clip.tracks.filter(t => t.name === pelvis.name + '.position'), original = tracks[0];
  if (tracks.length !== 1 || original.ValueTypeName !== 'vector' || original.getInterpolation() !== THREE.InterpolateLinear
    || !(original.values instanceof Float32Array) || original.values.length !== (duration + 1) * 3
    || original.times.length !== duration + 1 || original.times.some((t, i) => t !== Math.fround(i / 60))
    || [...original.values].some(v => !Number.isFinite(v))) throw new Error('Pelvis layer needs a complete finite LINEAR position grid.');
  let rotated = clip;
  const corrections: RotationCorrection[] = [];
  for (const chain of chains) {
    const result = bakeTwoKeyRotations(rotated, { clipId: spec.clipId, startTick: spec.startTick, maxRotationDegrees: spec.maxRotationDegrees, rotations: chain }, bones, [sourceRoot, locomotionRoot], signal);
    rotated = result.clip; corrections.push(...result.report.corrections);
  }
  const position = original.clone(), maxTranslationMeters = height * spec.maxTranslationFraction;
  const mixer = new THREE.AnimationMixer(scene), action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
  const positions: PelvisLayerReport['positions'] = [];
  try {
    for (let i = 0; i < 2; i++) {
      signal?.throwIfAborted();
      const tick = spec.startTick + i, before = Array.from(original.values.slice(tick * 3, tick * 3 + 3)), requested = spec.positions[i];
      position.values.set(requested, tick * 3);
      const after = Array.from(position.values.slice(tick * 3, tick * 3 + 3));
      action.reset().play(); mixer.setTime(original.times[tick]); scene.updateMatrixWorld(true);
      const parent = new THREE.Matrix3().setFromMatrix4(scene.matrixWorld.clone().invert().multiply(pelvis.parent!.matrixWorld));
      const distance = (p: number[]) => new THREE.Vector3().fromArray(p.map((v, j) => v - before[j])).applyMatrix3(parent).length();
      const requestedCorrectionMeters = distance(requested), storedCorrectionMeters = distance(after);
      if (!Number.isFinite(storedCorrectionMeters) || requestedCorrectionMeters > maxTranslationMeters || storedCorrectionMeters > maxTranslationMeters) throw new Error('Pelvis-layer translation exceeds its meter-space bound.');
      positions.push({ tick, before, requested: [...requested], after, requestedCorrectionMeters, storedCorrectionMeters });
    }
  } finally { action.stop(); mixer.stopAllAction(); mixer.uncacheRoot(scene); scene.updateMatrixWorld(true); }
  signal?.throwIfAborted();
  return { clip: new THREE.AnimationClip(clip.name, clip.duration, rotated.tracks.map(t => t.name === original.name ? position : t)),
    report: { policy: PELVIS_LAYER_POLICY, clipId: spec.clipId, pelvisJoint: spec.pelvisJoint, ticks: [spec.startTick, spec.startTick + 1],
      height, maxTranslationFraction: spec.maxTranslationFraction, maxTranslationMeters, maxRotationDegrees: spec.maxRotationDegrees, positions, corrections } satisfies PelvisLayerReport };
}

export function pelvisLayerRecipe(report: PelvisLayerReport): PelvisLayerRecipe {
  if (!report || report.policy !== PELVIS_LAYER_POLICY || Object.keys(report).sort().join(',') !== 'clipId,corrections,height,maxRotationDegrees,maxTranslationFraction,maxTranslationMeters,pelvisJoint,policy,positions,ticks'
    || !Array.isArray(report.ticks) || report.ticks.length !== 2 || report.ticks[1] !== report.ticks[0] + 1
    || !Array.isArray(report.positions) || report.positions.length !== 2 || !Array.isArray(report.corrections) || report.corrections.length !== 6
    || !Number.isFinite(report.height) || report.height <= 0 || report.maxTranslationMeters !== report.height * report.maxTranslationFraction) throw new Error('Invalid pelvis-layer provenance.');
  return parsePelvisLayer({ clipId: report.clipId, startTick: report.ticks[0], pelvisJoint: report.pelvisJoint,
    maxTranslationFraction: report.maxTranslationFraction, maxRotationDegrees: report.maxRotationDegrees,
    positions: Array.from(report.positions, p => p?.requested), rotations: Array.from(report.corrections, c => ({ joint: c?.joint, values: c?.values?.map(v => v.requested) })) },
  [report.clipId], [report.clipId], report.pelvisJoint, '');
}

/** Reverse this layer before any older provenance is inspected. */
export function restorePelvisLayer(clip: THREE.AnimationClip, report: PelvisLayerReport, bones: readonly THREE.Bone[], scene: THREE.Object3D, locomotionRoot: string, height: number, signal?: AbortSignal): THREE.AnimationClip {
  signal?.throwIfAborted();
  const spec = pelvisLayerRecipe(report);
  if (spec.clipId !== clip.name || Math.abs(report.height - height) > Math.max(1, height) * 1e-6) throw new Error('Pelvis-layer height or clip binding differs.');
  const replacements = new Map<string, THREE.KeyframeTrack>();
  for (const correction of report.corrections) {
    const name = correction.joint + '.quaternion', matches = clip.tracks.filter(t => t.name === name), track = matches[0];
    if (matches.length !== 1 || !Array.isArray(correction.values) || correction.values.length !== 2) throw new Error('Invalid pelvis-layer rotation provenance.');
    const values = Array.from({ length: track.times.length }, (_, i) => Array.from(track.values.slice(i * 12 + 4, i * 12 + 8)));
    Array.from(correction.values).forEach((v, i) => {
      if (!v || v.tick !== spec.startTick + i || !Array.isArray(v.before) || v.before.length !== 4 || Array.from(v.before).some(x => !Number.isFinite(x) || Math.fround(x) !== x)
        || Math.abs(Math.hypot(...v.before) - 1) > 1e-6 || !Array.isArray(v.after) || v.after.length !== 4 || Array.from(v.after).some((x, j) => x !== track.values[v.tick * 12 + 4 + j])) throw new Error('Stale pelvis-layer rotation provenance.');
      values[v.tick] = [...v.before];
    });
    replacements.set(name, chordRotationTrack(name, Array.from(track.times), values.flat()));
  }
  const name = spec.pelvisJoint + '.position', matches = clip.tracks.filter(t => t.name === name), position = matches[0]?.clone();
  if (matches.length !== 1 || !position) throw new Error('Missing pelvis-layer position channel.');
  Array.from(report.positions).forEach((v, i) => {
    if (!v || Object.keys(v).sort().join(',') !== 'after,before,requested,requestedCorrectionMeters,storedCorrectionMeters,tick'
      || !Number.isFinite(v.requestedCorrectionMeters) || !Number.isFinite(v.storedCorrectionMeters)
      || v.requestedCorrectionMeters < 0 || v.storedCorrectionMeters < 0
      || v.requestedCorrectionMeters > report.maxTranslationMeters || v.storedCorrectionMeters > report.maxTranslationMeters
      || v.tick !== spec.startTick + i || !Array.isArray(v.before) || v.before.length !== 3 || Array.from(v.before).some(x => !Number.isFinite(x) || Math.fround(x) !== x)
      || !Array.isArray(v.after) || v.after.length !== 3 || Array.from(v.after).some((x, j) => x !== position.values[v.tick * 3 + j])) throw new Error('Stale pelvis-layer position provenance.');
    position.values.set(v.before, v.tick * 3);
  });
  replacements.set(name, position);
  const restored = new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.map(t => replacements.get(t.name) ?? t));
  const checked = bakePelvisLayer(restored, spec, bones, scene, spec.pelvisJoint, locomotionRoot, height, signal);
  for (const t of checked.clip.tracks) if (t.values.some((v, i) => v !== clip.tracks.find(c => c.name === t.name)!.values[i])) throw new Error('Pelvis-layer reconstruction differs.');
  checked.report.corrections.forEach((c, i) => {
    const given = report.corrections[i];
    if (Object.keys(given).sort().join(',') !== 'joint,values' || c.joint !== given.joint) throw new Error('Pelvis-layer correction provenance differs.');
    c.values.forEach((v, j) => {
      const actual = given.values[j];
      if (Object.keys(actual).sort().join(',') !== 'after,before,requested,storedCorrectionDegrees,tick'
        || actual.tick !== v.tick || actual.storedCorrectionDegrees !== v.storedCorrectionDegrees
        || ['before', 'requested', 'after'].some(key => {
          const field = key as 'before' | 'requested' | 'after';
          return !Array.isArray(actual[field]) || actual[field].length !== 4 || Array.from(actual[field]).some((x, k) => x !== v[field][k]);
        })) throw new Error('Pelvis-layer correction provenance differs.');
    });
  });
  checked.report.positions.forEach((p, i) => {
    const v = report.positions[i];
    if (Math.abs(p.storedCorrectionMeters - v.storedCorrectionMeters) > 1e-9 || Math.abs(p.requestedCorrectionMeters - v.requestedCorrectionMeters) > 1e-9) throw new Error('Pelvis-layer meter provenance differs.');
  });
  return restored;
}
