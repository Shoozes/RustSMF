import type { AnalysisInputV1, AnalysisResultV1, SkeletonSnapshotV1 } from './retargetAnalysisTypes';
import type { BakeOptions, ClipSnapshot } from './retargetSnapshot';
import type { AnimationRetargetReport } from '../utils/animationRetarget';
export interface JobIdentity { jobId: number; revision: number }
export interface BakeInput {
  source: SkeletonSnapshotV1; target: SkeletonSnapshotV1; mapping: AnalysisResultV1['mapping'];
  clips: Array<{clip: ClipSnapshot; options: BakeOptions}>;
}
export type RetargetRequest = JobIdentity & ({phase:'analysis'; input:AnalysisInputV1} | {phase:'bake'; input:BakeInput});
export interface BakeOutput { clips: ClipSnapshot[]; reports: AnimationRetargetReport[] }
export type RetargetResponse = JobIdentity & {phase:'analysis'|'bake'} & (
  {type:'progress'; completed:number; total:number} | {type:'error'; message:string} |
  {type:'analysis'; value:AnalysisResultV1} | {type:'bake'; value:BakeOutput});
export function responseIdentity(value: unknown): (JobIdentity & {phase:string; type:string}) | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return Number.isSafeInteger(record.jobId) && Number.isSafeInteger(record.revision) &&
    typeof record.phase === 'string' && typeof record.type === 'string' ? record as unknown as JobIdentity & {phase:string;type:string} : null;
}
