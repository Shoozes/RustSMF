import * as THREE from 'three';
import type { ImportedSmf } from '../loaders/smf';
import {
  decomposeMatrix,
  dqCreateFromMatrix,
  dqNegate,
  dqToMatrix,
  smfMatrixToThree,
  threeMatrixToSmf,
} from '../loaders/coord';
import { cloneImportedSmf } from '../loaders/smfData';
import { findEffectiveBoneParentIndex } from '../loaders/smfRig';
import { MIN_ANIMATION_DURATION, normalizeAnimationDuration } from './animationCreation';
import type { AnimationEditScope } from './animationScope';
import { createTrackInterpolant, trackInterpolation, trackSampleSize } from './animationTrackInterpolation';

export type AnimationInterpolation = 'linear' | 'step' | 'quadratic';
export type AnimationSnapStep = 0 | 0.01 | 0.05 | 0.1 | 0.25 | 0.5;

export const ANIMATION_INTERPOLATIONS = ['linear', 'step', 'quadratic'] as const;
export const ANIMATION_SNAP_STEPS: readonly AnimationSnapStep[] = [0, 0.01, 0.05, 0.1, 0.25, 0.5];
export const SMF_ANIMATION_INTERPOLATION: Record<AnimationInterpolation, number> = {
  step: 0,
  linear: 1,
  quadratic: 2,
};

export function isAnimationInterpolation(value: unknown): value is AnimationInterpolation {
  return ANIMATION_INTERPOLATIONS.some((interpolation) => interpolation === value);
}

export interface AnimationClipMetadata {
  loop: boolean;
  sampleFrameMultiplier: number;
}

export interface EditableBoneKeyframe {
  time: number;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  interpolation: AnimationInterpolation;
}

export interface AnimationKeyframeClipboard {
  sourceClipName: string;
  sourceSkeletonFingerprint: string;
  sourceScope: AnimationEditScope;
  entries: Record<string, EditableBoneKeyframe>;
}

export type AnimationTrimKeyPolicy = 'retain-keys-and-sampled-boundaries';

export const ANIMATION_TRIM_KEY_POLICY: AnimationTrimKeyPolicy = 'retain-keys-and-sampled-boundaries';

export type AnimationTrimFailureReason = 'invalid-range' | 'locked-bone-range' | 'cubic-rotation-boundary' | 'unsupported-interpolation';

export type AnimationTrimResult =
  | {
      ok: true;
      clip: THREE.AnimationClip;
      startTime: number;
      endTime: number;
    }
  | {
      ok: false;
      reason: AnimationTrimFailureReason;
      boneName?: string;
      trackName?: string;
    };

export interface AnimationEditState {
  selectedKeyTime: number | null;
  clipboard: AnimationKeyframeClipboard | null;
  interpolation: AnimationInterpolation;
  editsByClip: Record<string, Record<string, EditableBoneKeyframe[]>>;
  metadataByClip: Record<string, AnimationClipMetadata>;
  durationByClip: Record<string, number>;
  lockedBonesByClip: Record<string, string[]>;
  dirtyClipNames: string[];
}

const TIME_EPSILON = 1e-4;

const makeStringRecord = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;

export const makeAnimationEditState = (): AnimationEditState => ({
  selectedKeyTime: null,
  clipboard: null,
  interpolation: 'linear',
  editsByClip: makeStringRecord(),
  metadataByClip: makeStringRecord(),
  durationByClip: makeStringRecord(),
  lockedBonesByClip: makeStringRecord(),
  dirtyClipNames: [],
});

export const hasDirtyAnimationEdits = (state: AnimationEditState): boolean => state.dirtyClipNames.length > 0;

const cloneKey = (key: EditableBoneKeyframe): EditableBoneKeyframe => ({
  time: key.time,
  position: [...key.position],
  quaternion: [...key.quaternion],
  interpolation: key.interpolation,
});

const cloneClipboard = (clipboard: AnimationKeyframeClipboard | null): AnimationKeyframeClipboard | null => {
  if (!clipboard) return null;
  const entries = makeStringRecord<EditableBoneKeyframe>();
  for (const [boneName, key] of Object.entries(clipboard.entries)) {
    entries[boneName] = cloneKey(key);
  }
  return {
    sourceClipName: clipboard.sourceClipName,
    sourceSkeletonFingerprint: clipboard.sourceSkeletonFingerprint,
    sourceScope: clipboard.sourceScope ?? 'bone',
    entries,
  };
};

export const cloneAnimationEditState = (state: AnimationEditState): AnimationEditState => {
  const editsByClip = makeStringRecord<AnimationEditState['editsByClip'][string]>();
  for (const [clipName, boneEdits] of Object.entries(state.editsByClip)) {
    editsByClip[clipName] = makeStringRecord<EditableBoneKeyframe[]>();
    for (const [boneName, keys] of Object.entries(boneEdits)) {
      editsByClip[clipName][boneName] = keys.map(cloneKey);
    }
  }

  const metadataByClip = makeStringRecord<AnimationClipMetadata>();
  for (const [clipName, metadata] of Object.entries(state.metadataByClip)) {
    metadataByClip[clipName] = { ...metadata };
  }

  const durationByClip = makeStringRecord<number>();
  for (const [clipName, duration] of Object.entries(state.durationByClip ?? {})) {
    durationByClip[clipName] = duration;
  }

  const lockedBonesByClip = makeStringRecord<string[]>();
  for (const [clipName, boneNames] of Object.entries(state.lockedBonesByClip ?? {})) {
    lockedBonesByClip[clipName] = [...new Set(boneNames.filter((name) => typeof name === 'string' && name))];
  }

  return {
    selectedKeyTime: state.selectedKeyTime,
    clipboard: cloneClipboard(state.clipboard),
    interpolation: state.interpolation,
    editsByClip,
    metadataByClip,
    durationByClip,
    lockedBonesByClip,
    dirtyClipNames: [...state.dirtyClipNames],
  };
};

const sameNumber = (left: number, right: number): boolean => Math.abs(left - right) <= TIME_EPSILON;

const sameKey = (left: EditableBoneKeyframe | null, right: EditableBoneKeyframe | null): boolean => {
  if (!left || !right) return left === right;
  return (
    sameNumber(left.time, right.time)
    && left.interpolation === right.interpolation
    && left.position.every((value, index) => sameNumber(value, right.position[index]))
    && left.quaternion.every((value, index) => sameNumber(value, right.quaternion[index]))
  );
};

const sameClipboard = (
  left: AnimationKeyframeClipboard | null,
  right: AnimationKeyframeClipboard | null,
): boolean => {
  if (!left || !right) return left === right;
  if (left.sourceClipName !== right.sourceClipName) return false;
  if (left.sourceSkeletonFingerprint !== right.sourceSkeletonFingerprint) return false;
  if (left.sourceScope !== right.sourceScope) return false;
  const names = new Set([...Object.keys(left.entries), ...Object.keys(right.entries)]);
  for (const name of names) {
    if (!sameKey(left.entries[name] ?? null, right.entries[name] ?? null)) return false;
  }
  return true;
};

