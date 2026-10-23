import * as THREE from 'three';
import type { LoadedModel } from '../loaders/glb';
import { createTrackInterpolant } from './animationTrackInterpolation';

export interface TransitionFloorRecipe {
  clipIds: string[];
  floorY: number;
  maxLiftMeters: number;
}
export interface TransitionFloorReport {
  clipId: string;
  policy: 'six-tick-root-y-interior-plateau.v1';
  floorY: number;
  maxLiftMeters: number;
  clearanceMeters: number;
  rootYLiftByTick: number[];
  minimumYBefore: number[];
  minimumYAfter: number[];
}

export function parseTransitionFloor(value: unknown, allowed: readonly string[]): TransitionFloorRecipe {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('transitionFloor must be an object.');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'clipIds,floorY,maxLiftMeters'
    || !Array.isArray(v.clipIds) || v.clipIds.length < 1 || v.clipIds.length > 24
    || new Set(v.clipIds).size !== v.clipIds.length
    || !v.clipIds.every(id => typeof id === 'string' && allowed.includes(id))
    || typeof v.floorY !== 'number' || !Number.isFinite(v.floorY) || Math.abs(v.floorY) > 100000
    || typeof v.maxLiftMeters !== 'number' || !Number.isFinite(v.maxLiftMeters) || v.maxLiftMeters <= 0 || v.maxLiftMeters > 100000) {
    throw new Error('transitionFloor requires unique generated start/stop IDs, finite floorY and positive bounded maxLiftMeters.');
  }
  return { clipIds: [...v.clipIds] as string[], floorY: v.floorY, maxLiftMeters: v.maxLiftMeters };
}

/** Source-side bake only. The original clip and the loaded bind pose remain unchanged. */
export function bakeTransitionFloor(
  model: LoadedModel, clip: THREE.AnimationClip, locomotion: THREE.Bone,
  spec: TransitionFloorRecipe, height: number, signal?: AbortSignal,
): { clip: THREE.AnimationClip; report: TransitionFloorReport } {
  signal?.throwIfAborted();
  if (locomotion.parent !== model.root || Math.abs(clip.duration * 60 - 6) > 1e-5
    || !Number.isFinite(height) || height <= 0) throw new Error('Floor bake requires a six-tick clip, direct locomotion root and positive model height.');
  const bones = model.skeleton!.bones;
  const bind = bones.map(b => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
  const restore = (): void => {
    bones.forEach((b, i) => { b.position.copy(bind[i].p); b.quaternion.copy(bind[i].q); b.scale.copy(bind[i].s); });
    model.root.updateMatrixWorld(true);
  };
  restore();
  const sceneInverse = model.root.matrixWorld.clone().invert();
  const minimumYs = (candidate: THREE.AnimationClip): number[] => {
    const tracks = candidate.tracks.map(track => {
      const binding = THREE.PropertyBinding.parseTrackName(track.name);
      const bone = bones.find(b => b.name === binding.nodeName);
      if (!bone || !['position', 'quaternion', 'scale'].includes(binding.propertyName)) throw new Error('Floor bake encountered an unsupported track.');
      return { bone, property: binding.propertyName, interpolant: createTrackInterpolant(track) };
    });
    const result: number[] = [];
    try {
      for (let step = 0; step <= 24; step++) {
        signal?.throwIfAborted(); restore();
        for (const { bone, property, interpolant } of tracks) {
          const value = interpolant.evaluate(step / 240);
          if (property === 'quaternion') bone.quaternion.fromArray(value);
          else if (property === 'position') bone.position.fromArray(value);
          else bone.scale.fromArray(value);
        }
        model.root.updateMatrixWorld(true);
        let minimum = Infinity, count = 0;
        for (const mesh of model.skinnedMeshes) {
          const positions = mesh.geometry.getAttribute('position');
          const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
          const palette = mesh.skeleton.bones.map((b, i) => sceneInverse.clone().multiply(b.matrixWorld).multiply(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix));
          for (let vertex = 0; vertex < positions.count; vertex++) {
            let y = 0;
            for (let slot = 0; slot < 4; slot++) {
              const matrix = palette[indices.getComponent(vertex, slot)];
              if (!matrix) throw new Error('Floor bake encountered an invalid skin joint.');
              const e = matrix.elements;
              y += (e[1] * positions.getX(vertex) + e[5] * positions.getY(vertex) + e[9] * positions.getZ(vertex) + e[13]) * weights.getComponent(vertex, slot);
            }
            if (!Number.isFinite(y)) throw new Error('Floor bake produced non-finite skin.');
            minimum = Math.min(minimum, y); count++;
          }
        }
        if (count < 3 || count > 8192) throw new Error('Floor bake requires 3–8,192 skinned vertices.');
        result.push(minimum);
      }
      return result;
    } finally { restore(); }
  };
  const before = minimumYs(clip), endpointLimit = height * .005, clearance = height * 1e-5;
  if ([before[0], before[24]].some(y => spec.floorY - y > endpointLimit)) throw new Error('Floor bake cannot repair unsafe endpoints while preserving them.');
  const times = Array.from({ length: 7 }, (_, i) => Math.fround(i / 60));
  let lift = 0;
  for (let step = 1; step < 24; step++) {
    const seconds = step / 240;
    const weight = Math.min(1, seconds / times[1], (times[6] - seconds) / (times[6] - times[5]));
    lift = Math.max(lift, (spec.floorY + clearance - before[step]) / weight);
  }
  if (!Number.isFinite(lift) || lift > spec.maxLiftMeters) throw new Error('Floor bake exceeds the declared maxLiftMeters.');
  const name = `${locomotion.name}.position`, original = clip.tracks.find(t => t.name === name);
  const interpolant = original ? createTrackInterpolant(original) : undefined;
  const values = times.flatMap(t => interpolant ? Array.from(interpolant.evaluate(t) as ArrayLike<number>) : locomotion.position.toArray());
  const corrected = [...values];
  for (let tick = 1; tick < 6; tick++) corrected[tick * 3 + 1] += lift;
  const track = new THREE.VectorKeyframeTrack(name, times, corrected);
  const rootYLiftByTick = times.map((_, tick) => track.values[tick * 3 + 1] - Math.fround(values[tick * 3 + 1]));
  if (rootYLiftByTick.some(value => !Number.isFinite(value) || value > spec.maxLiftMeters)) throw new Error('Stored-key floor bake exceeds the declared maxLiftMeters.');
  const baked = lift > 0 ? new THREE.AnimationClip(clip.name, clip.duration, [...clip.tracks.filter(t => t.name !== name), track]) : clip;
  const after = minimumYs(baked);
  if (after.some((y, step) => spec.floorY - y > (step === 0 || step === 24 ? endpointLimit : clearance))) throw new Error('Serialized-key floor bake failed its dense floor constraint.');
  return { clip: baked, report: { clipId: clip.name, policy: 'six-tick-root-y-interior-plateau.v1', floorY: spec.floorY,
    maxLiftMeters: spec.maxLiftMeters, clearanceMeters: clearance,
    rootYLiftByTick,
    minimumYBefore: before, minimumYAfter: after } };
}
