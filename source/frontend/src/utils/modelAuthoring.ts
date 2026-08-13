import * as THREE from 'three';
import { getModelOutlinerItemKind } from './modelOutliner';
import { isThreeBone } from './threeTypeGuards';

export interface ModelMetadataState {
  name: string;
  visible: boolean;
}

export interface ModelOutlinerSnapshot {
  objectById: Record<string, ModelMetadataState>;
  childOrderByParentId: Record<string, string[]>;
  selectedIds: string[];
}

export interface ApplyModelOutlinerSnapshotResult {
  changes: number;
  nameChanges: number;
  visibilityChanges: number;
  orderChanges: number;
  selectedIds: string[];
}

export type ModelRenameFailureReason =
  | 'missing-root'
  | 'missing-object'
  | 'bone-object'
  | 'unsupported-source'
  | 'empty-name'
  | 'same-name'
  | 'name-too-long'
  | 'invalid-name'
  | 'duplicate-name'
  | 'animated-target';

export type RenameModelObjectResult =
  | { ok: true; object: THREE.Object3D; previousName: string; name: string }
  | { ok: false; reason: ModelRenameFailureReason; message: string };

export type ModelObjectReorderDirection = 'earlier' | 'later';

export type ModelReorderFailureReason =
  | 'missing-root'
  | 'missing-object'
  | 'non-submodel-object'
  | 'unsupported-source'
  | 'unparented-object'
  | 'boundary';

export type ReorderModelObjectResult =
  | {
    ok: true;
    object: THREE.Object3D;
    parentId: string;
    direction: ModelObjectReorderDirection;
  }
  | { ok: false; reason: ModelReorderFailureReason; message: string };

export interface ModelObjectReorderAvailability {
  canMoveEarlier: boolean;
  canMoveLater: boolean;
}

const MAX_MODEL_OBJECT_NAME_LENGTH = 128;

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getObjectById(root: THREE.Object3D, objectId: string): THREE.Object3D | undefined {
  return root.uuid === objectId ? root : root.getObjectByProperty('uuid', objectId);
}

function sameStringListRecord(
  left: Record<string, string[]>,
  right: Record<string, string[]>,
): boolean {
  const leftIds = Object.keys(left).sort();
  const rightIds = Object.keys(right).sort();
  return sameStringList(leftIds, rightIds)
    && leftIds.every((id) => sameStringList(left[id], right[id]));
}

export function supportsModelObjectAuthoring(sourceFormat: string): boolean {
  return sourceFormat === 'glb' || sourceFormat === 'fbx' || sourceFormat === 'obj';
}

export function getModelObjectAuthoringDisabledReason(sourceFormat: string): string | undefined {
  if (supportsModelObjectAuthoring(sourceFormat)) return undefined;
  return sourceFormat === 'smf'
    ? 'SMF submodel names and hierarchy order are source-owned in the current exporter.'
    : 'The current source format cannot persist submodel authoring changes.';
}

function trackTargetsObjectName(trackName: string, objectName: string): boolean {
  if (!objectName) return false;
  try {
    return THREE.PropertyBinding.parseTrackName(trackName).nodeName === objectName;
  } catch {
    return trackName === objectName
      || trackName.startsWith(`${objectName}.`)
      || trackName.startsWith(`${objectName}[`);
  }
}

export function captureModelOutlinerSnapshot(
  root: THREE.Object3D | null | undefined,
  objectIds: Iterable<string>,
  selectedIds: Iterable<string>,
  orderedParentIds: Iterable<string> = [],
): ModelOutlinerSnapshot {
  const objectById = Object.create(null) as Record<string, ModelMetadataState>;
  const childOrderByParentId = Object.create(null) as Record<string, string[]>;
  const knownIds = new Set<string>();
  if (root) {
    for (const id of objectIds) {
      const object = getObjectById(root, id);
      if (!object || object === root) continue;
      knownIds.add(id);
      objectById[id] = { name: object.name, visible: object.visible };
    }
    for (const parentId of orderedParentIds) {
      const parent = getObjectById(root, parentId);
      if (!parent) continue;
      childOrderByParentId[parentId] = parent.children.map((child) => child.uuid);
    }
  }

  return {
    objectById,
    childOrderByParentId,
    selectedIds: [...selectedIds].filter((id) => knownIds.has(id)),
  };
}

