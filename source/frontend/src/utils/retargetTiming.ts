export interface RetargetVisualTiming {
  durationFrames: number;
  cycles: number;
  /** Explicit output-frame/source-phase landmarks, including both endpoints. */
  landmarks?: Array<{outputFrame:number;sourcePhase:number}>;
}

export function validateRetargetVisualTiming(value: RetargetVisualTiming): void {
  if (!Number.isInteger(value.durationFrames) || value.durationFrames < 1 || value.durationFrames > 3600
    || !Number.isInteger(value.cycles) || value.cycles < 1 || value.cycles > 8
    || value.durationFrames % value.cycles !== 0) {
    throw new Error('Visual timing requires 1-3600 duration frames and 1-8 cycles dividing the frame duration.');
  }
  if (value.landmarks !== undefined) {
    const points=value.landmarks;
    if (value.cycles!==1 || !Array.isArray(points) || points.length<2 || points.length>16
      || points.some((point,i)=>!point || !Number.isInteger(point.outputFrame) || !Number.isFinite(point.sourcePhase)
        || point.outputFrame<0 || point.outputFrame>value.durationFrames || point.sourcePhase<0 || point.sourcePhase>1
        || (i>0 && (point.outputFrame<=points[i-1].outputFrame || point.sourcePhase<points[i-1].sourcePhase)))
      || points[0].outputFrame!==0 || points[0].sourcePhase!==0
      || points.at(-1)!.outputFrame!==value.durationFrames || points.at(-1)!.sourcePhase!==1) {
      throw new Error('Visual landmarks require one cycle and 2-16 monotonic frame/phase pairs covering both endpoints.');
    }
  }
}

/** Output frame grid is independent of source cadence; references remain unchanged. */
export function retargetSourceTime(time: number, sourceDuration: number, timing: RetargetVisualTiming): number {
  validateRetargetVisualTiming(timing);
  const duration = timing.durationFrames / 60;
  if (!Number.isFinite(time) || time < 0 || !Number.isFinite(sourceDuration) || sourceDuration <= 0) {
    throw new Error('Invalid retarget sampling time.');
  }
  if (time >= duration) return sourceDuration;
  if (timing.landmarks) {
    const frame=time*60;
    for (let i=1;i<timing.landmarks.length;i++) {
      const a=timing.landmarks[i-1],b=timing.landmarks[i];
      if (frame<=b.outputFrame) return (a.sourcePhase+(b.sourcePhase-a.sourcePhase)*(frame-a.outputFrame)/(b.outputFrame-a.outputFrame))*sourceDuration;
    }
  }
  const phase = time / duration * timing.cycles;
  return (phase - Math.floor(phase)) * sourceDuration;
}
