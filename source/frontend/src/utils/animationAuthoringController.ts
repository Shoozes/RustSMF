import type * as THREE from 'three';
import {
  cloneAnimationEditState,
  copyAnimationKeyframe,
  deleteAnimationEditClip,
  deleteAnimationKeyframe,
  duplicateAnimationEditClip,
  getAnimationClipMetadata,
  getClipKey,
  getCurrentClipKey,
  getEditedKeyframe,
  makeKeyframeFromBone,
  makeUniqueAnimationClipName,
  moveAnimationClip,
  moveAnimationKeyframe,
  normalizeAnimationSnapStep,
  renameAnimationEditClip,
  selectAnimationKeyframe,
  setAnimationClipLoop,
  setAnimationClipSampleFrameMultiplier,
  setAnimationInterpolation,
  snapAnimationTime,
  upsertAnimationKeyframe,
  type AnimationClipMetadata,
  type AnimationEditState,
  type AnimationInterpolation,
  type AnimationSnapStep,
  type EditableBoneKeyframe,
} from './animationEdits';
import {
  resolveAnimationEditContext,
  resolveAnimationMetadataContext,
  type AnimationEditContextFailure,
} from './animationAuthoringContext';
import type { AnimationWorkspaceHistorySnapshot } from '../hooks/editorSnapshots';

export interface AnimationPlaybackController {
  currentClipName?: string;
  currentTime: number;
  duration: number;
  scrub: (time: number) => void;
  setCurrentClipName: (name: string) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
}

export interface AnimationAuthoringControllerOptions {
  baseClipsRef: { current: THREE.AnimationClip[] };
  animationEditStateRef: { current: AnimationEditState };
  playbackRef: { current: AnimationPlaybackController };
  skeleton: THREE.Skeleton | null;
  selectedBoneName: string;
  animationSnapStep: AnimationSnapStep;
  setAnimationEditState: (state: AnimationEditState) => void;
  setAnimationSnapStep: (step: AnimationSnapStep) => void;
  commitAnimationEditState: (state: AnimationEditState) => void;
  captureAnimationWorkspaceSnapshot: () => AnimationWorkspaceHistorySnapshot;
  applyAnimationWorkspaceSnapshot: (snapshot: AnimationWorkspaceHistorySnapshot) => boolean;
  pushAnimationHistory: (label: string, before: AnimationEditState, after: AnimationEditState) => boolean;
  pushAnimationWorkspaceHistory: (
    label: string,
    before: AnimationWorkspaceHistorySnapshot,
    after: AnimationWorkspaceHistorySnapshot,
  ) => boolean;
  getSourceAnimationClipMetadata: (clipName: string) => AnimationClipMetadata;
  setStatus: (message: string) => void;
}

export interface AnimationAuthoringController {
  renameCurrentAnimationClip: (requestedName: string) => void;
  duplicateCurrentAnimationClip: () => void;
  deleteCurrentAnimationClip: () => void;
  moveCurrentAnimationClipUp: () => void;
  moveCurrentAnimationClipDown: () => void;
  snapPlaybackTime: (time: number) => number;
  insertAnimationKeyframeAtTime: (time: number) => void;
  insertAnimationKeyframe: () => void;
  updateAnimationKeyframe: () => void;
  deleteSelectedAnimationKeyframe: () => void;
  copySelectedAnimationKeyframe: () => void;
  pasteAnimationKeyframe: () => void;
  selectAnimationKeyframeTime: (time: number | null) => void;
  moveSelectedAnimationKeyframe: (fromTime: number, toTime: number) => void;
  changeAnimationInterpolation: (interpolation: AnimationInterpolation) => void;
  changeAnimationSnapStep: (step: AnimationSnapStep) => void;
  changeAnimationClipLoop: (loop: boolean) => void;
  changeAnimationClipSampleFrameMultiplier: (value: number) => void;
  applyAnimationEditState: (state: AnimationEditState, status?: string) => void;
  getAnimationAuthoredKeyTimes: () => number[];
  getAnimationClipMetadata: () => AnimationClipMetadata;
}

