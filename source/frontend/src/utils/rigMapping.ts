import * as THREE from 'three';

export const CANONICAL_HUMANOID_BONES = [
  'hips',
  'spine',
  'spine1',
  'spine2',
  'neck',
  'head',
  'leftShoulder',
  'leftArm',
  'leftForearm',
  'leftHand',
  'rightShoulder',
  'rightArm',
  'rightForearm',
  'rightHand',
  'leftUpLeg',
  'leftLeg',
  'leftFoot',
  'leftToe',
  'rightUpLeg',
  'rightLeg',
  'rightFoot',
  'rightToe',
] as const;

export type CanonicalHumanoidBone = typeof CANONICAL_HUMANOID_BONES[number];
export type RigMapMethod = 'manual' | 'canonical' | 'normalized' | 'fuzzy';

export interface RigMapDecision {
  source: string;
  target: string;
  canonical?: CanonicalHumanoidBone;
  method: RigMapMethod;
  confidence: number;
}

export interface RigMapDiagnostic {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  sourceBone?: string;
  targetBone?: string;
}

export interface RigMapResult {
  ok: boolean;
  map: Record<string, string>;
  decisions: RigMapDecision[];
  diagnostics: RigMapDiagnostic[];
  sourceUp: [number, number, number] | null;
  targetUp: [number, number, number] | null;
  upCorrection: [number, number, number, number] | null;
  sourceLateral: [number, number, number] | null;
  targetLateral: [number, number, number] | null;
  orientationCorrection: [number, number, number, number] | null;
}

export interface RigMapOptions {
  manualMap?: Readonly<Record<string, string>>;
  allowFuzzy?: boolean;
  requireManualForOpaqueNames?: boolean;
}

export type LogicalAttachmentRole =
  | 'root'
  | 'torso'
  | 'head'
  | 'rightHand'
  | 'leftHand'
  | 'rightFoot'
  | 'leftFoot';

export interface AttachmentTransform {
  bone: string;
  parent: string | null;
  localPosition: [number, number, number];
  localQuaternion: [number, number, number, number];
  localScale: [number, number, number];
  worldPosition: [number, number, number];
  worldQuaternion: [number, number, number, number];
}

export type LogicalAttachmentMap = Record<LogicalAttachmentRole, AttachmentTransform>;

const CANONICAL_ALIASES: Record<CanonicalHumanoidBone, readonly string[]> = {
  hips: ['hips', 'hip', 'pelvis', 'root'],
  spine: ['spine', 'spine0', 'spine01'],
  spine1: ['spine1', 'spine02', 'midspine'],
  spine2: ['spine2', 'spine03', 'chest', 'upperchest'],
  neck: ['neck', 'neck1'],
  head: ['head'],
  leftShoulder: ['leftshoulder', 'lshoulder', 'shoulderl', 'leftclavicle', 'claviclel'],
  leftArm: ['leftarm', 'leftupperarm', 'lupperarm', 'upperarml'],
  leftForearm: ['leftforearm', 'leftlowerarm', 'lforearm', 'forearml', 'lowerarml'],
  leftHand: ['lefthand', 'lhand', 'handl', 'leftwrist', 'wristl'],
  rightShoulder: ['rightshoulder', 'rshoulder', 'shoulderr', 'rightclavicle', 'clavicler'],
  rightArm: ['rightarm', 'rightupperarm', 'rupperarm', 'upperarmr'],
  rightForearm: ['rightforearm', 'rightlowerarm', 'rforearm', 'forearmr', 'lowerarmr'],
  rightHand: ['righthand', 'rhand', 'handr', 'rightwrist', 'wristr'],
  leftUpLeg: ['leftupleg', 'leftthigh', 'lupleg', 'thighl', 'upperlegl'],
  leftLeg: ['leftleg', 'leftlowerleg', 'lleg', 'shinl', 'lowerlegl'],
  leftFoot: ['leftfoot', 'lfoot', 'footl'],
  leftToe: ['lefttoe', 'lefttoebase', 'ltoe', 'toel', 'toesl'],
  rightUpLeg: ['rightupleg', 'rightthigh', 'rupleg', 'thighr', 'upperlegr'],
  rightLeg: ['rightleg', 'rightlowerleg', 'rleg', 'shinr', 'lowerlegr'],
  rightFoot: ['rightfoot', 'rfoot', 'footr'],
  rightToe: ['righttoe', 'righttoebase', 'rtoe', 'toer', 'toesr'],
};

