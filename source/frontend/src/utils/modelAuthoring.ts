import * as THREE from 'three';
import { getModelOutlinerItemKind } from './modelOutliner';
import { isThreeBone, isThreeSkinnedMesh } from './threeTypeGuards';

export interface ModelMetadataState {
  name: string;
  visible: boolean;
  position?: [number, number, number];
  quaternion?: [number, number, number, number];
  scale?: [number, number, number];
  geometry?: THREE.BufferGeometry | null;
  material?: THREE.Material | THREE.Material[] | null;
}

export interface ModelOutlinerSnapshot {
  objectById: Record<string, ModelMetadataState>;
  childOrderByParentId: Record<string, string[]>;
  selectedIds: string[];
  structuralOperation?: ModelStructuralOperation;
}

export type ModelStructuralOperation = {
  kind: 'insert' | 'remove';
  object: THREE.Object3D;
  parentId: string;
  childIndex: number;
  disposeOnRelease?: boolean;
};

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

export type ModelDuplicateFailureReason =
  | 'missing-root'
  | 'missing-object'
  | 'non-submodel-object'
  | 'unsupported-source'
  | 'unparented-object'
  | 'unsupported-subtree'
  | 'animated-target';

export type DuplicateModelObjectResult =
  | {
    ok: true;
    sourceObject: THREE.Object3D;
    object: THREE.Object3D;
    parentId: string;
    childIndex: number;
  }
  | { ok: false; reason: ModelDuplicateFailureReason; message: string };

export type ModelDeleteFailureReason =
  | 'missing-root'
  | 'missing-object'
  | 'non-submodel-object'
  | 'unsupported-source'
  | 'unparented-object'
  | 'unsupported-subtree'
  | 'animated-target';

export type DeleteModelObjectResult =
  | {
    ok: true;
    object: THREE.Object3D;
    parentId: string;
    childIndex: number;
  }
  | { ok: false; reason: ModelDeleteFailureReason; message: string };

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

function sameStructuralOperation(
  left: ModelStructuralOperation | undefined,
  right: ModelStructuralOperation | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.kind === right.kind
    && left.object.uuid === right.object.uuid
    && left.parentId === right.parentId
    && left.childIndex === right.childIndex;
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
  structuralOperation?: ModelStructuralOperation,
): ModelOutlinerSnapshot {
  const objectById = Object.create(null) as Record<string, ModelMetadataState>;
  const childOrderByParentId = Object.create(null) as Record<string, string[]>;
  const knownIds = new Set<string>();
  if (root) {
    for (const id of objectIds) {
      const object = getObjectById(root, id);
      if (!object || object === root) continue;
      knownIds.add(id);
      const geometry = Reflect.get(object, 'geometry');
      const material = Reflect.get(object, 'material');
      objectById[id] = {
        name: object.name,
        visible: object.visible,
        position: [object.position.x, object.position.y, object.position.z],
        quaternion: [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w],
        scale: [object.scale.x, object.scale.y, object.scale.z],
        geometry: geometry instanceof THREE.BufferGeometry ? geometry : null,
        material: material instanceof THREE.Material || Array.isArray(material) ? material : null,
      };
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
    structuralOperation,
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
      && JSON.stringify(left.objectById[id].position) === JSON.stringify(right.objectById[id].position)
      && JSON.stringify(left.objectById[id].quaternion) === JSON.stringify(right.objectById[id].quaternion)
      && JSON.stringify(left.objectById[id].scale) === JSON.stringify(right.objectById[id].scale)
      && left.objectById[id].geometry?.uuid === right.objectById[id].geometry?.uuid
      && left.objectById[id].material === right.objectById[id].material
    ))
    && sameStringListRecord(left.childOrderByParentId, right.childOrderByParentId)
    && sameStringList(left.selectedIds, right.selectedIds)
    && sameStructuralOperation(left.structuralOperation, right.structuralOperation);
}

