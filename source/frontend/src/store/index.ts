/**
 * Store / state slices (no external store lib to stay dep-free and browser+tauri friendly).
 *
 * Primary ownership lifted from App.tsx for modularity.
 * Provides shared shapes and hooks for model, playback, ui state.
 * Components and hooks consume these to reduce App bloat.
 */

import { useState, useCallback } from 'react';
import * as THREE from 'three';

export interface LoadedModelState {
  root: THREE.Group | null;
  skeleton?: THREE.Skeleton;
  clips: THREE.AnimationClip[];
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentClipName: string;
  playbackSpeed: number;
}

export type EditorMode = 'view' | 'rig' | 'skin' | 'animate' | 'export';

export interface UiState {
  status: string;
  selected: string;
  isLoading: boolean;
  errorMsg: string;
  editorMode: EditorMode;
}

export function usePlaybackSlice(initial: Partial<PlaybackState> = {}) {
  const [isPlaying, setIsPlaying] = useState<boolean>(initial.isPlaying ?? false);
  const [currentTime, setCurrentTime] = useState<number>(initial.currentTime ?? 0);
  const [duration, setDuration] = useState<number>(initial.duration ?? 0);
  const [currentClipName, setCurrentClipName] = useState<string>(initial.currentClipName ?? '');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(initial.playbackSpeed ?? 1);

  const toggle = useCallback(() => setIsPlaying(p => !p), []);
  const scrub = useCallback((t: number) => setCurrentTime(Math.max(0, t)), []);
  const selectClip = useCallback((name: string, dur: number) => {
    setCurrentClipName(name);
    setDuration(dur);
    setCurrentTime(0);
    setIsPlaying(true);
  }, []);

  return {
    isPlaying, setIsPlaying,
    currentTime, setCurrentTime,
    duration, setDuration,
    currentClipName, setCurrentClipName,
    playbackSpeed, setPlaybackSpeed,
    toggle, scrub, selectClip,
  };
}

export function useModelSlice(initial: Partial<LoadedModelState> = {}) {
  const [root, setRoot] = useState<THREE.Group | null>(initial.root ?? null);
  const [skeleton, setSkeleton] = useState<THREE.Skeleton | undefined>(initial.skeleton);
  const [clips, setClips] = useState<THREE.AnimationClip[]>(initial.clips ?? []);

  const clear = useCallback(() => {
    setRoot(null);
    setSkeleton(undefined);
    setClips([]);
  }, []);

  return {
    root, setRoot,
    skeleton, setSkeleton,
    clips, setClips,
    clear,
  };
}

export function useUiSlice(initial: Partial<UiState> = {}) {
  const [status, setStatus] = useState<string>(initial.status ?? 'Three.js viewport ready (Y-up). Open .smf/.glb/.fbx/.obj. SMF/GLB/FBX export supported.');
  const [selected, setSelected] = useState<string>(initial.selected ?? 'Scene');
  const [isLoading, setIsLoading] = useState<boolean>(initial.isLoading ?? false);
  const [errorMsg, setErrorMsg] = useState<string>(initial.errorMsg ?? '');
  const [editorMode, setEditorMode] = useState<EditorMode>(initial.editorMode ?? 'view');

  const clearError = useCallback(() => setErrorMsg(''), []);

  return {
    status, setStatus,
    selected, setSelected,
    isLoading, setIsLoading,
    errorMsg, setErrorMsg,
    editorMode, setEditorMode,
    clearError,
  };
}
