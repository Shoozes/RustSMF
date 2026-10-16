import type { AnimationRetargetOptions, AnimationRetargetReport } from '../utils/animationRetarget';
interface Entry { slice: 'core' | 'advanced'; default: string; guard: string }
interface OptionEntry extends Entry { adapter: string; refusal: string }
/** TypeScript reference inventory; experimental core and advanced APIs remain separate. */
export const RETARGET_OPTIONS = {
  "clipName": {
    "slice": "core",
    "default": "trimmed clipName, then source name, then retargeted_clip",
    "adapter": "clipNames[source]",
    "refusal": "Unknown names, invalid values or incompatible profile fields are rejected by the strict profile/job parser and solver.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "applyUpCorrection": {
    "slice": "core",
    "default": "enabled when mapping supplies correction",
    "adapter": "applyUpCorrection",
    "refusal": "Unknown names, invalid values or incompatible profile fields are rejected by the strict profile/job parser and solver.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "scaleRootMotion": {
    "slice": "core",
    "default": "mapped-height scaling when available",
    "adapter": "scaleRootMotion",
    "refusal": "Unknown names, invalid values or incompatible profile fields are rejected by the strict profile/job parser and solver.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "rootMotionScale": {
    "slice": "core",
    "default": "automatic mapped-height ratio or 1",
    "adapter": "rootMotionScale",
    "refusal": "Positive finite value; cannot combine with scaleRootMotion=false.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "extractRootMotionBone": {
    "slice": "core",
    "default": "disabled",
    "adapter": "extractRootMotionBone",
    "refusal": "Existing source ancestor of the mapped pelvis required.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "visualTiming": {
    "slice": "core",
    "default": "source duration and timing",
    "adapter": "clipVisualTiming[source]",
    "refusal": "Validated frame landmarks/holds; requires 60 Hz.",
    "guard": "source/frontend/src/utils/retargetTiming.test.ts"
  },
  "sampleRateHz": {
    "slice": "core",
    "default": "union of source track times, at most 20000 samples",
    "adapter": "sampleRateHz",
    "refusal": "Finite positive rate; sample schedule is bounded at 20000.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "interpolation": {
    "slice": "core",
    "default": "linear output",
    "adapter": "interpolation",
    "refusal": "Unknown names, invalid values or incompatible profile fields are rejected by the strict profile/job parser and solver.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "nextDownRationalTimes": {
    "slice": "core",
    "default": "false",
    "adapter": "nextDownRationalTimes",
    "refusal": "Requires explicit sampleRateHz.",
    "guard": "source/frontend/src/utils/retargetTiming.test.ts"
  },
  "alignMappedBoneDirections": {
    "slice": "core",
    "default": "enabled for resolvable chains",
    "adapter": "alignMappedBoneDirections",
    "refusal": "Unknown names, invalid values or incompatible profile fields are rejected by the strict profile/job parser and solver.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "directionAlignmentBones": {
    "slice": "core",
    "default": "all constrained targets",
    "adapter": "directionAlignmentBones",
    "refusal": "Unique nonempty constrained targets; alignment must be enabled.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "directionTransferMode": {
    "slice": "core",
    "default": "relative",
    "adapter": "clipDirectionTransfer[source] / directionTransfer",
    "refusal": "Unknown names, invalid values or incompatible profile fields are rejected by the strict profile/job parser and solver.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "directionTransferBones": {
    "slice": "core",
    "default": "all eligible direction targets",
    "adapter": "clipDirectionTransferBones[source] / directionTransferBones",
    "refusal": "Every named target must have a direction constraint.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "sourceReferencePose": {
    "slice": "core",
    "default": "rest",
    "adapter": "sourceReferencePose",
    "refusal": "Unknown names, invalid values or incompatible profile fields are rejected by the strict profile/job parser and solver.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "sourceReferenceClip": {
    "slice": "core",
    "default": "absent; required when sourceReferencePose is clip",
    "adapter": "sourceReferenceClip",
    "refusal": "Named source reference must exist and contain transform channels.",
    "guard": "source/frontend/src/utils/retargetReference.test.ts"
  },
  "targetReferenceClip": {
    "slice": "core",
    "default": "target rest",
    "adapter": "targetReferenceClip",
    "refusal": "Named target reference must exist and contain transform channels.",
    "guard": "source/frontend/src/utils/retargetScale.test.ts"
  },
  "preserveTargetLeafRotations": {
    "slice": "core",
    "default": "false",
    "adapter": "preserveTargetLeafRotations",
    "refusal": "Unknown names, invalid values or incompatible profile fields are rejected by the strict profile/job parser and solver.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "preserveTargetRotations": {
    "slice": "core",
    "default": "empty",
    "adapter": "resolvePreservedTargetRotations",
    "refusal": "Every target must be mapped and active.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "targetChainCurls": {
    "slice": "advanced",
    "default": "empty",
    "adapter": "targetChainCurls",
    "refusal": "Unknown names, invalid values or incompatible profile fields are rejected by the strict profile/job parser and solver.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "naturalMotion": {
    "slice": "advanced",
    "default": "disabled",
    "adapter": "naturalMotion",
    "refusal": "Explicit source/target references and mapped pelvis; 60 Hz contact semantics; sampled root travel requires exact STEP coverage.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "poseRanges": {
    "slice": "advanced",
    "default": "disabled",
    "adapter": "poseRanges",
    "refusal": "Unknown names, invalid values or incompatible profile fields are rejected by the strict profile/job parser and solver.",
    "guard": "source/frontend/src/utils/poseRanges.test.ts"
  },
  "localReferenceCorrections": {
    "slice": "advanced",
    "default": "empty",
    "adapter": "localReferenceCorrections",
    "refusal": "Unknown names, invalid values or incompatible profile fields are rejected by the strict profile/job parser and solver.",
    "guard": "source/frontend/src/utils/retargetReference.test.ts"
  },
  "jointConstraints": {
    "slice": "advanced",
    "default": "disabled",
    "adapter": "clipJointConstraints[source]",
    "refusal": "Unbranched mapped animated neck/head with neutral pose ranges; no direction alignment, recovery, overlapping contacts or preserved/curl/reference rotations.",
    "guard": "source/frontend/src/utils/retargetJointConstraints.test.ts"
  },
  "poseRecovery": {
    "slice": "advanced",
    "default": "disabled",
    "adapter": "clipPoseRecovery[source]",
    "refusal": "Ordered integer peak/hold/return frames inside output; incompatible with scale transfer.",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "forearmTwist": {
    "slice": "advanced",
    "default": "empty",
    "adapter": "clipForearmTwist[source]",
    "refusal": "Isolated STEP post-pass; alignment disabled; no natural/joint/recovery/local-reference correction or preserved pair rotations.",
    "guard": "source/frontend/src/utils/forearmTwist.test.ts"
  },
  "endpointEnvelope": {
    "slice": "advanced",
    "default": "disabled",
    "adapter": "clipEndpointEnvelopes[source]",
    "refusal": "60 Hz STEP; no recovery/joint/twist/scale/local-reference post-corrections; exact endpoints required.",
    "guard": "source/frontend/src/utils/endpointEnvelope.test.ts"
  },
  "endpointTargetClips": {
    "slice": "advanced",
    "default": "empty; referenced targets required for envelope",
    "adapter": "loaded target clips",
    "refusal": "All endpoint references and compatible grids/poses must exist.",
    "guard": "source/frontend/src/utils/endpointEnvelope.test.ts"
  },
  "scaleTransfer": {
    "slice": "core",
    "default": "disabled (opt-in only)",
    "adapter": "clipScaleTransfer[source]",
    "refusal": "Bound source/target/track, valid axes/strength and safe ratios; no pose recovery.",
    "guard": "source/frontend/src/utils/retargetScale.test.ts"
  }
} satisfies Record<keyof AnimationRetargetOptions, OptionEntry>;
export const RETARGET_REPORTS = {
  "forearmTwist": {
    "slice": "advanced",
    "default": "omitted when disabled",
    "guard": "source/frontend/src/utils/forearmTwist.test.ts"
  },
  "endpointEnvelope": {
    "slice": "advanced",
    "default": "omitted when disabled",
    "guard": "source/frontend/src/utils/endpointEnvelope.test.ts"
  },
  "jointConstraints": {
    "slice": "advanced",
    "default": "omitted when disabled",
    "guard": "source/frontend/src/utils/retargetJointConstraints.test.ts"
  },
  "sourceClip": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "targetClip": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "duration": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "sampleCount": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "quaternionTrackCount": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "positionTrackCount": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "scaleTrackCount": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/retargetScale.test.ts"
  },
  "discardedTracks": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "hierarchyOnlyTracks": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "mappedBones": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "rootMotionScale": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "rootMotionExtraction": {
    "slice": "core",
    "default": "omitted when disabled",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "visualTiming": {
    "slice": "core",
    "default": "omitted when disabled",
    "guard": "source/frontend/src/utils/retargetTiming.test.ts"
  },
  "upCorrection": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "orientationCorrection": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "sampleRateHz": {
    "slice": "core",
    "default": "null for source key schedule",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "interpolation": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "nextDownRationalTimes": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "directionAlignedBones": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "directionTransferMode": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "directionTransferBones": {
    "slice": "core",
    "default": "null for all eligible targets",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "sourceReferencePose": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "sourceReferenceClip": {
    "slice": "core",
    "default": "null for rest",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "targetReferenceClip": {
    "slice": "core",
    "default": "null for target rest",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "preservedTargetLeafRotations": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "preservedTargetRotations": {
    "slice": "core",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "targetChainCurls": {
    "slice": "advanced",
    "default": "derived from the effective options and sampled result",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  },
  "naturalMotion": {
    "slice": "advanced",
    "default": "null when disabled",
    "guard": "source/frontend/src/utils/naturalRetarget.test.ts"
  },
  "poseRanges": {
    "slice": "advanced",
    "default": "omitted when disabled",
    "guard": "source/frontend/src/utils/poseRanges.test.ts"
  },
  "localReferenceCorrections": {
    "slice": "advanced",
    "default": "empty object",
    "guard": "source/frontend/src/utils/retargetReference.test.ts"
  },
  "poseRecovery": {
    "slice": "advanced",
    "default": "null when disabled",
    "guard": "source/frontend/src/utils/animationRetarget.test.ts"
  }
} satisfies Record<keyof AnimationRetargetReport, Entry>;