const sameStringSet = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
};

const sameMetadata = (
  left: AnimationClipMetadata | undefined,
  right: AnimationClipMetadata | undefined,
): boolean => {
  if (!left || !right) return left === right;
  return left.loop === right.loop && left.sampleFrameMultiplier === right.sampleFrameMultiplier;
};

export const sameAnimationEditState = (
  left: AnimationEditState,
  right: AnimationEditState,
): boolean => {
  if (left.interpolation !== right.interpolation) return false;
  if ((left.selectedKeyTime === null) !== (right.selectedKeyTime === null)) return false;
  if (
    left.selectedKeyTime !== null
    && right.selectedKeyTime !== null
    && !sameNumber(left.selectedKeyTime, right.selectedKeyTime)
  ) {
    return false;
  }
  if (!sameClipboard(left.clipboard, right.clipboard)) return false;
  if (!sameStringSet(left.dirtyClipNames, right.dirtyClipNames)) return false;
  const metadataClipNames = new Set([...Object.keys(left.metadataByClip), ...Object.keys(right.metadataByClip)]);
  for (const clipName of metadataClipNames) {
    if (!sameMetadata(left.metadataByClip[clipName], right.metadataByClip[clipName])) return false;
  }

  const durationClipNames = new Set([
    ...Object.keys(left.durationByClip ?? {}),
    ...Object.keys(right.durationByClip ?? {}),
  ]);
  for (const clipName of durationClipNames) {
    if (Math.abs((left.durationByClip?.[clipName] ?? 0) - (right.durationByClip?.[clipName] ?? 0)) > TIME_EPSILON) {
      return false;
    }
  }

  const lockedClipNames = new Set([
    ...Object.keys(left.lockedBonesByClip ?? {}),
    ...Object.keys(right.lockedBonesByClip ?? {}),
  ]);
  for (const clipName of lockedClipNames) {
    const leftNames = new Set(left.lockedBonesByClip?.[clipName] ?? []);
    const rightNames = new Set(right.lockedBonesByClip?.[clipName] ?? []);
    if (leftNames.size !== rightNames.size || [...leftNames].some((name) => !rightNames.has(name))) return false;
  }

  const clipNames = new Set([...Object.keys(left.editsByClip), ...Object.keys(right.editsByClip)]);
  for (const clipName of clipNames) {
    const leftClip = left.editsByClip[clipName] ?? makeStringRecord<EditableBoneKeyframe[]>();
    const rightClip = right.editsByClip[clipName] ?? makeStringRecord<EditableBoneKeyframe[]>();
    const boneNames = new Set([...Object.keys(leftClip), ...Object.keys(rightClip)]);
    for (const boneName of boneNames) {
      const leftKeys = leftClip[boneName] ?? [];
      const rightKeys = rightClip[boneName] ?? [];
      if (leftKeys.length !== rightKeys.length) return false;
      for (let index = 0; index < leftKeys.length; index += 1) {
        if (!sameKey(leftKeys[index], rightKeys[index])) return false;
      }
    }
  }

  return true;
};

export const getClipKey = (clip: THREE.AnimationClip, index: number): string => clip.name || `clip_${index}`;

export const getCurrentClipKey = (
  clips: readonly THREE.AnimationClip[],
  currentClipName: string,
): string => {
  const foundIndex = clips.findIndex((clip, index) => getClipKey(clip, index) === currentClipName);
  if (foundIndex >= 0) return getClipKey(clips[foundIndex], foundIndex);
  return clips[0] ? getClipKey(clips[0], 0) : '';
};

export const makeUniqueAnimationClipName = (
  clips: THREE.AnimationClip[],
  requestedName: string,
  ignoredName = '',
): string => {
  const baseName = requestedName.trim() || 'Clip';
  const usedNames = new Set(
    clips
      .map((clip, index) => getClipKey(clip, index))
      .filter((name) => name !== ignoredName),
  );
  if (!usedNames.has(baseName)) return baseName;

  let suffix = 2;
  let candidate = `${baseName} ${suffix}`;
  while (usedNames.has(candidate)) {
    suffix += 1;
    candidate = `${baseName} ${suffix}`;
  }
  return candidate;
};

export const moveAnimationClip = (
  clips: THREE.AnimationClip[],
  clipName: string,
  direction: -1 | 1,
): THREE.AnimationClip[] => {
  const sourceIndex = clips.findIndex((clip, index) => getClipKey(clip, index) === clipName);
  if (sourceIndex < 0) return clips.map((clip) => clip.clone());

  const targetIndex = sourceIndex + direction;
  if (targetIndex < 0 || targetIndex >= clips.length) {
    return clips.map((clip) => clip.clone());
  }

  const next = clips.map((clip) => clip.clone());
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
};

const normalizeTime = (time: number): number => {
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.round(time * 10000) / 10000);
};

export const normalizeAnimationSnapStep = (value: number): AnimationSnapStep => {
  const match = ANIMATION_SNAP_STEPS.find((step) => Math.abs(step - value) < TIME_EPSILON);
  return match ?? 0;
};

export const snapAnimationTime = (
  time: number,
  snapStep: AnimationSnapStep,
  duration = Number.MAX_SAFE_INTEGER,
): number => {
  const normalizedTime = normalizeTime(time);
  const step = normalizeAnimationSnapStep(snapStep);
  const snapped = step > 0
    ? normalizeTime(Math.round(normalizedTime / step) * step)
    : normalizedTime;
  const maxTime = Number.isFinite(duration) ? Math.max(0, duration) : Number.MAX_SAFE_INTEGER;
  return Math.min(maxTime, Math.max(0, snapped));
};

export const animationInterpolationToSmf = (interpolation: AnimationInterpolation): number => {
  return SMF_ANIMATION_INTERPOLATION[interpolation];
};

export const smfInterpolationToAnimation = (interpolation: number | null | undefined): AnimationInterpolation => {
  if (interpolation === SMF_ANIMATION_INTERPOLATION.step) return 'step';
  if (interpolation === SMF_ANIMATION_INTERPOLATION.quadratic) return 'quadratic';
  return 'linear';
};

const keyMatchesTime = (key: EditableBoneKeyframe, time: number): boolean => {
  return Math.abs(key.time - time) <= TIME_EPSILON;
};

const markDirty = (state: AnimationEditState, clipName: string): void => {
  if (!state.dirtyClipNames.includes(clipName)) {
    state.dirtyClipNames.push(clipName);
  }
};

export const markAnimationClipDirty = (
  state: AnimationEditState,
  clipName: string,
): AnimationEditState => {
  if (!clipName) return cloneAnimationEditState(state);
  const next = cloneAnimationEditState(state);
  markDirty(next, clipName);
  return next;
};

export const normalizeSampleFrameMultiplier = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.min(255, Math.max(1, Math.round(value)));
};

export const makeAnimationClipMetadata = (
  metadata?: Partial<AnimationClipMetadata> | null,
): AnimationClipMetadata => ({
  loop: metadata?.loop ?? true,
  sampleFrameMultiplier: normalizeSampleFrameMultiplier(metadata?.sampleFrameMultiplier ?? 1),
});

