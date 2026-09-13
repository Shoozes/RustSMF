import * as THREE from 'three';

export interface FittedRig {
  root: THREE.Group;
  skeleton: THREE.Skeleton;
  sourceToTarget: ReadonlyMap<THREE.Bone, THREE.Bone>;
  maximumBindFrameError: number;
}

function checkedMatrix(matrix: THREE.Matrix4, label: string): void {
  if (matrix.elements.some(value => !Number.isFinite(value)) || Math.abs(matrix.determinant()) < 1e-12) {
    throw new Error(`Invalid or singular bind frame: ${label}`);
  }
}

function namedBones(bones: readonly THREE.Bone[], label: string): Map<string, THREE.Bone> {
  if (!bones.length || bones.length > 256) throw new Error(`${label} requires 1–256 bones`);
  const names = new Map<string, THREE.Bone>();
  for (const bone of bones) {
    if (!bone.name || names.has(bone.name)) throw new Error(`${label} has missing or duplicate bone names`);
    names.set(bone.name, bone);
  }
  return names;
}

/** Fits a template hierarchy to explicit source bind frames without changing either input.
 * The returned root uses world coordinates; attach it with Object3D.attach when
 * placing it under a transformed model root. Unmapped template bones remain
 * unweighted helpers; mapped descendants compensate for their rest transforms.
 */
export function buildFittedRig(
  source: THREE.Skeleton,
  template: THREE.Skeleton,
  mapping: Readonly<Record<string, string>>,
): FittedRig {
  const sourceNames = namedBones(source.bones, 'Source rig');
  const targetNames = namedBones(template.bones, 'Template rig');
  const entries = Object.entries(mapping);
  if (!entries.length || entries.length > 256) throw new Error('An explicit bounded rig map is required');
  const sourceByTarget = new Map<THREE.Bone, THREE.Bone>();
  for (const [sourceName, targetName] of entries) {
    const sourceBone = sourceNames.get(sourceName), targetBone = targetNames.get(targetName);
    if (!sourceBone || !targetBone || sourceByTarget.has(targetBone)) throw new Error('Rig map has missing or repeated target bones');
    sourceBone.updateWorldMatrix(true, false);
    checkedMatrix(sourceBone.matrixWorld, sourceName);
    sourceByTarget.set(targetBone, sourceBone);
  }
  const root = new THREE.Group(); root.name = 'fitted-rig';
  const clones = new Map(template.bones.map(bone => {
    const clone = new THREE.Bone(); clone.name = bone.name;
    return [bone, clone] as const;
  }));
  const sourceToTarget = new Map<THREE.Bone, THREE.Bone>();
  const visiting = new Set<THREE.Bone>(), fitted = new Set<THREE.Bone>();
  let maximumBindFrameError = 0;
  const fit = (original: THREE.Bone): void => {
    if (fitted.has(original)) return;
    if (visiting.has(original)) throw new Error('Cyclic template hierarchy');
    visiting.add(original);
    const clone = clones.get(original)!;
    const parent = original.parent && 'isBone' in original.parent && original.parent.isBone === true
      ? original.parent as THREE.Bone : null;
    if (parent && !clones.has(parent)) throw new Error('Template skeleton omits a bone parent');
    if (parent) fit(parent);
    const destination = parent ? clones.get(parent)! : root;
    destination.add(clone); destination.updateWorldMatrix(true, false);
    const mapped = sourceByTarget.get(original);
    let local: THREE.Matrix4;
    if (mapped) {
      local = destination.matrixWorld.clone().invert().multiply(mapped.matrixWorld);
      sourceToTarget.set(mapped, clone);
    } else {
      if (!parent) throw new Error('Every template root needs an explicit source mapping');
      original.updateMatrix(); local = original.matrix.clone();
    }
    checkedMatrix(local, original.name);
    local.decompose(clone.position, clone.quaternion, clone.scale); clone.updateMatrix();
    if (local.elements.some((value, index) => Math.abs(value - clone.matrix.elements[index]) > 1e-6)) {
      throw new Error(`Fitted bind frame contains unsupported shear: ${original.name}`);
    }
    clone.updateWorldMatrix(true, false);
    if (mapped) maximumBindFrameError = Math.max(maximumBindFrameError,
      ...clone.matrixWorld.elements.map((value, index) => Math.abs(value - mapped.matrixWorld.elements[index])));
    visiting.delete(original); fitted.add(original);
  };
  try {
    template.bones.forEach(fit); root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(template.bones.map(bone => clones.get(bone)!));
    skeleton.calculateInverses();
    return { root, skeleton, sourceToTarget, maximumBindFrameError };
  } catch (error) { root.clear(); throw error; }
}

/** Creates replacement indices only. Input geometry, weights and assignments are
 * preserved; an unmapped positive influence rejects the operation before apply.
 */
export function fittedSkinIndices(mesh: THREE.SkinnedMesh, fitted: FittedRig): THREE.Uint16BufferAttribute {
  const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
  if (!indices || !weights || indices.itemSize !== 4 || weights.itemSize !== 4 || indices.count !== weights.count) {
    throw new Error('Expected matching four-slot skin attributes');
  }
  const targetIndices = new Map(fitted.skeleton.bones.map((bone, index) => [bone, index]));
  const result = new Uint16Array(indices.count * 4);
  for (let vertex = 0; vertex < indices.count; vertex++) {
    let sum = 0;
    for (let slot = 0; slot < 4; slot++) {
      const weight = weights.getComponent(vertex, slot), index = indices.getComponent(vertex, slot);
      if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error('Invalid skin weight');
      sum += weight;
      if (weight === 0) continue;
      if (!Number.isInteger(index) || !mesh.skeleton.bones[index]) throw new Error('Invalid weighted source joint');
      const target = fitted.sourceToTarget.get(mesh.skeleton.bones[index]);
      const targetIndex = target ? targetIndices.get(target) : undefined;
      if (targetIndex === undefined) throw new Error(`Unmapped weighted joint: ${mesh.skeleton.bones[index].name}`);
      result[vertex * 4 + slot] = targetIndex;
    }
    if (Math.abs(sum - 1) > 1e-5) throw new Error('Skin weights must sum to one');
  }
  return new THREE.Uint16BufferAttribute(result, 4);
}
