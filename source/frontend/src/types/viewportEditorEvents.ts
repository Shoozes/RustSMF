import type * as THREE from 'three';
import type { ViewportRole } from '../utils/viewportLayout';

export type BoneTransformEditSource = 'transform-controls' | 'endpoint-drag';
export type BoneTransformEditPhase = 'start' | 'change' | 'end' | 'cancel';
export type BoneTransformOwner = 'disabled' | 'pose' | 'animation';

export interface BoneTransformEditEvent {
  phase: BoneTransformEditPhase;
  source: BoneTransformEditSource;
  owner: BoneTransformOwner;
  boneName: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
}

export type RigMoveEditPhase = 'start' | 'change' | 'end';

export interface RigMoveEditEvent {
  phase: RigMoveEditPhase;
  boneName: string;
  worldPosition: THREE.Vector3;
  paneRole: ViewportRole;
}

export type RigRotateEditPhase = 'start' | 'change' | 'end';

export interface RigRotateEditEvent {
  phase: RigRotateEditPhase;
  boneName: string;
  worldAxis: THREE.Vector3;
  angleRadians: number;
  paneRole: ViewportRole;
}

export type RigIkEditPhase = 'start' | 'change' | 'end' | 'cancel';

export interface RigIkEditEvent {
  phase: RigIkEditPhase;
  boneName: string;
  targetWorld: THREE.Vector3;
  paneRole: ViewportRole;
}

export interface ViewportObjectSelectEvent {
  objectId: string;
  objectName: string;
  additive: boolean;
  toggle: boolean;
}
