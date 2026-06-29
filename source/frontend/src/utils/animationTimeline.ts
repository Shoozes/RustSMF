import * as THREE from 'three';

export interface AnimationTimelineSummary {
  trackCount: number;
  keyframeTimes: number[];
  selectedTrackCount: number;
  selectedKeyframeTimes: number[];
}

const roundTime = (value: number): number => Math.round(value * 10000) / 10000;

const collectTimes = (tracks: THREE.KeyframeTrack[]): number[] => {
  const times = new Set<number>();
  for (const track of tracks) {
    for (const time of track.times) {
      if (Number.isFinite(time)) {
        times.add(roundTime(time));
      }
    }
  }
  return [...times].sort((a, b) => a - b);
};

export const getClipByName = (
  clips: THREE.AnimationClip[],
  clipName: string,
): THREE.AnimationClip | null => {
  if (clips.length === 0) return null;
  return clips.find((clip, index) => (clip.name || `clip_${index}`) === clipName) ?? clips[0] ?? null;
};

export const isTrackForBone = (trackName: string, boneName: string): boolean => {
  if (!boneName) return false;
  return (
    trackName === boneName ||
    trackName.startsWith(`${boneName}.`) ||
    trackName.includes(`[${boneName}]`) ||
    trackName.includes(`.${boneName}.`)
  );
};

export const summarizeAnimationTimeline = (
  clip: THREE.AnimationClip | null | undefined,
  selectedBoneName = '',
): AnimationTimelineSummary => {
  if (!clip) {
    return {
      trackCount: 0,
      keyframeTimes: [],
      selectedTrackCount: 0,
      selectedKeyframeTimes: [],
    };
  }

  const selectedTracks = selectedBoneName
    ? clip.tracks.filter((track) => isTrackForBone(track.name, selectedBoneName))
    : [];

  return {
    trackCount: clip.tracks.length,
    keyframeTimes: collectTimes(clip.tracks),
    selectedTrackCount: selectedTracks.length,
    selectedKeyframeTimes: collectTimes(selectedTracks),
  };
};
