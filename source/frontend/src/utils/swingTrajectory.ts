import * as THREE from 'three';

export interface SwingTrajectory {
  foot: 'left' | 'right';
  startFrame: number;
  endFrame: number;
  startAnchorFrame: number;
  endAnchorFrame: number;
  startGrounded: boolean;
  endGrounded: boolean;
  lift: number;
  descendantRotations?: boolean;
  travelPower?: number;
  lateralOffset?: number;
}
export type SwingTrajectories = Record<string, SwingTrajectory[]>;
export interface SwingAnchor { sole: THREE.Vector3; quaternion: THREE.Quaternion }
export interface SwingRotationEnvelope { spec: SwingTrajectory; start: THREE.Quaternion; end: THREE.Quaternion }

/** Ordered intervals hold the preceding landing rotation between steps. */
export function sampleSwingDescendantRotation(intervals: readonly SwingRotationEnvelope[], frame: number): THREE.Quaternion | undefined {
  if (!intervals.length) return undefined;
  const {spec,start,end}=intervals.reduce((selected,candidate)=>candidate.spec.startFrame<=frame?candidate:selected,intervals[0]);
  const t=THREE.MathUtils.clamp((frame-spec.startFrame)/(spec.endFrame-spec.startFrame),0,1);
  return start.clone().slerp(end,t*t*(3-2*t));
}

export function parseSwingTrajectories(value: unknown): SwingTrajectories | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 256) throw new Error('Invalid swingTrajectories clip map.');
  let total = 0;
  return Object.fromEntries(Object.entries(value).map(([name, raw]) => {
    if (!name.trim() || name.length > 160 || !Array.isArray(raw) || !raw.length || (total += raw.length) > 512) throw new Error('Swing trajectories require named clips and at most 512 intervals.');
    const entries = Array.from(raw, item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid swing trajectory.');
      const p = item as Record<string, unknown>;
      if (Object.keys(p).some(k => !['foot','startFrame','endFrame','startAnchorFrame','endAnchorFrame','startGrounded','endGrounded','lift','descendantRotations','travelPower','lateralOffset'].includes(k))
        || (p.lateralOffset !== undefined && (typeof p.lateralOffset !== 'number' || !Number.isFinite(p.lateralOffset) || Math.abs(p.lateralOffset) > 10))
        || (p.travelPower !== undefined && (typeof p.travelPower !== 'number' || !Number.isFinite(p.travelPower) || p.travelPower < 1 || p.travelPower > 8))
        || (p.descendantRotations !== undefined && typeof p.descendantRotations !== 'boolean')
        || (p.foot !== 'left' && p.foot !== 'right')
        || ['startFrame','endFrame','startAnchorFrame','endAnchorFrame'].some(k => typeof p[k] !== 'number' || !Number.isInteger(p[k]) || (p[k] as number) < 0 || (p[k] as number) > 19999)
        || (p.endFrame as number) - (p.startFrame as number) < 2
        || typeof p.startGrounded !== 'boolean' || typeof p.endGrounded !== 'boolean'
        || typeof p.lift !== 'number' || !Number.isFinite(p.lift) || p.lift < 0 || p.lift > 10) throw new Error('Invalid swing frame, grounding or lift.');
      return { ...p } as unknown as SwingTrajectory;
    });
    for (let i=0;i<entries.length;i++) for (let j=0;j<i;j++) {
      const a=entries[i],b=entries[j];
      if (a.foot===b.foot && !!a.descendantRotations !== !!b.descendantRotations) throw new Error('Repeated swings must agree on descendant rotation ownership.');
      if (a.foot===b.foot && a.startFrame<=b.endFrame && b.startFrame<=a.endFrame) throw new Error('Swing intervals for one foot must not overlap.');
    }
    return [name,entries];
  }));
}

/** Anchors include receiving-root travel; output is converted back to actor space. */
export function sampleSwingTrajectory(spec: SwingTrajectory, start: SwingAnchor, end: SwingAnchor, frame: number, displacement: THREE.Vector3): SwingAnchor {
  if (!Number.isInteger(frame) || frame<spec.startFrame || frame>spec.endFrame) throw new Error('Swing sample is outside its interval.');
  const t=(frame-spec.startFrame)/(spec.endFrame-spec.startFrame),progress=1-Math.pow(1-t,spec.travelPower??1),smooth=progress*progress*(3-2*progress);
  const sole=start.sole.clone().lerp(end.sole,smooth);
  sole.y += spec.lift * 16*t*t*(1-t)*(1-t);
  sole.x += (spec.lateralOffset??0) * 16*t*t*(1-t)*(1-t);
  return { sole:sole.sub(displacement), quaternion:start.quaternion.clone().slerp(end.quaternion,smooth).normalize() };
}