export const getAnimationClipMetadata = (
  state: AnimationEditState,
  clipName: string,
  fallback?: Partial<AnimationClipMetadata> | null,
): AnimationClipMetadata => makeAnimationClipMetadata(state.metadataByClip[clipName] ?? fallback);

export const setAnimationClipLoop = (
  state: AnimationEditState,
  clipName: string,
  loop: boolean,
  fallback?: Partial<AnimationClipMetadata> | null,
): AnimationEditState => {
  if (!clipName) return cloneAnimationEditState(state);
  const next = cloneAnimationEditState(state);
  const metadata = getAnimationClipMetadata(next, clipName, fallback);
  metadata.loop = loop;
  next.metadataByClip[clipName] = metadata;
  markDirty(next, clipName);
  return next;
};

export const setAnimationClipSampleFrameMultiplier = (
  state: AnimationEditState,
  clipName: string,
  sampleFrameMultiplier: number,
  fallback?: Partial<AnimationClipMetadata> | null,
): AnimationEditState => {
  if (!clipName) return cloneAnimationEditState(state);
  const next = cloneAnimationEditState(state);
  const metadata = getAnimationClipMetadata(next, clipName, fallback);
  metadata.sampleFrameMultiplier = normalizeSampleFrameMultiplier(sampleFrameMultiplier);
  next.metadataByClip[clipName] = metadata;
  markDirty(next, clipName);
  return next;
};

export const setAnimationClipDuration = (
  state: AnimationEditState,
  clipName: string,
  duration: number,
): AnimationEditState => {
  if (!clipName) return cloneAnimationEditState(state);
  const next = cloneAnimationEditState(state);
  next.durationByClip[clipName] = normalizeAnimationDuration(duration);
  markDirty(next, clipName);
  return next;
};

export const getAnimationClipLockedBoneNames = (
  state: AnimationEditState,
  clipName: string,
  fallback: readonly string[] = [],
): string[] => {
  const names = Object.prototype.hasOwnProperty.call(state.lockedBonesByClip ?? {}, clipName)
    ? state.lockedBonesByClip[clipName]
    : fallback;
  return [...new Set((names ?? []).filter((name) => typeof name === 'string' && name))];
};

export const setAnimationClipLockedBones = (
  state: AnimationEditState,
  clipName: string,
  boneNames: Iterable<string>,
): AnimationEditState => {
  if (!clipName) return cloneAnimationEditState(state);
  const next = cloneAnimationEditState(state);
  next.lockedBonesByClip[clipName] = [...new Set([...boneNames].filter(Boolean))].sort();
  markDirty(next, clipName);
  return next;
};

export const isAnimationBoneLocked = (
  state: AnimationEditState,
  clipName: string,
  boneName: string,
  fallback: readonly string[] = [],
): boolean => getAnimationClipLockedBoneNames(state, clipName, fallback).includes(boneName);

export const getAnimationClipTimelineDuration = (clip: THREE.AnimationClip): number => {
  let duration = Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 0;
  for (const track of clip.tracks) {
    for (const time of track.times) {
      if (Number.isFinite(time)) duration = Math.max(duration, time);
    }
  }
  return Math.max(0, duration);
};

const trackBoneName = (track: THREE.KeyframeTrack): string | null => {
  const match = track.name.match(/^(.*)\.(?:position|quaternion)$/);
  return match?.[1] || null;
};

const hasTrackKeyOutsideRange = (
  track: THREE.KeyframeTrack,
  startTime: number,
  endTime: number,
): boolean => Array.from(track.times).some((time) => (
  !Number.isFinite(time) || time < startTime || time > endTime
));

const normalizeTrimBounds = (
  clip: THREE.AnimationClip,
  startTime: number,
  endTime: number,
): { startTime: number; endTime: number } | null => {
  const duration = getAnimationClipTimelineDuration(clip);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || duration < TIME_EPSILON) return null;
  const start = Math.fround(Math.min(duration, Math.max(0, startTime)));
  const end = Math.fround(Math.min(duration, Math.max(0, endTime)));
  if (end <= start || end - start < MIN_ANIMATION_DURATION - TIME_EPSILON) return null;
  return { startTime: start, endTime: end };
};

const sampleTrackAt = (track: THREE.KeyframeTrack, time: number): number[] => {
  return Array.from(createTrackInterpolant(track).evaluate(time) as ArrayLike<number>).slice(0, trackSampleSize(track));
};

const cubicBoundaryValues = (track: THREE.KeyframeTrack, time: number): number[] => {
  const size = trackSampleSize(track);
  const values = sampleTrackAt(track, time);
  const tangent = Array<number>(size).fill(0);
  let upper = 0;
  while (upper < track.times.length && track.times[upper] <= time) upper += 1;
  if (upper > 0 && upper < track.times.length) {
    const span = track.times[upper] - track.times[upper - 1];
    const t = (time - track.times[upper - 1]) / span, t2 = t * t;
    const left = (upper - 1) * size * 3, right = upper * size * 3;
    for (let i = 0; i < size; i++) {
      // The derivative remains in units per second after subdividing a Hermite segment.
      tangent[i] = (6*t2 - 6*t) / span * track.values[left + size + i]
        + (3*t2 - 4*t + 1) * track.values[left + 2*size + i]
        + (-6*t2 + 6*t) / span * track.values[right + size + i]
        + (3*t2 - 2*t) * track.values[right + i];
    }
  }
  return [...tangent, ...values, ...tangent];
};

const trimTrackToRange = (
  track: THREE.KeyframeTrack,
  startTime: number,
  endTime: number,
): THREE.KeyframeTrack => {
  const valueSize = track.getValueSize();
  const cubic = trackInterpolation(track) === 'gltf-cubic-spline';
  const entries = Array.from(track.times)
    .map((time, index) => ({ time, values: Array.from(track.values.slice(index * valueSize, (index + 1) * valueSize)) }))
    .filter((entry) => Number.isFinite(entry.time) && entry.time >= startTime && entry.time <= endTime);

  if (cubic) {
    const size = trackSampleSize(track);
    for (const entry of entries) {
      if (entry.time === track.times[0]) entry.values.fill(0, 0, size);
      if (entry.time === track.times[track.times.length - 1]) entry.values.fill(0, 2*size, 3*size);
    }
  }

  const addBoundary = (sourceTime: number): void => {
    if (entries.some((entry) => entry.time === sourceTime)) return;
    entries.push({ time: sourceTime, values: cubic ? cubicBoundaryValues(track, sourceTime) : sampleTrackAt(track, sourceTime) });
  };

  addBoundary(startTime);
  addBoundary(endTime);
  entries.sort((left, right) => left.time - right.time);

  const trimmed = track.clone();
  trimmed.times = Float32Array.from(entries.map((entry) => entry.time - startTime));
  trimmed.values = Float32Array.from(entries.flatMap((entry) => entry.values));
  return trimmed;
};

