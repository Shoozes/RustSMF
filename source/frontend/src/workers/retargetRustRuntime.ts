import * as THREE from 'three';
import type { BakeInput, BakeOutput } from './retargetProtocol';
import { portableBakeRequest, type PortableBakeRequestV1 } from './retargetPortable';
import type { AnimationRetargetReport } from '../utils/animationRetarget';

function invalid(): never { throw new Error('Retarget runtime returned invalid clips or reports. Rebuild the matching Rust/WASM runtime.'); }
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : invalid();
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const count = (v: unknown): v is number => finite(v) && Number.isSafeInteger(v) && v >= 0;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string');
const tuple = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(finite);

/** Bound and own report JSON before exposing it to preview, diagnostics or history. */
function report(value: unknown, source: string, target: string, duration: number): AnimationRetargetReport {
  let budget = 0;
  function visit(v: unknown, depth: number): void {
    if (++budget > 1_000_000 || depth > 64) invalid();
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return;
    if (typeof v === 'number') { if (!finite(v)) invalid(); return; }
    if (Array.isArray(v)) { v.forEach(item => visit(item, depth + 1)); return; }
    Object.values(record(v)).forEach(item => visit(item, depth + 1));
  }
  visit(value, 0);
  const r = record(value);
  if (r.sourceClip !== (source || '(unnamed)') || r.targetClip !== target || r.duration !== duration
    || !['sampleCount', 'quaternionTrackCount', 'positionTrackCount', 'scaleTrackCount'].every(k => count(r[k]))
    || !finite(r.rootMotionScale) || !tuple(r.upCorrection, 4) || !tuple(r.orientationCorrection, 4)
    || !(r.sampleRateHz === null || finite(r.sampleRateHz)) || !['linear', 'step'].includes(String(r.interpolation))
    || typeof r.nextDownRationalTimes !== 'boolean' || !['relative', 'absolute'].includes(String(r.directionTransferMode))
    || !['rest', 'first-frame', 'clip'].includes(String(r.sourceReferencePose))
    || !['sourceReferenceClip', 'targetReferenceClip'].every(k => r[k] === null || typeof r[k] === 'string')
    || !['discardedTracks', 'hierarchyOnlyTracks', 'directionAlignedBones', 'preservedTargetLeafRotations', 'preservedTargetRotations'].every(k => strings(r[k]))
    || !(r.directionTransferBones === null || strings(r.directionTransferBones))
    || !Array.isArray(r.mappedBones) || !Array.isArray(r.targetChainCurls)) invalid();
  for (const raw of r.mappedBones) {
    const d = record(raw);
    if (typeof d.source !== 'string' || typeof d.target !== 'string' || !finite(d.confidence) || d.confidence < 0 || d.confidence > 1
      || !['manual', 'canonical', 'normalized', 'fuzzy'].includes(String(d.method))) invalid();
  }
  for (const raw of r.targetChainCurls) {
    const c = record(raw);
    if (typeof c.palmBone !== 'string' || !strings(c.bones) || !tuple(c.palmNormal, 3)
      || !Array.isArray(c.degrees) || c.degrees.length !== c.bones.length || !c.degrees.every(finite)) invalid();
  }
  if (r.poseRecovery !== null) {
    const p = record(r.poseRecovery); if (!['peakFrame', 'holdThroughFrame', 'returnByFrame'].every(k => count(p[k]))) invalid();
  }
  if (r.naturalMotion !== null) {
    const n = record(r.naturalMotion), legs = record(n.legs);
    if (n.contactSpace !== 'model' || !Array.isArray(n.contacts)) invalid();
    for (const side of ['left', 'right']) {
      const leg = record(legs[side]);
      if (!['hip', 'knee', 'ankle'].every(k => typeof leg[k] === 'string') || !['minimumBendDegrees', 'maximumBendDegrees'].every(k => finite(leg[k]))
        || !['soleOffsetAnkleLocal', 'referenceSolePoint', 'polePelvisLocal', 'referenceBendPlaneNormal'].every(k => tuple(leg[k], 3)) || !tuple(leg.referenceFootQuaternion, 4)) invalid();
    }
    if (n.torso !== null) {const t = record(n.torso); if (!strings(t.targetBones) || !tuple(t.effectiveWeights, t.targetBones.length)) invalid();}
    if (n.legMotionLimit !== null) {
      const l = record(n.legMotionLimit), sides = record(l.sides);
      for (const side of ['left', 'right']) {
        const s = record(sides[side]);
        if (!count(s.constrainedSamples) || !['maximumRequestedForwardDegrees', 'maximumRequestedBackwardDegrees', 'maximumRequestedLateralDegrees'].every(k => finite(s[k]))) invalid();
      }
    }
    for (const raw of n.contacts) {
      const c = record(raw);
      if (!['left', 'right'].includes(String(c.foot)) || typeof c.clip !== 'string' || typeof c.unreachable !== 'boolean'
        || !['maximumResidual', 'maximumPelvisCorrection'].every(k => finite(c[k])) || !count(c.clampedSamples)) invalid();
    }
  }
  if (r.poseRanges !== undefined) {
    const p = record(r.poseRanges);
    if (typeof p.profile !== 'string' || p.clip !== target || !['within-profile', 'review-required'].includes(String(p.status))
      || !count(p.sampleCount) || !count(p.checkedJoints) || !Array.isArray(p.issues)) invalid();
    for (const raw of p.issues) {
      const i = record(raw);
      if (typeof i.bone !== 'string' || typeof i.component !== 'string' || !tuple(i.limits, 2)
        || !['firstFrame', 'lastFrame', 'worstFrame', 'samples'].every(k => count(i[k])) || !finite(i.worstDegrees) || !finite(i.excessDegrees)) invalid();
    }
  }
  for (const key of ['rootMotionExtraction', 'visualTiming', 'localReferenceCorrections', 'jointConstraints', 'endpointEnvelope']) {
    if (r[key] !== undefined) record(r[key]);
  }
  if (r.endpointEnvelope !== undefined) {
    const e = record(r.endpointEnvelope);
    if (!['matched', 'constraint-conflict'].includes(String(e.status))) invalid();
    for (const key of ['entry', 'exit']) {
      const p = record(e[key]);
      if (!finite(p.maximumPosition) || !finite(p.maximumDegrees) || typeof p.positionBone !== 'string' || typeof p.rotationBone !== 'string') invalid();
    }
  }
  if (r.jointConstraints !== undefined) {
    const j = record(r.jointConstraints);
    if (typeof j.neck !== 'string' || typeof j.head !== 'string' || !count(j.correctedSamples)
      || !finite(j.maximumCorrectionDegrees) || !finite(j.maximumResidualDegrees) || !(j.maximumResidualFrame === null || count(j.maximumResidualFrame))) invalid();
  }
  if (r.localReferenceCorrections !== undefined) for (const raw of Object.values(record(r.localReferenceCorrections))) {
    const c = record(raw); if (!tuple(c.from, 4) || !tuple(c.to, 4)) invalid();
  }
  if (r.forearmTwist !== undefined) {
    if (!Array.isArray(r.forearmTwist)) invalid();
    for (const raw of r.forearmTwist) {
      const f = record(raw);
      if (typeof f.forearm !== 'string' || typeof f.hand !== 'string' || !finite(f.share) || !finite(f.maximumTransferredDegrees)
        || !tuple(f.axis, 3) || !tuple(f.referenceRotation, 4)) invalid();
    }
  }
  return structuredClone(value) as AnimationRetargetReport;
}

