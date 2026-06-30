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
  draggableKeyframeTimes?: number[];
  selectedKeyTime?: number | null;
  onSelectKeyframe?: (time: number | null) => void;
  onInsertKeyframeAtTime?: (time: number) => void;
  onMoveKeyframe?: (fromTime: number, toTime: number) => void;
  disabled?: boolean;
}

interface DragState {
  pointerId: number;
  fromTime: number;
  currentTime: number;
  moved: boolean;
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
  draggableKeyframeTimes = [],
  selectedKeyTime = null,
  onSelectKeyframe,
  onInsertKeyframeAtTime,
  onMoveKeyframe,
  disabled = false,
}) => {
  const safeDuration = duration || 1;
  const markerTimes = keyframeTimes.slice(0, 80);
  const laneRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const suppressMarkerClickRef = React.useRef(false);
  const isDraggableTime = (time: number): boolean => (
    draggableKeyframeTimes.some((candidate) => Math.abs(candidate - time) < 0.0001)
  );
  const resolveLaneTime = (clientX: number): number => {
    const bounds = laneRef.current?.getBoundingClientRect();
    if (!bounds) return 0;
    const ratio = bounds.width > 0
      ? Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
      : 0;
    return Math.max(0, Math.min(duration || 0, ratio * safeDuration));
  };
  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const nextTime = resolveLaneTime(event.clientX);
    drag.currentTime = nextTime;
    if (Math.abs(nextTime - drag.fromTime) > 0.005) {
      drag.moved = true;
      onScrub(nextTime);
    }
  };
  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved) {
      suppressMarkerClickRef.current = true;
      onMoveKeyframe?.(drag.fromTime, drag.currentTime);
    } else {
      onSelectKeyframe?.(drag.fromTime);
      onScrub(drag.fromTime);
    }
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
        ref={laneRef}
        className="timeline-keyframe-lane"
        data-testid="timeline-keyframe-lane"
        data-keyframe-count={keyframeTimes.length}
        aria-label="Animation keyframe lane"
        role="presentation"
        onClick={(event) => {
          if (disabled) return;
          const time = resolveLaneTime(event.clientX);
          onSelectKeyframe?.(null);
          onScrub(time);
        }}
        onDoubleClick={(event) => {
          if (disabled || !onInsertKeyframeAtTime) return;
          const time = resolveLaneTime(event.clientX);
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
            data-draggable-keyframe={isDraggableTime(time) ? 'true' : 'false'}
            style={{ left: `${Math.min(100, Math.max(0, (time / safeDuration) * 100))}%` }}
            aria-label={`${isDraggableTime(time) ? 'Move' : 'Scrub to'} keyframe ${time.toFixed(2)} seconds`}
            aria-pressed={selectedKeyTime !== null && Math.abs(selectedKeyTime - time) < 0.0001}
            title={`${time.toFixed(2)}s${isDraggableTime(time) ? ' (drag to move)' : ''}`}
            disabled={disabled}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (disabled || !onMoveKeyframe || !isDraggableTime(time) || event.button !== 0) return;
              event.preventDefault();
              dragRef.current = {
                pointerId: event.pointerId,
                fromTime: time,
                currentTime: time,
                moved: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              onSelectKeyframe?.(time);
            }}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onClick={(event) => {
              event.stopPropagation();
              if (suppressMarkerClickRef.current) {
                suppressMarkerClickRef.current = false;
                return;
              }
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
