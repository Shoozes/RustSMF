import * as THREE from 'three';

export const RIG_IK_CHAIN_LENGTHS = [1, 2, 3, 4, 5, 6] as const;
export const RIG_IK_ITERATION_OPTIONS = [8, 16, 32, 64] as const;
export const RIG_IK_TOLERANCE_OPTIONS = [0.001, 0.01, 0.05, 0.1] as const;
export const RIG_IK_MAX_ANGLE_OPTIONS = [30, 60, 90, 120, 180] as const;

export type RigIkPoleAxis = 'none' | 'x' | '-x' | 'y' | '-y' | 'z' | '-z';

export interface RigIkSettings {
  chainLength: number;
  maxIterations: number;
  tolerance: number;
  maxJointAngleDegrees: number;
  poleAxis: RigIkPoleAxis;
}

export const DEFAULT_RIG_IK_SETTINGS: RigIkSettings = {
  chainLength: 2,
  maxIterations: 32,
  tolerance: 0.01,
  maxJointAngleDegrees: 120,
  poleAxis: 'z',
};

export type RigIkSessionFailureReason =
  | 'missing-skeleton'
  | 'missing-end-effector'
  | 'insufficient-chain'
  | 'zero-reach';

export type RigIkSolveStatus =
  | 'reached'
  | 'unreachable'
  | 'constrained'
  | 'iteration-limit'
  | 'stale-chain'
  | 'invalid-target';

interface RigIkJointReference {
  bone: THREE.Bone;
  solverBone: THREE.Bone;
  parent: THREE.Object3D | null;
  localQuaternion: THREE.Quaternion;
}

export interface RigIkSession {
  endEffector: THREE.Bone;
  chain: THREE.Bone[];
  solverAnchor: THREE.Object3D;
  solverChain: THREE.Bone[];
  joints: RigIkJointReference[];
  segmentLocalLengths: number[];
  maxReach: number;
}

export type CreateRigIkSessionResult =
  | { ok: true; session: RigIkSession }
  | { ok: false; reason: RigIkSessionFailureReason; message: string };

export interface RigIkSolveResult {
  status: RigIkSolveStatus;
  chainNames: string[];
  changedBoneNames: string[];
  iterations: number;
  distanceToTarget: number;
  maxReach: number;
  jointLimitApplied: boolean;
  poleApplied: boolean;
}

const EPSILON = 1e-8;

const finiteVector = (value: THREE.Vector3): boolean => (
  Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)
);

const closestOption = (value: number, options: readonly number[], fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return options.reduce((best, option) => (
    Math.abs(option - value) < Math.abs(best - value) ? option : best
  ), fallback);
};

export function normalizeRigIkSettings(settings: Partial<RigIkSettings>): RigIkSettings {
  const poleAxis: RigIkPoleAxis = ['none', 'x', '-x', 'y', '-y', 'z', '-z'].includes(settings.poleAxis ?? '')
    ? settings.poleAxis as RigIkPoleAxis
    : DEFAULT_RIG_IK_SETTINGS.poleAxis;
  return {
    chainLength: closestOption(
      settings.chainLength ?? DEFAULT_RIG_IK_SETTINGS.chainLength,
      RIG_IK_CHAIN_LENGTHS,
      DEFAULT_RIG_IK_SETTINGS.chainLength,
    ),
    maxIterations: closestOption(
      settings.maxIterations ?? DEFAULT_RIG_IK_SETTINGS.maxIterations,
      RIG_IK_ITERATION_OPTIONS,
      DEFAULT_RIG_IK_SETTINGS.maxIterations,
    ),
    tolerance: closestOption(
      settings.tolerance ?? DEFAULT_RIG_IK_SETTINGS.tolerance,
      RIG_IK_TOLERANCE_OPTIONS,
      DEFAULT_RIG_IK_SETTINGS.tolerance,
    ),
    maxJointAngleDegrees: closestOption(
      settings.maxJointAngleDegrees ?? DEFAULT_RIG_IK_SETTINGS.maxJointAngleDegrees,
      RIG_IK_MAX_ANGLE_OPTIONS,
      DEFAULT_RIG_IK_SETTINGS.maxJointAngleDegrees,
    ),
    poleAxis,
  };
}

