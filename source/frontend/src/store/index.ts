/**
 * Store / state slices (no external store lib to stay dep-free and browser+tauri friendly).
 *
 * Primary ownership lifted from App.tsx for modularity.
 * Provides shared shapes and hooks for model, playback, ui state.
 * Components and hooks consume these to reduce App bloat.
 */

import { useState, useCallback } from 'react';
import * as THREE from 'three';
import { supportedModelFormatsLabel } from '../utils/modelFormat';

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
export type ViewportLayout = 'single' | 'quad';

export interface UiState {
  status: string;
  selected: string;
  isLoading: boolean;
  errorMsg: string;
  editorMode: EditorMode;
  viewportLayout: ViewportLayout;
  textureEnabled: boolean;
  boneIndexLabelsEnabled: boolean;
  rigOpacity: number;
  rigThicknessScale: number;
  gridEnabled: boolean;
  axesEnabled: boolean;
  wireframeEnabled: boolean;
  shaderEnabled: boolean;
  perspectiveEnabled: boolean;
  modelOpacity: number;
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
  const [status, setStatus] = useState<string>(initial.status ?? `Three.js viewport ready (Y-up). Open ${supportedModelFormatsLabel()}. SMF/GLB/FBX export supported.`);
  const [selected, setSelected] = useState<string>(initial.selected ?? 'Scene');
  const [isLoading, setIsLoading] = useState<boolean>(initial.isLoading ?? false);
  const [errorMsg, setErrorMsg] = useState<string>(initial.errorMsg ?? '');
  const [editorMode, setEditorMode] = useState<EditorMode>(initial.editorMode ?? 'view');
  const [viewportLayout, setViewportLayout] = useState<ViewportLayout>(initial.viewportLayout ?? 'single');
  const [textureEnabled, setTextureEnabled] = useState<boolean>(initial.textureEnabled ?? true);
  const [boneIndexLabelsEnabled, setBoneIndexLabelsEnabled] = useState<boolean>(initial.boneIndexLabelsEnabled ?? false);
  const [rigOpacity, setRigOpacity] = useState<number>(initial.rigOpacity ?? 1);
  const [rigThicknessScale, setRigThicknessScale] = useState<number>(initial.rigThicknessScale ?? 1);
  const [gridEnabled, setGridEnabled] = useState<boolean>(initial.gridEnabled ?? true);
  const [axesEnabled, setAxesEnabled] = useState<boolean>(initial.axesEnabled ?? true);
  const [wireframeEnabled, setWireframeEnabled] = useState<boolean>(initial.wireframeEnabled ?? false);
  const [shaderEnabled, setShaderEnabled] = useState<boolean>(initial.shaderEnabled ?? false);
  const [perspectiveEnabled, setPerspectiveEnabled] = useState<boolean>(initial.perspectiveEnabled ?? true);
  const [modelOpacity, setModelOpacity] = useState<number>(initial.modelOpacity ?? 1);

  const clearError = useCallback(() => setErrorMsg(''), []);

  return {
    status, setStatus,
    selected, setSelected,
    isLoading, setIsLoading,
    errorMsg, setErrorMsg,
    editorMode, setEditorMode,
    viewportLayout, setViewportLayout,
    textureEnabled, setTextureEnabled,
    boneIndexLabelsEnabled, setBoneIndexLabelsEnabled,
    rigOpacity, setRigOpacity,
    rigThicknessScale, setRigThicknessScale,
    gridEnabled, setGridEnabled,
    axesEnabled, setAxesEnabled,
    wireframeEnabled, setWireframeEnabled,
    shaderEnabled, setShaderEnabled,
    perspectiveEnabled, setPerspectiveEnabled,
    modelOpacity, setModelOpacity,
    clearError,
  };
}