export const trimAnimationClip = (
  clip: THREE.AnimationClip,
  startTime: number,
  endTime: number,
  lockedBoneNames: readonly string[] = [],
): AnimationTrimResult => {
  const bounds = normalizeTrimBounds(clip, startTime, endTime);
  if (!bounds) return { ok: false, reason: 'invalid-range' };

  const locked = new Set(lockedBoneNames);
  const lockedTrack = clip.tracks.find((track) => {
    const boneName = trackBoneName(track);
    return !!boneName && locked.has(boneName) && hasTrackKeyOutsideRange(track, bounds.startTime, bounds.endTime);
  });
  if (lockedTrack) {
    return {
      ok: false,
      reason: 'locked-bone-range',
      boneName: trackBoneName(lockedTrack) ?? undefined,
    };
  }

  for (const track of clip.tracks) {
    let interpolation;
    try { interpolation = trackInterpolation(track); }
    catch { return { ok: false, reason: 'unsupported-interpolation', trackName: track.name }; }
    if (interpolation === THREE.InterpolateSmooth) {
      return { ok: false, reason: 'unsupported-interpolation', trackName: track.name };
    }
    if (interpolation === 'gltf-cubic-spline' && track.ValueTypeName === 'quaternion'
      && [bounds.startTime, bounds.endTime].some(time => time > track.times[0]
        && time < track.times[track.times.length - 1] && !track.times.includes(time))) {
      // Normalizing an inserted quaternion vertex changes the underlying cubic polynomial.
      return { ok: false, reason: 'cubic-rotation-boundary', trackName: track.name };
    }
  }

  return {
    ok: true,
    clip: new THREE.AnimationClip(
      clip.name,
      bounds.endTime - bounds.startTime,
      clip.tracks.map((track) => trimTrackToRange(track, bounds.startTime, bounds.endTime)),
      clip.blendMode,
    ),
    ...bounds,
  };
};

export const trimAnimationEditState = (
  state: AnimationEditState,
  clipName: string,
  startTime: number,
  endTime: number,
): AnimationEditState => {
  if (!clipName) return cloneAnimationEditState(state);
  const next = cloneAnimationEditState(state);
  const clipEdits = next.editsByClip[clipName];
  if (clipEdits) {
    for (const [boneName, keys] of Object.entries(clipEdits)) {
      const trimmed = keys
        .filter((key) => key.time >= startTime - TIME_EPSILON && key.time <= endTime + TIME_EPSILON)
        .map((key) => ({ ...cloneKey(key), time: normalizeTime(key.time - startTime) }))
        .sort((left, right) => left.time - right.time);
      if (trimmed.length > 0) clipEdits[boneName] = trimmed;
      else delete clipEdits[boneName];
    }
    if (Object.keys(clipEdits).length === 0) delete next.editsByClip[clipName];
  }
  next.selectedKeyTime = next.selectedKeyTime === null
    ? null
    : normalizeTime(Math.max(0, Math.min(endTime - startTime, next.selectedKeyTime - startTime)));
  next.durationByClip[clipName] = normalizeAnimationDuration(endTime - startTime);
  markDirty(next, clipName);
  return next;
};

const scaleAnimationTime = (time: number, scale: number, duration: number): number => (
  normalizeTime(Math.min(duration, Math.max(0, Number.isFinite(time) ? time * scale : 0)))
);

export const retimeAnimationClip = (
  clip: THREE.AnimationClip,
  currentDuration: number,
  targetDuration: number,
): THREE.AnimationClip => {
  const normalizedTarget = normalizeAnimationDuration(targetDuration);
  const sourceDuration = Number.isFinite(currentDuration) && currentDuration > TIME_EPSILON
    ? currentDuration
    : getAnimationClipTimelineDuration(clip);
  const scale = sourceDuration > TIME_EPSILON ? normalizedTarget / sourceDuration : 1;
  const tracks = clip.tracks.map((track) => {
    const interpolation = trackInterpolation(track);
    const retimed = track.clone();
    retimed.times = Float32Array.from(track.times, (time) => time * scale);
    if (interpolation === 'gltf-cubic-spline') {
      const size = trackSampleSize(track);
      for (let offset = 0; offset < retimed.values.length; offset += size * 3) {
        for (let i = 0; i < size; i++) {
          retimed.values[offset + i] /= scale;
          retimed.values[offset + 2*size + i] /= scale;
        }
      }
    }
    return retimed;
  });
  return new THREE.AnimationClip(clip.name, normalizedTarget, tracks, clip.blendMode);
};

export const retimeAnimationEditState = (
  state: AnimationEditState,
  clipName: string,
  currentDuration: number,
  targetDuration: number,
): AnimationEditState => {
  if (!clipName) return cloneAnimationEditState(state);

  const next = cloneAnimationEditState(state);
  const normalizedTarget = normalizeAnimationDuration(targetDuration);
  const sourceDuration = Number.isFinite(currentDuration) && currentDuration > TIME_EPSILON
    ? currentDuration
    : normalizedTarget;
  const scale = sourceDuration > TIME_EPSILON ? normalizedTarget / sourceDuration : 1;
  const clipEdits = next.editsByClip[clipName];
  if (clipEdits) {
    for (const [boneName, keys] of Object.entries(clipEdits)) {
      clipEdits[boneName] = keys
        .map((key) => ({ ...cloneKey(key), time: scaleAnimationTime(key.time, scale, normalizedTarget) }))
        .sort((left, right) => left.time - right.time);
    }
  }
  next.durationByClip[clipName] = normalizedTarget;
  markDirty(next, clipName);
  return next;
};

export const makeKeyframeFromBone = (
  bone: THREE.Bone,
  time: number,
  interpolation: AnimationInterpolation,
): EditableBoneKeyframe => {
  bone.updateMatrix();
  const q = bone.quaternion.clone().normalize();
  return {
    time: normalizeTime(time),
    position: [bone.position.x, bone.position.y, bone.position.z],
    quaternion: [q.x, q.y, q.z, q.w],
    interpolation,
  };
};

export const upsertAnimationKeyframe = (
  state: AnimationEditState,
  clipName: string,
  boneName: string,
  keyframe: EditableBoneKeyframe,
): AnimationEditState => {
  const next = cloneAnimationEditState(state);
  const key = cloneKey({ ...keyframe, time: normalizeTime(keyframe.time) });
  const clipEdits = next.editsByClip[clipName] ?? makeStringRecord<EditableBoneKeyframe[]>();
  const boneKeys = clipEdits[boneName] ?? [];
  const existingIndex = boneKeys.findIndex((candidate) => keyMatchesTime(candidate, key.time));

  if (existingIndex >= 0) {
    boneKeys[existingIndex] = key;
  } else {
    boneKeys.push(key);
  }

  boneKeys.sort((a, b) => a.time - b.time);
  clipEdits[boneName] = boneKeys;
  next.editsByClip[clipName] = clipEdits;
  next.selectedKeyTime = key.time;
  next.interpolation = key.interpolation;
  markDirty(next, clipName);
  return next;
};

