import * as THREE from 'three';

const EPSILON = 1e-10;

export type NaturalFootSide = 'left' | 'right';

export interface NaturalTorsoProfile {
  targetBones: string[];
  weights?: number[];
}

export interface NaturalLegProfile {
  hip: string;
  knee: string;
  ankle: string;
  /** Calibrated ankle-local point on the target mesh's sole. */
  soleOffset: [number, number, number];
  /** Stable knee-pole direction in target-reference pelvis-local space. */
  pole: [number, number, number];
  minBendDegrees: number;
  maxBendDegrees: number;
  maxPelvisCorrection: number;
}

export interface NaturalFootContact {
  foot: NaturalFootSide;
  /** Plane follows horizontal motion; planted (the default) locks a world point. */
  positionMode?: 'planted' | 'plane';
  /** Preserve animated yaw while leveling the sole; a plant captures its entry heading. */
  orientationMode?: 'reference' | 'animated-heading';
  /** Inclusive 60 Hz frame index. */
  startFrame: number;
  /** Inclusive 60 Hz frame index. */
  endFrame: number;
  /** Frames used for each linear lock/unlock ramp; zero means a hard lock. */
  blendFrames: number;
  /** Optional asymmetric ramps; omission retains the symmetric blendFrames. */
  blendInFrames?: number;
  blendOutFrames?: number;
  /** Terminal planted interval continues into the same foot's opening interval. */
  wrapToStart?: boolean;
}

export interface NaturalLegMotionLimits {
  /** Maximum forward hip-to-ankle angle measured from target-pelvis local down. */
  maximumForwardDegrees: number;
  /** Maximum backward hip-to-ankle angle measured from target-pelvis local down. */
  maximumBackwardDegrees: number;
  /** Symmetric sideways hip-to-ankle angle measured from target-pelvis local down. */
  maximumLateralDegrees: number;
  /** Lower knee-bend bound applied away from planted-foot contact. */
  minimumSwingBendDegrees: number;
}

export interface NaturalGrounding {
  /** Scale model-forward ankle reach while retaining height and lateral stance. */
  strideScale: number;
  rootHeightOffset: number;
  groundHeight: number;
}

export interface NaturalMotionProfile {
  /** Animated retains transferred axial twist and uses the source knee plane. */
  legOrientation?: 'calibrated' | 'animated';
  grounding?: Record<string, NaturalGrounding>;
  /** Explicit anatomical calibration; omission preserves legacy reach ratios. */
  reachTransfer?: 'reference-ratio' | 'calibrated-bend';
  torso?: NaturalTorsoProfile;
  legs: Record<NaturalFootSide, NaturalLegProfile>;
  contacts?: Record<string, NaturalFootContact[]>;
  /** Receiving-game root travel, in model-space meters per 60 Hz frame. */
  rootTravelPerFrame?: Record<string, [number, number, number]>;
  /** Optional clip-specific limits for proportion-sensitive locomotion strides. */
  legMotionLimits?: Record<string, NaturalLegMotionLimits>;
}

/** Reference-anchored flexion mapping; avoids reach-ratio saturation on longer rigs. */
export function calibratedNaturalBend(source: number, sourceReference: number, targetReference: number): number {
  if (![source, sourceReference, targetReference].every(v => Number.isFinite(v) && v >= 0 && v <= Math.PI)) {
    throw new Error('Natural bend calibration requires finite angles in [0, pi].');
  }
  if (sourceReference < EPSILON || Math.PI - sourceReference < EPSILON) {
    throw new Error('Natural bend calibration requires a nondegenerate source reference.');
  }
  return source <= sourceReference
    ? targetReference * source / sourceReference
    : targetReference + (Math.PI - targetReference) * (source - sourceReference) / (Math.PI - sourceReference);
}

export interface NaturalLegDirectionLimitResult {
  direction: THREE.Vector3;
  constrained: boolean;
  requestedSagittalDegrees: number;
  requestedLateralDegrees: number;
  solvedSagittalDegrees: number;
  solvedLateralDegrees: number;
}

