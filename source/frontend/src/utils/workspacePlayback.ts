import * as THREE from 'three';
import type { EditorMode } from '../store';
import type { SkinPaintPoseMode } from './skinDiagnostics';
import { isThreeMesh, isThreeSkinnedMesh } from './threeTypeGuards';

export interface WorkspacePlaybackIntent {
  clips: THREE.AnimationClip[];
  currentClipName?: string;
  isPlaying: boolean;
  currentTime: number;
  playbackSpeed: number;
}

type GltfNodeDefaults = Partial<Record<'translation' | 'rotation' | 'scale' | 'weights', number[]>>;
export type PreviewRestState = ReadonlyMap<THREE.Object3D, GltfNodeDefaults>;

const previewRestStates = new WeakMap<THREE.Object3D, PreviewRestState>();

export function getPreviewRestState(root: THREE.Object3D): PreviewRestState | undefined {
  return previewRestStates.get(root);
}

function capturePreviewRestState(root: THREE.Object3D, clip: THREE.AnimationClip): PreviewRestState {
  const states = new Map<THREE.Object3D, GltfNodeDefaults>();
  for (const track of clip.tracks) {
    const { nodeName, objectName, objectIndex, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
    const target = THREE.PropertyBinding.findNode(root, nodeName);
    if (!(target instanceof THREE.Object3D)) continue;
    const node = objectName === 'bones' && isThreeSkinnedMesh(target)
      ? target.skeleton.getBoneByName(objectIndex ?? '')
      : objectName ? undefined : target;
    if (!node) continue;

    const defaults = states.get(node) ?? {};
    if (propertyName === 'position') defaults.translation ??= node.position.toArray();
    else if (propertyName === 'quaternion' || propertyName === 'rotation') defaults.rotation ??= node.quaternion.toArray();
    else if (propertyName === 'scale') defaults.scale ??= node.scale.toArray();
    else if (propertyName === 'morphTargetInfluences' && isThreeMesh(node) && node.morphTargetInfluences?.length) {
      defaults.weights ??= [...node.morphTargetInfluences];
    }
    else continue;
    states.set(node, defaults);
  }
  return states;
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
  const root = mixer.getRoot();
  if (root instanceof THREE.Object3D) previewRestStates.delete(root);
  if (workspaceUsesRestPose(editorMode, skinPaintPose) || intent.clips.length === 0) return null;

  const clip = (
    intent.currentClipName
      ? intent.clips.find(candidate => (candidate.name || 'clip') === intent.currentClipName)
      : undefined
  ) ?? intent.clips[0];
  if (!clip) return null;

  // The stopped action has restored the underlying values, before preview applies another sample.
  if ((editorMode === 'view' || editorMode === 'export') && root instanceof THREE.Object3D) {
    previewRestStates.set(root, capturePreviewRestState(root, clip));
  }
  const action = mixer.clipAction(clip);
  action.reset();
  action.play();
  action.paused = !intent.isPlaying || !workspaceAllowsPlayback(editorMode, skinPaintPose);
  action.setEffectiveTimeScale(intent.playbackSpeed);
  action.time = Math.max(0, Math.min(intent.currentTime, clip.duration || 0));
  mixer.update(0);
  return action;
}
