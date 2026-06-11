import React from 'react';

interface TimelineProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onReset: () => void;
  onScrub: (t: number) => void;
  onSpeedChange: (s: number) => void;
  disabled?: boolean;
}

const Timeline: React.FC<TimelineProps> = ({
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onReset,
  onScrub,
  onSpeedChange,
  disabled = false,
}) => {
  return (
    <div data-testid="timeline" className="timeline">
      <div className="flex items-center gap-2 text-xs mb-1">
        <button onClick={onTogglePlay} disabled={disabled}>
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        <button onClick={onReset} disabled={disabled}>⏮ Reset</button>
        <input
          type="range"
          data-testid="scrub-slider"
          className="w-80 accent-emerald-500"
          min={0}
          max={duration || 1}
          step={0.01}
          value={currentTime}
          onChange={(e) => onScrub(parseFloat(e.target.value))}
          disabled={disabled}
        />
        <span data-testid="time-display" className="tabular-nums w-24 text-right">
          {currentTime.toFixed(2)} / {(duration || 0).toFixed(2)}s
        </span>
        <select
          className="bg-slate-700 text-xs px-1"
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          disabled={disabled}
        >
          <option value="1">1x</option>
          <option value="0.5">0.5x</option>
          <option value="2">2x</option>
        </select>
      </div>
      <div className="text-[10px] text-slate-400">
        Real AnimationMixer + tracks from imported clips. SMF dual-quat converted in loaders/coord + smf.ts. Load a real .smf from docs/references/old-src/datafiles/SMF/ to see it in action.
      </div>
    </div>
  );
};

export default Timeline;
