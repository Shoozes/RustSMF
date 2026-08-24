import { useEffect, useState } from 'react';
import * as THREE from 'three';
import type { AnimationTimelineSummary } from '../utils/animationTimeline';
import {
  isAnimationInterpolation,
  normalizeAnimationSnapStep,
  type AnimationClipMetadata,
  type AnimationInterpolation,
  type AnimationSnapStep,
} from '../utils/animationEdits';
import {
  formatAnimationDuration,
  MAX_ANIMATION_DURATION,
  MIN_ANIMATION_DURATION,
  normalizeAnimationDuration,
  type AnimationCreationRequest,
  type AnimationInitialPose,
} from '../utils/animationCreation';
import {
  ANIMATION_EDIT_SCOPE_LABELS,
  ANIMATION_EDIT_SCOPES,
  type AnimationEditScope,
} from '../utils/animationScope';

interface AnimatePanelProps {
  clips: THREE.AnimationClip[];
  hasSkeleton: boolean;
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
  snapStep: AnimationSnapStep;
  animationScope: AnimationEditScope;
  animationLockedBoneNames: string[];
  clipMetadata: AnimationClipMetadata;
  onInsertKeyframe: () => void;
  onUpdateKeyframe: () => void;
  onDeleteKeyframe: () => void;
  onCopyKeyframe: () => void;
  onPasteKeyframe: () => void;
  onInterpolationChange: (next: AnimationInterpolation) => void;
  onSnapStepChange: (next: AnimationSnapStep) => void;
  onAnimationScopeChange: (next: AnimationEditScope) => void;
  onClipLoopChange: (next: boolean) => void;
  onClipSampleFrameMultiplierChange: (next: number) => void;
  onClipDurationChange: (next: number) => void;
  onClipRetimeChange: (next: number) => void;
  onClipTrimChange: (startTime: number, endTime: number) => void;
  onToggleAnimationBoneLock: () => void;
  onRenameClip: (nextName: string) => void;
  onDuplicateClip: () => void;
  onDeleteClip: () => void;
  onMoveClipUp: () => void;
  onMoveClipDown: () => void;
  onCreateAnimation: (request: AnimationCreationRequest) => void;
  editorMode?: string;
}