export interface NaturalLegSolveResult {
  knee: THREE.Vector3;
  ankle: THREE.Vector3;
  bendDegrees: number;
  requestedReach: number;
  solvedReach: number;
  residual: number;
  clamped: boolean;
  bendPlaneNormal: THREE.Vector3;
}

export interface NaturalContactDiagnostic extends NaturalFootContact {
  clip: string;
  fullWeightStartFrame: number;
  fullWeightEndFrame: number;
  maximumResidual: number;
  maximumResidualFrame: number | null;
  maximumPelvisCorrection: number;
  maximumPelvisCorrectionFrame: number | null;
  clampedSamples: number;
  unreachable: boolean;
  rootTravelPerFrame: [number, number, number];
}

export interface NaturalMotionReport {
  contactSpace: 'model';
  torso: {
    targetBones: string[];
    effectiveWeights: number[];
  } | null;
  legs: Record<NaturalFootSide, {
    hip: string;
    knee: string;
    ankle: string;
    soleOffsetAnkleLocal: [number, number, number];
    referenceSolePoint: [number, number, number];
    referenceFootQuaternion: [number, number, number, number];
    polePelvisLocal: [number, number, number];
    referenceBendPlaneNormal: [number, number, number];
    minimumBendDegrees: number;
    maximumBendDegrees: number;
  }>;
  contacts: NaturalContactDiagnostic[];
  legMotionLimit: (NaturalLegMotionLimits & {
    sides: Record<NaturalFootSide, {
      constrainedSamples: number;
      maximumRequestedForwardDegrees: number;
      maximumRequestedBackwardDegrees: number;
      maximumRequestedLateralDegrees: number;
    }>;
  }) | null;
}

export function limitNaturalLegDirection(
  pelvisLocalDirection: THREE.Vector3,
  limits: NaturalLegMotionLimits,
  weight = 1,
): NaturalLegDirectionLimitResult {
  if (![pelvisLocalDirection.x, pelvisLocalDirection.y, pelvisLocalDirection.z, weight]
    .every(Number.isFinite) || pelvisLocalDirection.lengthSq() <= EPSILON) {
    throw new Error('Natural leg direction limit inputs must be finite and non-zero.');
  }
  const maximumAngles = [
    limits.maximumForwardDegrees,
    limits.maximumBackwardDegrees,
    limits.maximumLateralDegrees,
  ];
  if (maximumAngles.some((angle) => !Number.isFinite(angle) || angle < 0 || angle >= 90)) {
    throw new Error('Natural leg direction limits must be finite angles from 0 up to, but not including, 90 degrees.');
  }
  const direction = pelvisLocalDirection.clone().normalize();
  const down = -direction.y;
  const requestedSagittalDegrees = THREE.MathUtils.radToDeg(Math.atan2(direction.z, down));
  const requestedLateralDegrees = THREE.MathUtils.radToDeg(Math.atan2(direction.x, down));
  const solvedSagittalDegrees = THREE.MathUtils.clamp(
    requestedSagittalDegrees,
    -limits.maximumBackwardDegrees,
    limits.maximumForwardDegrees,
  );
  const solvedLateralDegrees = THREE.MathUtils.clamp(
    requestedLateralDegrees,
    -limits.maximumLateralDegrees,
    limits.maximumLateralDegrees,
  );
  const constrained = Math.abs(solvedSagittalDegrees - requestedSagittalDegrees) > 1e-8
    || Math.abs(solvedLateralDegrees - requestedLateralDegrees) > 1e-8;
  if (!constrained || weight <= 0) {
    return {
      direction,
      constrained: false,
      requestedSagittalDegrees,
      requestedLateralDegrees,
      solvedSagittalDegrees: requestedSagittalDegrees,
      solvedLateralDegrees: requestedLateralDegrees,
    };
  }
  const bounded = new THREE.Vector3(
    Math.tan(THREE.MathUtils.degToRad(solvedLateralDegrees)),
    -1,
    Math.tan(THREE.MathUtils.degToRad(solvedSagittalDegrees)),
  ).normalize();
  const arc = new THREE.Quaternion().setFromUnitVectors(direction, bounded);
  direction.applyQuaternion(new THREE.Quaternion().slerp(arc, THREE.MathUtils.clamp(weight, 0, 1))).normalize();
  const blendedDown = -direction.y;
  return {
    direction,
    constrained: true,
    requestedSagittalDegrees,
    requestedLateralDegrees,
    solvedSagittalDegrees: THREE.MathUtils.radToDeg(Math.atan2(direction.z, blendedDown)),
    solvedLateralDegrees: THREE.MathUtils.radToDeg(Math.atan2(direction.x, blendedDown)),
  };
}

