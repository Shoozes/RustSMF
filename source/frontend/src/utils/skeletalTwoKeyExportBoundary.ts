import * as THREE from 'three';
import { chordRotationTrack, validateChordRotation } from './skeletalChordRotation';
import { bakeTwoKeyRotations, parseTwoKeyRotationSelection, parseTwoKeyRotationBake, MAX_TWO_KEY_ROTATION_BAKES } from './skeletalTwoKeyRotation';
import { rotationDifferenceDegrees } from './skeletalTerminalRotation';
import { bakeRotationSpan, parseRotationSpanBake, assertDisjointRotationSpan } from './skeletalRotationSpan';
import { PELVIS_LAYER_POLICY, pelvisLayerRecipe, restorePelvisLayer, type PelvisLayerReport } from './skeletalPelvisLayer';
import { assertDisjointStanceTrajectory, bakeStanceTrajectory, parseStanceTrajectory, STANCE_TRAJECTORY_POLICY } from './skeletalStanceTrajectory';
import { restoreHipYLoopEndpointClip, validateHipYLoopEndpointReport, type HipYLoopEndpointReport } from './skeletalHipYLoopEndpoint';
import { COUPLED_BODY_HEIGHT_POLICY, COUPLED_BODY_HEIGHT_PROFILE_SHA256, restoreCoupledBodyHeightClip, type CoupledBodyHeightReport } from './skeletalCoupledBodyHeight';

export const TWO_KEY_EXPORT_BOUNDARY_POLICY = 'preserve-unselected-emitted-keys.v1' as const;
type Report = ReturnType<typeof bakeTwoKeyRotations>['report'];
type SpanReport = ReturnType<typeof bakeRotationSpan>['report'];
type StanceReport = ReturnType<typeof bakeStanceTrajectory>['report'];
export type TwoKeyExportBoundary = { policy: typeof TWO_KEY_EXPORT_BOUNDARY_POLICY; spanReport?: SpanReport; pelvisReport?: PelvisLayerReport; stanceReport?: StanceReport; endpointReport?: HipYLoopEndpointReport; coupledReport?: CoupledBodyHeightReport } & (
  { report: Report; reports?: never } | { reports: Report[]; report?: never } | { spanReport: SpanReport; report?: never; reports?: never } | { pelvisReport: PelvisLayerReport; report?: never; reports?: never } | { stanceReport: StanceReport; report?: never; reports?: never } | { endpointReport: HipYLoopEndpointReport; report?: never; reports?: never }
);

