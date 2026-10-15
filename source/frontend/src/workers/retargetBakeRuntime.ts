import { retargetAnimationClip } from '../utils/animationRetarget';
import { restoreClip, restoreOptions, restoreSkeleton, snapshotClip } from './retargetSnapshot';
import type { BakeInput, BakeOutput } from './retargetProtocol';

/** The existing solver runs unchanged against private worker objects. */
export function bakeRetarget(input: BakeInput, progress: (completed:number,total:number)=>void): BakeOutput {
  if (!input.clips.length || input.clips.length > 256) throw new Error('Transfer needs 1–256 selected clips.');
  let outputValues=0;
  for(const {clip,options} of input.clips){
    const duration=options.visualTiming?options.visualTiming.durationFrames/60:clip.duration;
    const samples=options.sampleRateHz?Math.ceil(duration*options.sampleRateHz)+1:
      new Set(clip.tracks.flatMap(track=>Array.from(track.times))).size;
    outputValues+=Math.max(2,samples)*input.mapping.decisions.length*13;
  }
  if(outputValues>16_000_000)throw new Error('Transfer preview exceeds 16 million output values. Select fewer clips or reduce the profile sample rate.');
  const source = restoreSkeleton(input.source), target = restoreSkeleton(input.target);
  try {
    const clips: BakeOutput['clips'] = [], reports: BakeOutput['reports'] = [];
    progress(0, input.clips.length);
    for (const item of input.clips) {
      const result = retargetAnimationClip(restoreClip(item.clip), source, target, input.mapping, restoreOptions(item.options));
      clips.push(snapshotClip(result.clip)); reports.push(result.report); progress(clips.length, input.clips.length);
    }
    return {clips, reports};
  } finally { source.dispose(); target.dispose(); }
}
