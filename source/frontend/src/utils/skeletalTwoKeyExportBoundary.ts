import * as THREE from 'three';
import { chordRotationTrack, validateChordRotation } from './skeletalChordRotation';
import { bakeTwoKeyRotations, parseTwoKeyRotationSelection } from './skeletalTwoKeyRotation';
import { rotationDifferenceDegrees } from './skeletalTerminalRotation';

export const TWO_KEY_EXPORT_BOUNDARY_POLICY = 'preserve-unselected-emitted-keys.v1' as const;
type Report = ReturnType<typeof bakeTwoKeyRotations>['report'];
export type TwoKeyExportBoundary = { policy: typeof TWO_KEY_EXPORT_BOUNDARY_POLICY } & (
  { report: Report; reports?: never } | { reports: Report[]; report?: never }
);

export function twoKeyExportReports(context: TwoKeyExportBoundary): readonly Report[] {
  const single = Object.prototype.hasOwnProperty.call(context, 'report');
  if (context.policy !== TWO_KEY_EXPORT_BOUNDARY_POLICY
    || Object.keys(context).sort().join(',') !== (single ? 'policy,report' : 'policy,reports')) throw new Error('Invalid two-key export-boundary selection.');
  const reports: Report[] = single ? [context.report!] : context.reports!;
  if (!Array.isArray(reports) || reports.length < 1 || reports.length > 2
    || reports.some(report => !report || report.policy !== 'two-adjacent-interior-rotations.v1'
      || !Array.isArray(report.ticks) || report.ticks.length !== 2 || report.ticks[1] !== report.ticks[0] + 1
      || !Array.isArray(report.corrections) || report.corrections.length !== 3)) throw new Error('Invalid two-key export-boundary provenance.');
  parseTwoKeyRotationSelection({ twoKeyRotationBakes: reports.map(report => ({ clipId: report.clipId,
    startTick: report.ticks[0], maxRotationDegrees: report.maxRotationDegrees,
    rotations: report.corrections.map(r => ({ joint: r.joint, values: r.values?.map(v => v.after) })) })) },
  reports.map(r => r.clipId), reports.map(r => r.clipId), []);
  return reports;
}

/** Restore the pre-authoring curve for unselected emitted keys, never source references. */
export function twoKeyExportBaseline(clip: THREE.AnimationClip, context: TwoKeyExportBoundary, bones: readonly THREE.Bone[], roots: readonly string[], signal?: AbortSignal): THREE.AnimationClip {
  signal?.throwIfAborted();
  const reports = twoKeyExportReports(context).filter(report => report.clipId === clip.name);
  const fail = (): never => { throw new Error('Invalid two-key export-boundary provenance.'); };
  if (!reports.length) fail();
  const specs = parseTwoKeyRotationSelection({ twoKeyRotationBakes: reports.map(report => ({ clipId: report.clipId,
    startTick: report.ticks[0], maxRotationDegrees: report.maxRotationDegrees,
    rotations: report.corrections.map(r => ({ joint: r.joint, values: r.values.map(v => v.after) })) })) }, [clip.name], [clip.name],
  [...roots, ...bones.filter(b => !bones.includes(b.parent as THREE.Bone)).map(b => b.name)]).twoKeyRotationBakes!;
  const duration = Math.round(clip.duration * 60);
  if (duration < 3 || duration > 3600 || Math.abs(duration - clip.duration * 60) > 1e-3) fail();
  const restoredValues = new Map<string, { track: THREE.KeyframeTrack; values: number[][]; ticks: Set<number> }>();
  const replacements = new Map<string, THREE.QuaternionKeyframeTrack>();
  for (const [index, report] of reports.entries()) {
    const spec = specs[index];
    if (spec.startTick + 1 >= duration) fail();
    const chain = spec.rotations.map(r => bones.filter(b => b.name === r.joint));
    if (chain.some((matches, i) => matches.length !== 1 || (i > 0 && matches[0].parent !== chain[i - 1][0]))) fail();
    for (const correction of report.corrections) {
      signal?.throwIfAborted();
      const name = correction.joint + '.quaternion', tracks = clip.tracks.filter(t => t.name === name);
      if (tracks.length !== 1 || correction.values.length !== 2) fail();
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