export function twoKeyExportReports(context: TwoKeyExportBoundary): readonly (Report | SpanReport | PelvisLayerReport | StanceReport)[] {
  const single = Object.prototype.hasOwnProperty.call(context, 'report'), plural = Object.prototype.hasOwnProperty.call(context, 'reports'), span = Object.prototype.hasOwnProperty.call(context, 'spanReport'), pelvis = Object.prototype.hasOwnProperty.call(context, 'pelvisReport'), stance = Object.prototype.hasOwnProperty.call(context, 'stanceReport'), endpoint = Object.prototype.hasOwnProperty.call(context, 'endpointReport'), coupled = Object.prototype.hasOwnProperty.call(context, 'coupledReport');
  if (pelvis) pelvisLayerRecipe(context.pelvisReport!);
  if (endpoint) validateHipYLoopEndpointReport(context.endpointReport!);
  if (coupled && (context.coupledReport?.policy !== COUPLED_BODY_HEIGHT_POLICY
    || context.coupledReport.profileSha256 !== COUPLED_BODY_HEIGHT_PROFILE_SHA256
    || !endpoint || !span || !plural)) throw new Error('Invalid coupled export-boundary provenance.');
  if (context.policy !== TWO_KEY_EXPORT_BOUNDARY_POLICY
    || (single && plural) || (!single && !plural && !span && !pelvis && !stance && !endpoint)
    || Object.keys(context).sort().join(',') !== ['policy', ...(single ? ['report'] : plural ? ['reports'] : []), ...(span ? ['spanReport'] : []), ...(pelvis ? ['pelvisReport'] : []), ...(stance ? ['stanceReport'] : []), ...(endpoint ? ['endpointReport'] : []), ...(coupled ? ['coupledReport'] : [])].sort().join(',')) throw new Error('Invalid two-key export-boundary selection.');
  const reports: Report[] = single ? [context.report!] : plural ? context.reports! : [];
  if (!Array.isArray(reports) || ((single || plural) && reports.length < 1) || reports.length > MAX_TWO_KEY_ROTATION_BAKES
    || reports.some(report => !report || report.policy !== 'two-adjacent-interior-rotations.v1'
      || !Array.isArray(report.ticks) || report.ticks.length !== 2 || report.ticks[1] !== report.ticks[0] + 1
      || !Array.isArray(report.corrections) || report.corrections.length !== 3)) throw new Error('Invalid two-key export-boundary provenance.');
  if (reports.length) parseTwoKeyRotationSelection({ twoKeyRotationBakes: reports.map(report => ({ clipId: report.clipId,
    startTick: report.ticks[0], maxRotationDegrees: report.maxRotationDegrees,
    rotations: report.corrections.map(r => ({ joint: r.joint, values: r.values?.map(v => v.after) })) })) },
  reports.map(r => r.clipId), reports.map(r => r.clipId), []);
  if (stance) {
    const report = context.stanceReport!;
    if (report.policy !== STANCE_TRAJECTORY_POLICY || report.anchorTick !== 0 || report.ticks.length !== 23
      || report.ticks.some((tick, index) => tick !== index + 2) || report.corrections.length !== 3)
      throw new Error('Invalid stance-trajectory export-boundary provenance.');
    const spec = parseStanceTrajectory({ policy: report.policy, clipId: report.clipId, anchorTick: report.anchorTick,
      startTick: 2, maxRotationDegrees: report.maxRotationDegrees,
      rotations: report.corrections.map(r => ({ joint: r.joint, values: r.values?.map(v => v.after) })) }, [report.clipId], [report.clipId]);
    assertDisjointStanceTrajectory(spec, reports.map(r => ({ clipId: r.clipId, startTick: r.ticks[0], maxRotationDegrees: r.maxRotationDegrees,
      rotations: r.corrections.map(c => ({ joint: c.joint, values: c.values.map(v => v.after) })) })), context.spanReport && { clipId: context.spanReport.clipId, startTick: context.spanReport.ticks[0],
      maxRotationDegrees: context.spanReport.maxRotationDegrees, rotations: context.spanReport.corrections.map(c => ({ joint: c.joint, values: c.values.map(v => v.after) })) });
  }
  if (!span) return [...reports, ...(pelvis ? [context.pelvisReport!] : []), ...(stance ? [context.stanceReport!] : [])];
  const report = context.spanReport;
  if (!report || report.policy !== 'bounded-interior-rotation-span.v1' || !Array.isArray(report.ticks)
    || report.ticks.length < 3 || report.ticks.length > 18 || Array.from(report.ticks).some((t, i) => t !== report.ticks[0] + i)
    || !Array.isArray(report.corrections) || report.corrections.length !== 3) throw new Error('Invalid rotation-span export-boundary provenance.');
  const spec = parseRotationSpanBake({ clipId: report.clipId, startTick: report.ticks[0], maxRotationDegrees: report.maxRotationDegrees,
    rotations: report.corrections.map(r => ({ joint: r.joint, values: r.values?.map(v => v.after) })) }, [report.clipId], [report.clipId], []);
  if (report.ticks.length !== spec.rotations[0].values.length) throw new Error('Invalid rotation-span tick coverage.');
  assertDisjointRotationSpan(spec, reports.map(r => ({ clipId: r.clipId, startTick: r.ticks[0], maxRotationDegrees: r.maxRotationDegrees,
    rotations: r.corrections.map(c => ({ joint: c.joint, values: c.values.map(v => v.after) })) })));
  return [...reports, report, ...(pelvis ? [context.pelvisReport!] : []), ...(stance ? [context.stanceReport!] : [])];
}

