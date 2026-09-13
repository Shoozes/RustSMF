import * as THREE from 'three';
import type { RigMapDecision, RigMapResult } from './rigMapping';

export interface RigSegmentComparison {
  sourceParent: string;
  sourceChild: string;
  targetParent: string;
  targetChild: string;
  sourceLength: number;
  targetLength: number;
  normalizedTargetToSourceRatio: number;
  warning: boolean;
}

export interface RigCompatibilityReport {
  sourceMappedSpan: number;
  targetMappedSpan: number;
  targetToSourceUnitScale: number;
  segmentWarningThreshold: number;
  segments: RigSegmentComparison[];
  warningCount: number;
  minimumNormalizedRatio: number | null;
  maximumNormalizedRatio: number | null;
}

function nearestMappedAncestor(
  bone: THREE.Bone,
  decisionsByBone: ReadonlyMap<THREE.Bone, RigMapDecision>,
): RigMapDecision | null {
  let cursor: THREE.Object3D | null = bone.parent;
  while (cursor instanceof THREE.Bone) {
    const decision = decisionsByBone.get(cursor);
    if (decision) return decision;
    cursor = cursor.parent;
  }
  return null;
}

function mappedSpan(positions: readonly THREE.Vector3[]): number {
  let span = 0;
  for (let left = 0; left < positions.length; left += 1) {
    for (let right = left + 1; right < positions.length; right += 1) {
      span = Math.max(span, positions[left].distanceTo(positions[right]));
    }
  }
  return span;
}

export function compareMappedRigProportions(
  source: THREE.Skeleton,
  target: THREE.Skeleton,
  mapping: RigMapResult,
  segmentWarningThreshold = 0.35,
): RigCompatibilityReport {
  if (!mapping.ok) throw new Error('Cannot compare proportions for an invalid rig map.');
  if (!Number.isFinite(segmentWarningThreshold) || segmentWarningThreshold < 0 || segmentWarningThreshold >= 1) {
    throw new Error('Rig segment warning threshold must be from 0 through less than 1.');
  }
  source.bones[0]?.updateWorldMatrix(true, true);
  target.bones[0]?.updateWorldMatrix(true, true);

  const sourceBones = new Map(source.bones.map((bone) => [bone.name, bone]));
  const targetBones = new Map(target.bones.map((bone) => [bone.name, bone]));
  const active = mapping.decisions.flatMap((decision) => {
    const sourceBone = sourceBones.get(decision.source);
    const targetBone = targetBones.get(decision.target);
    return sourceBone && targetBone ? [{ decision, sourceBone, targetBone }] : [];
  });
  if (active.length < 2) throw new Error('Rig proportion comparison requires at least two mapped bones.');

  const sourcePositions = active.map(({ sourceBone }) => sourceBone.getWorldPosition(new THREE.Vector3()));
  const targetPositions = active.map(({ targetBone }) => targetBone.getWorldPosition(new THREE.Vector3()));
  const sourceMappedSpan = mappedSpan(sourcePositions);
  const targetMappedSpan = mappedSpan(targetPositions);
  if (sourceMappedSpan <= 1e-8 || targetMappedSpan <= 1e-8) {
    throw new Error('Mapped rig span must be finite and non-zero.');
  }
  const targetToSourceUnitScale = sourceMappedSpan / targetMappedSpan;
  const minimumSourceSegmentLength = sourceMappedSpan * 1e-4;
  const minimumTargetSegmentLength = targetMappedSpan * 1e-4;
  const sourceDecisionsByBone = new Map(active.map(({ decision, sourceBone }) => [sourceBone, decision]));
  const targetDecisionsByBone = new Map(active.map(({ decision, targetBone }) => [targetBone, decision]));
  const lowerRatio = 1 - segmentWarningThreshold;
  const upperRatio = 1 + segmentWarningThreshold;
  const segments: RigSegmentComparison[] = [];

  for (const { decision, sourceBone, targetBone } of active) {
    const sourceParent = nearestMappedAncestor(sourceBone, sourceDecisionsByBone);
    const targetParent = nearestMappedAncestor(targetBone, targetDecisionsByBone);
    if (!sourceParent || !targetParent || sourceParent.target !== targetParent.target) continue;
    const sourceParentBone = sourceBones.get(sourceParent.source)!;
    const targetParentBone = targetBones.get(targetParent.target)!;
    const sourceLength = sourceParentBone.getWorldPosition(new THREE.Vector3())
      .distanceTo(sourceBone.getWorldPosition(new THREE.Vector3()));
    const targetLength = targetParentBone.getWorldPosition(new THREE.Vector3())
      .distanceTo(targetBone.getWorldPosition(new THREE.Vector3()));
    // Exporters often retain zero-length shoulder/helper joints. They describe
    // hierarchy pivots, not proportions, and would otherwise dominate ratios.
    if (sourceLength <= minimumSourceSegmentLength || targetLength <= minimumTargetSegmentLength) continue;
    const normalizedTargetToSourceRatio = (targetLength * targetToSourceUnitScale) / sourceLength;
    segments.push({
      sourceParent: sourceParent.source,
      sourceChild: decision.source,
      targetParent: targetParent.target,
      targetChild: decision.target,
      sourceLength,
      targetLength,
      normalizedTargetToSourceRatio,
      warning: normalizedTargetToSourceRatio < lowerRatio || normalizedTargetToSourceRatio > upperRatio,
    });
  }
  segments.sort((left, right) => left.targetChild.localeCompare(right.targetChild));
  const ratios = segments.map((segment) => segment.normalizedTargetToSourceRatio);
  return {
    sourceMappedSpan,
    targetMappedSpan,
    targetToSourceUnitScale,
    segmentWarningThreshold,
    segments,
    warningCount: segments.filter((segment) => segment.warning).length,
    minimumNormalizedRatio: ratios.length > 0 ? Math.min(...ratios) : null,
    maximumNormalizedRatio: ratios.length > 0 ? Math.max(...ratios) : null,
  };
}