export function naturalSolePoint(
  ankle: THREE.Vector3,
  footQuaternion: THREE.Quaternion,
  soleOffset: readonly [number, number, number],
): THREE.Vector3 {
  return ankle.clone().add(new THREE.Vector3(...soleOffset).applyQuaternion(footQuaternion));
}

/** Remove tilt around a calibrated level sole without erasing the foot's yaw. */
export function naturalFootHeading(
  animated: THREE.Quaternion,
  reference: THREE.Quaternion,
  previous: THREE.Quaternion = reference,
): THREE.Quaternion {
  const delta = animated.clone().multiply(reference.clone().invert()).normalize();
  const heading = new THREE.Quaternion(0, delta.y, 0, delta.w);
  // A half-turn about a horizontal axis has no unique yaw. Keep the last valid
  // heading (reference at contact entry) rather than introducing a 180° flip.
  if (heading.lengthSq() < EPSILON) return previous.clone();
  return heading.normalize().multiply(reference).normalize();
}

export function resolveNaturalContactPose(input: {
  naturalAnkle: THREE.Vector3;
  naturalFootQuaternion: THREE.Quaternion;
  referenceFootQuaternion: THREE.Quaternion;
  soleOffset: [number, number, number];
  pinnedSole: THREE.Vector3;
  rootTravelPerFrame: [number, number, number];
  elapsedFrames: number;
  weight: number;
}): { ankle: THREE.Vector3; footQuaternion: THREE.Quaternion; targetSole: THREE.Vector3 } {
  const weight = THREE.MathUtils.clamp(input.weight, 0, 1);
  const footQuaternion = input.naturalFootQuaternion.clone()
    .slerp(input.referenceFootQuaternion, weight)
    .normalize();
  const naturalSole = naturalSolePoint(
    input.naturalAnkle,
    input.naturalFootQuaternion,
    input.soleOffset,
  );
  const pinnedSole = input.pinnedSole.clone().add(
    new THREE.Vector3(...input.rootTravelPerFrame).multiplyScalar(-input.elapsedFrames),
  );
  const targetSole = naturalSole.lerp(pinnedSole, weight);
  const ankle = targetSole.clone().sub(
    new THREE.Vector3(...input.soleOffset).applyQuaternion(footQuaternion),
  );
  return { ankle, footQuaternion, targetSole };
}

export function lengthNormalizedWeights(
  lengths: readonly number[],
  multipliers?: readonly number[],
): number[] {
  if (lengths.length === 0 || lengths.some((length) => !Number.isFinite(length) || length <= EPSILON)) {
    throw new Error('Natural torso chain lengths must be positive finite values.');
  }
  if (multipliers && multipliers.length !== lengths.length) {
    throw new Error('Natural torso weights must match targetBones.');
  }
  const weighted = lengths.map((length, index) => {
    const multiplier = multipliers?.[index] ?? 1;
    if (!Number.isFinite(multiplier) || multiplier < 0) {
      throw new Error('Natural torso weight multipliers must be finite and non-negative.');
    }
    return length * multiplier;
  });
  const total = weighted.reduce((sum, value) => sum + value, 0);
  if (total <= EPSILON) throw new Error('Natural torso weight multipliers must include a positive value.');
  return weighted.map((value) => value / total);
}