/** Restore the pre-authoring curve for unselected emitted keys, never source references. */
export function twoKeyExportBaseline(clip: THREE.AnimationClip, context: TwoKeyExportBoundary, bones: readonly THREE.Bone[], roots: readonly string[], signal?: AbortSignal, scene?: THREE.Object3D, height?: number): THREE.AnimationClip {
  signal?.throwIfAborted();
  const coupled = context.coupledReport?.clipId === clip.name ? context.coupledReport : undefined;
  if (coupled) clip = restoreCoupledBodyHeightClip(clip, coupled);
  const endpoint = context.endpointReport?.clipId === clip.name ? context.endpointReport : undefined;
  if (endpoint) clip = restoreHipYLoopEndpointClip(clip, endpoint);
  const allReports = twoKeyExportReports(context).filter(report => report.clipId === clip.name);
  const pelvis = allReports.find((report): report is PelvisLayerReport => report.policy === PELVIS_LAYER_POLICY);
  if (pelvis) {
    if (!scene || height === undefined || roots.length !== 1) throw new Error('Missing pelvis-layer scene/height binding.');
    clip = restorePelvisLayer(clip, pelvis, bones, scene, roots[0], height, signal);
  }
  const reports = allReports.filter((report): report is Report | SpanReport | StanceReport => report.policy !== PELVIS_LAYER_POLICY);
  const fail = (): never => { throw new Error('Invalid two-key export-boundary provenance.'); };
  if (!reports.length) { if (pelvis || endpoint) return clip; fail(); }
  const rootNames = [...roots, ...bones.filter(b => !bones.includes(b.parent as THREE.Bone)).map(b => b.name)];
  const specs = reports.map(report => report.policy === STANCE_TRAJECTORY_POLICY
    ? parseStanceTrajectory({ policy: report.policy, clipId: report.clipId, anchorTick: (report as StanceReport).anchorTick, startTick: 2,
      maxRotationDegrees: report.maxRotationDegrees, rotations: report.corrections.map(r => ({ joint: r.joint, values: r.values.map(v => v.after) })) }, [clip.name], [clip.name])
    : (report.policy === 'bounded-interior-rotation-span.v1' ? parseRotationSpanBake : parseTwoKeyRotationBake)({ clipId: report.clipId,
      startTick: report.ticks[0], maxRotationDegrees: report.maxRotationDegrees,
      rotations: report.corrections.map(r => ({ joint: r.joint, values: r.values.map(v => v.after) })) }, [clip.name], [clip.name], rootNames));
  const duration = Math.round(clip.duration * 60);
  if (duration < 3 || duration > 3600 || Math.abs(duration - clip.duration * 60) > 1e-3) fail();
  const restoredValues = new Map<string, { track: THREE.KeyframeTrack; values: number[][]; ticks: Set<number> }>();
  const replacements = new Map<string, THREE.QuaternionKeyframeTrack>();
  for (const [index, report] of reports.entries()) {
    const spec = specs[index];
    const count = spec.rotations[0].values.length;
    if (spec.startTick + count - 1 >= duration) fail();
    const chain = spec.rotations.map(r => bones.filter(b => b.name === r.joint));
    if (chain.some((matches, i) => matches.length !== 1 || (i > 0 && matches[0].parent !== chain[i - 1][0]))) fail();
    for (const correction of report.corrections) {
      signal?.throwIfAborted();
      const name = correction.joint + '.quaternion', tracks = clip.tracks.filter(t => t.name === name);
      if (tracks.length !== 1 || correction.values.length !== count) fail();
      const track = tracks[0]; validateChordRotation(track, duration);
      if (track.times.length !== duration + 1) fail();
      const restored = restoredValues.get(name) ?? { track,
        values: Array.from({ length: duration + 1 }, (_, tick) => Array.from(track.values.slice(tick * 12 + 4, tick * 12 + 8))), ticks: new Set<number>() };
      correction.values.forEach((value, index) => {
        const tick = spec.startTick + index;
        if (value.tick !== tick || !Array.isArray(value.before) || value.before.length !== 4
          || value.before.some(v => !Number.isFinite(v) || Math.fround(v) !== v)
          || Math.abs(Math.hypot(...value.before) - 1) > 1e-6
          || !Array.isArray(value.after) || value.after.some((v, i) => v !== track.values[tick * 12 + 4 + i])
          || rotationDifferenceDegrees(value.before, value.after) !== value.storedCorrectionDegrees
          || value.storedCorrectionDegrees > spec.maxRotationDegrees) fail();
        restored.values[tick] = [...value.before];
        restored.ticks.add(tick);
      });
      restoredValues.set(name, restored);
    }
  }
  for (const [name, { track, values, ticks }] of restoredValues) {
    const restored = chordRotationTrack(name, Array.from(track.times), values.flat());
    validateChordRotation(restored, duration);
    for (let tick = 0; tick <= duration; tick++) if (!ticks.has(tick)
      && restored.values.slice(tick * 12 + 4, tick * 12 + 8).some((v, i) => v !== track.values[tick * 12 + 4 + i])) fail();
    replacements.set(name, restored);
  }
  signal?.throwIfAborted();
  return new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.map(t => replacements.get(t.name) ?? t));
}
