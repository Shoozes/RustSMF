import * as THREE from 'three';
import { ensureGeometryAttributes } from '../loaders/geometryAttributes';
import { getSourceMaterials } from './materialPreview';
import { getModelObjectAuthoringDisabledReason, supportsModelObjectAuthoring } from './modelAuthoring';
import { isThreeBone, isThreeSkinnedMesh } from './threeTypeGuards';

export interface ModelTransformPatch {
  position?: [number, number, number];
  quaternion?: [number, number, number, number];
  scale?: [number, number, number];
}

export type ModelSurfaceEditFailure = 'missing-root' | 'missing-object' | 'unsupported-source' | 'unsupported-object' | 'animated-target' | 'invalid-material';
export type ModelSurfaceEditResult =
  | { ok: true; object: THREE.Object3D; message: string }
  | { ok: false; reason: ModelSurfaceEditFailure; message: string };

function findObject(root: THREE.Object3D | null | undefined, objectId: string): THREE.Object3D | null {
  if (!root) return null;
  return root.uuid === objectId ? root : root.getObjectByProperty('uuid', objectId) ?? null;
}

function staticTarget(root: THREE.Object3D | null | undefined, objectId: string, sourceFormat: string): ModelSurfaceEditResult & { ok: false } | THREE.Object3D {
  if (!root) return { ok: false, reason: 'missing-root', message: 'Load a model before editing a submodel.' };
  const object = findObject(root, objectId);
  if (!object || object === root) return { ok: false, reason: 'missing-object', message: 'Select one current submodel before editing.' };
  if (!supportsModelObjectAuthoring(sourceFormat)) return { ok: false, reason: 'unsupported-source', message: getModelObjectAuthoringDisabledReason(sourceFormat)! };
  if (isThreeBone(object) || isThreeSkinnedMesh(object)) return { ok: false, reason: 'unsupported-object', message: 'Static model authoring does not mutate bones or skinned meshes.' };
  return object;
}

function trackTargetsName(trackName: string, objectName: string): boolean {
  return trackName === objectName || trackName.startsWith(`${objectName}.`) || trackName.startsWith(`${objectName}[`);
}

function rejectAnimatedTarget(object: THREE.Object3D, clips: readonly THREE.AnimationClip[]): ModelSurfaceEditResult | null {
  if (object.name && clips.some((clip) => clip.tracks.some((track) => trackTargetsName(track.name, object.name)))) {
    return { ok: false, reason: 'animated-target', message: `Submodel ${object.name} is animated; this surface edit was rejected to preserve bindings.` };
  }
  return null;
}

export function transformStaticModelObject(
  root: THREE.Object3D | null | undefined,
  objectId: string,
  patch: ModelTransformPatch,
  clips: readonly THREE.AnimationClip[],
  sourceFormat: string,
): ModelSurfaceEditResult {
  const target = staticTarget(root, objectId, sourceFormat);
  if (!target || typeof target !== 'object' || !('isObject3D' in target)) return target as ModelSurfaceEditResult;
  const animated = rejectAnimatedTarget(target, clips);
  if (animated) return animated;
  if (patch.position) target.position.fromArray(patch.position);
  if (patch.quaternion) target.quaternion.fromArray(patch.quaternion).normalize();
  if (patch.scale) target.scale.fromArray(patch.scale);
  target.updateMatrix();
  return { ok: true, object: target, message: `Transformed ${target.name || 'submodel'}.` };
}

export function assignStaticModelMaterial(
  root: THREE.Object3D | null | undefined,
  objectId: string,
  materialName: string,
  clips: readonly THREE.AnimationClip[],
  sourceFormat: string,
): ModelSurfaceEditResult {
  const target = staticTarget(root, objectId, sourceFormat);
  if (!target || typeof target !== 'object' || !('isObject3D' in target)) return target as ModelSurfaceEditResult;
  const animated = rejectAnimatedTarget(target, clips);
  if (animated) return animated;
  const requested = materialName.trim();
  const materials = root ? root.getObjectsByProperty('isObject3D', true).flatMap((object) => {
    const mesh = object as THREE.Mesh;
    return mesh.material ? getSourceMaterials(mesh) : [];
  }) : [];
  const material = materials.find((candidate) => candidate.name === requested);
  if (!material) return { ok: false, reason: 'invalid-material', message: `Material ${requested || '(empty)'} was not found in the loaded model.` };
  Reflect.set(target, 'material', material.clone());
  return { ok: true, object: target, message: `Assigned material ${requested} to ${target.name || 'submodel'}.` };
}

export function flipStaticModelWinding(
  root: THREE.Object3D | null | undefined,
  objectId: string,
  clips: readonly THREE.AnimationClip[],
  sourceFormat: string,
): ModelSurfaceEditResult {
  const target = staticTarget(root, objectId, sourceFormat);
  if (!target || typeof target !== 'object' || !('isObject3D' in target)) return target as ModelSurfaceEditResult;
  const animated = rejectAnimatedTarget(target, clips);
  if (animated) return animated;
  const geometry = Reflect.get(target, 'geometry');
  if (!(geometry instanceof THREE.BufferGeometry)) return { ok: false, reason: 'unsupported-object', message: 'The selected static submodel has no editable geometry.' };
  const next = geometry.clone();
  const index = next.getIndex();
  if (index) {
    for (let offset = 0; offset + 2 < index.count; offset += 3) {
      const first = index.getX(offset);
      index.setX(offset, index.getX(offset + 2));
      index.setX(offset + 2, first);
    }
    index.needsUpdate = true;
  } else {
    const attributes = Object.values(next.attributes) as THREE.BufferAttribute[];
    for (const attribute of attributes) {
      const values = Array.from(attribute.array);
      for (let offset = 0; offset + 2 < attribute.count; offset += 3) {
        for (let component = 0; component < attribute.itemSize; component += 1) {
          const first = values[(offset * attribute.itemSize) + component];
          values[(offset * attribute.itemSize) + component] = values[((offset + 2) * attribute.itemSize) + component];
          values[((offset + 2) * attribute.itemSize) + component] = first;
        }
      }
      const replacement = new (attribute.array.constructor as new (values: number[]) => typeof attribute.array)(values);
      next.setAttribute(attribute.name, new THREE.BufferAttribute(replacement, attribute.itemSize, attribute.normalized));
    }
  }
  Reflect.set(target, 'geometry', next);
  return { ok: true, object: target, message: `Flipped winding for ${target.name || 'submodel'}.` };
}

export function prepareStaticModelGeometry(
  root: THREE.Object3D | null | undefined,
  objectId: string,
  clips: readonly THREE.AnimationClip[],
  sourceFormat: string,
): ModelSurfaceEditResult & { preparation?: ReturnType<typeof ensureGeometryAttributes> } {
  const target = staticTarget(root, objectId, sourceFormat);
  if (!target || typeof target !== 'object' || !('isObject3D' in target)) return target as ModelSurfaceEditResult;
  const animated = rejectAnimatedTarget(target, clips);
  if (animated) return animated;
  const geometry = Reflect.get(target, 'geometry');
  if (!(geometry instanceof THREE.BufferGeometry)) return { ok: false, reason: 'unsupported-object', message: 'The selected static submodel has no editable geometry.' };
  const next = geometry.clone();
  const preparation = ensureGeometryAttributes(next);
  Reflect.set(target, 'geometry', next);
  return { ok: true, object: target, preparation, message: `Prepared geometry attributes for ${target.name || 'submodel'}.` };
}
