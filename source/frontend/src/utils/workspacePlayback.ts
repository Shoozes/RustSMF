import * as THREE from 'three';
import type { EditorMode } from '../store';
import type { SkinPaintPoseMode } from './skinDiagnostics';

export interface WorkspacePlaybackIntent {
  clips: THREE.AnimationClip[];
  currentClipName?: string;
  isPlaying: boolean;
  currentTime: number;
  playbackSpeed: number;
}

export function workspaceUsesRestPose(editorMode: EditorMode, skinPaintPose: SkinPaintPoseMode = 'rest'): boolean {
  return editorMode === 'rig' || (editorMode === 'skin' && skinPaintPose === 'rest');
}

export function workspaceAllowsPlayback(editorMode: EditorMode, skinPaintPose: SkinPaintPoseMode = 'rest'): boolean {
  return !workspaceUsesRestPose(editorMode, skinPaintPose)
    && !(editorMode === 'skin' && skinPaintPose === 'frozen');
}

export function activateWorkspacePlayback(
  mixer: THREE.AnimationMixer,
  intent: WorkspacePlaybackIntent,
  editorMode: EditorMode,
  skinPaintPose: SkinPaintPoseMode = 'rest',
): THREE.AnimationAction | null {
  mixer.stopAllAction();
  if (workspaceUsesRestPose(editorMode, skinPaintPose) || intent.clips.length === 0) return null;

  const clip = (
    intent.currentClipName
      ? intent.clips.find(candidate => (candidate.name || 'clip') === intent.currentClipName)
      : undefined
  ) ?? intent.clips[0];
  if (!clip) return null;

  const action = mixer.clipAction(clip);
  action.reset();
  action.play();
  action.paused = !intent.isPlaying || !workspaceAllowsPlayback(editorMode, skinPaintPose);
  action.setEffectiveTimeScale(intent.playbackSpeed);
  action.time = Math.max(0, Math.min(intent.currentTime, clip.duration || 0));
  mixer.update(0);
  return action;
}
