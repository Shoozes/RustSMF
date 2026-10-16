import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ArrowClockwise, ArrowDown, ArrowUp, ArrowsLeftRight, Copy, Diamond, FilePlus, Lock, LockOpen, PencilSimple, Scissors, Trash, ClipboardText } from '@phosphor-icons/react';
import { PanelAction, PanelFileAction, TaskDetails, TaskSection } from './WorkspaceTasks';
import { useWorkspaceTask } from './workspaceTaskContext';
import RetargetProfileControls, { type RetargetProfileEditorState } from './RetargetProfileControls';
import RetargetTransferControls from './RetargetTransferControls';
import type { useRetargetTransfer } from '../hooks/useRetargetTransfer';
import { parseRetargetProfile, type RetargetProfile } from '../utils/retargetProfile';
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
  onRetargetAnimations: (files: readonly File[], profile?: RetargetProfile) => void;
  retargetTransfer: ReturnType<typeof useRetargetTransfer>;
  retargetProfileState: RetargetProfileEditorState;
  onRetargetProfileChange: (value: RetargetProfileEditorState) => void;
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
  onRetargetAnimations,
  retargetTransfer,
  retargetProfileState,
  onRetargetProfileChange,
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
  const task = useWorkspaceTask();
  const newAnimationRef = useRef<HTMLDetailsElement>(null);
  const newAnimationButtonRef = useRef<HTMLButtonElement>(null);
  const sourceProfile = useMemo(() => {
    if (!retargetProfileState.draft.trim()) return { profile: undefined, invalid: false, error: '' };
    try { return { profile: parseRetargetProfile(retargetProfileState.draft), invalid: false, error: '' }; }
    catch (cause) { return { profile: undefined, invalid: true, error: cause instanceof Error ? cause.message : String(cause) }; }
  }, [retargetProfileState.draft]);

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

  const retargetPicker = (
    <PanelFileAction icon={ArrowsLeftRight} label="Retarget clips" disabled={!hasSkeleton || sourceProfile.invalid}
      className="outliner-append-action" data-testid="animation-retarget-clips"
      title="Retarget named-bone FBX, DAE, GLB, or GLTF clips onto this rig. Use a saved profile for explicit numeric bone maps."
    >
      <input type="file" accept=".fbx,.dae,.glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.ktx2" className="hidden" multiple disabled={!hasSkeleton || sourceProfile.invalid}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          if (files.length > 0) onRetargetAnimations(files, sourceProfile.profile);
          event.currentTarget.value = '';
        }}
      />
    </PanelFileAction>
  );
  const retargetProfile = <>
    <RetargetProfileControls disabled={!hasSkeleton} onRetarget={onRetargetAnimations} value={retargetProfileState} onChange={onRetargetProfileChange} />
    {!hasSkeleton && <div className="text-slate-500 mt-1">Load a skinned model with bones first.</div>}
  </>;

  return (
    <div className="inspector" data-testid="animate-workspace-panel" data-editor-mode={editorMode}>
      <div className="panel-title">Animate Workspace</div>
      {task && (animationEditHasDirtyState || poseEditHasDirtyState) && <div className="workspace-unsaved" role="status">Unsaved {animationEditHasDirtyState ? 'animation' : 'pose'}</div>}
      <TaskSection task="clips">
      <TaskDetails label="Clip details">
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
      </TaskDetails>
      <TaskDetails label="New animation" initialOpen={clipCount === 0} detailsRef={newAnimationRef} hideClosed onClose={() => newAnimationButtonRef.current?.focus()}>
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
          <PanelAction icon={FilePlus} label={'Create animation'}
            type="button"
            data-testid="animation-create-btn"
            disabled={!hasSkeleton || draftNewAnimationName.trim().length === 0}
            onClick={submitCreateAnimation}
          >
            Create animation
          </PanelAction>
          {!task && retargetPicker}
        </div>
        {!task && retargetProfile}
      </div>
      </TaskDetails>
      </TaskSection>
      <TaskSection task="transfer">
      {task && <RetargetTransferControls transfer={retargetTransfer} sourcePicker={retargetPicker} profileControls={retargetProfile} profileError={sourceProfile.error}/>}
      {!task && retargetTransfer.state.phase!=='idle' && <RetargetTransferControls transfer={retargetTransfer} sourcePicker={retargetPicker} profileControls={retargetProfile}/>}
      </TaskSection>
      <TaskSection task="clips">
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
          {task && <PanelAction icon={FilePlus} label="New animation" buttonRef={newAnimationButtonRef} disabled={!hasSkeleton} onClick={() => {
            if (newAnimationRef.current) {
              newAnimationRef.current.open = true;
              newAnimationRef.current.querySelector('input')?.focus();
            }
          }}>New</PanelAction>}
          <PanelAction icon={PencilSimple} label={'Rename clip'}
            type="button"
            data-testid="animation-rename-clip-btn"
            disabled={!hasActiveClip || draftClipName.trim().length === 0}
            onClick={submitRename}
          >
            Rename
          </PanelAction>
          <PanelAction icon={Copy} label={'Duplicate clip'}
            type="button"
            data-testid="animation-duplicate-clip-btn"
            disabled={!hasActiveClip}
            onClick={onDuplicateClip}
          >
            Duplicate
          </PanelAction>
          <PanelAction icon={Trash} label={'Delete clip'}
            type="button"
            data-testid="animation-delete-clip-btn"
            disabled={!canDeleteClip}
            onClick={onDeleteClip}
          >
            Delete
          </PanelAction>
        </div>
        <TaskDetails label="Clip order">
        <div className="animate-clip-reorder-actions">
          <PanelAction icon={ArrowUp} label={'Move clip up'}
            type="button"
            data-testid="animation-move-clip-up-btn"
            disabled={!canMoveClipUp}
            onClick={onMoveClipUp}
          >
            Move Up
          </PanelAction>
          <PanelAction icon={ArrowDown} label={'Move clip down'}
            type="button"
            data-testid="animation-move-clip-down-btn"
            disabled={!canMoveClipDown}
            onClick={onMoveClipDown}
          >
            Move Down
          </PanelAction>
        </div>
        </TaskDetails>
        <TaskDetails label="Timing">
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
          <PanelAction icon={Scissors} label={'Trim clip'}
            type="button"
            data-testid="animation-trim-btn"
            disabled={!hasActiveClip}
            onClick={() => onClipTrimChange(draftTrimStart, draftTrimEnd)}
          >
            Trim
          </PanelAction>
        </div>
        </TaskDetails>
      </div>
      </TaskSection>
      <TaskSection task="pose">
      {task && !selectedBoneName && <div className="workspace-context">Select a bone to edit keys</div>}
      <div className="animate-keyframe-tools" data-testid="animate-keyframe-tools">
        <TaskDetails label="Keying help">
        <div className="animate-workflow-hint" data-testid="animation-workflow-hint">
          {task
            ? 'Select a bone, pose it, scrub, then Insert. Branch keys the whole chain; Update replaces selected keys.'
            : 'Select a bone and pose it, scrub to a time, then Insert. For a multi-joint gesture, select its root and use Branch to key the whole chain together. Use Update to replace selected keys.'}
        </div>
        </TaskDetails>
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
        <PanelAction icon={Diamond} label={'Insert scoped keyframe'}
          type="button"
          data-testid="animation-insert-key-btn"
          disabled={!hasEditableSelection}
          onClick={onInsertKeyframe}
        >
          Insert
        </PanelAction>
        <PanelAction icon={ArrowClockwise} label={'Update scoped keyframe'}
          type="button"
          data-testid="animation-update-key-btn"
          disabled={!hasEditableSelection}
          onClick={onUpdateKeyframe}
        >
          Update
        </PanelAction>
        <PanelAction icon={Trash} label={'Delete scoped keyframe'}
          type="button"
          data-testid="animation-delete-key-btn"
          disabled={!hasEditableSelection}
          onClick={onDeleteKeyframe}
        >
          Delete
        </PanelAction>
        <PanelAction icon={Copy} label={'Copy scoped keyframe'}
          type="button"
          data-testid="animation-copy-key-btn"
          disabled={!hasEditableSelection}
          onClick={onCopyKeyframe}
        >
          Copy
        </PanelAction>
        <PanelAction icon={ClipboardText} label={'Paste scoped keyframe'}
          type="button"
          data-testid="animation-paste-key-btn"
          disabled={!hasEditableSelection || !clipboardHasKeyframe}
          onClick={onPasteKeyframe}
        >
          Paste
        </PanelAction>
        <PanelAction icon={selectedBoneLocked ? LockOpen : Lock} label={selectedBoneLocked ? 'Unlock bone' : 'Lock bone'}
          type="button"
          data-testid="animation-lock-bone-btn"
          disabled={!hasEditableSelection}
          onClick={onToggleAnimationBoneLock}
        >
          {selectedBoneLocked ? 'Unlock bone' : 'Lock bone'}
        </PanelAction>
      </div>
      <div className="text-[10px] text-slate-400" data-testid="animation-lock-state">
        Locked bones: {animationLockedBoneNames.length}
        {selectedBoneLocked && selectedBoneName ? ` (${selectedBoneName})` : ''}
      </div>
      <div className="animate-authoring-settings">
        <TaskDetails label="Key options">
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
            aria-describedby={interpolation === 'quadratic' ? 'animation-interpolation-note' : undefined}
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
          {interpolation === 'quadratic' && (
            <span id="animation-interpolation-note" className="animate-interpolation-note" data-testid="animation-interpolation-note">
              Quadratic is preserved in SMF metadata; the live preview uses linear interpolation.
            </span>
          )}
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
        </TaskDetails>
      </div>
      </TaskSection>
    </div>
  );
}
