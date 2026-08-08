import type * as THREE from 'three';
import {
  cloneAnimationEditState,
  copyAnimationKeyframes,
  deleteAnimationEditClip,
  deleteAnimationKeyframes,
  duplicateAnimationEditClip,
  getAnimationClipMetadata,
  getAnimationClipTimelineDuration,
  getAnimationClipLockedBoneNames,
  getClipKey,
  getCurrentClipKey,
  makeAnimationClipMetadata,
  getEditedKeyframe,
  makeKeyframeFromBone,
  markAnimationClipDirty,
  makeUniqueAnimationClipName,
  moveAnimationClip,
  moveAnimationKeyframes,
  retimeAnimationClip,
  retimeAnimationEditState,
  setAnimationClipLockedBones,
  setAnimationClipDuration,
  normalizeAnimationSnapStep,
  renameAnimationEditClip,
  selectAnimationKeyframe,
  setAnimationClipLoop,
  setAnimationClipSampleFrameMultiplier,
  setAnimationInterpolation,
  snapAnimationTime,
  trimAnimationClip,
  trimAnimationEditState,
  upsertAnimationKeyframes,
  type AnimationEditState,
  type AnimationClipMetadata,
  type AnimationInterpolation,
  type AnimationSnapStep,
  type EditableBoneKeyframe,
} from './animationEdits';
import {
  captureAnimationPose,
  createAnimationClipFromPose,
  normalizeAnimationDuration,
  MAX_ANIMATION_DURATION,
  MIN_ANIMATION_DURATION,
  validateAnimationSkeleton,
  type AnimationCreationRequest,
  type AnimationPoseSnapshot,
} from './animationCreation';
import {
  resolveAnimationEditContext,
  resolveAnimationMetadataContext,
  type AnimationEditContextFailure,
} from './animationAuthoringContext';
import type { AnimationWorkspaceHistorySnapshot } from '../hooks/editorSnapshots';
import {
  ANIMATION_EDIT_SCOPE_LABELS,
  ANIMATION_EDIT_SCOPES,
  getAnimationSkeletonFingerprint,
  resolveAnimationScope,
  type AnimationEditScope,
} from './animationScope';

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
  animationRestPoseRef: { current: AnimationPoseSnapshot | null };
  selectedBoneName: string;
  animationScope?: AnimationEditScope;
  setAnimationScope?: (scope: AnimationEditScope) => void;
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
  getSourceAnimationLockedBoneNames?: (clipName: string) => readonly string[];
  setStatus: (message: string) => void;
}

export interface AnimationAuthoringController {
  createAnimationFromPose: (request: AnimationCreationRequest) => void;
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
  changeAnimationScope: (scope: AnimationEditScope) => void;
  changeAnimationClipLoop: (loop: boolean) => void;
  changeAnimationClipSampleFrameMultiplier: (value: number) => void;
  changeAnimationClipDuration: (value: number) => void;
  changeAnimationClipRetime: (value: number) => void;
  changeAnimationClipTrim: (startTime: number, endTime: number) => void;
  toggleAnimationBoneLock: () => void;
  applyAnimationEditState: (state: AnimationEditState, status?: string) => void;
  getAnimationAuthoredKeyTimes: () => number[];
  getAnimationClipMetadata: () => AnimationClipMetadata;
  getAnimationLockedBoneNames: () => string[];
  getAnimationScope: () => AnimationEditScope;
}