/** Strict wire boundary shared by the native command and browser worker. */
export function restoreRustBake(value: unknown, request: PortableBakeRequestV1): BakeOutput {
  const r = record(value);
  if (r.apiVersion !== 1 || r.stage !== 'advanced-bake' || !Array.isArray(r.capabilities)
    || r.capabilities.join(',') !== 'core-bake-v1,advanced-bake-v1' || !['baked', 'error'].includes(String(r.status)) || !Array.isArray(r.clips)) invalid();
  if (r.status === 'error') {
    const e = record(r.error);
    if (r.clips.length || typeof e.code !== 'string' || typeof e.path !== 'string' || typeof e.message !== 'string') invalid();
    throw new Error(`Transfer could not bake: ${e.message} (${e.code}, ${e.path}). Review Mapping details or the profile.`);
  }
  if (r.clips.length !== request.clips.length || !r.clips.length || r.clips.length > 256 || r.error != null) invalid();
  let scalars = 0;
  const reports: AnimationRetargetReport[] = [];
  const clips = r.clips.map((raw, index) => {
    const entry = record(raw), clip = record(entry.clip);
    if (typeof clip.name !== 'string' || !clip.name || !finite(clip.duration) || clip.duration < 0 || clip.duration > 1e9
      || !(clip.blendMode === THREE.NormalAnimationBlendMode || clip.blendMode === THREE.AdditiveAnimationBlendMode)
      || !Array.isArray(clip.tracks) || clip.tracks.length > 32768) invalid();
    const names = new Set<string>();
    const tracks = clip.tracks.map(rawTrack => {
      const t = record(rawTrack);
      if (!count(t.node) || t.node >= request.target.nodes.length || typeof t.name !== 'string' || names.has(t.name)
        || !['position', 'quaternion', 'scale'].includes(String(t.property)) || !['linear', 'step'].includes(String(t.interpolation))
        || !Array.isArray(t.times) || !t.times.length || t.times.length > 20000 || !Array.isArray(t.values)) invalid();
      names.add(t.name);
      const node = request.target.nodes[t.node];
      const binding = THREE.PropertyBinding.parseTrackName(t.name);
      if (binding.nodeName !== node.name || binding.objectName !== undefined || binding.propertyName !== t.property || binding.propertyIndex !== undefined) invalid();
      const size = t.property === 'quaternion' ? 4 : 3;
      const rawTimes = t.times;
      if (t.values.length !== rawTimes.length * size || rawTimes.some((time: unknown, i: number) => !finite(time) || time < 0 || time > (clip.duration as number) + 1e-5 || i > 0 && time <= rawTimes[i - 1])
        || !t.values.every(finite)) invalid();
      scalars += t.times.length + t.values.length;
      if (scalars > 16_000_000) invalid();
      const times = new Float32Array(t.times), values = new Float32Array(t.values);
      if (!times.every(Number.isFinite) || !values.every(Number.isFinite) || times.some((time, i) => i > 0 && time <= times[i - 1])) invalid();
      return {name: t.name, type: t.property === 'quaternion' ? 'quaternion' : 'vector',
        interpolation: t.interpolation === 'step' ? THREE.InterpolateDiscrete : THREE.InterpolateLinear, times, values};
    });
    const rawReport = record(entry.report);
    for (const key of ['poseRanges', 'localReferenceCorrections', 'forearmTwist', 'jointConstraints', 'endpointEnvelope']) {
      if (request.clips[index].options[key] !== undefined && rawReport[key] === undefined) invalid();
    }
    reports.push(report(rawReport, request.clips[index].clip.name, clip.name, clip.duration));
    return {name: clip.name, duration: clip.duration, blendMode: clip.blendMode as THREE.AnimationBlendMode, tracks};
  });
  return {clips, reports};
}

export function rustBakeRequest(input: BakeInput): PortableBakeRequestV1 { return portableBakeRequest(input, [0], 'bake'); }
