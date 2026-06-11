/**
 * Store / state slices (no external store lib to stay dep-free and browser+tauri friendly).
 *
 * For current scale we keep primary ownership in App.tsx (or page root).
 * These provide:
 *  - Shared TypeScript shapes for model/playback/ui to aid future extraction, components, tests.
 *  - A tiny example useAppState hook + context if a subtree wants isolated state.
 *
 * When modularity grows (multiple viewports, inspectors, future backend sync), lift slices here.
 */

import { useState, useCallback } from 'react';
import * as THREE from 'three';

export interface LoadedModelState {
  root: THREE.Group | null;
  skeleton?: THREE.Skeleton;
  clips: THREE.AnimationClip[];
  lastSmfData: any | null; // ImportedSmf for fidelity export
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentClipName: string;
  playbackSpeed: number;
}

export interface UiState {
  status: string;
  selected: string;
  isLoading: boolean;
}

// Example hook demonstrating a slice bundle (can be consumed by App or split later).
// Not forced on the root App yet to keep diff small; import and use where beneficial.
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

export type { LoadedModelState, PlaybackState, UiState };
