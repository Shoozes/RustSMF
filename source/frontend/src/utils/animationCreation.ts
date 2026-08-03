import * as THREE from 'three';

export type AnimationInitialPose = 'rest' | 'current';

export interface AnimationBonePose {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export type AnimationPoseSnapshot = Record<string, AnimationBonePose>;

export interface AnimationCreationRequest {
  requestedName: string;
  duration: number;
  initialPose: AnimationInitialPose;
}

export const MIN_ANIMATION_DURATION = 0.01;
export const MAX_ANIMATION_DURATION = 3600;

export function normalizeAnimationDuration(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const clamped = Math.min(MAX_ANIMATION_DURATION, Math.max(MIN_ANIMATION_DURATION, value));
  return Math.round(clamped * 1000) / 1000;
}

function poseFromBone(bone: THREE.Bone): AnimationBonePose {
  const quaternion = bone.quaternion.clone().normalize();
  return {
    position: [bone.position.x, bone.position.y, bone.position.z],
    quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
  };
}

export function captureAnimationPose(
  skeleton: THREE.Skeleton | null | undefined,
): AnimationPoseSnapshot {
  if (!skeleton) return {};

  const snapshot: AnimationPoseSnapshot = {};
  for (const bone of skeleton.bones) {
    if (!bone.name || snapshot[bone.name]) continue;
    snapshot[bone.name] = poseFromBone(bone);
  }
  return snapshot;
}

function poseForBone(
  bone: THREE.Bone,
  snapshot: AnimationPoseSnapshot,
): AnimationBonePose {
  const saved = snapshot[bone.name];
  return saved ?? poseFromBone(bone);
}

export function createAnimationClipFromPose(
  skeleton: THREE.Skeleton | null | undefined,
  name: string,
  duration: number,
  snapshot: AnimationPoseSnapshot,
): THREE.AnimationClip | null {
  if (!skeleton || skeleton.bones.length === 0 || !name.trim()) return null;

  const normalizedDuration = normalizeAnimationDuration(duration);
  const times = [0, normalizedDuration];
  const tracks: THREE.KeyframeTrack[] = [];

  for (const bone of skeleton.bones) {
    if (!bone.name) continue;
    const pose = poseForBone(bone, snapshot);
    const positionValues = [
      pose.position[0], pose.position[1], pose.position[2],
      pose.position[0], pose.position[1], pose.position[2],
    ];
    const quaternion = new THREE.Quaternion(...pose.quaternion).normalize();
    const quaternionValues = [
      quaternion.x, quaternion.y, quaternion.z, quaternion.w,
      quaternion.x, quaternion.y, quaternion.z, quaternion.w,
    ];
    tracks.push(
      new THREE.VectorKeyframeTrack(`${bone.name}.position`, times, positionValues),
      new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, quaternionValues),
    );
  }

  return tracks.length > 0
    ? new THREE.AnimationClip(name.trim(), normalizedDuration, tracks)
    : null;
}