export const upsertAnimationKeyframes = (
  state: AnimationEditState,
  clipName: string,
  keyframes: Readonly<Record<string, EditableBoneKeyframe>>,
): AnimationEditState => {
  const next = cloneAnimationEditState(state);
  const clipEdits = next.editsByClip[clipName] ?? makeStringRecord<EditableBoneKeyframe[]>();
  let firstKey: EditableBoneKeyframe | null = null;

  for (const [boneName, candidate] of Object.entries(keyframes)) {
    if (!boneName) continue;
    const key = cloneKey({ ...candidate, time: normalizeTime(candidate.time) });
    const boneKeys = clipEdits[boneName] ?? [];
    const existingIndex = boneKeys.findIndex((entry) => keyMatchesTime(entry, key.time));
    if (existingIndex >= 0) {
      boneKeys[existingIndex] = key;
    } else {
      boneKeys.push(key);
    }
    boneKeys.sort((left, right) => left.time - right.time);
    clipEdits[boneName] = boneKeys;
    firstKey ??= key;
  }

  if (!firstKey) return next;
  next.editsByClip[clipName] = clipEdits;
  next.selectedKeyTime = firstKey.time;
  next.interpolation = firstKey.interpolation;
  markDirty(next, clipName);
  return next;
};

export const deleteAnimationKeyframe = (
  state: AnimationEditState,
  clipName: string,
  boneName: string,
  time: number,
): AnimationEditState => {
  const next = cloneAnimationEditState(state);
  const clipEdits = next.editsByClip[clipName];
  const boneKeys = clipEdits?.[boneName];
  if (!boneKeys) return next;

  const filtered = boneKeys.filter((key) => !keyMatchesTime(key, time));
  if (filtered.length === boneKeys.length) return next;

  if (filtered.length > 0) {
    clipEdits[boneName] = filtered;
  } else {
    delete clipEdits[boneName];
  }
  if (Object.keys(clipEdits).length === 0) {
    delete next.editsByClip[clipName];
  }
  next.selectedKeyTime = null;
  markDirty(next, clipName);
  return next;
};

export const deleteAnimationKeyframes = (
  state: AnimationEditState,
  clipName: string,
  boneNames: Iterable<string>,
  time: number,
): AnimationEditState => {
  const next = cloneAnimationEditState(state);
  const clipEdits = next.editsByClip[clipName];
  if (!clipEdits) return next;

  let changed = false;
  for (const boneName of new Set([...boneNames].filter(Boolean))) {
    const boneKeys = clipEdits[boneName];
    if (!boneKeys) continue;
    const filtered = boneKeys.filter((key) => !keyMatchesTime(key, time));
    if (filtered.length === boneKeys.length) continue;
    changed = true;
    if (filtered.length > 0) clipEdits[boneName] = filtered;
    else delete clipEdits[boneName];
  }

  if (!changed) return next;
  if (Object.keys(clipEdits).length === 0) delete next.editsByClip[clipName];
  next.selectedKeyTime = null;
  markDirty(next, clipName);
  return next;
};

export const selectAnimationKeyframe = (
  state: AnimationEditState,
  time: number | null,
): AnimationEditState => ({
  ...state,
  selectedKeyTime: time === null ? null : normalizeTime(time),
});

export const setAnimationInterpolation = (
  state: AnimationEditState,
  interpolation: AnimationInterpolation,
  clipName?: string,
  boneName?: string,
): AnimationEditState => {
  const next = cloneAnimationEditState(state);
  next.interpolation = interpolation;
  const selectedTime = next.selectedKeyTime;
  if (clipName && boneName && selectedTime !== null) {
    const key = next.editsByClip[clipName]?.[boneName]?.find((candidate) => keyMatchesTime(candidate, selectedTime));
    if (key) {
      key.interpolation = interpolation;
      markDirty(next, clipName);
    }
  }
  return next;
};

export const copyAnimationKeyframe = (
  state: AnimationEditState,
  keyframe: EditableBoneKeyframe,
  boneName = '',
  sourceClipName = '',
  sourceSkeletonFingerprint = '',
  sourceScope: AnimationEditScope = 'bone',
): AnimationEditState => ({
  ...cloneAnimationEditState(state),
  clipboard: {
    sourceClipName,
    sourceSkeletonFingerprint,
    sourceScope,
    entries: Object.assign(makeStringRecord<EditableBoneKeyframe>(), { [boneName]: cloneKey(keyframe) }),
  },
});

export const copyAnimationKeyframes = (
  state: AnimationEditState,
  sourceClipName: string,
  sourceSkeletonFingerprint: string,
  sourceScope: AnimationEditScope,
  keyframes: Readonly<Record<string, EditableBoneKeyframe>>,
): AnimationEditState => ({
  ...cloneAnimationEditState(state),
  clipboard: {
    sourceClipName,
    sourceSkeletonFingerprint,
    sourceScope,
    entries: Object.assign(
      makeStringRecord<EditableBoneKeyframe>(),
      Object.fromEntries(Object.entries(keyframes).map(([boneName, key]) => [boneName, cloneKey(key)])),
    ),
  },
});

export const renameAnimationEditBone = (
  state: AnimationEditState,
  oldBoneName: string,
  newBoneName: string,
): AnimationEditState => {
  if (!oldBoneName || !newBoneName || oldBoneName === newBoneName) {
    return cloneAnimationEditState(state);
  }

  const next = cloneAnimationEditState(state);
  for (const clipEdits of Object.values(next.editsByClip)) {
    const existing = clipEdits[oldBoneName];
    if (!existing) continue;
    const destination = clipEdits[newBoneName] ?? [];
    clipEdits[newBoneName] = [...destination, ...existing.map(cloneKey)]
      .sort((left, right) => left.time - right.time);
    delete clipEdits[oldBoneName];
  }
  return next;
};

export const renameAnimationEditClip = (
  state: AnimationEditState,
  oldClipName: string,
  newClipName: string,
): AnimationEditState => {
  if (!oldClipName || !newClipName || oldClipName === newClipName) {
    return cloneAnimationEditState(state);
  }

  const next = cloneAnimationEditState(state);
  const existing = next.editsByClip[oldClipName];
  if (existing) {
    const destination = next.editsByClip[newClipName] ?? makeStringRecord<EditableBoneKeyframe[]>();
    next.editsByClip[newClipName] = {
      ...destination,
      ...existing,
    };
    delete next.editsByClip[oldClipName];
  }
  const metadata = next.metadataByClip[oldClipName];
  if (metadata) {
    next.metadataByClip[newClipName] = { ...metadata };
    delete next.metadataByClip[oldClipName];
  }
  const duration = next.durationByClip[oldClipName];
  if (duration !== undefined) {
    next.durationByClip[newClipName] = duration;
    delete next.durationByClip[oldClipName];
  }
  const lockedBones = next.lockedBonesByClip[oldClipName];
  if (lockedBones !== undefined) {
    next.lockedBonesByClip[newClipName] = [...lockedBones];
    delete next.lockedBonesByClip[oldClipName];
  }

  next.dirtyClipNames = Array.from(new Set([
    ...next.dirtyClipNames.map((clipName) => (clipName === oldClipName ? newClipName : clipName)),
    newClipName,
  ]));
  return next;
};