const ATTACHMENT_CANONICAL_PRIORITY: Record<LogicalAttachmentRole, readonly CanonicalHumanoidBone[]> = {
  root: ['hips'],
  torso: ['spine2', 'spine1', 'spine'],
  head: ['head', 'neck'],
  rightHand: ['rightHand', 'rightForearm', 'rightArm'],
  leftHand: ['leftHand', 'leftForearm', 'leftArm'],
  rightFoot: ['rightFoot', 'rightToe', 'rightLeg'],
  leftFoot: ['leftFoot', 'leftToe', 'leftLeg'],
};

export function normalizeRigBoneName(name: string): string {
  return name
    .toLocaleLowerCase('en-US')
    .replace(/mixamorig:?/g, '')
    .replace(/(?:^|[\s_.:|/-])(?:armature|skeleton|rig|def)(?=$|[\s_.:|/-])/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function canonicalRole(name: string): CanonicalHumanoidBone | null {
  const normalized = normalizeRigBoneName(name);
  for (const role of CANONICAL_HUMANOID_BONES) {
    if (CANONICAL_ALIASES[role].includes(normalized)) return role;
  }
  return null;
}

function isOpaqueBoneName(name: string): boolean {
  return /^(?:joint|bone|node)[\s_.:-]*\d+$/i.test(name.trim());
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function addDecision(
  decisions: RigMapDecision[],
  diagnostics: RigMapDiagnostic[],
  occupiedTargets: Set<string>,
  decision: RigMapDecision,
): boolean {
  if (occupiedTargets.has(decision.target)) {
    diagnostics.push({
      level: 'error',
      code: 'RIG_MAP_DUPLICATE_TARGET',
      message: `Target bone ${decision.target} would receive more than one source bone. Add an explicit non-colliding manual map.`,
      sourceBone: decision.source,
      targetBone: decision.target,
    });
    return false;
  }
  decisions.push(decision);
  occupiedTargets.add(decision.target);
  return true;
}

function boneWorldPosition(bone: THREE.Bone): THREE.Vector3 {
  bone.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
}

function findCanonicalBone(
  skeleton: THREE.Skeleton,
  role: CanonicalHumanoidBone,
): THREE.Bone | undefined {
  return skeleton.bones.find((bone) => canonicalRole(bone.name) === role);
}

function detectUpVector(
  skeleton: THREE.Skeleton,
  mapToTarget?: Readonly<Record<string, string>>,
  targetSkeleton?: THREE.Skeleton,
): THREE.Vector3 | null {
  let hips = findCanonicalBone(skeleton, 'hips');
  let head = findCanonicalBone(skeleton, 'head') ?? findCanonicalBone(skeleton, 'neck');

  if ((!hips || !head) && mapToTarget && targetSkeleton) {
    const targetHips = findCanonicalBone(targetSkeleton, 'hips')?.name;
    const targetHead = (findCanonicalBone(targetSkeleton, 'head') ?? findCanonicalBone(targetSkeleton, 'neck'))?.name;
    if (!hips && targetHips) {
      const sourceName = Object.keys(mapToTarget).find((name) => mapToTarget[name] === targetHips);
      hips = skeleton.bones.find((bone) => bone.name === sourceName);
    }
    if (!head && targetHead) {
      const sourceName = Object.keys(mapToTarget).find((name) => mapToTarget[name] === targetHead);
      head = skeleton.bones.find((bone) => bone.name === sourceName);
    }
  }

  if (!hips || !head) return null;
  const direction = boneWorldPosition(head).sub(boneWorldPosition(hips));
  return direction.lengthSq() > 1e-12 ? direction.normalize() : null;
}

function axisCorrection(sourceUp: THREE.Vector3 | null, targetUp: THREE.Vector3 | null): THREE.Quaternion | null {
  if (!sourceUp || !targetUp) return null;
  const dot = THREE.MathUtils.clamp(sourceUp.dot(targetUp), -1, 1);
  if (dot > 0.999999) return new THREE.Quaternion();
  if (dot < -0.999999) {
    const fallback = Math.abs(sourceUp.x) < 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 0, 1);
    return new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3().crossVectors(sourceUp, fallback).normalize(),
      Math.PI,
    );
  }
  return new THREE.Quaternion().setFromUnitVectors(sourceUp, targetUp).normalize();
}

const LATERAL_ROLE_PAIRS: ReadonlyArray<readonly [CanonicalHumanoidBone, CanonicalHumanoidBone]> = [
  ['rightHand', 'leftHand'],
  ['rightArm', 'leftArm'],
  ['rightShoulder', 'leftShoulder'],
  ['rightFoot', 'leftFoot'],
  ['rightUpLeg', 'leftUpLeg'],
];

function mappedBoneForRole(
  skeleton: THREE.Skeleton,
  decisions: readonly RigMapDecision[],
  role: CanonicalHumanoidBone,
  side: 'source' | 'target',
): THREE.Bone | undefined {
  const decision = decisions.find((candidate) => candidate.canonical === role);
  const name = decision?.[side];
  return name ? skeleton.bones.find((bone) => bone.name === name) : findCanonicalBone(skeleton, role);
}

function detectLateralVector(
  skeleton: THREE.Skeleton,
  decisions: readonly RigMapDecision[],
  side: 'source' | 'target',
  up: THREE.Vector3 | null,
): THREE.Vector3 | null {
  if (!up) return null;
  const sum = new THREE.Vector3();
  let count = 0;
  for (const [rightRole, leftRole] of LATERAL_ROLE_PAIRS) {
    const right = mappedBoneForRole(skeleton, decisions, rightRole, side);
    const left = mappedBoneForRole(skeleton, decisions, leftRole, side);
    if (!right || !left) continue;
    const lateral = boneWorldPosition(right).sub(boneWorldPosition(left));
    lateral.addScaledVector(up, -lateral.dot(up));
    if (lateral.lengthSq() <= 1e-12) continue;
    sum.add(lateral.normalize());
    count += 1;
  }
  return count > 0 && sum.lengthSq() > 1e-12 ? sum.normalize() : null;
}

function fullOrientationCorrection(
  sourceUp: THREE.Vector3 | null,
  targetUp: THREE.Vector3 | null,
  sourceLateral: THREE.Vector3 | null,
  targetLateral: THREE.Vector3 | null,
): THREE.Quaternion | null {
  const up = axisCorrection(sourceUp, targetUp);
  if (!up || !targetUp || !sourceLateral || !targetLateral) return up;
  const alignedSource = sourceLateral.clone().applyQuaternion(up);
  alignedSource.addScaledVector(targetUp, -alignedSource.dot(targetUp));
  const target = targetLateral.clone().addScaledVector(targetUp, -targetLateral.dot(targetUp));
  if (alignedSource.lengthSq() <= 1e-12 || target.lengthSq() <= 1e-12) return up;
  alignedSource.normalize();
  target.normalize();
  const angle = Math.atan2(
    targetUp.dot(new THREE.Vector3().crossVectors(alignedSource, target)),
    THREE.MathUtils.clamp(alignedSource.dot(target), -1, 1),
  );
  const twist = new THREE.Quaternion().setFromAxisAngle(targetUp, angle);
  return twist.multiply(up).normalize();
}

export function buildRigMap(
  source: THREE.Skeleton,
  target: THREE.Skeleton,
  options: RigMapOptions = {},
): RigMapResult {
  source.bones[0]?.updateWorldMatrix(true, true);
  target.bones[0]?.updateWorldMatrix(true, true);
  const diagnostics: RigMapDiagnostic[] = [];
  const decisions: RigMapDecision[] = [];
  const occupiedTargets = new Set<string>();
  const sourceByName = new Map(source.bones.map((bone) => [bone.name, bone]));
  const targetByName = new Map(target.bones.map((bone) => [bone.name, bone]));
  const manualMap = options.manualMap ?? {};

  for (const [sourceName, targetName] of Object.entries(manualMap)) {
    if (!sourceByName.has(sourceName)) {
      diagnostics.push({
        level: 'error',
        code: 'RIG_MAP_MANUAL_SOURCE_MISSING',
        message: `Manual source bone ${sourceName} does not exist.`,
        sourceBone: sourceName,
        targetBone: targetName,
      });
      continue;
    }
    if (!targetByName.has(targetName)) {
      diagnostics.push({
        level: 'error',
        code: 'RIG_MAP_MANUAL_TARGET_MISSING',
        message: `Manual target bone ${targetName} does not exist.`,
        sourceBone: sourceName,
        targetBone: targetName,
      });
      continue;
    }
    addDecision(decisions, diagnostics, occupiedTargets, {
      source: sourceName,
      target: targetName,
      canonical: canonicalRole(targetName) ?? undefined,
      method: 'manual',
      confidence: 1,
    });
  }

  const mappedSources = new Set(decisions.map((decision) => decision.source));
  const opaqueUnmapped = source.bones.filter((bone) => isOpaqueBoneName(bone.name) && !mappedSources.has(bone.name));
  if ((options.requireManualForOpaqueNames ?? true) && opaqueUnmapped.length > 0 && Object.keys(manualMap).length === 0) {
    diagnostics.push({
      level: 'error',
      code: 'RIG_MAP_OPAQUE_REQUIRES_MANUAL',
      message: 'Opaque/numeric rigs require an explicit source-to-target manual map; automatic name matching is disabled for them.',
    });
  } else {
    opaqueUnmapped.forEach((bone) => diagnostics.push({
      level: 'warning',
      code: 'RIG_MAP_OPAQUE_UNMAPPED',
      message: `Opaque bone ${bone.name} is not a direct target; its transforms still contribute through mapped descendants.`,
      sourceBone: bone.name,
    }));
  }

  const targetByCanonical = new Map<CanonicalHumanoidBone, THREE.Bone>();
  for (const targetBone of target.bones) {
    const role = canonicalRole(targetBone.name);
    if (role && !targetByCanonical.has(role)) targetByCanonical.set(role, targetBone);
  }

  for (const sourceBone of source.bones) {
    if (mappedSources.has(sourceBone.name) || isOpaqueBoneName(sourceBone.name)) continue;
    const role = canonicalRole(sourceBone.name);
    const targetBone = role ? targetByCanonical.get(role) : undefined;
    if (!role || !targetBone || occupiedTargets.has(targetBone.name)) continue;
    if (addDecision(decisions, diagnostics, occupiedTargets, {
      source: sourceBone.name,
      target: targetBone.name,
      canonical: role,
      method: 'canonical',
      confidence: 1,
    })) mappedSources.add(sourceBone.name);
  }

  for (const sourceBone of source.bones) {
    if (mappedSources.has(sourceBone.name) || isOpaqueBoneName(sourceBone.name)) continue;
    const normalized = normalizeRigBoneName(sourceBone.name);
    const candidates = target.bones.filter((bone) => (
      !occupiedTargets.has(bone.name) && normalizeRigBoneName(bone.name) === normalized
    ));
    if (candidates.length === 1) {
      addDecision(decisions, diagnostics, occupiedTargets, {
        source: sourceBone.name,
        target: candidates[0].name,
        method: 'normalized',
        confidence: 0.98,
      });
      mappedSources.add(sourceBone.name);
    } else if (candidates.length > 1) {
      diagnostics.push({
        level: 'error',
        code: 'RIG_MAP_NORMALIZED_AMBIGUOUS',
        message: `Normalized name ${normalized} matches multiple target bones.`,
        sourceBone: sourceBone.name,
      });
    }
  }

  if (options.allowFuzzy ?? true) {
    for (const sourceBone of source.bones) {
      if (mappedSources.has(sourceBone.name) || isOpaqueBoneName(sourceBone.name)) continue;
      const normalized = normalizeRigBoneName(sourceBone.name);
      if (!normalized) continue;
      const sourceCanonical = canonicalRole(sourceBone.name);
      const candidates = target.bones
        .filter((bone) => !occupiedTargets.has(bone.name))
        .map((bone) => ({
          bone,
          distance: levenshtein(normalized, normalizeRigBoneName(bone.name)),
          canonical: canonicalRole(bone.name),
        }))
        .filter((candidate) => !sourceCanonical || !candidate.canonical || sourceCanonical === candidate.canonical)
        .sort((left, right) => left.distance - right.distance || left.bone.name.localeCompare(right.bone.name));
      const best = candidates[0];
      const next = candidates[1];
      const limit = Math.max(1, Math.floor(normalized.length * 0.25));
      if (!best || best.distance > limit || (next && next.distance === best.distance)) continue;
      const confidence = Math.max(0.5, 1 - best.distance / Math.max(normalized.length, 1));
      addDecision(decisions, diagnostics, occupiedTargets, {
        source: sourceBone.name,
        target: best.bone.name,
        canonical: sourceCanonical ?? undefined,
        method: 'fuzzy',
        confidence,
      });
      mappedSources.add(sourceBone.name);
      diagnostics.push({
        level: 'warning',
        code: 'RIG_MAP_FUZZY_MATCH',
        message: `Fuzzy-mapped ${sourceBone.name} to ${best.bone.name} at confidence ${confidence.toFixed(2)}. Review before export.`,
        sourceBone: sourceBone.name,
        targetBone: best.bone.name,
      });
    }
  }

  for (const sourceBone of source.bones) {
    if (mappedSources.has(sourceBone.name) || isOpaqueBoneName(sourceBone.name)) continue;
    diagnostics.push({
      level: 'warning',
      code: 'RIG_MAP_UNMATCHED_SOURCE',
      message: `Source bone ${sourceBone.name} is unmatched and its tracks will be discarded.`,
      sourceBone: sourceBone.name,
    });
  }

  const map = Object.fromEntries(decisions.map((decision) => [decision.source, decision.target]));
  const sourceUpVector = detectUpVector(source, map, target);
  const targetUpVector = detectUpVector(target);
  const correction = axisCorrection(sourceUpVector, targetUpVector);
  const sourceLateral = detectLateralVector(source, decisions, 'source', sourceUpVector);
  const targetLateral = detectLateralVector(target, decisions, 'target', targetUpVector);
  const orientationCorrection = fullOrientationCorrection(
    sourceUpVector,
    targetUpVector,
    sourceLateral,
    targetLateral,
  );
  if (!sourceUpVector || !targetUpVector) {
    diagnostics.push({
      level: 'warning',
      code: 'RIG_MAP_UP_AXIS_UNRESOLVED',
      message: 'Hip-to-head direction could not be resolved on both rigs; no automatic up-axis correction is safe.',
    });
  }
  if (correction && orientationCorrection && sourceLateral && targetLateral) {
    const twistAngle = correction.angleTo(orientationCorrection);
    if (twistAngle > 1e-4) diagnostics.push({
      level: 'info',
      code: 'RIG_MAP_LATERAL_TWIST',
      message: `Aligned mapped anatomical sides with a ${THREE.MathUtils.radToDeg(twistAngle).toFixed(1)} degree twist around the target up axis.`,
    });
  }

  if (decisions.length === 0) {
    diagnostics.push({
      level: 'error',
      code: 'RIG_MAP_EMPTY',
      message: 'No compatible bone mappings were resolved.',
    });
  }

  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.level === 'error'),
    map,
    decisions,
    diagnostics,
    sourceUp: sourceUpVector ? sourceUpVector.toArray() : null,
    targetUp: targetUpVector ? targetUpVector.toArray() : null,
    upCorrection: correction ? correction.toArray() : null,
    sourceLateral: sourceLateral ? sourceLateral.toArray() : null,
    targetLateral: targetLateral ? targetLateral.toArray() : null,
    orientationCorrection: orientationCorrection ? orientationCorrection.toArray() : null,
  };
}

