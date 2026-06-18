import * as THREE from 'three';

interface AnimatePanelProps {
  clips: THREE.AnimationClip[];
  currentClipName: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  editorMode?: string;
}

export default function AnimatePanel({
  clips,
  currentClipName,
  isPlaying,
  currentTime,
  duration,
  editorMode = 'animate',
}: AnimatePanelProps) {
  const clipCount = clips.length;

  return (
    <div className="inspector" data-testid="animate-workspace-panel" data-editor-mode={editorMode}>
      <div className="panel-title">Animate Workspace</div>
      <div className="text-xs text-slate-300">Animation preview, clip list, and scrub pacing live in Timeline.</div>
      <div className="text-[10px] text-slate-400 mt-2">Clips loaded: {clipCount}</div>
      <div className="text-[10px] text-slate-400">Current clip: {currentClipName || 'none'}</div>
      <div className="text-[10px] text-slate-400">Playback: {isPlaying ? 'Playing' : 'Paused'}</div>
      <div className="text-[10px] text-slate-400">Time: {currentTime.toFixed(2)} / {duration.toFixed(2)}s</div>
      <div className="text-[10px] text-slate-500 mt-2">
        Use Timeline controls below for play, reset, scrub, and speed. Keep model loading stable while timeline scrubs.
      </div>
    </div>
  );
}
