import * as THREE from 'three';
import type { AnimationTimelineSummary } from '../utils/animationTimeline';
import type { AnimationInterpolation } from '../utils/animationEdits';

interface AnimatePanelProps {
  clips: THREE.AnimationClip[];
  currentClipName: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  selectedBoneName: string;
  timelineSummary: AnimationTimelineSummary;
  poseEditHasDirtyState?: boolean;
  animationEditHasDirtyState: boolean;
  selectedKeyTime: number | null;
  clipboardHasKeyframe: boolean;
  interpolation: AnimationInterpolation;
  onInsertKeyframe: () => void;
  onUpdateKeyframe: () => void;
  onDeleteKeyframe: () => void;
  onCopyKeyframe: () => void;
  onPasteKeyframe: () => void;
  onInterpolationChange: (next: AnimationInterpolation) => void;
  editorMode?: string;
}

export default function AnimatePanel({
  clips,
  currentClipName,
  isPlaying,
  currentTime,
  duration,
  selectedBoneName,
  timelineSummary,
  poseEditHasDirtyState = false,
  animationEditHasDirtyState,
  selectedKeyTime,
  clipboardHasKeyframe,
  interpolation,
  onInsertKeyframe,
  onUpdateKeyframe,
  onDeleteKeyframe,
  onCopyKeyframe,
  onPasteKeyframe,
  onInterpolationChange,
  editorMode = 'animate',
}: AnimatePanelProps) {
  const clipCount = clips.length;
  const selectedKeyframeCount = timelineSummary.selectedKeyframeTimes.length;
  const allKeyframeCount = timelineSummary.keyframeTimes.length;
  const hasEditableSelection = !!selectedBoneName && !!currentClipName;

  return (
    <div className="inspector" data-testid="animate-workspace-panel" data-editor-mode={editorMode}>
      <div className="panel-title">Animate Workspace</div>
      <div className="animate-summary-grid" data-testid="animate-summary">
        <div>
          <span>Clips</span>
          <strong>{clipCount}</strong>
        </div>
        <div>
          <span>Tracks</span>
          <strong>{timelineSummary.trackCount}</strong>
        </div>
        <div>
          <span>Keys</span>
          <strong>{allKeyframeCount}</strong>
        </div>
        <div>
          <span>Selected keys</span>
          <strong>{selectedKeyframeCount}</strong>
        </div>
      </div>
      <div className="animate-detail-list">
        <div>Current clip: <span>{currentClipName || 'none'}</span></div>
        <div>Selected bone: <span>{selectedBoneName || 'none'}</span></div>
        <div data-testid="pose-edit-state">Pose edit dirty: <span>{poseEditHasDirtyState ? 'true' : 'false'}</span></div>
        <div data-testid="animation-edit-state">Animation edit dirty: <span>{animationEditHasDirtyState ? 'true' : 'false'}</span></div>
        <div data-testid="animation-selected-key">Selected key: <span>{selectedKeyTime === null ? 'none' : `${selectedKeyTime.toFixed(2)}s`}</span></div>
        <div>Playback: <span>{isPlaying ? 'Playing' : 'Paused'}</span></div>
        <div>Time: <span>{currentTime.toFixed(2)} / {duration.toFixed(2)}s</span></div>
      </div>
      <div className="animate-keyframe-tools" data-testid="animate-keyframe-tools">
        <button
          type="button"
          data-testid="animation-insert-key-btn"
          disabled={!hasEditableSelection}
          onClick={onInsertKeyframe}
        >
          Insert
        </button>
        <button
          type="button"
          data-testid="animation-update-key-btn"
          disabled={!hasEditableSelection}
          onClick={onUpdateKeyframe}
        >
          Update
        </button>
        <button
          type="button"
          data-testid="animation-delete-key-btn"
          disabled={!hasEditableSelection}
          onClick={onDeleteKeyframe}
        >
          Delete
        </button>
        <button
          type="button"
          data-testid="animation-copy-key-btn"
          disabled={!hasEditableSelection}
          onClick={onCopyKeyframe}
        >
          Copy
        </button>
        <button
          type="button"
          data-testid="animation-paste-key-btn"
          disabled={!hasEditableSelection || !clipboardHasKeyframe}
          onClick={onPasteKeyframe}
        >
          Paste
        </button>
      </div>
      <label className="animate-interpolation">
        <span>Interpolation</span>
        <select
          data-testid="animation-interpolation-select"
          value={interpolation}
          disabled={!hasEditableSelection}
          onChange={(event) => onInterpolationChange(event.target.value as AnimationInterpolation)}
        >
          <option value="linear">Linear</option>
          <option value="step">Step</option>
        </select>
      </label>
    </div>
  );
}