export function createAnimationAuthoringController(
  options: AnimationAuthoringControllerOptions,
): AnimationAuthoringController {
  const {
    baseClipsRef,
    animationEditStateRef,
    playbackRef,
    skeleton,
    animationRestPoseRef,
    selectedBoneName,
    animationScope = 'bone',
    setAnimationScope,
    animationSnapStep,
    setAnimationEditState,
    setAnimationSnapStep,
    commitAnimationEditState,
    captureAnimationWorkspaceSnapshot,
    applyAnimationWorkspaceSnapshot,
    pushAnimationHistory,
    pushAnimationWorkspaceHistory,
    getSourceAnimationClipMetadata,
    getSourceAnimationLockedBoneNames = () => [],
    setStatus,
  } = options;

  const scopeLabel = (): string => ANIMATION_EDIT_SCOPE_LABELS[animationScope];

  const scopeKeyframeLabel = (): string => (
    animationScope === 'bone'
      ? 'animation keyframe'
      : `${scopeLabel().toLowerCase()} animation keyframes`
  );

  const getActiveAnimationScopeContext = (): {
    clipName: string;
    boneName: string;
    bone: THREE.Bone;
    bones: THREE.Bone[];
    names: string[];
    editableBones: THREE.Bone[];
    editableNames: string[];
    lockedNames: string[];
    fingerprint: string;
  } | null => {
    const context = getActiveAnimationEditContext();
    if (!context) return null;
    const resolved = resolveAnimationScope(skeleton, context.boneName, animationScope);
    if (resolved.ok) {
      const lockedNames = getAnimationClipLockedBoneNames(
        animationEditStateRef.current,
        context.clipName,
        getSourceAnimationLockedBoneNames(context.clipName),
      );
      const locked = new Set(lockedNames);
      const editableBones = resolved.bones.filter((bone) => !locked.has(bone.name));
      if (editableBones.length === 0) {
        setStatus(`All bones in the active ${scopeLabel().toLowerCase()} scope are locked.`);
        return null;
      }
      return {
        ...context,
        bones: resolved.bones,
        names: resolved.names,
        editableBones,
        editableNames: editableBones.map((bone) => bone.name),
        lockedNames,
        fingerprint: getAnimationSkeletonFingerprint(skeleton),
      };
    }
    const message = resolved.reason === 'ambiguous-selection'
      ? `Animation scope is unavailable because bone name ${resolved.boneName || context.boneName} is ambiguous.`
      : resolved.reason === 'ambiguous-bone-name'
        ? `Animation scope is unavailable because bone name ${resolved.boneName || '(unnamed)'} is ambiguous.`
        : 'Animation scope requires a selected bone and a loaded skeleton.';
    setStatus(message);
    return null;
  };

  const scopeTargetDescription = (context: { boneName: string; names: string[] }): string => (
    animationScope === 'bone'
      ? context.boneName
      : `${scopeLabel()} (${context.names.join(', ')})`
  );

  const getActiveAnimationLockedBoneNames = (clipName?: string): string[] => {
    const activeClipName = clipName ?? getCurrentClipKey(
      baseClipsRef.current,
      playbackRef.current.currentClipName ?? '',
    );
    if (!activeClipName) return [];
    return getAnimationClipLockedBoneNames(
      animationEditStateRef.current,
      activeClipName,
      getSourceAnimationLockedBoneNames(activeClipName),
    );
  };

  const getLockedOperationReason = (
    clip: THREE.AnimationClip,
    operation: 'retime' | 'trim',
    startTime?: number,
    endTime?: number,
  ): string | null => {
    const locked = new Set(getActiveAnimationLockedBoneNames(clip.name || undefined));
    if (locked.size === 0) return null;
    const affected = clip.tracks.find((track) => {
      const match = track.name.match(/^(.*)\.(?:position|quaternion)$/);
      if (!match || !locked.has(match[1])) return false;
      if (operation === 'retime') return track.times.length > 0;
      return Array.from(track.times).some((time) => time < (startTime ?? 0) - 0.0001 || time > (endTime ?? clip.duration) + 0.0001);
    });
    if (!affected) return null;
    const boneName = affected.name.replace(/\.(?:position|quaternion)$/, '');
    return `${operation === 'retime' ? 'Retiming' : 'Trimming'} would rewrite locked bone ${boneName}; unlock it first.`;
  };

  const makeScopedKeyframes = (
    context: { editableBones: THREE.Bone[] },
    time: number,
    interpolation: AnimationInterpolation,
  ): Record<string, EditableBoneKeyframe> => Object.fromEntries(
    context.editableBones.map((bone) => [bone.name, makeKeyframeFromBone(bone, time, interpolation)]),
  );

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
    if (!applyWorkspaceSnapshot(after)) return;
    pushAnimationWorkspaceHistory(label, before, after);
    setStatus(`Moved animation clip ${currentClipName} ${direction < 0 ? 'up' : 'down'}.`);
  };

  const snapPlaybackTime = (time: number): number => (
    snapAnimationTime(time, animationSnapStep, playbackRef.current.duration || 0)
  );

  const applyWorkspaceSnapshot = (snapshot: AnimationWorkspaceHistorySnapshot): boolean => {
    if (applyAnimationWorkspaceSnapshot(snapshot)) return true;
    setStatus('Animation workspace update was skipped because no usable clip remained.');
    return false;
  };

  const controller: AnimationAuthoringController = {
    createAnimationFromPose(request) {
      const skeletonValidation = validateAnimationSkeleton(skeleton);
      if (!skeletonValidation.ok) {
        const message = skeletonValidation.reason === 'duplicate-bone-name'
          ? `Animation creation is unavailable because bone name ${skeletonValidation.boneName || '(unnamed)'} is ambiguous.`
          : skeletonValidation.reason === 'unnamed-bone'
            ? 'Animation creation is unavailable because every bone must have a name.'
            : 'Load a skinned model with bones before creating an animation.';
        setStatus(message);
        return;
      }

      const snapshot = request.initialPose === 'rest'
        ? animationRestPoseRef.current
        : captureAnimationPose(skeleton);
      if (!snapshot || Object.keys(snapshot).length === 0) {
        setStatus(request.initialPose === 'rest'
          ? 'The model rest pose is unavailable; reload the model or choose Current pose.'
          : 'The current skeleton pose is unavailable.');
        return;
      }

      const clips = baseClipsRef.current;
      const name = makeUniqueAnimationClipName(clips, request.requestedName);
      const createdClip = createAnimationClipFromPose(
        skeleton,
        name,
        request.duration,
        snapshot,
      );
      if (!createdClip) {
        setStatus('The new animation could not be created because the skeleton is not animation-safe.');
        return;
      }

      const before = captureAnimationWorkspaceSnapshot();
      const nextAnimationState = markAnimationClipDirty(animationEditStateRef.current, name);
      nextAnimationState.metadataByClip[name] = makeAnimationClipMetadata();
      const after: AnimationWorkspaceHistorySnapshot = {
        baseClips: [...clips.map((clip) => clip.clone()), createdClip],
        animationEditState: nextAnimationState,
        currentClipName: name,
        currentTime: 0,
      };
      if (!applyWorkspaceSnapshot(after)) return;
      pushAnimationWorkspaceHistory(`create animation clip ${name}`, before, after);
      setStatus(`Created animation clip ${name} from the ${request.initialPose} pose.`);
    },

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
      if (!applyWorkspaceSnapshot(after)) return;
      pushAnimationWorkspaceHistory(`rename animation clip ${currentClipName} to ${nextName}`, before, after);
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
      if (!applyWorkspaceSnapshot(after)) return;
      pushAnimationWorkspaceHistory(`duplicate animation clip ${currentClipName}`, before, after);
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
      if (!applyWorkspaceSnapshot(after)) return;
      pushAnimationWorkspaceHistory(`delete animation clip ${currentClipName}`, before, after);
      setStatus(`Deleted animation clip ${currentClipName}.`);
    },

    moveCurrentAnimationClipUp() { moveCurrentAnimationClip(-1); },
    moveCurrentAnimationClipDown() { moveCurrentAnimationClip(1); },
    snapPlaybackTime,

    insertAnimationKeyframeAtTime(time) {
      const context = getActiveAnimationScopeContext();
      if (!context) return;
      const state = animationEditStateRef.current;
      const before = cloneAnimationEditState(state);
      const keyTime = snapPlaybackTime(time);
      const keyframes = makeScopedKeyframes(context, keyTime, state.interpolation);
      const next = upsertAnimationKeyframes(state, context.clipName, keyframes);
      const target = scopeTargetDescription(context);
      pushAnimationHistory(`insert ${scopeKeyframeLabel()} for ${target} at ${keyTime.toFixed(2)}s`, before, next);
      playbackRef.current.scrub(keyTime);
      applyAnimationEditState(next, `Inserted ${scopeKeyframeLabel()} for ${target} at ${keyTime.toFixed(2)}s.`);
    },

    insertAnimationKeyframe() {
      controller.insertAnimationKeyframeAtTime(playbackRef.current.currentTime);
    },

    updateAnimationKeyframe() {
      const context = getActiveAnimationScopeContext();
      if (!context) return;
      const state = animationEditStateRef.current;
      const before = cloneAnimationEditState(state);
      const time = state.selectedKeyTime ?? snapPlaybackTime(playbackRef.current.currentTime);
      const keyframes = makeScopedKeyframes(context, time, state.interpolation);
      const next = upsertAnimationKeyframes(state, context.clipName, keyframes);
      const target = scopeTargetDescription(context);
      pushAnimationHistory(`update ${scopeKeyframeLabel()} for ${target} at ${time.toFixed(2)}s`, before, next);
      applyAnimationEditState(next, `Updated ${scopeKeyframeLabel()} for ${target} at ${time.toFixed(2)}s.`);
    },

    deleteSelectedAnimationKeyframe() {
      const context = getActiveAnimationScopeContext();
      if (!context) return;
      const state = animationEditStateRef.current;
      const before = cloneAnimationEditState(state);
      const time = state.selectedKeyTime ?? snapPlaybackTime(playbackRef.current.currentTime);
      const next = deleteAnimationKeyframes(state, context.clipName, context.editableNames, time);
      const target = scopeTargetDescription(context);
      pushAnimationHistory(`delete ${scopeKeyframeLabel()} for ${target} near ${time.toFixed(2)}s`, before, next);
      applyAnimationEditState(next, `Deleted ${scopeKeyframeLabel()} for ${target} near ${time.toFixed(2)}s.`);
    },

    copySelectedAnimationKeyframe() {
      const context = getActiveAnimationScopeContext();
      if (!context) return;
      const state = animationEditStateRef.current;
      const time = state.selectedKeyTime ?? snapPlaybackTime(playbackRef.current.currentTime);
      const keyframes = Object.fromEntries(
        context.editableBones.map((bone) => [
          bone.name,
          getEditedKeyframe(state, context.clipName, bone.name, time)
            ?? makeKeyframeFromBone(bone, time, state.interpolation),
        ]),
      );
      const next = copyAnimationKeyframes(
        state,
        context.clipName,
        context.fingerprint,
        animationScope,
        keyframes,
      );
      animationEditStateRef.current = next;
      setAnimationEditState(next);
      setStatus(`Copied ${scopeKeyframeLabel()} for ${scopeTargetDescription(context)} at ${time.toFixed(2)}s.`);
    },

    pasteAnimationKeyframe() {
      const context = getActiveAnimationScopeContext();
      if (!context) return;
      const state = animationEditStateRef.current;
      if (!state.clipboard) {
        setStatus('No copied animation keyframe to paste.');
        return;
      }
      if (state.clipboard.sourceSkeletonFingerprint !== context.fingerprint) {
        setStatus('Copied animation keyframes belong to a different skeleton; paste was rejected.');
        return;
      }
      if (state.clipboard.sourceScope !== animationScope) {
        setStatus(`Copied ${ANIMATION_EDIT_SCOPE_LABELS[state.clipboard.sourceScope] ?? 'animation'} keyframes do not match the active ${scopeLabel().toLowerCase()} scope; paste was rejected.`);
        return;
      }
      const targetNames = new Set(context.names);
      const missingTarget = Object.keys(state.clipboard.entries).find((name) => !targetNames.has(name));
      if (missingTarget) {
        setStatus(`Copied ${scopeLabel().toLowerCase()} keyframes do not match the active ${scopeLabel().toLowerCase()} scope; paste was rejected.`);
        return;
      }
      const lockedTarget = Object.keys(state.clipboard.entries).find((name) => context.lockedNames.includes(name));
      if (lockedTarget) {
        setStatus(`Animation keyframe paste would modify locked bone ${lockedTarget}; unlock it first.`);
        return;
      }
      const before = cloneAnimationEditState(state);
      const time = snapPlaybackTime(playbackRef.current.currentTime);
      const keyframes = Object.fromEntries(
        Object.entries(state.clipboard.entries).map(([boneName, key]) => [boneName, { ...key, time }]),
      );
      const next = upsertAnimationKeyframes(state, context.clipName, keyframes);
      const target = scopeTargetDescription(context);
      pushAnimationHistory(`paste ${scopeKeyframeLabel()} for ${target} at ${time.toFixed(2)}s`, before, next);
      applyAnimationEditState(next, `Pasted ${scopeKeyframeLabel()} for ${target} at ${time.toFixed(2)}s.`);
    },

    selectAnimationKeyframeTime(time) {
      const next = selectAnimationKeyframe(animationEditStateRef.current, time);
      animationEditStateRef.current = next;
      setAnimationEditState(next);
    },

    moveSelectedAnimationKeyframe(fromTime, toTime) {
      const context = getActiveAnimationScopeContext();
      if (!context) return;
      const state = animationEditStateRef.current;
      const source = getEditedKeyframe(state, context.clipName, context.boneName, fromTime);
      if (!source) {
        setStatus('Only authored animation keyframes can be dragged. Insert or update a keyframe first.');
        return;
      }
      const before = cloneAnimationEditState(state);
      const nextTime = snapPlaybackTime(toTime);
      const next = moveAnimationKeyframes(state, context.clipName, context.editableNames, fromTime, nextTime);
      const target = scopeTargetDescription(context);
      const moved = pushAnimationHistory(`move ${scopeKeyframeLabel()} for ${target} to ${nextTime.toFixed(2)}s`, before, next);
      if (!moved) {
        playbackRef.current.scrub(nextTime);
        return;
      }
      playbackRef.current.scrub(nextTime);
      applyAnimationEditState(next, `Moved ${scopeKeyframeLabel()} for ${target} to ${nextTime.toFixed(2)}s.`);
    },

    changeAnimationInterpolation(interpolation) {
      const context = getActiveAnimationEditContext();
      if (context && getActiveAnimationLockedBoneNames(context.clipName).includes(context.boneName)) {
        setStatus(`Animation interpolation cannot modify locked bone ${context.boneName}; unlock it first.`);
        return;
      }
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

    changeAnimationScope(next) {
      if (!ANIMATION_EDIT_SCOPES.includes(next)) return;
      setAnimationScope?.(next);
      setStatus(`Animation edit scope set to ${ANIMATION_EDIT_SCOPE_LABELS[next]}.`);
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

    changeAnimationClipDuration(value) {
      const context = getActiveAnimationClipMetadataContext();
      if (!context) return;
      const clip = baseClipsRef.current.find((candidate, index) => getClipKey(candidate, index) === context.clipName);
      if (!clip) {
        setStatus('No animation clip is active for duration editing.');
        return;
      }

      const duration = normalizeAnimationDuration(value);
      const authoredLatest = Math.max(
        0,
        ...Object.values(animationEditStateRef.current.editsByClip[context.clipName] ?? {})
          .flatMap((keys) => keys.map((key) => key.time)),
      );
      const trackLatest = Math.max(
        0,
        ...clip.tracks.flatMap((track) => Array.from(track.times).filter(Number.isFinite)),
      );
      const latestKeyTime = Math.max(authoredLatest, trackLatest);
      if (duration + 0.0001 < latestKeyTime) {
        setStatus(`Animation duration cannot be shorter than the latest key at ${latestKeyTime.toFixed(2)}s; use Trim when it is available.`);
        return;
      }

      const currentDuration = animationEditStateRef.current.durationByClip[context.clipName] ?? clip.duration;
      if (Math.abs(currentDuration - duration) <= 0.0001) {
        setStatus(`Animation clip ${context.clipName} duration is already ${duration.toFixed(2)}s.`);
        return;
      }

      const before = captureAnimationWorkspaceSnapshot();
      const nextAnimationState = setAnimationClipDuration(
        animationEditStateRef.current,
        context.clipName,
        Math.min(MAX_ANIMATION_DURATION, Math.max(MIN_ANIMATION_DURATION, duration)),
      );
      const nextTime = Math.min(playbackRef.current.currentTime, duration);
      const after: AnimationWorkspaceHistorySnapshot = {
        baseClips: baseClipsRef.current.map((candidate) => candidate.clone()),
        animationEditState: nextAnimationState,
        currentClipName: context.clipName,
        currentTime: nextTime,
      };
      if (!applyWorkspaceSnapshot(after)) return;
      pushAnimationWorkspaceHistory(`set animation clip ${context.clipName} duration to ${duration.toFixed(2)}s`, before, after);
      setStatus(`Set animation clip ${context.clipName} duration to ${duration.toFixed(2)}s.`);
    },

    changeAnimationClipRetime(value) {
      const context = getActiveAnimationClipMetadataContext();
      if (!context) return;
      const clips = baseClipsRef.current;
      const clipIndex = clips.findIndex((candidate, index) => getClipKey(candidate, index) === context.clipName);
      const clip = clips[clipIndex];
      if (!clip || clipIndex < 0) {
        setStatus('No animation clip is active for retiming.');
        return;
      }

      const lockReason = getLockedOperationReason(clip, 'retime');
      if (lockReason) {
        setStatus(lockReason);
        return;
      }

      const targetDuration = normalizeAnimationDuration(value);
      const currentDuration = animationEditStateRef.current.durationByClip[context.clipName]
        ?? getAnimationClipTimelineDuration(clip);
      if (Math.abs(currentDuration - targetDuration) <= 0.0001) {
        setStatus(`Animation clip ${context.clipName} is already ${targetDuration.toFixed(2)}s; no retime was applied.`);
        return;
      }

      const before = captureAnimationWorkspaceSnapshot();
      const nextBaseClips = clips.map((candidate, index) => (
        index === clipIndex ? retimeAnimationClip(candidate, currentDuration, targetDuration) : candidate.clone()
      ));
      const nextAnimationState = retimeAnimationEditState(
        animationEditStateRef.current,
        context.clipName,
        currentDuration,
        targetDuration,
      );
      const scale = currentDuration > 0 ? targetDuration / currentDuration : 1;
      const nextTime = Math.min(targetDuration, Math.max(0, playbackRef.current.currentTime * scale));
      const after: AnimationWorkspaceHistorySnapshot = {
        baseClips: nextBaseClips,
        animationEditState: nextAnimationState,
        currentClipName: context.clipName,
        currentTime: nextTime,
      };
      if (!applyWorkspaceSnapshot(after)) return;
      pushAnimationWorkspaceHistory(
        `retime animation clip ${context.clipName} from ${currentDuration.toFixed(2)}s to ${targetDuration.toFixed(2)}s`,
        before,
        after,
      );
      setStatus(`Retimed animation clip ${context.clipName} from ${currentDuration.toFixed(2)}s to ${targetDuration.toFixed(2)}s.`);
    },

    changeAnimationClipTrim(startTime, endTime) {
      const context = getActiveAnimationClipMetadataContext();
      if (!context) return;
      const clips = baseClipsRef.current;
      const clipIndex = clips.findIndex((candidate, index) => getClipKey(candidate, index) === context.clipName);
      const clip = clips[clipIndex];
      if (!clip || clipIndex < 0) {
        setStatus('No animation clip is active for trimming.');
        return;
      }

      const lockedNames = getActiveAnimationLockedBoneNames(context.clipName);
      const result = trimAnimationClip(clip, startTime, endTime, lockedNames);
      if (!result.ok) {
        if (result.reason === 'locked-bone-range') {
          setStatus(`Trimming would rewrite locked bone ${result.boneName ?? 'channel'}; unlock it first.`);
        } else {
          setStatus('Animation trim requires finite bounds at least 0.01s apart within the clip.');
        }
        return;
      }

      const locked = new Set(lockedNames);
      const authoredOutside = Object.entries(animationEditStateRef.current.editsByClip[context.clipName] ?? {})
        .find(([boneName, keys]) => locked.has(boneName)
          && keys.some((key) => key.time < result.startTime - 0.0001 || key.time > result.endTime + 0.0001));
      if (authoredOutside) {
        setStatus(`Trimming would rewrite locked bone ${authoredOutside[0]}; unlock it first.`);
        return;
      }

      const before = captureAnimationWorkspaceSnapshot();
      const nextBaseClips = clips.map((candidate, index) => (
        index === clipIndex ? result.clip : candidate.clone()
      ));
      const nextAnimationState = trimAnimationEditState(
        animationEditStateRef.current,
        context.clipName,
        result.startTime,
        result.endTime,
      );
      const nextTime = Math.max(0, Math.min(result.endTime - result.startTime,
        playbackRef.current.currentTime - result.startTime));
      const after: AnimationWorkspaceHistorySnapshot = {
        baseClips: nextBaseClips,
        animationEditState: nextAnimationState,
        currentClipName: context.clipName,
        currentTime: nextTime,
      };
      if (!applyWorkspaceSnapshot(after)) return;
      pushAnimationWorkspaceHistory(
        `trim animation clip ${context.clipName} to ${result.startTime.toFixed(2)}s–${result.endTime.toFixed(2)}s`,
        before,
        after,
      );
      setStatus(`Trimmed animation clip ${context.clipName} to ${(result.endTime - result.startTime).toFixed(2)}s.`);
    },

    toggleAnimationBoneLock() {
      const context = getActiveAnimationEditContext();
      if (!context) return;
      const sourceNames = getSourceAnimationLockedBoneNames(context.clipName);
      const lockedNames = getAnimationClipLockedBoneNames(
        animationEditStateRef.current,
        context.clipName,
        sourceNames,
      );
      const nextNames = lockedNames.includes(context.boneName)
        ? lockedNames.filter((name) => name !== context.boneName)
        : [...lockedNames, context.boneName];
      const before = cloneAnimationEditState(animationEditStateRef.current);
      const next = setAnimationClipLockedBones(animationEditStateRef.current, context.clipName, nextNames);
      pushAnimationHistory(
        `${nextNames.includes(context.boneName) ? 'lock' : 'unlock'} animation bone ${context.boneName}`,
        before,
        next,
      );
      applyAnimationEditState(next, `${nextNames.includes(context.boneName) ? 'Locked' : 'Unlocked'} animation bone ${context.boneName}.`);
    },

    applyAnimationEditState,

    getAnimationAuthoredKeyTimes() {
      if (!selectedBoneName || selectedBoneName === 'Scene') return [];
      const clipName = getCurrentClipKey(baseClipsRef.current, playbackRef.current.currentClipName ?? '');
      if (!clipName) return [];
      const resolved = resolveAnimationScope(skeleton, selectedBoneName, animationScope);
      const names = resolved.ok ? resolved.names : [selectedBoneName];
      return [...new Set(names.flatMap((name) => (
        animationEditStateRef.current.editsByClip[clipName]?.[name] ?? []
      ).map((key) => key.time)))].sort((left, right) => left - right);
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

    getAnimationLockedBoneNames() {
      const clipName = getCurrentClipKey(baseClipsRef.current, playbackRef.current.currentClipName ?? '');
      return getActiveAnimationLockedBoneNames(clipName);
    },

    getAnimationScope() {
      return animationScope;
    },
  };

  return controller;
}