export function createAnimationAuthoringController(
  options: AnimationAuthoringControllerOptions,
): AnimationAuthoringController {
  const {
    baseClipsRef,
    animationEditStateRef,
    playbackRef,
    skeleton,
    selectedBoneName,
    animationSnapStep,
    setAnimationEditState,
    setAnimationSnapStep,
    commitAnimationEditState,
    captureAnimationWorkspaceSnapshot,
    applyAnimationWorkspaceSnapshot,
    pushAnimationHistory,
    pushAnimationWorkspaceHistory,
    getSourceAnimationClipMetadata,
    setStatus,
  } = options;

  const getActiveAnimationEditContext = (): {
    clipName: string;
    boneName: string;
    bone: THREE.Bone;
  } | null => {
    const result = resolveAnimationEditContext({
      skeleton,
      clips: baseClipsRef.current,
      currentClipName: playbackRef.current.currentClipName ?? '',
      selectedBoneName,
    });
    if (result.context) return result.context;

    const statusByFailure: Record<AnimationEditContextFailure, string> = {
      'missing-animated-model': 'Load a skinned animated model before editing keyframes.',
      'missing-bone-selection': 'Select a bone before editing keyframes.',
      'invalid-bone-selection': 'Selected item is not an editable animation bone.',
    };
    setStatus(statusByFailure[result.failure ?? 'missing-animated-model']);
    return null;
  };

  const getActiveAnimationClipMetadataContext = (): {
    clipName: string;
    fallback: AnimationClipMetadata;
  } | null => {
    const result = resolveAnimationMetadataContext({
      clips: baseClipsRef.current,
      currentClipName: playbackRef.current.currentClipName ?? '',
      getFallback: getSourceAnimationClipMetadata,
    });
    if (result.context) return result.context;
    setStatus('Load an animated model before editing clip metadata.');
    return null;
  };

  const applyAnimationEditState = (next: AnimationEditState, status?: string): void => {
    commitAnimationEditState(next);
    if (status) setStatus(status);
  };

  const moveCurrentAnimationClip = (direction: -1 | 1): void => {
    const clips = baseClipsRef.current;
    if (clips.length < 2) {
      setStatus('Load at least two animation clips before reordering clips.');
      return;
    }

    const currentClipName = getCurrentClipKey(clips, playbackRef.current.currentClipName ?? '') ?? '';
    const clipIndex = clips.findIndex((clip, index) => getClipKey(clip, index) === currentClipName);
    if (clipIndex < 0) {
      setStatus('No animation clip is active for reorder.');
      return;
    }

    const targetIndex = clipIndex + direction;
    if (targetIndex < 0 || targetIndex >= clips.length) {
      setStatus(`Animation clip ${currentClipName} is already ${direction < 0 ? 'first' : 'last'}.`);
      return;
    }

    const before = captureAnimationWorkspaceSnapshot();
    const nextBaseClips = moveAnimationClip(clips, currentClipName, direction);
    const after: AnimationWorkspaceHistorySnapshot = {
      baseClips: nextBaseClips,
      animationEditState: cloneAnimationEditState(animationEditStateRef.current),
      currentClipName,
      currentTime: playbackRef.current.currentTime,
    };
    const label = `${direction < 0 ? 'move up' : 'move down'} animation clip ${currentClipName}`;
    pushAnimationWorkspaceHistory(label, before, after);
    applyAnimationWorkspaceSnapshot(after);
    setStatus(`Moved animation clip ${currentClipName} ${direction < 0 ? 'up' : 'down'}.`);
  };

  const snapPlaybackTime = (time: number): number => (
    snapAnimationTime(time, animationSnapStep, playbackRef.current.duration || 0)
  );

  const controller: AnimationAuthoringController = {
    renameCurrentAnimationClip(requestedName) {
      const clips = baseClipsRef.current;
      if (clips.length === 0) {
        setStatus('Load an animated model before renaming clips.');
        return;
      }
      const currentClipName = getCurrentClipKey(clips, playbackRef.current.currentClipName ?? '') ?? '';
      const clipIndex = clips.findIndex((clip, index) => getClipKey(clip, index) === currentClipName);
      if (clipIndex < 0) {
        setStatus('No animation clip is active for rename.');
        return;
      }
      const nextName = makeUniqueAnimationClipName(clips, requestedName, currentClipName);
      if (nextName === currentClipName) {
        setStatus('Animation clip name is unchanged.');
        return;
      }
      const before = captureAnimationWorkspaceSnapshot();
      const nextBaseClips = [...clips].map((clip) => clip.clone());
      nextBaseClips[clipIndex].name = nextName;
      const nextAnimationState = renameAnimationEditClip(animationEditStateRef.current, currentClipName, nextName);
      const after: AnimationWorkspaceHistorySnapshot = {
        baseClips: nextBaseClips,
        animationEditState: nextAnimationState,
        currentClipName: nextName,
        currentTime: playbackRef.current.currentTime,
      };
      pushAnimationWorkspaceHistory(`rename animation clip ${currentClipName} to ${nextName}`, before, after);
      applyAnimationWorkspaceSnapshot(after);
      setStatus(`Renamed animation clip ${currentClipName} to ${nextName}.`);
    },

    duplicateCurrentAnimationClip() {
      const clips = baseClipsRef.current;
      if (clips.length === 0) {
        setStatus('Load an animated model before duplicating clips.');
        return;
      }
      const currentClipName = getCurrentClipKey(clips, playbackRef.current.currentClipName ?? '') ?? '';
      const clipIndex = clips.findIndex((clip, index) => getClipKey(clip, index) === currentClipName);
      const sourceClip = clips[clipIndex];
      if (!sourceClip) {
        setStatus('No animation clip is active for duplicate.');
        return;
      }
      const nextName = makeUniqueAnimationClipName(clips, `${currentClipName} Copy`);
      const before = captureAnimationWorkspaceSnapshot();
      const duplicatedClip = sourceClip.clone();
      duplicatedClip.name = nextName;
      const nextBaseClips = clips.map((clip) => clip.clone());
      nextBaseClips.splice(clipIndex + 1, 0, duplicatedClip);
      const nextAnimationState = duplicateAnimationEditClip(animationEditStateRef.current, currentClipName, nextName);
      const after: AnimationWorkspaceHistorySnapshot = {
        baseClips: nextBaseClips,
        animationEditState: nextAnimationState,
        currentClipName: nextName,
        currentTime: playbackRef.current.currentTime,
      };
      pushAnimationWorkspaceHistory(`duplicate animation clip ${currentClipName}`, before, after);
      applyAnimationWorkspaceSnapshot(after);
      setStatus(`Duplicated animation clip ${currentClipName} as ${nextName}.`);
    },

    deleteCurrentAnimationClip() {
      const clips = baseClipsRef.current;
      if (clips.length === 0) {
        setStatus('Load an animated model before deleting clips.');
        return;
      }
      if (clips.length === 1) {
        setStatus('Cannot delete the last animation clip.');
        return;
      }
      const currentClipName = getCurrentClipKey(clips, playbackRef.current.currentClipName ?? '') ?? '';
      const clipIndex = clips.findIndex((clip, index) => getClipKey(clip, index) === currentClipName);
      if (clipIndex < 0) {
        setStatus('No animation clip is active for delete.');
        return;
      }
      const before = captureAnimationWorkspaceSnapshot();
      const nextBaseClips = clips.map((clip) => clip.clone());
      nextBaseClips.splice(clipIndex, 1);
      const fallbackIndex = Math.min(clipIndex, nextBaseClips.length - 1);
      const fallbackClipName = getClipKey(nextBaseClips[fallbackIndex], fallbackIndex);
      const nextAnimationState = deleteAnimationEditClip(animationEditStateRef.current, currentClipName);
      const after: AnimationWorkspaceHistorySnapshot = {
        baseClips: nextBaseClips,
        animationEditState: nextAnimationState,
        currentClipName: fallbackClipName,
        currentTime: playbackRef.current.currentTime,
      };
      pushAnimationWorkspaceHistory(`delete animation clip ${currentClipName}`, before, after);
      applyAnimationWorkspaceSnapshot(after);
      setStatus(`Deleted animation clip ${currentClipName}.`);
    },

    moveCurrentAnimationClipUp() { moveCurrentAnimationClip(-1); },
    moveCurrentAnimationClipDown() { moveCurrentAnimationClip(1); },
    snapPlaybackTime,

    insertAnimationKeyframeAtTime(time) {
      const context = getActiveAnimationEditContext();
      if (!context) return;
      const state = animationEditStateRef.current;
      const before = cloneAnimationEditState(state);
      const keyTime = snapPlaybackTime(time);
      const key = makeKeyframeFromBone(context.bone, keyTime, state.interpolation);
      const next = upsertAnimationKeyframe(state, context.clipName, context.boneName, key);
      pushAnimationHistory(`insert animation keyframe for ${context.boneName} at ${key.time.toFixed(2)}s`, before, next);
      playbackRef.current.scrub(keyTime);
      applyAnimationEditState(next, `Inserted animation keyframe for ${context.boneName} at ${key.time.toFixed(2)}s.`);
    },

    insertAnimationKeyframe() {
      controller.insertAnimationKeyframeAtTime(playbackRef.current.currentTime);
    },

    updateAnimationKeyframe() {
      const context = getActiveAnimationEditContext();
      if (!context) return;
      const state = animationEditStateRef.current;
      const before = cloneAnimationEditState(state);
      const time = state.selectedKeyTime ?? snapPlaybackTime(playbackRef.current.currentTime);
      const key = makeKeyframeFromBone(context.bone, time, state.interpolation);
      const next = upsertAnimationKeyframe(state, context.clipName, context.boneName, key);
      pushAnimationHistory(`update animation keyframe for ${context.boneName} at ${key.time.toFixed(2)}s`, before, next);
      applyAnimationEditState(next, `Updated animation keyframe for ${context.boneName} at ${key.time.toFixed(2)}s.`);
    },

    deleteSelectedAnimationKeyframe() {
      const context = getActiveAnimationEditContext();
      if (!context) return;
      const state = animationEditStateRef.current;
      const before = cloneAnimationEditState(state);
      const time = state.selectedKeyTime ?? snapPlaybackTime(playbackRef.current.currentTime);
      const next = deleteAnimationKeyframe(state, context.clipName, context.boneName, time);
      pushAnimationHistory(`delete animation keyframe for ${context.boneName} near ${time.toFixed(2)}s`, before, next);
      applyAnimationEditState(next, `Deleted animation keyframe for ${context.boneName} near ${time.toFixed(2)}s.`);
    },

    copySelectedAnimationKeyframe() {
      const context = getActiveAnimationEditContext();
      if (!context) return;
      const state = animationEditStateRef.current;
      const time = state.selectedKeyTime ?? snapPlaybackTime(playbackRef.current.currentTime);
      const edited = getEditedKeyframe(state, context.clipName, context.boneName, time);
      const key: EditableBoneKeyframe = edited ?? makeKeyframeFromBone(context.bone, time, state.interpolation);
      const next = copyAnimationKeyframe(state, key);
      animationEditStateRef.current = next;
      setAnimationEditState(next);
      setStatus(`Copied animation keyframe for ${context.boneName} at ${key.time.toFixed(2)}s.`);
    },

    pasteAnimationKeyframe() {
      const context = getActiveAnimationEditContext();
      if (!context) return;
      const state = animationEditStateRef.current;
      if (!state.clipboard) {
        setStatus('No copied animation keyframe to paste.');
        return;
      }
      const before = cloneAnimationEditState(state);
      const time = snapPlaybackTime(playbackRef.current.currentTime);
      const key: EditableBoneKeyframe = { ...state.clipboard, time };
      const next = upsertAnimationKeyframe(state, context.clipName, context.boneName, key);
      pushAnimationHistory(`paste animation keyframe for ${context.boneName} at ${key.time.toFixed(2)}s`, before, next);
      applyAnimationEditState(next, `Pasted animation keyframe for ${context.boneName} at ${key.time.toFixed(2)}s.`);
    },

    selectAnimationKeyframeTime(time) {
      const next = selectAnimationKeyframe(animationEditStateRef.current, time);
      animationEditStateRef.current = next;
      setAnimationEditState(next);
    },

    moveSelectedAnimationKeyframe(fromTime, toTime) {
      const context = getActiveAnimationEditContext();
      if (!context) return;
      const state = animationEditStateRef.current;
      const source = getEditedKeyframe(state, context.clipName, context.boneName, fromTime);
      if (!source) {
        setStatus('Only authored animation keyframes can be dragged. Insert or update a keyframe first.');
        return;
      }
      const before = cloneAnimationEditState(state);
      const nextTime = snapPlaybackTime(toTime);
      const next = moveAnimationKeyframe(state, context.clipName, context.boneName, fromTime, nextTime);
      const moved = pushAnimationHistory(`move animation keyframe for ${context.boneName} to ${nextTime.toFixed(2)}s`, before, next);
      if (!moved) {
        playbackRef.current.scrub(nextTime);
        return;
      }
      playbackRef.current.scrub(nextTime);
      applyAnimationEditState(next, `Moved animation keyframe for ${context.boneName} to ${nextTime.toFixed(2)}s.`);
    },

    changeAnimationInterpolation(interpolation) {
      const context = getActiveAnimationEditContext();
      const before = cloneAnimationEditState(animationEditStateRef.current);
      const next = context
        ? setAnimationInterpolation(animationEditStateRef.current, interpolation, context.clipName, context.boneName)
        : setAnimationInterpolation(animationEditStateRef.current, interpolation);
      pushAnimationHistory(`set animation interpolation to ${interpolation}`, before, next);
      applyAnimationEditState(next, `Animation interpolation set to ${interpolation}.`);
    },

    changeAnimationSnapStep(step) {
      const next = normalizeAnimationSnapStep(step);
      setAnimationSnapStep(next);
      setStatus(next > 0 ? `Animation snap set to ${next.toFixed(2)}s.` : 'Animation snap disabled.');
    },

    changeAnimationClipLoop(loop) {
      const context = getActiveAnimationClipMetadataContext();
      if (!context) return;
      const before = cloneAnimationEditState(animationEditStateRef.current);
      const next = setAnimationClipLoop(animationEditStateRef.current, context.clipName, loop, context.fallback);
      pushAnimationHistory(`set animation clip ${context.clipName} loop ${loop ? 'on' : 'off'}`, before, next);
      applyAnimationEditState(next, `Animation clip ${context.clipName} loop ${loop ? 'enabled' : 'disabled'}.`);
    },

    changeAnimationClipSampleFrameMultiplier(value) {
      const context = getActiveAnimationClipMetadataContext();
      if (!context) return;
      const before = cloneAnimationEditState(animationEditStateRef.current);
      const next = setAnimationClipSampleFrameMultiplier(animationEditStateRef.current, context.clipName, value, context.fallback);
      const metadata = getAnimationClipMetadata(next, context.clipName, context.fallback);
      pushAnimationHistory(`set animation clip ${context.clipName} sample frame multiplier to ${metadata.sampleFrameMultiplier}`, before, next);
      applyAnimationEditState(next, `Animation clip ${context.clipName} sample frame multiplier set to ${metadata.sampleFrameMultiplier}.`);
    },

    applyAnimationEditState,

    getAnimationAuthoredKeyTimes() {
      if (!selectedBoneName || selectedBoneName === 'Scene') return [];
      const clipName = getCurrentClipKey(baseClipsRef.current, playbackRef.current.currentClipName ?? '');
      if (!clipName) return [];
      return (animationEditStateRef.current.editsByClip[clipName]?.[selectedBoneName] ?? []).map((key) => key.time);
    },

    getAnimationClipMetadata() {
      const clipName = getCurrentClipKey(baseClipsRef.current, playbackRef.current.currentClipName ?? '');
      if (!clipName) return getAnimationClipMetadata(animationEditStateRef.current, '', null);
      return getAnimationClipMetadata(
        animationEditStateRef.current,
        clipName,
        getSourceAnimationClipMetadata(clipName),
      );
    },
  };

  return controller;
}
