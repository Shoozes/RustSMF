import * as THREE from 'three';
import type { EditorMode } from '../store';
import type { SkinPaintPoseMode } from './skinDiagnostics';
import { isThreeSkinnedMesh } from './threeTypeGuards';

export interface WorkspacePlaybackIntent {
  clips: THREE.AnimationClip[];
  currentClipName?: string;
  isPlaying: boolean;
  currentTime: number;
  playbackSpeed: number;
}

type GltfTransform = 'translation' | 'rotation' | 'scale';
export type PreviewRestTransforms = ReadonlyMap<THREE.Object3D, Partial<Record<GltfTransform, number[]>>>;

const modelPreviewRestTransforms = new WeakMap<THREE.Object3D, PreviewRestTransforms>();

export function getModelPreviewRestTransforms(root: THREE.Object3D): PreviewRestTransforms | undefined {
  return modelPreviewRestTransforms.get(root);
}

function capturePreviewRestTransforms(root: THREE.Object3D, clip: THREE.AnimationClip): PreviewRestTransforms {
  const transforms = new Map<THREE.Object3D, Partial<Record<GltfTransform, number[]>>>();
  for (const track of clip.tracks) {
    const { nodeName, objectName, objectIndex, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
    const target = THREE.PropertyBinding.findNode(root, nodeName);
    if (!(target instanceof THREE.Object3D)) continue;
    const node = objectName === 'bones' && isThreeSkinnedMesh(target)
      ? target.skeleton.getBoneByName(objectIndex ?? '')
      : objectName ? undefined : target;
    if (!node) continue;

    const defaults = transforms.get(node) ?? {};
    if (propertyName === 'position') defaults.translation ??= node.position.toArray();
    else if (propertyName === 'quaternion' || propertyName === 'rotation') defaults.rotation ??= node.quaternion.toArray();
    else if (propertyName === 'scale') defaults.scale ??= node.scale.toArray();
    else continue;
    transforms.set(node, defaults);
  }
  return transforms;
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
  if (root instanceof THREE.Object3D) modelPreviewRestTransforms.delete(root);
  if (workspaceUsesRestPose(editorMode, skinPaintPose) || intent.clips.length === 0) return null;

  const clip = (
    intent.currentClipName
      ? intent.clips.find(candidate => (candidate.name || 'clip') === intent.currentClipName)
      : undefined
  ) ?? intent.clips[0];
  if (!clip) return null;

  // The stopped action has restored the underlying values, before preview applies another sample.
  if (editorMode === 'view' && root instanceof THREE.Object3D) {
    modelPreviewRestTransforms.set(root, capturePreviewRestTransforms(root, clip));
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