export function resolveLogicalAttachments(
  skeleton: THREE.Skeleton,
  overrides: Partial<Record<LogicalAttachmentRole, string>> = {},
): LogicalAttachmentMap {
  const result = {} as LogicalAttachmentMap;
  const roles = Object.keys(ATTACHMENT_CANONICAL_PRIORITY) as LogicalAttachmentRole[];
  const bonesByName = new Map(skeleton.bones.map((bone) => [bone.name, bone]));
  skeleton.bones[0]?.updateWorldMatrix(true, true);

  for (const role of roles) {
    const override = overrides[role];
    const bone = override
      ? bonesByName.get(override)
      : ATTACHMENT_CANONICAL_PRIORITY[role]
        .map((canonical) => findCanonicalBone(skeleton, canonical))
        .find((candidate): candidate is THREE.Bone => !!candidate);
    if (!bone) {
      throw new Error(`Attachment role ${role} could not be resolved; provide an explicit target bone name.`);
    }
    bone.updateWorldMatrix(true, false);
    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    bone.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
    result[role] = {
      bone: bone.name,
      parent: bone.parent instanceof THREE.Bone ? bone.parent.name : null,
      localPosition: bone.position.toArray(),
      localQuaternion: bone.quaternion.toArray(),
      localScale: bone.scale.toArray(),
      worldPosition: worldPosition.toArray(),
      worldQuaternion: worldQuaternion.toArray(),
    };
  }
  return result;
}
