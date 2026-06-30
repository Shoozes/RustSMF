import React from 'react';

interface TimelineProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onReset: () => void;
  onScrub: (t: number) => void;
  onSpeedChange: (s: number) => void;
  playbackSpeed: number;
  keyframeTimes?: number[];
  selectedKeyTime?: number | null;
  onSelectKeyframe?: (time: number | null) => void;
  onInsertKeyframeAtTime?: (time: number) => void;
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
  playbackSpeed,
  keyframeTimes = [],
  selectedKeyTime = null,
  onSelectKeyframe,
  onInsertKeyframeAtTime,
  disabled = false,
}) => {
  const safeDuration = duration || 1;
  const markerTimes = keyframeTimes.slice(0, 80);
  const resolveLaneTime = (event: React.MouseEvent<HTMLDivElement>): number => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = bounds.width > 0
      ? Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
      : 0;
    return Math.max(0, Math.min(duration || 0, ratio * safeDuration));
  };

  return (
    <div data-testid="timeline" className="timeline">
      <div className="timeline-controls">
        <button data-testid="timeline-play-btn" onClick={onTogglePlay} disabled={disabled}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button data-testid="timeline-reset-btn" onClick={onReset} disabled={disabled}>Reset</button>
        <input
          type="range"
          data-testid="scrub-slider"
          className="timeline-scrub accent-emerald-500"
          min={0}
          max={safeDuration}
          step={0.01}
          value={currentTime}
          onChange={(e) => onScrub(parseFloat(e.target.value))}
          disabled={disabled}
        />
        <span data-testid="time-display" className="timeline-time tabular-nums">
          {currentTime.toFixed(2)} / {(duration || 0).toFixed(2)}s
        </span>
        <select
          data-testid="timeline-speed-select"
          className="timeline-speed-select"
          value={playbackSpeed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          disabled={disabled}
        >
          <option value="1">1x</option>
          <option value="0.5">0.5x</option>
          <option value="2">2x</option>
        </select>
      </div>
      <div
        className="timeline-keyframe-lane"
        data-testid="timeline-keyframe-lane"
        data-keyframe-count={keyframeTimes.length}
        aria-label="Animation keyframe lane"
        role="presentation"
        onClick={(event) => {
          if (disabled) return;
          const time = resolveLaneTime(event);
          onSelectKeyframe?.(null);
          onScrub(time);
        }}
        onDoubleClick={(event) => {
          if (disabled || !onInsertKeyframeAtTime) return;
          const time = resolveLaneTime(event);
          onScrub(time);
          onInsertKeyframeAtTime(time);
        }}
      >
        <div
          className="timeline-keyframe-progress"
          style={{ width: `${Math.min(100, Math.max(0, (currentTime / safeDuration) * 100))}%` }}
        />
        {markerTimes.map((time, index) => (
          <button
            key={`${time}-${index}`}
            type="button"
            className={`timeline-keyframe-marker ${selectedKeyTime !== null && Math.abs(selectedKeyTime - time) < 0.0001 ? 'timeline-keyframe-marker-selected' : ''}`}
            data-testid={`timeline-keyframe-marker-${index}`}
            style={{ left: `${Math.min(100, Math.max(0, (time / safeDuration) * 100))}%` }}
            aria-label={`Scrub to keyframe ${time.toFixed(2)} seconds`}
            aria-pressed={selectedKeyTime !== null && Math.abs(selectedKeyTime - time) < 0.0001}
            title={`${time.toFixed(2)}s`}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onSelectKeyframe?.(time);
              onScrub(time);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          />
        ))}
      </div>
      <div className="timeline-note">
        {keyframeTimes.length > 0
          ? `${keyframeTimes.length} keyframe time${keyframeTimes.length === 1 ? '' : 's'} from the active clip`
          : 'No keyframe times available for the active clip'}
      </div>
    </div>
  );
};

export default Timeline;