export function sameModelOutlinerSnapshot(
  left: ModelOutlinerSnapshot,
  right: ModelOutlinerSnapshot,
): boolean {
  const leftIds = Object.keys(left.objectById).sort();
  const rightIds = Object.keys(right.objectById).sort();
  return sameStringList(leftIds, rightIds)
    && leftIds.every((id) => (
      left.objectById[id].name === right.objectById[id].name
      && left.objectById[id].visible === right.objectById[id].visible
    ))
    && sameStringListRecord(left.childOrderByParentId, right.childOrderByParentId)
    && sameStringList(left.selectedIds, right.selectedIds);
}

export function applyModelOutlinerSnapshot(
  root: THREE.Object3D | null | undefined,
  snapshot: ModelOutlinerSnapshot,
  currentObjectIds: Iterable<string>,
): ApplyModelOutlinerSnapshotResult {
  const knownIds = new Set(currentObjectIds);
  let nameChanges = 0;
  let visibilityChanges = 0;
  let orderChanges = 0;

  if (root) {
    for (const [id, state] of Object.entries(snapshot.objectById)) {
      if (!knownIds.has(id)) continue;
      const object = getObjectById(root, id);
      if (!object || object === root) continue;
      if (object.name !== state.name) {
        object.name = state.name;
        nameChanges += 1;
      }
      if (object.visible !== state.visible) {
        object.visible = state.visible;
        visibilityChanges += 1;
      }
    }
    for (const [parentId, childIds] of Object.entries(snapshot.childOrderByParentId)) {
      const parent = getObjectById(root, parentId);
      if (!parent || childIds.length !== parent.children.length) continue;
      const currentById = new Map(parent.children.map((child) => [child.uuid, child]));
      if (
        currentById.size !== childIds.length
        || new Set(childIds).size !== childIds.length
        || childIds.some((id) => !currentById.has(id))
      ) continue;
      const currentIds = parent.children.map((child) => child.uuid);
      if (sameStringList(currentIds, childIds)) continue;
      parent.children.splice(0, parent.children.length, ...childIds.map((id) => currentById.get(id)!));
      orderChanges += 1;
    }
  }

  return {
    changes: nameChanges + visibilityChanges + orderChanges,
    nameChanges,
    visibilityChanges,
    orderChanges,
    selectedIds: snapshot.selectedIds.filter((id) => knownIds.has(id)),
  };
}