export default function AnimatePanel({
  clips,
  hasSkeleton,
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
  snapStep,
  animationScope,
  animationLockedBoneNames,
  clipMetadata,
  onInsertKeyframe,
  onUpdateKeyframe,
  onDeleteKeyframe,
  onCopyKeyframe,
  onPasteKeyframe,
  onInterpolationChange,
  onSnapStepChange,
  onAnimationScopeChange,
  onClipLoopChange,
  onClipSampleFrameMultiplierChange,
  onClipDurationChange,
  onClipRetimeChange,
  onClipTrimChange,
  onToggleAnimationBoneLock,
  onRenameClip,
  onDuplicateClip,
  onDeleteClip,
  onMoveClipUp,
  onMoveClipDown,
  onCreateAnimation,
  editorMode = 'animate',
}: AnimatePanelProps) {
  const clipCount = clips.length;
  const activeClipIndex = clips.findIndex((clip, index) => (clip.name || `clip_${index}`) === currentClipName);
  const selectedKeyframeCount = timelineSummary.selectedKeyframeTimes.length;
  const allKeyframeCount = timelineSummary.keyframeTimes.length;
  const hasEditableSelection = !!selectedBoneName && !!currentClipName;
  const selectedBoneLocked = !!selectedBoneName && animationLockedBoneNames.includes(selectedBoneName);
  const hasActiveClip = !!currentClipName;
  const canDeleteClip = clipCount > 1 && hasActiveClip;
  const canMoveClipUp = hasActiveClip && activeClipIndex > 0;
  const canMoveClipDown = hasActiveClip && activeClipIndex >= 0 && activeClipIndex < clipCount - 1;
  const [draftClipName, setDraftClipName] = useState(currentClipName);
  const [draftNewAnimationName, setDraftNewAnimationName] = useState('New Animation');
  const [draftNewAnimationDuration, setDraftNewAnimationDuration] = useState(1);
  const [draftNewAnimationPose, setDraftNewAnimationPose] = useState<AnimationInitialPose>('rest');
  const [draftTrimStart, setDraftTrimStart] = useState(0);
  const [draftTrimEnd, setDraftTrimEnd] = useState(duration);

  useEffect(() => {
    setDraftClipName(currentClipName);
    setDraftTrimStart(0);
    setDraftTrimEnd(duration);
  }, [currentClipName, duration]);

  const submitRename = () => {
    onRenameClip(draftClipName);
  };

  const submitCreateAnimation = () => {
    onCreateAnimation({
      requestedName: draftNewAnimationName,
      duration: draftNewAnimationDuration,
      initialPose: draftNewAnimationPose,
    });
  };

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
      <div className="animate-new-clip-tools" data-testid="animate-new-clip-tools">
        <div className="text-slate-400 mb-1">New animation</div>
        <div className="grid gap-1.5 text-[10px]">
          <label>
            <span>Name</span>
            <input
              data-testid="animation-new-name-input"
              value={draftNewAnimationName}
              onChange={(event) => setDraftNewAnimationName(event.target.value)}
            />
          </label>
          <label>
            <span>Duration (s)</span>
            <input
              type="number"
              data-testid="animation-new-duration-input"
              min={MIN_ANIMATION_DURATION}
              max={MAX_ANIMATION_DURATION}
              step="0.01"
              value={draftNewAnimationDuration}
              onChange={(event) => setDraftNewAnimationDuration(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Initial pose</span>
            <select
              data-testid="animation-new-pose-select"
              value={draftNewAnimationPose}
              onChange={(event) => {
                if (event.target.value === 'rest' || event.target.value === 'current') {
                  setDraftNewAnimationPose(event.target.value);
                }
              }}
            >
              <option value="rest">Rest</option>
              <option value="current">Current</option>
            </select>
          </label>
          <button
            type="button"
            data-testid="animation-create-btn"
            disabled={!hasSkeleton || draftNewAnimationName.trim().length === 0}
            onClick={submitCreateAnimation}
          >
            Create animation
          </button>
        </div>
        {!hasSkeleton && <div className="text-slate-500 mt-1">Load a skinned model with bones first.</div>}
      </div>
      <div className="animate-clip-tools" data-testid="animate-clip-tools">
        <label>
          <span>Clip name</span>
          <input
            data-testid="animation-clip-name-input"
            value={draftClipName}
            disabled={!hasActiveClip}
            onChange={(event) => setDraftClipName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitRename();
              }
            }}
          />
        </label>
        <div className="animate-clip-actions">
          <button
            type="button"
            data-testid="animation-rename-clip-btn"
            disabled={!hasActiveClip || draftClipName.trim().length === 0}
            onClick={submitRename}
          >
            Rename
          </button>
          <button
            type="button"
            data-testid="animation-duplicate-clip-btn"
            disabled={!hasActiveClip}
            onClick={onDuplicateClip}
          >
            Duplicate
          </button>
          <button
            type="button"
            data-testid="animation-delete-clip-btn"
            disabled={!canDeleteClip}
            onClick={onDeleteClip}
          >
            Delete
          </button>
        </div>
        <div className="animate-clip-reorder-actions">
          <button
            type="button"
            data-testid="animation-move-clip-up-btn"
            disabled={!canMoveClipUp}
            onClick={onMoveClipUp}
          >
            Move Up
          </button>
          <button
            type="button"
            data-testid="animation-move-clip-down-btn"
            disabled={!canMoveClipDown}
            onClick={onMoveClipDown}
          >
            Move Down
          </button>
        </div>
        <label>
          <span>Duration (s)</span>
          <input
            type="number"
            data-testid="animation-duration-input"
            min={MIN_ANIMATION_DURATION}
            max={MAX_ANIMATION_DURATION}
            step="0.01"
            value={formatAnimationDuration(duration)}
            disabled={!hasActiveClip}
            onChange={(event) => onClipDurationChange(normalizeAnimationDuration(Number(event.target.value)))}
          />
        </label>
        <label>
          <span>Retime to (s)</span>
          <input
            type="number"
            data-testid="animation-retime-input"
            min={MIN_ANIMATION_DURATION}
            max={MAX_ANIMATION_DURATION}
            step="0.01"
            value={formatAnimationDuration(duration)}
            disabled={!hasActiveClip}
            onChange={(event) => onClipRetimeChange(normalizeAnimationDuration(Number(event.target.value)))}
          />
        </label>
        <div className="animate-trim-tools">
          <label>
            <span>Trim start (s)</span>
            <input
              type="number"
              data-testid="animation-trim-start-input"
              min="0"
              max={duration}
              step="0.01"
              value={draftTrimStart}
              disabled={!hasActiveClip}
              onChange={(event) => setDraftTrimStart(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Trim end (s)</span>
            <input
              type="number"
              data-testid="animation-trim-end-input"
              min="0"
              max={duration}
              step="0.01"
              value={draftTrimEnd}
              disabled={!hasActiveClip}
              onChange={(event) => setDraftTrimEnd(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            data-testid="animation-trim-btn"
            disabled={!hasActiveClip}
            onClick={() => onClipTrimChange(draftTrimStart, draftTrimEnd)}
          >
            Trim
          </button>
        </div>
      </div>
      <div className="animate-keyframe-tools" data-testid="animate-keyframe-tools">
        <div className="animate-workflow-hint" data-testid="animation-workflow-hint">
          Select a bone in the viewport or Bones list, pose it, scrub to a time, then Insert a key. Use Update to replace the selected key.
        </div>
        <label className="animate-scope-selector">
          <span>Key scope</span>
          <select
            data-testid="animation-scope-select"
            value={animationScope}
            disabled={!hasEditableSelection}
            onChange={(event) => {
              if (ANIMATION_EDIT_SCOPES.includes(event.target.value as AnimationEditScope)) {
                onAnimationScopeChange(event.target.value as AnimationEditScope);
              }
            }}
          >
            {ANIMATION_EDIT_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {ANIMATION_EDIT_SCOPE_LABELS[scope]}
              </option>
            ))}
          </select>
        </label>
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
        <button
          type="button"
          data-testid="animation-lock-bone-btn"
          disabled={!hasEditableSelection}
          onClick={onToggleAnimationBoneLock}
        >
          {selectedBoneLocked ? 'Unlock bone' : 'Lock bone'}
        </button>
      </div>
      <div className="text-[10px] text-slate-400" data-testid="animation-lock-state">
        Locked bones: {animationLockedBoneNames.length}
        {selectedBoneLocked && selectedBoneName ? ` (${selectedBoneName})` : ''}
      </div>
      <div className="animate-authoring-settings">
        <label className="animate-loop-toggle">
          <input
            type="checkbox"
            data-testid="animation-loop-toggle"
            checked={clipMetadata.loop}
            disabled={!hasActiveClip}
            onChange={(event) => onClipLoopChange(event.target.checked)}
          />
          <span>Loop</span>
        </label>
        <label>
          <span>Sample x</span>
          <input
            type="number"
            data-testid="animation-sample-multiplier-input"
            min="1"
            max="255"
            step="1"
            value={clipMetadata.sampleFrameMultiplier}
            disabled={!hasActiveClip}
            onChange={(event) => onClipSampleFrameMultiplierChange(Number(event.target.value))}
          />
        </label>
        <label>
          <span>Interpolation</span>
          <select
            data-testid="animation-interpolation-select"
            value={interpolation}
            disabled={!hasEditableSelection}
            onChange={(event) => {
              if (isAnimationInterpolation(event.target.value)) {
                onInterpolationChange(event.target.value);
              }
            }}
          >
            <option value="linear">Linear</option>
            <option value="step">Step</option>
            <option value="quadratic">Quadratic</option>
          </select>
        </label>
        <label>
          <span>Snap</span>
          <select
            data-testid="animation-snap-step-select"
            value={snapStep}
            disabled={!hasActiveClip}
            onChange={(event) => onSnapStepChange(normalizeAnimationSnapStep(Number(event.target.value)))}
          >
            <option value="0">Off</option>
            <option value="0.01">0.01s</option>
            <option value="0.05">0.05s</option>
            <option value="0.1">0.10s</option>
            <option value="0.25">0.25s</option>
            <option value="0.5">0.50s</option>
          </select>
        </label>
      </div>
    </div>
  );
}