export const duplicateAnimationEditClip = (
  state: AnimationEditState,
  sourceClipName: string,
  duplicateClipName: string,
): AnimationEditState => {
  if (!sourceClipName || !duplicateClipName || sourceClipName === duplicateClipName) {
    return cloneAnimationEditState(state);
  }

  const next = cloneAnimationEditState(state);
  const sourceEdits = next.editsByClip[sourceClipName];
  if (sourceEdits) {
    next.editsByClip[duplicateClipName] = makeStringRecord<EditableBoneKeyframe[]>();
    for (const [boneName, keys] of Object.entries(sourceEdits)) {
      next.editsByClip[duplicateClipName][boneName] = keys.map(cloneKey);
    }
  } else {
    delete next.editsByClip[duplicateClipName];
  }
  const metadata = next.metadataByClip[sourceClipName];
  if (metadata) {
    next.metadataByClip[duplicateClipName] = { ...metadata };
  }
  const duration = next.durationByClip[sourceClipName];
  if (duration !== undefined) {
    next.durationByClip[duplicateClipName] = duration;
  }
  const lockedBones = next.lockedBonesByClip[sourceClipName];
  if (lockedBones !== undefined) {
    next.lockedBonesByClip[duplicateClipName] = [...lockedBones];
  }
  markDirty(next, duplicateClipName);
  return next;
};

export const deleteAnimationEditClip = (
  state: AnimationEditState,
  clipName: string,
): AnimationEditState => {
  if (!clipName) return cloneAnimationEditState(state);

  const next = cloneAnimationEditState(state);
  delete next.editsByClip[clipName];
  delete next.metadataByClip[clipName];
  delete next.durationByClip[clipName];
  delete next.lockedBonesByClip[clipName];
  next.dirtyClipNames = next.dirtyClipNames.filter((name) => name !== clipName);
  next.selectedKeyTime = null;
  return next;
};

export const deleteAnimationEditBones = (
  state: AnimationEditState,
  boneNames: Iterable<string>,
): AnimationEditState => {
  const names = new Set([...boneNames].filter(Boolean));
  if (names.size === 0) return cloneAnimationEditState(state);

  const next = cloneAnimationEditState(state);
  for (const [clipName, clipEdits] of Object.entries(next.editsByClip)) {
    let changed = false;
    for (const boneName of names) {
      if (clipEdits[boneName]) {
        delete clipEdits[boneName];
        changed = true;
      }
    }
    if (Object.keys(clipEdits).length === 0) {
      delete next.editsByClip[clipName];
    }
    if (changed) {
      markDirty(next, clipName);
    }
  }
  if (
    next.clipboard
    && [...names].some((name) => Object.prototype.hasOwnProperty.call(next.clipboard!.entries, name))
  ) {
    next.clipboard = null;
  }
  next.selectedKeyTime = null;
  return next;
};

export const getEditedKeyframe = (
  state: AnimationEditState,
  clipName: string,
  boneName: string,
  time: number,
): EditableBoneKeyframe | null => {
  const key = state.editsByClip[clipName]?.[boneName]?.find((candidate) => keyMatchesTime(candidate, time));
  return key ? cloneKey(key) : null;
};

export const moveAnimationKeyframe = (
  state: AnimationEditState,
  clipName: string,
  boneName: string,
  fromTime: number,
  toTime: number,
): AnimationEditState => {
  const next = cloneAnimationEditState(state);
  const clipEdits = next.editsByClip[clipName];
  const boneKeys = clipEdits?.[boneName];
  if (!boneKeys) return next;

  const sourceIndex = boneKeys.findIndex((candidate) => keyMatchesTime(candidate, fromTime));
  if (sourceIndex < 0) return next;

  const normalizedToTime = normalizeTime(toTime);
  const source = boneKeys[sourceIndex];
  if (keyMatchesTime(source, normalizedToTime)) {
    next.selectedKeyTime = source.time;
    return next;
  }

  const moved = cloneKey({ ...source, time: normalizedToTime });
  const withoutSource = boneKeys.filter((_, index) => index !== sourceIndex);
  const destinationIndex = withoutSource.findIndex((candidate) => keyMatchesTime(candidate, normalizedToTime));
  if (destinationIndex >= 0) {
    withoutSource[destinationIndex] = moved;
  } else {
    withoutSource.push(moved);
  }
  withoutSource.sort((left, right) => left.time - right.time);
  clipEdits[boneName] = withoutSource;
  next.selectedKeyTime = normalizedToTime;
  markDirty(next, clipName);
  return next;
};

export const moveAnimationKeyframes = (
  state: AnimationEditState,
  clipName: string,
  boneNames: Iterable<string>,
  fromTime: number,
  toTime: number,
): AnimationEditState => {
  const next = cloneAnimationEditState(state);
  const clipEdits = next.editsByClip[clipName];
  if (!clipEdits) return next;

  const normalizedToTime = normalizeTime(toTime);
  let changed = false;
  for (const boneName of new Set([...boneNames].filter(Boolean))) {
    const boneKeys = clipEdits[boneName];
    if (!boneKeys) continue;
    const sourceIndex = boneKeys.findIndex((candidate) => keyMatchesTime(candidate, fromTime));
    if (sourceIndex < 0) continue;
    const source = boneKeys[sourceIndex];
    if (keyMatchesTime(source, normalizedToTime)) continue;

    const moved = cloneKey({ ...source, time: normalizedToTime });
    const withoutSource = boneKeys.filter((_, index) => index !== sourceIndex);
    const destinationIndex = withoutSource.findIndex((candidate) => keyMatchesTime(candidate, normalizedToTime));
    if (destinationIndex >= 0) withoutSource[destinationIndex] = moved;
    else withoutSource.push(moved);
    withoutSource.sort((left, right) => left.time - right.time);
    clipEdits[boneName] = withoutSource;
    changed = true;
  }

  if (!changed) return next;
  next.selectedKeyTime = normalizedToTime;
  markDirty(next, clipName);
  return next;
};

const findBoneTrack = (
  clip: THREE.AnimationClip,
  boneName: string,
  property: 'position' | 'quaternion',
): THREE.KeyframeTrack | null => {
  return clip.tracks.find((track) => track.name === `${boneName}.${property}`) ?? null;
};

export const sampleClipBoneKeyframe = (
  clip: THREE.AnimationClip,
  boneName: string,
  time: number,
  fallback?: EditableBoneKeyframe,
): EditableBoneKeyframe | null => {
  const posTrack = findBoneTrack(clip, boneName, 'position');
  const quatTrack = findBoneTrack(clip, boneName, 'quaternion');
  if (!posTrack && !quatTrack && !fallback) return null;

  const position = posTrack
    ? sampleTrackAt(posTrack, time) as [number, number, number]
    : fallback?.position ?? [0, 0, 0];
  const quaternion = quatTrack
    ? sampleTrackAt(quatTrack, time) as [number, number, number, number]
    : fallback?.quaternion ?? [0, 0, 0, 1];

  return {
    time: normalizeTime(time),
    position,
    quaternion,
    interpolation: fallback?.interpolation ?? 'linear',
  };
};