export function renameModelObject(
  root: THREE.Object3D | null | undefined,
  objectId: string,
  requestedName: string,
  clips: readonly THREE.AnimationClip[],
  sourceFormat: string,
): RenameModelObjectResult {
  if (!root) {
    return { ok: false, reason: 'missing-root', message: 'Load a model before renaming a submodel.' };
  }
  const object: THREE.Object3D | undefined = root.getObjectByProperty('uuid', objectId);
  if (!object || object === root) {
    return { ok: false, reason: 'missing-object', message: 'Select one current submodel before renaming.' };
  }
  if (isThreeBone(object)) {
    return { ok: false, reason: 'bone-object', message: 'Rename bones through the guarded Rig workspace.' };
  }
  if (!supportsModelObjectAuthoring(sourceFormat)) {
    return {
      ok: false,
      reason: 'unsupported-source',
      message: getModelObjectAuthoringDisabledReason(sourceFormat)!,
    };
  }

  const nextName = requestedName.trim();
  if (!nextName) {
    return { ok: false, reason: 'empty-name', message: 'Submodel name cannot be empty.' };
  }
  if (nextName === object.name) {
    return { ok: false, reason: 'same-name', message: 'Submodel already has that name.' };
  }
  if (nextName.length > MAX_MODEL_OBJECT_NAME_LENGTH) {
    return {
      ok: false,
      reason: 'name-too-long',
      message: `Submodel names are limited to ${MAX_MODEL_OBJECT_NAME_LENGTH} characters.`,
    };
  }
  if (THREE.PropertyBinding.sanitizeNodeName(nextName) !== nextName) {
    return {
      ok: false,
      reason: 'invalid-name',
      message: 'Submodel names cannot contain spaces or Three.js binding characters: [ ] . : /.',
    };
  }

  let duplicate = false;
  root.traverse((candidate) => {
    if (candidate !== object && candidate.name === nextName) duplicate = true;
  });
  if (duplicate) {
    return { ok: false, reason: 'duplicate-name', message: `An object named ${nextName} already exists.` };
  }

  if (object.name && clips.some((clip) => (
    clip.tracks.some((track) => trackTargetsObjectName(track.name, object.name))
  ))) {
    return {
      ok: false,
      reason: 'animated-target',
      message: `Submodel ${object.name} is an animation target. Retargeting object tracks is not yet a safe rename contract.`,
    };
  }

  const previousName = object.name;
  object.name = nextName;
  return { ok: true, object, previousName, name: nextName };
}

function getReorderableSiblings(object: THREE.Object3D): THREE.Object3D[] {
  return object.parent?.children.filter((candidate) => getModelOutlinerItemKind(candidate) !== null) ?? [];
}

export function getModelObjectReorderAvailability(
  root: THREE.Object3D | null | undefined,
  objectId: string,
): ModelObjectReorderAvailability {
  if (!root) return { canMoveEarlier: false, canMoveLater: false };
  const object = getObjectById(root, objectId);
  if (!object || object === root || !object.parent || getModelOutlinerItemKind(object) === null) {
    return { canMoveEarlier: false, canMoveLater: false };
  }
  const siblings = getReorderableSiblings(object);
  const index = siblings.indexOf(object);
  return {
    canMoveEarlier: index > 0,
    canMoveLater: index >= 0 && index < siblings.length - 1,
  };
}

export function reorderModelObject(
  root: THREE.Object3D | null | undefined,
  objectId: string,
  direction: ModelObjectReorderDirection,
  sourceFormat: string,
): ReorderModelObjectResult {
  if (!root) {
    return { ok: false, reason: 'missing-root', message: 'Load a model before reordering submodels.' };
  }
  const object = getObjectById(root, objectId);
  if (!object || object === root) {
    return { ok: false, reason: 'missing-object', message: 'Select one current submodel before reordering.' };
  }
  if (getModelOutlinerItemKind(object) === null) {
    return { ok: false, reason: 'non-submodel-object', message: 'Only Outliner submodels can be reordered.' };
  }
  if (!supportsModelObjectAuthoring(sourceFormat)) {
    return {
      ok: false,
      reason: 'unsupported-source',
      message: getModelObjectAuthoringDisabledReason(sourceFormat)!,
    };
  }
  const parent = object.parent;
  if (!parent) {
    return { ok: false, reason: 'unparented-object', message: 'The selected submodel has no current parent.' };
  }

  const siblings = getReorderableSiblings(object);
  const currentIndex = siblings.indexOf(object);
  const targetIndex = currentIndex + (direction === 'earlier' ? -1 : 1);
  const target = siblings[targetIndex];
  if (currentIndex < 0 || !target) {
    return {
      ok: false,
      reason: 'boundary',
      message: `Submodel ${object.name || 'unnamed'} is already ${direction === 'earlier' ? 'first' : 'last'} among its siblings.`,
    };
  }

  const objectChildIndex = parent.children.indexOf(object);
  const targetChildIndex = parent.children.indexOf(target);
  [parent.children[objectChildIndex], parent.children[targetChildIndex]] = [target, object];
  return { ok: true, object, parentId: parent.uuid, direction };
}
