export type ApiVersionV1 = 1;
export type ConventionV1 = 'auto' | 'mixamo' | 'ue4' | 'unity' | 'rigify';

export interface SkeletonNodeSnapshotV1 {
  name: string;
  parent: number | null;
  isBone: boolean;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  worldPosition: [number, number, number];
  worldQuaternion: [number, number, number, number];
}

export interface SkeletonSnapshotV1 {
  nodes: SkeletonNodeSnapshotV1[];
  /** Indices into nodes in the source skeleton's bone order. */
  bones: number[];
}

export interface AnalysisClipV1 {
  name: string;
  duration: number;
  tracks: Array<{ name: string; bone: string | null; property: string | null }>;
}

export interface AnalysisInputV1 {
  apiVersion: ApiVersionV1;
  source: SkeletonSnapshotV1;
  target: SkeletonSnapshotV1;
  manualMap: Record<string, string>;
  sourceConvention: ConventionV1;
  targetConvention: ConventionV1;
  allowFuzzy: boolean;
  clips: AnalysisClipV1[];
}

export interface AnalysisDiagnosticV1 {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  sourceBone?: string;
  targetBone?: string;
}

export interface AnalysisResultV1 {
  apiVersion: ApiVersionV1;
  mapping: {
    ok: boolean;
    map: Record<string, string>;
    decisions: Array<{
      source: string;
      target: string;
      canonical?: string;
      method: 'manual' | 'canonical' | 'normalized' | 'fuzzy';
      confidence: number;
    }>;
    diagnostics: AnalysisDiagnosticV1[];
    sourceUp: [number, number, number] | null;
    targetUp: [number, number, number] | null;
    upCorrection: [number, number, number, number] | null;
    sourceLateral: [number, number, number] | null;
    targetLateral: [number, number, number] | null;
    orientationCorrection: [number, number, number, number] | null;
  };
  proportions: null | {
    sourceMappedSpan: number;
    targetMappedSpan: number;
    targetToSourceUnitScale: number;
    segmentWarningThreshold: number;
    segments: Array<{
      sourceParent: string;
      sourceChild: string;
      targetParent: string;
      targetChild: string;
      sourceLength: number;
      targetLength: number;
      normalizedTargetToSourceRatio: number;
      warning: boolean;
    }>;
    warningCount: number;
    minimumNormalizedRatio: number | null;
    maximumNormalizedRatio: number | null;
  };
  diagnostics: AnalysisDiagnosticV1[];
  status: 'ready' | 'needs-review' | 'blocked';
}
