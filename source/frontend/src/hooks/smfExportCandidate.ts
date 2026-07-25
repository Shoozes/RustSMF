import type * as THREE from 'three';
import {
  buildImportedSmfFromThree,
  collectSkinnedMeshes,
  inspectThreeToSmfSource,
  SmfConversionError,
  type ImportedSmf,
} from '../loaders';
import { applyLiveSkinEditsToImportedSmf } from '../loaders/threeToSmf';
import {
  applyAnimationEditsToImportedSmf,
  applyAnimationMetadataToImportedSmf,
  type AnimationEditState,
} from '../utils/animationEdits';
import {
  applyPoseEditsToSmf,
  hasUnsupportedPoseScaleEdits,
  type PoseEditMap,
} from './poseEdits';

export const UNSUPPORTED_SMF_SCALE_EDIT_MESSAGE =
  'SMF export does not support scale edits. Reset bone scale or export GLB.';

export interface SmfExportCandidateInput {
  sourceSmf: ImportedSmf | null;
  root: THREE.Object3D | null;
  skeleton: THREE.Skeleton | null;
  clips: THREE.AnimationClip[];
  poseEdits: PoseEditMap;
  animationEdits: AnimationEditState;
}

export function buildSmfExportCandidate({
  sourceSmf,
  root,
  skeleton,
  clips,
  poseEdits,
  animationEdits,
}: SmfExportCandidateInput): ImportedSmf | null {
  if (hasUnsupportedPoseScaleEdits(poseEdits)) {
    throw new SmfConversionError(UNSUPPORTED_SMF_SCALE_EDIT_MESSAGE);
  }

  const skinnedMeshes = root ? collectSkinnedMeshes(root) : [];
  if (sourceSmf) {
    const posed = skeleton
      ? applyPoseEditsToSmf(sourceSmf, poseEdits, skeleton)
      : sourceSmf;
    const animated = applyAnimationEditsToImportedSmf(posed, clips, animationEdits);
    return root
      ? applyLiveSkinEditsToImportedSmf(animated, skinnedMeshes)
      : animated;
  }

  if (!root) return null;

  const diagnostics = inspectThreeToSmfSource({
    skeleton,
    skinnedMeshes,
    clips,
  });
  const blockingDiagnostic = diagnostics.diagnostics.find((item) => item.level === 'error');
  if (blockingDiagnostic) {
    const detail = blockingDiagnostic.target ? ` (${blockingDiagnostic.target})` : '';
    throw new SmfConversionError(
      `${blockingDiagnostic.code}: ${blockingDiagnostic.message}${detail}`,
    );
  }

  const converted = buildImportedSmfFromThree({
    skeleton,
    skinnedMeshes,
    clips,
  });
  return applyAnimationMetadataToImportedSmf(converted, animationEdits);
}