export function contactBlendWeight(frame: number, contact: NaturalFootContact): number {
  if (frame < contact.startFrame || frame > contact.endFrame) return 0;
  const { blendInFrames, blendOutFrames } = naturalContactRamp(contact);
  const rampIn = blendInFrames === 0 ? 1 : (frame - contact.startFrame + 1) / blendInFrames;
  const rampOut = blendOutFrames === 0 ? 1 : (contact.endFrame - frame + 1) / blendOutFrames;
  return THREE.MathUtils.clamp(Math.min(rampIn, rampOut), 0, 1);
}

export function naturalContactRamp(contact: NaturalFootContact) {
  const blendInFrames = contact.blendInFrames === undefined ? contact.blendFrames : contact.blendInFrames;
  const blendOutFrames = contact.blendOutFrames === undefined ? contact.blendFrames : contact.blendOutFrames;
  if (![contact.startFrame, contact.endFrame, contact.blendFrames, blendInFrames, blendOutFrames]
    .every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Contact ramps require non-negative integer frames.');
  const fullWeightStartFrame = contact.startFrame + Math.max(0, blendInFrames - 1);
  const fullWeightEndFrame = contact.endFrame - Math.max(0, blendOutFrames - 1);
  if (fullWeightEndFrame < fullWeightStartFrame) throw new Error('Contact ramp leaves no full-weight contact frame.');
  return { blendInFrames, blendOutFrames, fullWeightStartFrame, fullWeightEndFrame };
}

function reachForBend(firstLength: number, secondLength: number, bendRadians: number): number {
  return Math.sqrt(Math.max(0,
    (firstLength * firstLength)
    + (secondLength * secondLength)
    + (2 * firstLength * secondLength * Math.cos(bendRadians)),
  ));
}

export function solveNaturalTwoBoneLeg(input: {
  hip: THREE.Vector3;
  desiredAnkle: THREE.Vector3;
  referenceKnee: THREE.Vector3;
  poleDirection: THREE.Vector3;
  previousPlaneNormal?: THREE.Vector3;
  firstLength: number;
  secondLength: number;
  minBendDegrees: number;
  maxBendDegrees: number;
}): NaturalLegSolveResult {
  const {
    hip,
    desiredAnkle,
    referenceKnee,
    poleDirection,
    previousPlaneNormal,
    firstLength,
    secondLength,
    minBendDegrees,
    maxBendDegrees,
  } = input;
  if (![firstLength, secondLength].every((value) => Number.isFinite(value) && value > EPSILON)) {
    throw new Error('Natural leg segment lengths must be positive finite values.');
  }
  if (!Number.isFinite(minBendDegrees) || !Number.isFinite(maxBendDegrees)
    || minBendDegrees < 0 || maxBendDegrees >= 180 || minBendDegrees > maxBendDegrees) {
    throw new Error('Natural leg bend limits require 0 <= minBendDegrees <= maxBendDegrees < 180.');
  }
  if (![hip, desiredAnkle, referenceKnee, poleDirection].every((value) => (
    [value.x, value.y, value.z].every(Number.isFinite)
  ))) throw new Error('Natural leg solve inputs must be finite.');

  const requested = desiredAnkle.clone().sub(hip);
  const requestedReach = requested.length();
  if (requestedReach <= EPSILON) throw new Error('Natural leg hip and requested ankle must be distinct.');
  const direction = requested.multiplyScalar(1 / requestedReach);
  const minimumReach = reachForBend(firstLength, secondLength, THREE.MathUtils.degToRad(maxBendDegrees));
  const maximumReach = reachForBend(firstLength, secondLength, THREE.MathUtils.degToRad(minBendDegrees));
  const solvedReach = THREE.MathUtils.clamp(requestedReach, minimumReach, maximumReach);
  const ankle = hip.clone().addScaledVector(direction, solvedReach);
  const along = ((firstLength * firstLength) - (secondLength * secondLength) + (solvedReach * solvedReach))
    / (2 * solvedReach);
  const perpendicularLength = Math.sqrt(Math.max(0, (firstLength * firstLength) - (along * along)));
  const pole = poleDirection.clone().addScaledVector(direction, -poleDirection.dot(direction));
  if (pole.lengthSq() <= EPSILON && previousPlaneNormal && previousPlaneNormal.lengthSq() > EPSILON) {
    pole.copy(previousPlaneNormal).cross(direction);
  }
  if (pole.lengthSq() <= EPSILON) {
    pole.copy(referenceKnee).sub(hip).addScaledVector(direction, -referenceKnee.clone().sub(hip).dot(direction));
  }
  if (pole.lengthSq() <= EPSILON) throw new Error('Natural leg pole is parallel to the solved reach direction.');
  pole.normalize();
  const knee = hip.clone().addScaledVector(direction, along).addScaledVector(pole, perpendicularLength);
  const bendPlaneNormal = knee.clone().sub(hip).cross(ankle.clone().sub(knee));
  if (bendPlaneNormal.lengthSq() <= EPSILON) {
    if (previousPlaneNormal && previousPlaneNormal.lengthSq() > EPSILON) bendPlaneNormal.copy(previousPlaneNormal);
    else bendPlaneNormal.copy(direction).cross(pole);
  }
  bendPlaneNormal.normalize();
  const cosine = THREE.MathUtils.clamp(
    ((firstLength * firstLength) + (secondLength * secondLength) - (solvedReach * solvedReach))
      / (2 * firstLength * secondLength),
    -1,
    1,
  );
  const bendDegrees = 180 - THREE.MathUtils.radToDeg(Math.acos(cosine));
  return {
    knee,
    ankle,
    bendDegrees,
    requestedReach,
    solvedReach,
    residual: desiredAnkle.distanceTo(ankle),
    clamped: Math.abs(solvedReach - requestedReach) > 1e-8,
    bendPlaneNormal,
  };
}

function frameQuaternion(primary: THREE.Vector3, planeNormal: THREE.Vector3): THREE.Quaternion {
  const x = primary.clone().normalize();
  const y = planeNormal.clone().addScaledVector(x, -planeNormal.dot(x));
  if (x.lengthSq() <= EPSILON || y.lengthSq() <= EPSILON) {
    throw new Error('Natural anatomical frame requires non-parallel segment and plane axes.');
  }
  y.normalize();
  const z = x.clone().cross(y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).normalize();
}

export function alignNaturalAnatomicalFrame(
  referenceSegment: THREE.Vector3,
  referencePlaneNormal: THREE.Vector3,
  solvedSegment: THREE.Vector3,
  solvedPlaneNormal: THREE.Vector3,
  referenceBoneWorldQuaternion: THREE.Quaternion,
): THREE.Quaternion {
  const referenceFrame = frameQuaternion(referenceSegment, referencePlaneNormal);
  const solvedFrame = frameQuaternion(solvedSegment, solvedPlaneNormal);
  return solvedFrame
    .multiply(referenceFrame.invert())
    .multiply(referenceBoneWorldQuaternion)
    .normalize();
}


/** Find one bounded pelvis displacement satisfying all active leg reaches. */
export function solveNaturalPelvisCorrection(constraints: readonly {
  leg: Parameters<typeof solveNaturalTwoBoneLeg>[0];
  maximumCorrection: number;
}[]): THREE.Vector3 {
  const correction = new THREE.Vector3();
  if (!constraints.length) return correction;
  const maximum = Math.min(...constraints.map(c => c.maximumCorrection));
  if (!Number.isFinite(maximum) || maximum < 0) throw new Error('Pelvis correction must be finite and non-negative.');
  if (maximum === 0) return correction;
  // Alternating projections resolve coupled feet; unreachable constraints remain
  // bounded and are reported by the final leg solves, never by stretching bones.
  for (let pass = 0; pass < 32; pass++) {
    let worst = 0;
    for (const {leg} of constraints) {
      const solved = solveNaturalTwoBoneLeg({...leg,hip:leg.hip.clone().add(correction)});
      worst = Math.max(worst,solved.residual);
      correction.add(leg.desiredAnkle.clone().sub(solved.ankle));
      if (correction.length() > maximum) correction.setLength(maximum);
    }
    if (worst < 1e-9) break;
  }
  return correction;
}
