import * as THREE from 'three';
import { collectRigHierarchyBones } from './rigHierarchy';

export const RIG_METADATA_SCHEMA_VERSION = 1 as const;
export const RIG_PRIMARY_AXES = ['x', 'y', 'z'] as const;
export type RigPrimaryAxis = typeof RIG_PRIMARY_AXES[number];

export interface RigBoneMetadata {
  primaryAxis: RigPrimaryAxis;
  locked: boolean;
  pinned: boolean;
}

export interface RigMetadata {
  schemaVersion: typeof RIG_METADATA_SCHEMA_VERSION;
  bones: Record<string, RigBoneMetadata>;
}

const ROOT_METADATA_KEY = 'rustsmfRigMetadata';

const defaultBoneMetadata = (): RigBoneMetadata => ({ primaryAxis: 'y', locked: false, pinned: false });

export function createRigMetadata(root: THREE.Object3D | null, skeleton?: THREE.Skeleton | null): RigMetadata {
  const bones = Object.create(null) as Record<string, RigBoneMetadata>;
  const source = root && skeleton ? collectRigHierarchyBones(root, skeleton) : skeleton?.bones ?? [];
  for (const bone of source) {
    if (bone.name) bones[bone.name] = defaultBoneMetadata();
  }
  return { schemaVersion: RIG_METADATA_SCHEMA_VERSION, bones };
}

export function cloneRigMetadata(metadata: RigMetadata): RigMetadata {
  const bones = Object.create(null) as Record<string, RigBoneMetadata>;
  for (const [name, value] of Object.entries(metadata.bones)) bones[name] = { ...value };
  return { schemaVersion: RIG_METADATA_SCHEMA_VERSION, bones };
}

export function normalizeRigMetadata(value: unknown, root?: THREE.Object3D | null, skeleton?: THREE.Skeleton | null): RigMetadata {
  const fallback = createRigMetadata(root ?? null, skeleton);
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as { schemaVersion?: unknown; bones?: unknown };
  if (candidate.schemaVersion !== RIG_METADATA_SCHEMA_VERSION || !candidate.bones || typeof candidate.bones !== 'object') {
    return fallback;
  }
  const bones = cloneRigMetadata(fallback).bones;
  for (const [name, raw] of Object.entries(candidate.bones as Record<string, unknown>)) {
    if (!name || !raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const primaryAxis = RIG_PRIMARY_AXES.includes(item.primaryAxis as RigPrimaryAxis) ? item.primaryAxis as RigPrimaryAxis : 'y';
    bones[name] = {
      primaryAxis,
      locked: item.locked === true,
      pinned: item.pinned === true,
    };
  }
  return { schemaVersion: RIG_METADATA_SCHEMA_VERSION, bones };
}

export function readRigMetadata(root: THREE.Object3D | null, skeleton?: THREE.Skeleton | null): RigMetadata {
  return normalizeRigMetadata(root ? root.userData[ROOT_METADATA_KEY] : null, root, skeleton);
}

export function writeRigMetadata(root: THREE.Object3D, metadata: RigMetadata): void {
  root.userData[ROOT_METADATA_KEY] = cloneRigMetadata(metadata);
}

export function updateRigBoneMetadata(
  metadata: RigMetadata,
  boneName: string,
  patch: Partial<RigBoneMetadata>,
): RigMetadata {
  if (!boneName) return cloneRigMetadata(metadata);
  const current = metadata.bones[boneName] ?? defaultBoneMetadata();
  const next = cloneRigMetadata(metadata);
  next.bones[boneName] = {
    primaryAxis: RIG_PRIMARY_AXES.includes(patch.primaryAxis ?? current.primaryAxis)
      ? patch.primaryAxis ?? current.primaryAxis
      : current.primaryAxis,
    locked: patch.locked ?? current.locked,
    pinned: patch.pinned ?? current.pinned,
  };
  return next;
}

export function lockedRigBoneNames(metadata: RigMetadata): readonly string[] {
  return Object.entries(metadata.bones)
    .filter(([, value]) => value.locked || value.pinned)
    .map(([name]) => name);
}

export function serializeRigMetadata(metadata: RigMetadata): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(cloneRigMetadata(metadata)));
}

export function parseRigMetadata(bytes: Uint8Array): RigMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('RIG_METADATA_INVALID: metadata JSON is malformed.');
  }
  if (!parsed || typeof parsed !== 'object' || (parsed as { schemaVersion?: unknown }).schemaVersion !== RIG_METADATA_SCHEMA_VERSION) {
    throw new Error('RIG_METADATA_INVALID: unsupported metadata schema.');
  }
  return normalizeRigMetadata(parsed);
}
