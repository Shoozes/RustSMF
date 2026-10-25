import * as THREE from 'three';
import { chordRotationTrack, validateChordRotation } from './skeletalChordRotation';
import { bakeTwoKeyRotations, parseTwoKeyRotationSelection, parseTwoKeyRotationBake, MAX_TWO_KEY_ROTATION_BAKES } from './skeletalTwoKeyRotation';
import { rotationDifferenceDegrees } from './skeletalTerminalRotation';
import { bakeRotationSpan, parseRotationSpanBake, assertDisjointRotationSpan } from './skeletalRotationSpan';
import { PELVIS_LAYER_POLICY, pelvisLayerRecipe, restorePelvisLayer, type PelvisLayerReport } from './skeletalPelvisLayer';

export const TWO_KEY_EXPORT_BOUNDARY_POLICY = 'preserve-unselected-emitted-keys.v1' as const;
type Report = ReturnType<typeof bakeTwoKeyRotations>['report'];
type SpanReport = ReturnType<typeof bakeRotationSpan>['report'];
export type TwoKeyExportBoundary = { policy: typeof TWO_KEY_EXPORT_BOUNDARY_POLICY; spanReport?: SpanReport; pelvisReport?: PelvisLayerReport } & (
  { report: Report; reports?: never } | { reports: Report[]; report?: never } | { spanReport: SpanReport; report?: never; reports?: never } | { pelvisReport: PelvisLayerReport; report?: never; reports?: never }
);

export function twoKeyExportReports(context: TwoKeyExportBoundary): readonly (Report | SpanReport | PelvisLayerReport)[] {
  const single = Object.prototype.hasOwnProperty.call(context, 'report'), plural = Object.prototype.hasOwnProperty.call(context, 'reports'), span = Object.prototype.hasOwnProperty.call(context, 'spanReport'), pelvis = Object.prototype.hasOwnProperty.call(context, 'pelvisReport');
  if (pelvis) pelvisLayerRecipe(context.pelvisReport!);
  if (context.policy !== TWO_KEY_EXPORT_BOUNDARY_POLICY
    || (single && plural) || (!single && !plural && !span && !pelvis)
    || Object.keys(context).sort().join(',') !== ['policy', ...(single ? ['report'] : plural ? ['reports'] : []), ...(span ? ['spanReport'] : []), ...(pelvis ? ['pelvisReport'] : [])].sort().join(',')) throw new Error('Invalid two-key export-boundary selection.');
  const reports: Report[] = single ? [context.report!] : plural ? context.reports! : [];
  if (!Array.isArray(reports) || ((single || plural) && reports.length < 1) || reports.length > MAX_TWO_KEY_ROTATION_BAKES
    || reports.some(report => !report || report.policy !== 'two-adjacent-interior-rotations.v1'
      || !Array.isArray(report.ticks) || report.ticks.length !== 2 || report.ticks[1] !== report.ticks[0] + 1
      || !Array.isArray(report.corrections) || report.corrections.length !== 3)) throw new Error('Invalid two-key export-boundary provenance.');
  if (reports.length) parseTwoKeyRotationSelection({ twoKeyRotationBakes: reports.map(report => ({ clipId: report.clipId,
    startTick: report.ticks[0], maxRotationDegrees: report.maxRotationDegrees,
    rotations: report.corrections.map(r => ({ joint: r.joint, values: r.values?.map(v => v.after) })) })) },
  reports.map(r => r.clipId), reports.map(r => r.clipId), []);
  if (!span) return [...reports, ...(pelvis ? [context.pelvisReport!] : [])];
  const report = context.spanReport;
  if (!report || report.policy !== 'bounded-interior-rotation-span.v1' || !Array.isArray(report.ticks)
    || report.ticks.length < 3 || report.ticks.length > 18 || Array.from(report.ticks).some((t, i) => t !== report.ticks[0] + i)
    || !Array.isArray(report.corrections) || report.corrections.length !== 3) throw new Error('Invalid rotation-span export-boundary provenance.');
  const spec = parseRotationSpanBake({ clipId: report.clipId, startTick: report.ticks[0], maxRotationDegrees: report.maxRotationDegrees,
    rotations: report.corrections.map(r => ({ joint: r.joint, values: r.values?.map(v => v.after) })) }, [report.clipId], [report.clipId], []);
  if (report.ticks.length !== spec.rotations[0].values.length) throw new Error('Invalid rotation-span tick coverage.');
  assertDisjointRotationSpan(spec, reports.map(r => ({ clipId: r.clipId, startTick: r.ticks[0], maxRotationDegrees: r.maxRotationDegrees,
    rotations: r.corrections.map(c => ({ joint: c.joint, values: c.values.map(v => v.after) })) })));
  return [...reports, report, ...(pelvis ? [context.pelvisReport!] : [])];
}

/** Restore the pre-authoring curve for unselected emitted keys, never source references. */
export function twoKeyExportBaseline(clip: THREE.AnimationClip, context: TwoKeyExportBoundary, bones: readonly THREE.Bone[], roots: readonly string[], signal?: AbortSignal, scene?: THREE.Object3D, height?: number): THREE.AnimationClip {
  signal?.throwIfAborted();
  const allReports = twoKeyExportReports(context).filter(report => report.clipId === clip.name);
  const pelvis = allReports.find((report): report is PelvisLayerReport => report.policy === PELVIS_LAYER_POLICY);
  if (pelvis) {
    if (!scene || height === undefined || roots.length !== 1) throw new Error('Missing pelvis-layer scene/height binding.');
    clip = restorePelvisLayer(clip, pelvis, bones, scene, roots[0], height, signal);
  }
  const reports = allReports.filter((report): report is Report | SpanReport => report.policy !== PELVIS_LAYER_POLICY);
  const fail = (): never => { throw new Error('Invalid two-key export-boundary provenance.'); };
  if (!reports.length) { if (pelvis) return clip; fail(); }
  const rootNames = [...roots, ...bones.filter(b => !bones.includes(b.parent as THREE.Bone)).map(b => b.name)];
  const specs = reports.map(report => (report.policy === 'bounded-interior-rotation-span.v1' ? parseRotationSpanBake : parseTwoKeyRotationBake)({ clipId: report.clipId,
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
