import type * as THREE from 'three';
import type { AnimationRetargetOptions } from './animationRetarget';
import { GAME_READY_JOB_SCHEMA, parseGameReadyJob, resolvePreservedTargetRotations, type RetargetJob } from './gameReadyJob';

export const RETARGET_PROFILE_SCHEMA = 'rustsmf.retarget-profile.v1';
export const MAX_RETARGET_PROFILE_BYTES = 1024 * 1024;
export type RetargetProfileSettings = Omit<RetargetJob, 'sourceModel'>;
export interface RetargetProfile {
  $schema: typeof RETARGET_PROFILE_SCHEMA;
  retarget: RetargetProfileSettings;
  targetClipNames: Record<string, string>;
}

const paths = {
  isAbsolute: (value: string) => /^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(value),
  resolve: (value: string) => value,
  comparisonKey: (value: string) => value.replace(/\\/g, '/').toLowerCase(),
};

/** Reuse job validation without opening any paths: browser sources are picked files. */
export function parseRetargetProfile(text: string): RetargetProfile {
  if (new TextEncoder().encode(text).length > MAX_RETARGET_PROFILE_BYTES) throw new Error('Retarget profile exceeds 1 MiB.');
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Retarget profile must be an object.');
  const record = value as Record<string, unknown>;
  let job;
  if (record.$schema === GAME_READY_JOB_SCHEMA) {
    job = parseGameReadyJob(value, paths);
  } else {
    if (record.$schema !== RETARGET_PROFILE_SCHEMA) throw new Error('Import a saved game-ready job or rustsmf.retarget-profile.v1 document.');
    if (Object.keys(record).some((key) => !['$schema', 'retarget', 'targetClipNames'].includes(key))) throw new Error('Unknown retarget profile field.');
    if (!record.retarget || typeof record.retarget !== 'object' || Array.isArray(record.retarget)) {
      throw new Error('Retarget profile retarget settings must be an object.');
    }
    if ('sourceModel' in record.retarget) {
      throw new Error('Standalone retarget profiles do not store sourceModel paths; select source files when applying the profile.');
    }
    // These inert envelope paths only let the existing strict job parser validate
    // the retarget settings. No browser operation reads or writes them.
    job = parseGameReadyJob({
      $schema: GAME_READY_JOB_SCHEMA,
      input: { riggedModel: '/profile/target.glb', referenceObj: '/profile/reference.obj', referenceMtl: '/profile/reference.mtl', textures: ['/profile/color.png'] },
      materialRepair: { mode: 'strict-auto', textureFlipY: true },
      coordinates: { unitMeters: 1, up: '+Y', forward: '+Z', grounded: false },
      rig: { retarget: { ...record.retarget, sourceModel: '/profile/source.glb' }, clipNames: record.targetClipNames },
      output: { generationRoot: '/profile/output' },
      provenance: { ownership: 'User-selected browser files' },
    }, paths);
  }
  if (!job.rig.retarget) throw new Error('The document has no retarget settings.');
  const retarget = { ...job.rig.retarget } as Partial<RetargetJob>;
  delete retarget.sourceModel;
  // The job parser represents omitted curls as [], but explicit [] is invalid.
  if (!retarget.targetChainCurls?.length) delete retarget.targetChainCurls;
  return {
    $schema: RETARGET_PROFILE_SCHEMA,
    retarget: retarget as RetargetProfileSettings,
    targetClipNames: job.rig.clipNames ?? {},
  };
}

export function profileClipOptions(profile: RetargetProfile, sourceClip: THREE.AnimationClip,
  sourceClips: readonly THREE.AnimationClip[], targetClips: readonly THREE.AnimationClip[]): AnimationRetargetOptions {
  const job = profile.retarget;
  const reference = (name: string | undefined, clips: readonly THREE.AnimationClip[], owner: string) => {
    if (!name) return undefined;
    const clip = clips.find((candidate) => candidate.name === name);
    if (!clip) throw new Error(`${owner} is missing reference clip ${name}.`);
    return clip;
  };
  const targetReferenceName = job.targetReferenceClip
    ? profile.targetClipNames[job.targetReferenceClip] ?? job.targetReferenceClip
    : undefined;
  return {
    clipName: job.clipNames?.[sourceClip.name] || sourceClip.name,
    applyUpCorrection: job.applyUpCorrection,
    alignMappedBoneDirections: job.alignMappedBoneDirections,
    directionTransferMode: job.clipDirectionTransfer?.[sourceClip.name] ?? job.directionTransfer,
    directionTransferBones: job.clipDirectionTransferBones?.[sourceClip.name] ?? job.directionTransferBones,
    sourceReferencePose: job.sourceReferencePose,
    sourceReferenceClip: reference(job.sourceReferenceClip, sourceClips, 'Source model'),
    targetReferenceClip: reference(targetReferenceName, targetClips, 'Target model'),
    preserveTargetLeafRotations: job.preserveTargetLeafRotations,
    preserveTargetRotations: resolvePreservedTargetRotations(job, sourceClip.name),
    targetChainCurls: job.targetChainCurls,
    naturalMotion: job.naturalMotion,
    poseRecovery: job.clipPoseRecovery?.[sourceClip.name],
    scaleRootMotion: job.scaleRootMotion,
    sampleRateHz: job.sampleRateHz,
    interpolation: job.interpolation,
    nextDownRationalTimes: job.nextDownRationalTimes,
  };
}