export function createRigIkSession(
  skeleton: THREE.Skeleton | null | undefined,
  endEffectorName: string,
  requestedChainLength: number,
): CreateRigIkSessionResult {
  if (!skeleton) {
    return { ok: false, reason: 'missing-skeleton', message: 'Load a skinned model before using IK.' };
  }
  const endEffector = skeleton.bones.find((bone) => bone.name === endEffectorName);
  if (!endEffector) {
    return { ok: false, reason: 'missing-end-effector', message: 'Select a deform bone as the IK end effector.' };
  }

  const chainLength = Math.max(1, Math.floor(requestedChainLength));
  const ancestors: THREE.Bone[] = [];
  let cursor = endEffector.parent;
  while (cursor && (cursor as THREE.Bone).isBone === true && ancestors.length < chainLength) {
    ancestors.push(cursor as THREE.Bone);
    cursor = cursor.parent;
  }
  if (ancestors.length !== chainLength) {
    return {
      ok: false,
      reason: 'insufficient-chain',
      message: `${endEffectorName} needs ${chainLength} deform ancestor${chainLength === 1 ? '' : 's'} for this IK chain.`,
    };
  }

  const chain = [...ancestors].reverse().concat(endEffector);
  chain[0].updateWorldMatrix(true, true);
  const solverAnchor = new THREE.Object3D();
  const solverChain = chain.map((bone) => {
    const solverBone = new THREE.Bone();
    solverBone.name = bone.name;
    solverBone.position.copy(bone.position);
    solverBone.quaternion.copy(bone.quaternion);
    solverBone.scale.copy(bone.scale);
    solverBone.updateMatrix();
    return solverBone;
  });
  solverAnchor.add(solverChain[0]);
  for (let index = 1; index < solverChain.length; index += 1) {
    solverChain[index - 1].add(solverChain[index]);
  }
  const externalParent = chain[0].parent;
  if (externalParent) {
    externalParent.updateWorldMatrix(true, false);
    externalParent.matrixWorld.decompose(solverAnchor.position, solverAnchor.quaternion, solverAnchor.scale);
  }
  solverAnchor.updateMatrixWorld(true);
  const worldPositions = chain.map((bone) => bone.getWorldPosition(new THREE.Vector3()));
  const segmentLocalLengths = chain.slice(1).map((bone) => bone.position.length());
  const maxReach = worldPositions.slice(1).reduce((total, position, index) => (
    total + position.distanceTo(worldPositions[index])
  ), 0);
  if (!Number.isFinite(maxReach) || maxReach <= EPSILON) {
    return { ok: false, reason: 'zero-reach', message: 'The selected IK chain has no usable reach.' };
  }

  return {
    ok: true,
    session: {
      endEffector,
      chain,
      solverAnchor,
      solverChain,
      joints: chain.slice(0, -1).map((bone) => ({
        bone,
        solverBone: solverChain[chain.indexOf(bone)],
        parent: bone.parent,
        localQuaternion: bone.quaternion.clone(),
      })),
      segmentLocalLengths,
      maxReach,
    },
  };
}

function syncRigIkSolverChain(session: RigIkSession): void {
  const externalParent = session.chain[0].parent;
  if (externalParent) {
    externalParent.updateWorldMatrix(true, false);
    externalParent.matrixWorld.decompose(
      session.solverAnchor.position,
      session.solverAnchor.quaternion,
      session.solverAnchor.scale,
    );
  } else {
    session.solverAnchor.position.set(0, 0, 0);
    session.solverAnchor.quaternion.identity();
    session.solverAnchor.scale.set(1, 1, 1);
  }
  session.chain.forEach((bone, index) => {
    const solverBone = session.solverChain[index];
    solverBone.position.copy(bone.position);
    solverBone.quaternion.copy(bone.quaternion);
    solverBone.scale.copy(bone.scale);
    solverBone.updateMatrix();
  });
  session.solverAnchor.updateMatrixWorld(true);
}

export function isRigIkSessionCurrent(
  skeleton: THREE.Skeleton,
  session: RigIkSession,
): boolean {
  if (!skeleton.bones.includes(session.endEffector)) return false;
  for (let index = 0; index < session.chain.length - 1; index += 1) {
    const parent = session.chain[index];
    const child = session.chain[index + 1];
    if (!skeleton.bones.includes(parent) || child.parent !== parent) return false;
  }
  return session.joints.every((joint) => joint.bone.parent === joint.parent);
}

function setLocalQuaternionFromWorld(
  bone: THREE.Bone,
  worldQuaternion: THREE.Quaternion,
): void {
  if (!bone.parent) {
    bone.quaternion.copy(worldQuaternion).normalize();
    return;
  }
  const parentWorld = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parentWorld.invert().multiply(worldQuaternion)).normalize();
}