function applyStructuralOperation(
  root: THREE.Object3D,
  operation: ModelStructuralOperation,
): number {
  const parent = getObjectById(root, operation.parentId);
  if (!parent) return 0;

  if (operation.kind === 'remove') {
    if (operation.object.parent !== parent) return 0;
    parent.remove(operation.object);
    return 1;
  }

  let changed = 0;
  if (operation.object.parent && operation.object.parent !== parent) {
    operation.object.parent.remove(operation.object);
    changed = 1;
  }
  if (operation.object.parent !== parent) {
    parent.add(operation.object);
    changed = 1;
  }
  const currentIndex = parent.children.indexOf(operation.object);
  if (currentIndex < 0) return 0;
  const targetIndex = Math.max(0, Math.min(operation.childIndex, parent.children.length - 1));
  if (currentIndex !== targetIndex) {
    parent.children.splice(currentIndex, 1);
    parent.children.splice(targetIndex, 0, operation.object);
    changed = 1;
  }
  return changed;
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
  let structuralChanges = 0;

  if (root) {
    if (snapshot.structuralOperation) {
      structuralChanges = applyStructuralOperation(root, snapshot.structuralOperation);
      root.traverse((object) => knownIds.add(object.uuid));
    }
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
      if (state.position) object.position.fromArray(state.position);
      if (state.quaternion) object.quaternion.fromArray(state.quaternion);
      if (state.scale) object.scale.fromArray(state.scale);
      if (state.geometry && Reflect.get(object, 'geometry') !== state.geometry) Reflect.set(object, 'geometry', state.geometry);
      if (state.material && Reflect.get(object, 'material') !== state.material) Reflect.set(object, 'material', state.material);
      object.updateMatrix();
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
    changes: structuralChanges + nameChanges + visibilityChanges + orderChanges,
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

function hasUnsupportedStructuralChild(object: THREE.Object3D): boolean {
  let unsupported = false;
  object.traverse((candidate) => {
    if (isThreeBone(candidate) || isThreeSkinnedMesh(candidate)) unsupported = true;
  });
  return unsupported;
}

function getUniqueDuplicateName(root: THREE.Object3D, object: THREE.Object3D): string {
  const names = new Set<string>();
  root.traverse((candidate) => names.add(candidate.name));
  const sourceName = object.name || object.type || 'Submodel';
  let suffixIndex = 0;
  while (true) {
    const suffix = suffixIndex === 0 ? ' Copy' : ` Copy ${suffixIndex}`;
    const base = sourceName.slice(0, Math.max(1, MAX_MODEL_OBJECT_NAME_LENGTH - suffix.length));
    const name = `${base}${suffix}`;
    if (!names.has(name)) return name;
    suffixIndex += 1;
  }
}

function cloneMaterialResources(material: THREE.Material): THREE.Material {
  const clone = material.clone();
  for (const key of Object.keys(clone)) {
    const value = Reflect.get(clone, key);
    if (value instanceof THREE.Texture) Reflect.set(clone, key, value.clone());
  }
  return clone;
}

function cloneStaticResources(root: THREE.Object3D): void {
  root.traverse((object) => {
    const geometry = Reflect.get(object, 'geometry');
    if (geometry instanceof THREE.BufferGeometry) Reflect.set(object, 'geometry', geometry.clone());

    const material = Reflect.get(object, 'material');
    if (material instanceof THREE.Material) {
      Reflect.set(object, 'material', cloneMaterialResources(material));
    } else if (Array.isArray(material)) {
      Reflect.set(
        object,
        'material',
        material.map((entry) => entry instanceof THREE.Material ? cloneMaterialResources(entry) : entry),
      );
    }
  });
}

export function duplicateModelObject(
  root: THREE.Object3D | null | undefined,
  objectId: string,
  clips: readonly THREE.AnimationClip[],
  sourceFormat: string,
): DuplicateModelObjectResult {
  if (!root) return { ok: false, reason: 'missing-root', message: 'Load a model before duplicating a submodel.' };
  const sourceObject = getObjectById(root, objectId);
  if (!sourceObject || sourceObject === root) {
    return { ok: false, reason: 'missing-object', message: 'Select one current submodel before duplicating.' };
  }
  if (getModelOutlinerItemKind(sourceObject) === null) {
    return { ok: false, reason: 'non-submodel-object', message: 'Only Outliner submodels can be duplicated.' };
  }
  if (!supportsModelObjectAuthoring(sourceFormat)) {
    return { ok: false, reason: 'unsupported-source', message: getModelObjectAuthoringDisabledReason(sourceFormat)! };
  }
  const parent = sourceObject.parent;
  if (!parent) return { ok: false, reason: 'unparented-object', message: 'The selected submodel has no current parent.' };
  if (hasUnsupportedStructuralChild(sourceObject)) {
    return {
      ok: false,
      reason: 'unsupported-subtree',
      message: 'Duplicate is limited to static submodels; bones and skinned meshes remain unchanged.',
    };
  }
  if (objectOwnsAnimationTrack(sourceObject, clips)) {
    return {
      ok: false,
      reason: 'animated-target',
      message: `Submodel ${sourceObject.name || 'unnamed'} is an animation target and cannot be duplicated safely.`,
    };
  }

  const object = sourceObject.clone(true);
  cloneStaticResources(object);
  object.name = getUniqueDuplicateName(root, sourceObject);
  const sourceIndex = parent.children.indexOf(sourceObject);
  parent.add(object);
  const appendedIndex = parent.children.indexOf(object);
  parent.children.splice(appendedIndex, 1);
  parent.children.splice(sourceIndex + 1, 0, object);
  return { ok: true, sourceObject, object, parentId: parent.uuid, childIndex: sourceIndex + 1 };
}

function objectOwnsAnimationTrack(object: THREE.Object3D, clips: readonly THREE.AnimationClip[]): boolean {
  const names = new Set<string>();
  object.traverse((candidate) => {
    if (candidate.name) names.add(candidate.name);
  });
  return [...names].some((name) => clips.some((clip) => (
    clip.tracks.some((track) => trackTargetsObjectName(track.name, name))
  )));
}

export function deleteModelObject(
  root: THREE.Object3D | null | undefined,
  objectId: string,
  clips: readonly THREE.AnimationClip[],
  sourceFormat: string,
): DeleteModelObjectResult {
  if (!root) return { ok: false, reason: 'missing-root', message: 'Load a model before deleting a submodel.' };
  const object = getObjectById(root, objectId);
  if (!object || object === root) {
    return { ok: false, reason: 'missing-object', message: 'Select one current submodel before deleting.' };
  }
  if (getModelOutlinerItemKind(object) === null) {
    return { ok: false, reason: 'non-submodel-object', message: 'Only Outliner submodels can be deleted.' };
  }
  if (!supportsModelObjectAuthoring(sourceFormat)) {
    return { ok: false, reason: 'unsupported-source', message: getModelObjectAuthoringDisabledReason(sourceFormat)! };
  }
  const parent = object.parent;
  if (!parent) return { ok: false, reason: 'unparented-object', message: 'The selected submodel has no current parent.' };
  if (hasUnsupportedStructuralChild(object)) {
    return {
      ok: false,
      reason: 'unsupported-subtree',
      message: 'Delete is limited to static submodels; bones and skinned meshes remain unchanged.',
    };
  }
  if (objectOwnsAnimationTrack(object, clips)) {
    return {
      ok: false,
      reason: 'animated-target',
      message: `Submodel ${object.name || 'unnamed'} is an animation target and cannot be deleted safely.`,
    };
  }

  const parentId = parent.uuid;
  const childIndex = parent.children.indexOf(object);
  parent.remove(object);
  return { ok: true, object, parentId, childIndex };
}
