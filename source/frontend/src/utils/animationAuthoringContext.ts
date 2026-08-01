import type * as THREE from 'three';
import { findBoneByName } from './bonePicker';
import { getCurrentClipKey, type AnimationClipMetadata } from './animationEdits';

export type AnimationEditContextFailure =
  | 'missing-animated-model'
  | 'missing-bone-selection'
  | 'invalid-bone-selection';

export interface AnimationEditContext {
  clipName: string;
  boneName: string;
  bone: THREE.Bone;
}

export interface AnimationEditContextResult {
  context: AnimationEditContext | null;
  failure?: AnimationEditContextFailure;
}

export interface AnimationMetadataContext {
  clipName: string;
  fallback: AnimationClipMetadata;
}

export interface AnimationMetadataContextResult {
  context: AnimationMetadataContext | null;
  failure?: 'missing-animated-model';
}

export function resolveAnimationEditContext({
  skeleton,
  clips,
  currentClipName,
  selectedBoneName,
}: {
  skeleton: THREE.Skeleton | null | undefined;
  clips: readonly THREE.AnimationClip[];
  currentClipName: string;
  selectedBoneName: string;
}): AnimationEditContextResult {
  if (!skeleton || clips.length === 0) {
    return { context: null, failure: 'missing-animated-model' };
  }

  if (!selectedBoneName || selectedBoneName === 'Scene') {
    return { context: null, failure: 'missing-bone-selection' };
  }

  const bone = findBoneByName(skeleton, selectedBoneName);
  if (!bone) {
    return { context: null, failure: 'invalid-bone-selection' };
  }

  const clipName = getCurrentClipKey(clips, currentClipName);
  return { context: { clipName, boneName: selectedBoneName, bone } };
}

export function resolveAnimationMetadataContext({
  clips,
  currentClipName,
  getFallback,
}: {
  clips: readonly THREE.AnimationClip[];
  currentClipName: string;
  getFallback: (clipName: string) => AnimationClipMetadata;
}): AnimationMetadataContextResult {
  if (clips.length === 0) {
    return { context: null, failure: 'missing-animated-model' };
  }

  const clipName = getCurrentClipKey(clips, currentClipName);
  return { context: { clipName, fallback: getFallback(clipName) } };
}