function clampJointQuaternion(
  candidate: THREE.Quaternion,
  reference: THREE.Quaternion,
  maxAngleRadians: number,
): { quaternion: THREE.Quaternion; constrained: boolean } {
  const angle = reference.angleTo(candidate);
  if (!Number.isFinite(angle) || angle <= maxAngleRadians + EPSILON) {
    return { quaternion: candidate, constrained: false };
  }
  const ratio = Math.max(0, Math.min(1, maxAngleRadians / angle));
  return {
    quaternion: reference.clone().slerp(candidate, ratio).normalize(),
    constrained: true,
  };
}

function poleDirection(axis: RigIkPoleAxis): THREE.Vector3 | null {
  if (axis === 'none') return null;
  if (axis === 'x') return new THREE.Vector3(1, 0, 0);
  if (axis === '-x') return new THREE.Vector3(-1, 0, 0);
  if (axis === 'y') return new THREE.Vector3(0, 1, 0);
  if (axis === '-y') return new THREE.Vector3(0, -1, 0);
  if (axis === 'z') return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(0, 0, -1);
}

function applyPoleConstraint(
  session: RigIkSession,
  poleAxis: RigIkPoleAxis,
  maxAngleRadians: number,
): { applied: boolean; constrained: boolean } {
  const direction = poleDirection(poleAxis);
  if (!direction || session.chain.length < 3) return { applied: false, constrained: false };

  const rootJoint = session.joints[0];
  const rootPosition = rootJoint.solverBone.getWorldPosition(new THREE.Vector3());
  const solverEndEffector = session.solverChain.at(-1)!;
  const endPosition = solverEndEffector.getWorldPosition(new THREE.Vector3());
  const axis = endPosition.sub(rootPosition);
  if (axis.lengthSq() <= EPSILON) return { applied: false, constrained: false };
  axis.normalize();

  const middleBone = session.solverChain[Math.floor((session.solverChain.length - 1) / 2)];
  const middleDirection = middleBone.getWorldPosition(new THREE.Vector3()).sub(rootPosition);
  const projectedMiddle = middleDirection.addScaledVector(axis, -middleDirection.dot(axis));
  const projectedPole = direction.addScaledVector(axis, -direction.dot(axis));
  if (projectedMiddle.lengthSq() <= EPSILON || projectedPole.lengthSq() <= EPSILON) {
    return { applied: false, constrained: false };
  }
  projectedMiddle.normalize();
  projectedPole.normalize();
  const signedAngle = Math.atan2(
    new THREE.Vector3().crossVectors(projectedMiddle, projectedPole).dot(axis),
    projectedMiddle.dot(projectedPole),
  );
  if (!Number.isFinite(signedAngle) || Math.abs(signedAngle) <= 1e-6) {
    return { applied: false, constrained: false };
  }

  const worldQuaternion = rootJoint.solverBone.getWorldQuaternion(new THREE.Quaternion());
  const rotatedWorld = new THREE.Quaternion().setFromAxisAngle(axis, signedAngle).multiply(worldQuaternion);
  setLocalQuaternionFromWorld(rootJoint.solverBone, rotatedWorld);
  const clamped = clampJointQuaternion(rootJoint.solverBone.quaternion, rootJoint.localQuaternion, maxAngleRadians);
  rootJoint.solverBone.quaternion.copy(clamped.quaternion);
  rootJoint.solverBone.updateMatrix();
  rootJoint.solverBone.updateMatrixWorld(true);
  return { applied: true, constrained: clamped.constrained };
}