const collectTrackTimes = (tracks: THREE.KeyframeTrack[]): number[] => {
  const times = new Set<number>();
  for (const track of tracks) {
    for (const time of track.times) {
      if (Number.isFinite(time)) {
        times.add(normalizeTime(time));
      }
    }
  }
  return [...times].sort((a, b) => a - b);
};

const collectBoneKeysFromClip = (
  clip: THREE.AnimationClip,
  boneName: string,
): EditableBoneKeyframe[] => {
  const tracks = [
    findBoneTrack(clip, boneName, 'position'),
    findBoneTrack(clip, boneName, 'quaternion'),
  ].filter((track): track is THREE.KeyframeTrack => !!track);
  const times = collectTrackTimes(tracks);
  return times
    .map((time) => sampleClipBoneKeyframe(clip, boneName, time))
    .filter((key): key is EditableBoneKeyframe => !!key);
};

const isEditedBoneTrack = (
  track: THREE.KeyframeTrack,
  editedBoneNames: Set<string>,
): boolean => {
  for (const boneName of editedBoneNames) {
    if (track.name === `${boneName}.position` || track.name === `${boneName}.quaternion`) {
      return true;
    }
  }
  return false;
};

const makeTracksForBone = (
  boneName: string,
  keys: EditableBoneKeyframe[],
): THREE.KeyframeTrack[] => {
  const sorted = [...keys].sort((a, b) => a.time - b.time);
  const times = sorted.map((key) => key.time);
  const posValues = new Float32Array(sorted.length * 3);
  const quatValues = new Float32Array(sorted.length * 4);

  sorted.forEach((key, index) => {
    posValues[index * 3] = key.position[0];
    posValues[index * 3 + 1] = key.position[1];
    posValues[index * 3 + 2] = key.position[2];
    quatValues[index * 4] = key.quaternion[0];
    quatValues[index * 4 + 1] = key.quaternion[1];
    quatValues[index * 4 + 2] = key.quaternion[2];
    quatValues[index * 4 + 3] = key.quaternion[3];
  });

  const positionTrack = new THREE.VectorKeyframeTrack(`${boneName}.position`, times, posValues);
  const quaternionTrack = new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, quatValues);
  const interpolation = sorted.some((key) => key.interpolation === 'step')
    ? THREE.InterpolateDiscrete
    : THREE.InterpolateLinear;
  // Three.js tracks do not have a quadratic mode; quadratic remains SMF export metadata and previews linearly.
  positionTrack.setInterpolation(interpolation);
  quaternionTrack.setInterpolation(interpolation);
  return [positionTrack, quaternionTrack];
};

export const applyAnimationEditsToClips = (
  baseClips: THREE.AnimationClip[],
  state: AnimationEditState,
): THREE.AnimationClip[] => {
  if (!hasDirtyAnimationEdits(state)) return baseClips;

  return baseClips.map((clip, index) => {
    const clipName = getClipKey(clip, index);
    const clipEdits = state.editsByClip[clipName];
    const durationOverride = state.durationByClip?.[clipName];
    if (!clipEdits && durationOverride === undefined) return clip;

    const editedBoneNames = new Set(Object.keys(clipEdits ?? {}));
    const tracks = clipEdits
      ? clip.tracks.filter((track) => !isEditedBoneTrack(track, editedBoneNames))
      : clip.tracks.map((track) => track.clone());
    let duration = Math.max(clip.duration, durationOverride ?? 0);

    for (const [boneName, editedKeys] of Object.entries(clipEdits ?? {})) {
      const byTime = new Map<number, EditableBoneKeyframe>();
      for (const key of collectBoneKeysFromClip(clip, boneName)) {
        byTime.set(key.time, key);
      }
      for (const key of editedKeys) {
        byTime.set(key.time, cloneKey(key));
        duration = Math.max(duration, key.time);
      }
      const merged = [...byTime.values()].sort((a, b) => a.time - b.time);
      tracks.push(...makeTracksForBone(boneName, merged));
    }

    return new THREE.AnimationClip(clip.name, duration, tracks, clip.blendMode);
  });
};

const isValidNodeIndex = (index: number, count: number): boolean => index >= 0 && index < count;

const dqToThreeWorldMatrix = (dq: Float32Array): THREE.Matrix4 => {
  return new THREE.Matrix4().fromArray(smfMatrixToThree(dqToMatrix(dq)));
};

const threeWorldMatrixToImportedDq = (matrix: THREE.Matrix4): Float32Array => {
  return dqNegate(dqCreateFromMatrix(threeMatrixToSmf(matrix)));
};

const nearestFrameIndex = (times: number[], time: number): number => {
  if (times.length === 0) return -1;
  let best = 0;
  let bestDelta = Math.abs(times[0] - time);
  for (let i = 1; i < times.length; i += 1) {
    const delta = Math.abs(times[i] - time);
    if (delta < bestDelta) {
      best = i;
      bestDelta = delta;
    }
  }
  return best;
};

const makeMatrixFromKey = (key: EditableBoneKeyframe): THREE.Matrix4 => {
  const matrix = new THREE.Matrix4();
  matrix.compose(
    new THREE.Vector3(...key.position),
    new THREE.Quaternion(...key.quaternion).normalize(),
    new THREE.Vector3(1, 1, 1),
  );
  return matrix;
};

const makeLocalFromWorld = (
  world: THREE.Matrix4,
  parentWorld: THREE.Matrix4 | null,
): THREE.Matrix4 => {
  return parentWorld ? parentWorld.clone().invert().multiply(world) : world.clone();
};

