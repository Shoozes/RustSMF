import * as THREE from 'three';

export type RigRenameFailureReason =
  | 'no-selected-bone'
  | 'empty-name'
  | 'duplicate-name'
  | 'same-name'
  | 'invalid-name';

export type RigRenameValidationResult =
  | { ok: true; name: string }
  | { ok: false; reason: RigRenameFailureReason; message: string };

const BONE_NAME_PATTERN = /^[A-Za-z0-9_.:-]+$/;

export function validateBoneRename(
  skeleton: THREE.Skeleton | null | undefined,
  oldName: string,
  requestedName: string,
): RigRenameValidationResult {
  if (!skeleton || !oldName || oldName === 'Scene') {
    return { ok: false, reason: 'no-selected-bone', message: 'Select a bone before renaming.' };
  }

  const nextName = requestedName.trim();
  if (!nextName) {
    return { ok: false, reason: 'empty-name', message: 'Bone name cannot be empty.' };
  }
  if (nextName === oldName) {
    return { ok: false, reason: 'same-name', message: 'Bone already has that name.' };
  }
  if (!BONE_NAME_PATTERN.test(nextName)) {
    return {
      ok: false,
      reason: 'invalid-name',
      message: 'Bone names may contain letters, numbers, underscore, dash, dot, and colon.',
    };
  }
  if (skeleton.bones.some((bone) => bone.name === nextName)) {
    return { ok: false, reason: 'duplicate-name', message: `A bone named ${nextName} already exists.` };
  }
  return { ok: true, name: nextName };
}

function retargetTrackName(trackName: string, oldBoneName: string, newBoneName: string): string {
  if (trackName === oldBoneName) return newBoneName;
  if (trackName.startsWith(`${oldBoneName}.`)) {
    return `${newBoneName}${trackName.slice(oldBoneName.length)}`;
  }
  if (trackName.includes(`[${oldBoneName}]`)) {
    return trackName.replace(`[${oldBoneName}]`, `[${newBoneName}]`);
  }
  if (trackName.includes(`.${oldBoneName}.`)) {
    return trackName.replace(`.${oldBoneName}.`, `.${newBoneName}.`);
  }
  return trackName;
}

function cloneTrackWithName(track: THREE.KeyframeTrack, name: string): THREE.KeyframeTrack {
  const cloned = track.clone();
  cloned.name = name;
  return cloned;
}

export function retargetAnimationClipBoneName(
  clip: THREE.AnimationClip,
  oldBoneName: string,
  newBoneName: string,
): THREE.AnimationClip {
  if (!oldBoneName || !newBoneName || oldBoneName === newBoneName) return clip;
  let changed = false;
  const tracks = clip.tracks.map((track) => {
    const nextName = retargetTrackName(track.name, oldBoneName, newBoneName);
    if (nextName === track.name) return track;
    changed = true;
    return cloneTrackWithName(track, nextName);
  });
  return changed ? new THREE.AnimationClip(clip.name, clip.duration, tracks) : clip;
}

export function retargetAnimationClipBoneNames(
  clips: THREE.AnimationClip[],
  oldBoneName: string,
  newBoneName: string,
): THREE.AnimationClip[] {
  return clips.map((clip) => retargetAnimationClipBoneName(clip, oldBoneName, newBoneName));
}