export function solveRigIk(
  skeleton: THREE.Skeleton,
  session: RigIkSession,
  targetWorld: THREE.Vector3,
  rawSettings: Partial<RigIkSettings> = {},
): RigIkSolveResult {
  const settings = normalizeRigIkSettings(rawSettings);
  const chainNames = session.chain.map((bone) => bone.name);
  const baseResult = {
    chainNames,
    changedBoneNames: [] as string[],
    iterations: 0,
    distanceToTarget: Number.POSITIVE_INFINITY,
    maxReach: session.maxReach,
    jointLimitApplied: false,
    poleApplied: false,
  };
  if (!finiteVector(targetWorld)) {
    return { ...baseResult, status: 'invalid-target' };
  }
  if (!isRigIkSessionCurrent(skeleton, session)) {
    return { ...baseResult, status: 'stale-chain' };
  }

  syncRigIkSolverChain(session);
  const beforeQuaternions = new Map(session.joints.map((joint) => [joint.bone, joint.bone.quaternion.clone()]));
  const solverEndEffector = session.solverChain.at(-1)!;
  const rootPosition = session.solverChain[0].getWorldPosition(new THREE.Vector3());
  const targetDistanceFromRoot = rootPosition.distanceTo(targetWorld);
  const unreachable = targetDistanceFromRoot > session.maxReach + settings.tolerance;
  const effectiveTarget = targetWorld.clone();
  if (unreachable) {
    effectiveTarget.sub(rootPosition).setLength(session.maxReach).add(rootPosition);
  }

  const maxAngleRadians = THREE.MathUtils.degToRad(settings.maxJointAngleDegrees);
  let iterations = 0;
  let jointLimitApplied = false;
  if (unreachable) {
    const reachDirection = targetWorld.clone().sub(rootPosition).normalize();
    for (let jointIndex = 0; jointIndex < session.joints.length; jointIndex += 1) {
      const joint = session.joints[jointIndex];
      const child = session.solverChain[jointIndex + 1];
      const jointPosition = joint.solverBone.getWorldPosition(new THREE.Vector3());
      const segmentDirection = child.getWorldPosition(new THREE.Vector3()).sub(jointPosition);
      if (segmentDirection.lengthSq() <= EPSILON) continue;
      const deltaWorld = new THREE.Quaternion().setFromUnitVectors(segmentDirection.normalize(), reachDirection);
      const currentWorld = joint.solverBone.getWorldQuaternion(new THREE.Quaternion());
      setLocalQuaternionFromWorld(joint.solverBone, deltaWorld.multiply(currentWorld));
      const clamped = clampJointQuaternion(joint.solverBone.quaternion, joint.localQuaternion, maxAngleRadians);
      joint.solverBone.quaternion.copy(clamped.quaternion);
      jointLimitApplied ||= clamped.constrained;
      joint.solverBone.updateMatrix();
      joint.solverBone.updateMatrixWorld(true);
    }
  }
  for (let iteration = 0; iteration < settings.maxIterations; iteration += 1) {
    iterations = iteration + 1;
    for (let jointIndex = session.joints.length - 1; jointIndex >= 0; jointIndex -= 1) {
      const joint = session.joints[jointIndex];
      const jointPosition = joint.solverBone.getWorldPosition(new THREE.Vector3());
      const effectorVector = solverEndEffector.getWorldPosition(new THREE.Vector3()).sub(jointPosition);
      const targetVector = effectiveTarget.clone().sub(jointPosition);
      if (effectorVector.lengthSq() <= EPSILON || targetVector.lengthSq() <= EPSILON) continue;

      const deltaWorld = new THREE.Quaternion().setFromUnitVectors(
        effectorVector.normalize(),
        targetVector.normalize(),
      );
      const currentWorld = joint.solverBone.getWorldQuaternion(new THREE.Quaternion());
      setLocalQuaternionFromWorld(joint.solverBone, deltaWorld.multiply(currentWorld));
      const clamped = clampJointQuaternion(joint.solverBone.quaternion, joint.localQuaternion, maxAngleRadians);
      joint.solverBone.quaternion.copy(clamped.quaternion);
      jointLimitApplied ||= clamped.constrained;
      joint.solverBone.updateMatrix();
      joint.solverBone.updateMatrixWorld(true);
    }

    const distance = solverEndEffector.getWorldPosition(new THREE.Vector3()).distanceTo(effectiveTarget);
    if (distance <= settings.tolerance) break;
  }

  const pole = applyPoleConstraint(session, settings.poleAxis, maxAngleRadians);
  jointLimitApplied ||= pole.constrained;
  session.joints.forEach((joint) => {
    joint.bone.quaternion.copy(joint.solverBone.quaternion);
    joint.bone.updateMatrix();
  });
  session.chain[0].updateWorldMatrix(true, true);
  skeleton.update();
  const distanceToTarget = solverEndEffector.getWorldPosition(new THREE.Vector3()).distanceTo(targetWorld);
  const changedBoneNames = session.joints
    .filter((joint) => (beforeQuaternions.get(joint.bone)?.angleTo(joint.bone.quaternion) ?? 0) > 1e-7)
    .map((joint) => joint.bone.name);

  let status: RigIkSolveStatus;
  if (unreachable) {
    status = 'unreachable';
  } else if (distanceToTarget <= settings.tolerance) {
    status = 'reached';
  } else if (jointLimitApplied) {
    status = 'constrained';
  } else {
    status = 'iteration-limit';
  }
  return {
    status,
    chainNames,
    changedBoneNames,
    iterations,
    distanceToTarget,
    maxReach: session.maxReach,
    jointLimitApplied,
    poleApplied: pole.applied,
  };
}

export function rigIkLocalLengthsUnchanged(session: RigIkSession, epsilon = 1e-7): boolean {
  const current = session.chain.slice(1).map((bone) => bone.position.length());
  return current.every((length, index) => Math.abs(length - session.segmentLocalLengths[index]) <= epsilon);
}