const buildSmfAnimationFromClip = (
  source: ImportedSmf,
  sourceAnimation: ImportedSmf['animations'][number],
  clip: THREE.AnimationClip,
  durationOverride?: number,
): ImportedSmf['animations'][number] => {
  const times = collectTrackTimes(clip.tracks);
  if (times.length === 0) times.push(0);

  const sourceFrameWorld = sourceAnimation.frames.map((frame) => frame.map(dqToThreeWorldMatrix));
  const bindWorld = source.bones.map((bone) => dqToThreeWorldMatrix(bone.dq));

  const getOriginalWorld = (nodeIndex: number, time: number): THREE.Matrix4 => {
    const frameIndex = nearestFrameIndex(sourceAnimation.times, time);
    return sourceFrameWorld[frameIndex]?.[nodeIndex]?.clone() ?? bindWorld[nodeIndex]?.clone() ?? new THREE.Matrix4();
  };

  const frames = times.map((time) => {
    const cache = new Map<number, THREE.Matrix4>();
    const computeWorld = (nodeIndex: number): THREE.Matrix4 => {
      const cached = cache.get(nodeIndex);
      if (cached) return cached;

      const node = source.bones[nodeIndex];
      const originalWorld = getOriginalWorld(nodeIndex, time);
      const parentIndex = findEffectiveBoneParentIndex(source.bones, node?.parent ?? -1, nodeIndex);
      const parentWorld = parentIndex !== null && isValidNodeIndex(parentIndex, source.bones.length)
        ? computeWorld(parentIndex)
        : null;

      let world: THREE.Matrix4;
      if (!node || node.isBone !== 1) {
        world = originalWorld;
      } else {
        const boneName = `SMF_Node_${nodeIndex}`;
        const originalParentWorld = parentIndex !== null && isValidNodeIndex(parentIndex, source.bones.length)
          ? getOriginalWorld(parentIndex, time)
          : null;
        const originalLocal = makeLocalFromWorld(originalWorld, originalParentWorld);
        const { pos, quat } = decomposeMatrix(originalLocal);
        const fallback: EditableBoneKeyframe = {
          time,
          position: [pos.x, pos.y, pos.z],
          quaternion: [quat.x, quat.y, quat.z, quat.w],
          interpolation: 'linear',
        };
        const sampled = sampleClipBoneKeyframe(clip, boneName, time, fallback) ?? fallback;
        const localMatrix = makeMatrixFromKey(sampled);
        world = parentWorld ? parentWorld.clone().multiply(localMatrix) : localMatrix;
      }

      cache.set(nodeIndex, world);
      return world;
    };

    return source.bones.map((_, nodeIndex) => threeWorldMatrixToImportedDq(computeWorld(nodeIndex)));
  });

  return {
    ...sourceAnimation,
    name: clip.name || sourceAnimation.name,
    duration: durationOverride === undefined
      ? Math.max(sourceAnimation.duration, clip.duration, times[times.length - 1] ?? 0)
      : normalizeAnimationDuration(durationOverride),
    times,
    frames,
    nodeCount: source.bones.length,
  };
};

const applyAnimationMetadata = (
  animation: ImportedSmf['animations'][number],
  metadata?: AnimationClipMetadata,
  interpolation?: AnimationInterpolation | null,
): ImportedSmf['animations'][number] => {
  if (!metadata && !interpolation) return animation;
  return {
    ...animation,
    ...(metadata ? {
      loop: metadata.loop ? 1 : 0,
      sampleFrameMultiplier: normalizeSampleFrameMultiplier(metadata.sampleFrameMultiplier),
    } : {}),
    ...(interpolation ? { interpolation: animationInterpolationToSmf(interpolation) } : {}),
  };
};

const getAuthoredClipInterpolation = (
  state: AnimationEditState,
  clipName: string,
): AnimationInterpolation | null => {
  const clipEdits = state.editsByClip[clipName];
  if (!clipEdits) return null;

  let found: AnimationInterpolation | null = null;
  for (const keys of Object.values(clipEdits)) {
    for (const key of keys) {
      if (key.interpolation === 'quadratic') return 'quadratic';
      if (key.interpolation === 'step') {
        found = 'step';
      } else if (!found) {
        found = 'linear';
      }
    }
  }
  return found;
};

const getImportedBoneIndex = (boneName: string, boneCount: number): number | null => {
  const match = boneName.match(/^(?:SMF_Node|Bone)_(\d+)$/);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 && index < boneCount ? index : null;
};

const applyAnimationLockState = (
  animation: ImportedSmf['animations'][number],
  state: AnimationEditState,
  clipName: string,
  boneCount: number,
): ImportedSmf['animations'][number] => {
  if (!Object.prototype.hasOwnProperty.call(state.lockedBonesByClip ?? {}, clipName)) return animation;
  const lockedBones = [...new Set(
    (state.lockedBonesByClip[clipName] ?? [])
      .map((name) => getImportedBoneIndex(name, boneCount))
      .filter((index): index is number => index !== null),
  )].sort((left, right) => left - right);
  return { ...animation, lockedBones };
};

export const applyAnimationMetadataToImportedSmf = (
  source: ImportedSmf,
  state: AnimationEditState,
): ImportedSmf => {
  const metadataEntries = Object.entries(state.metadataByClip);
  if (metadataEntries.length === 0) return source;

  const metadataByClip = new Map(metadataEntries);
  const result = cloneImportedSmf(source);
  result.animations = result.animations.map((animation, index) => {
    const clipName = animation.name || `clip_${index}`;
    return applyAnimationMetadata(animation, metadataByClip.get(clipName));
  });
  return result;
};

export const applyAnimationEditsToImportedSmf = (
  source: ImportedSmf,
  editedClips: THREE.AnimationClip[],
  state: AnimationEditState,
): ImportedSmf => {
  const sourceAnimations = source.animations;
  const sourceByName = new Map(sourceAnimations.map((animation, index) => [animation.name || `clip_${index}`, animation]));
  const clipListChanged = editedClips.length !== sourceAnimations.length
    || editedClips.some((clip, index) => getClipKey(clip, index) !== (sourceAnimations[index]?.name || `clip_${index}`));
  const hasLockOverrides = Object.keys(state.lockedBonesByClip ?? {}).length > 0;
  if (!hasDirtyAnimationEdits(state) && !clipListChanged && !hasLockOverrides) return source;

  const result = cloneImportedSmf(source);
  const makeFallbackAnimation = (clipName: string): ImportedSmf['animations'][number] => ({
    name: clipName,
    duration: 0,
    times: [],
    frames: [],
    nodeCount: source.bones.length,
    loop: 1,
    interpolation: 1,
    sampleFrameMultiplier: 1,
    lockedBones: [],
  });

  if (clipListChanged) {
    result.animations = editedClips.map((clip, index) => {
      const clipName = getClipKey(clip, index);
      const sourceAnimation = sourceByName.get(clipName)
        ?? sourceAnimations[index]
        ?? sourceAnimations[0]
        ?? makeFallbackAnimation(clipName);
      const rebuilt = buildSmfAnimationFromClip(source, sourceAnimation, clip, state.durationByClip?.[clipName]);
      return {
        ...applyAnimationLockState(
          applyAnimationMetadata(rebuilt, state.metadataByClip[clipName], getAuthoredClipInterpolation(state, clipName)),
          state,
          clipName,
          source.bones.length,
        ),
        name: clipName,
      };
    });
    return result;
  }

  result.animations = sourceAnimations.map((animation, index) => {
    const clipName = animation.name || `clip_${index}`;
    if (!state.dirtyClipNames.includes(clipName)) return animation;
    const clip = editedClips.find((candidate, clipIndex) => getClipKey(candidate, clipIndex) === clipName);
    const interpolation = getAuthoredClipInterpolation(state, clipName);
    if (!clip) return applyAnimationMetadata(animation, state.metadataByClip[clipName], interpolation);
    return applyAnimationLockState(
      applyAnimationMetadata(
        buildSmfAnimationFromClip(source, animation, clip, state.durationByClip?.[clipName]),
        state.metadataByClip[clipName],
        interpolation,
      ),
      state,
      clipName,
      source.bones.length,
    );
  });
  return result;
};
