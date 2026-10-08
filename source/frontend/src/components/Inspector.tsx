import React from 'react';
import * as THREE from 'three';
import type { BoneNudgeDelta } from '../hooks/poseEdits';
import type { EditorMode } from '../store';
import { deriveMixamoMinimalBoneAliases } from '../utils/boneAliases';
import { getRigRootBones, isRigBone, isRigBoneDetached } from '../utils/rigHierarchy';

interface InspectorProps {
  title?: string;
  selected: string;
  clips: THREE.AnimationClip[];
  currentClipName: string;
  onChangeClip: (clip: THREE.AnimationClip) => void;
  skeleton?: THREE.Skeleton;
  displayBones?: THREE.Bone[];
  onSelectBone?: (boneName: string) => void;
  showWeightPreview?: boolean;
  onToggleWeightPreview?: () => void;
  transformMode?: 'translate' | 'rotate' | 'scale';
  onSetTransformMode?: (mode: 'translate' | 'rotate' | 'scale') => void;
  onNudgeBone?: (boneName: string, delta: BoneNudgeDelta) => void;
  showBoneLabels?: boolean;
  onToggleBoneLabels?: () => void;
  showClipList?: boolean;
  showBonePanel?: boolean;
  showTransformControls?: boolean;
  editorMode?: EditorMode;
  compact?: boolean;
}

const ROTATION_STEP_RADIANS = 0.2;
const rotationNudgeControls: readonly {
  axis: 'X' | 'Y' | 'Z';
  direction: -1 | 1;
  testId: string;
  delta: BoneNudgeDelta;
}[] = [
  { axis: 'X', direction: -1, testId: 'transform-rot-x-negative-btn', delta: { rotX: -ROTATION_STEP_RADIANS } },
  { axis: 'X', direction: 1, testId: 'transform-rot-x-btn', delta: { rotX: ROTATION_STEP_RADIANS } },
  { axis: 'Y', direction: -1, testId: 'transform-rot-y-negative-btn', delta: { rotY: -ROTATION_STEP_RADIANS } },
  { axis: 'Y', direction: 1, testId: 'transform-rot-y-btn', delta: { rotY: ROTATION_STEP_RADIANS } },
  { axis: 'Z', direction: -1, testId: 'transform-rot-negative-btn', delta: { rotZ: -ROTATION_STEP_RADIANS } },
  { axis: 'Z', direction: 1, testId: 'transform-rot-btn', delta: { rotZ: ROTATION_STEP_RADIANS } },
];

const Inspector: React.FC<InspectorProps> = ({
  title = 'Inspector',
  selected,
  clips,
  currentClipName,
  onChangeClip,
  skeleton,
  displayBones,
  onSelectBone,
  showWeightPreview = false,
  onToggleWeightPreview,
  transformMode = 'translate',
  onSetTransformMode,
  onNudgeBone,
  showBoneLabels = false,
  onToggleBoneLabels,
  showClipList = true,
  showBonePanel = true,
  showTransformControls = true,
  editorMode = 'view',
  compact = false,
}) => {
  // State for collapsible bone hierarchy (starts with top-level roots expanded for usability)
  const [expandedBones, setExpandedBones] = React.useState<Set<string>>(new Set());
  const visibleBones = React.useMemo(
    () => displayBones && displayBones.length > 0
      ? displayBones
      : skeleton?.bones ?? [],
    [displayBones, skeleton],
  );
  const visibleBoneSet = React.useMemo(() => new Set(visibleBones), [visibleBones]);
  const boneAliases = React.useMemo(
    () => deriveMixamoMinimalBoneAliases(visibleBones),
    [visibleBones],
  );
  const usesIndexedSmfBoneNames = visibleBones.length > 0
    && visibleBones.every((bone) => /^SMF_Node_\d+$/.test(bone.name));
  const rootBones = getRigRootBones(visibleBones);
  const rootBoneUuidKey = rootBones.map((bone) => bone.uuid).join('|');

  // Reset expanded on skeleton change (e.g., new model load) to avoid stale state
  React.useEffect(() => {
    setExpandedBones(new Set(rootBoneUuidKey ? rootBoneUuidKey.split('|') : []));
  }, [rootBoneUuidKey]);

  const toggleBone = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedBones(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Recursive renderer for proper bone hierarchy tree (nested <ul><li>, collapsible, depth indent, follows .children)
  const renderBoneTree = (bone: THREE.Bone, depth: number): React.ReactNode => {
    const isSelected = selected === bone.name;
    const childBones = bone.children.filter((child): child is THREE.Bone => (
      isRigBone(child) && visibleBoneSet.has(child)
    ));
    const hasChildren = childBones.length > 0;
    const isExpanded = expandedBones.has(bone.uuid);
    const isDetached = isRigBoneDetached(bone, skeleton);
    const alias = boneAliases.get(bone.name);
    return (
      <li key={bone.uuid} className="list-none">
        <div
          className={`cursor-pointer px-1 rounded hover:bg-slate-700 ${isSelected ? 'bg-slate-600' : ''}`}
          onClick={() => onSelectBone && onSelectBone(bone.name)}
          role="treeitem"
          tabIndex={0}
          aria-label={alias ? `${bone.name}, ${alias}` : bone.name}
          aria-selected={isSelected}
          aria-expanded={hasChildren ? isExpanded : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelectBone?.(bone.name);
            } else if (hasChildren && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
              event.preventDefault();
              setExpandedBones(previous => {
                const next = new Set(previous);
                if (event.key === 'ArrowRight') next.add(bone.uuid); else next.delete(bone.uuid);
                return next;
              });
            }
          }}
          style={{ paddingLeft: `${depth * 12}px` }}
          data-testid={`bone-tree-item-${bone.name || bone.uuid}`}
          data-rig-bone-detached={isDetached ? 'true' : 'false'}
          data-bone-alias={alias ?? ''}
          title={alias ? `${bone.name} uses the display alias ${alias}` : bone.name}
        >
          {hasChildren && (
            <span
              className="inline-block w-3 text-center mr-1 select-none"
              onClick={(e) => toggleBone(bone.uuid, e)}
            >
              {isExpanded ? '−' : '+'}
            </span>
          )}
          <span className="font-mono">{bone.name}</span>
          {alias && <span className="ml-1 text-cyan-300">· {alias}</span>}
          {isDetached && <span className="ml-1 text-slate-500">(detached)</span>}
        </div>
        {hasChildren && isExpanded && (
          <ul className="pl-0 m-0" role="group">
            {childBones.map((child) => renderBoneTree(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };
  const workspaceHelp = editorMode === 'rig'
    ? ['Rig opens on the model rest pose.', 'Animation resumes when you return to Animate.']
    : editorMode === 'skin'
      ? ['Skin defaults to the model rest pose.', 'Advanced can opt into Frozen or Live sampling.']
      : editorMode === 'animate'
        ? ['Animation playback and key editing are active here.', 'Use the Timeline to scrub or author poses.']
        : ['Skinned meshes, skeletons, and clips are ready.', 'Open Animate when you want playback.'];
  return (
    <div data-testid="inspector" className="inspector" data-editor-mode={editorMode}>
      <div className="panel-title">{title}</div>
      <div className="text-xs">
        <div className="mb-1 text-slate-400">Selected</div>
        <div data-testid="inspector-selected" className="font-mono text-amber-300 break-all">{selected}</div>
        {!compact && <div className="inspector-help-copy mt-3 text-[10px] text-slate-400">
          {workspaceHelp[0]}<br />
          {workspaceHelp[1]}
        </div>}
        {showClipList && clips.length > 0 && (
          <div className="mt-3">
            <div className="panel-title">Clips</div>
            {clips.map((c, idx) => (
              <div
                key={idx}
                data-testid={`clip-item-${idx}`}
                className={`cursor-pointer px-1 rounded ${
                  currentClipName === (c.name || `clip_${idx}`) ? 'bg-slate-600' : 'hover:bg-slate-700'
                }`}
                onClick={() => onChangeClip(c)}
                role="button"
                tabIndex={0}
                aria-pressed={currentClipName === (c.name || `clip_${idx}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onChangeClip(c);
                  }
                }}
              >
                {c.name || `clip_${idx}`} ({(c.duration || 0).toFixed(2)}s)
              </div>
            ))}
          </div>
        )}
        {showBonePanel && visibleBones.length > 0 && (
          <div className="mt-3">
            <div className="panel-title">Bones ({visibleBones.length})</div>
            {onToggleBoneLabels && (
              <button
                data-testid="labels-toggle-btn"
                className="text-[9px] px-1 py-0 bg-slate-700 hover:bg-slate-600 mb-1"
                onClick={() => onToggleBoneLabels()}
              >
                {showBoneLabels ? 'Hide' : 'Show'} labels
              </button>
            )}
            <div className="max-h-24 overflow-auto text-[10px]">
              <ul className="pl-0 m-0 list-none" role="tree" aria-label="Rig bones">
                {rootBones.map((root) => renderBoneTree(root, 0))}
              </ul>
            </div>
            {usesIndexedSmfBoneNames && (
              <div data-testid="smf-indexed-bone-guidance" className="mt-1 text-[10px] leading-snug text-slate-500">
                {compact ? 'Source bone IDs are preserved on export.' : boneAliases.size > 0
                  ? 'Mixamo-style aliases identify this known humanoid layout for editing. Source IDs stay unchanged for SMF export fidelity.'
                  : 'SMF stores indexed bone IDs. Hover or click the visible rig to match an ID to a body part.'}
              </div>
            )}
          </div>
        )}

        {/* Quick pose controls write through the pose-edit layer; Rig also owns the viewport gizmo. */}
        {showTransformControls && selected && selected !== 'Scene' && (
          <div
            className="mt-2 text-[9px] border-t border-slate-700 pt-1"
            role="group"
            aria-label="Selected bone pose controls"
          >
            {!compact && <div>
              Pose for: <span className="font-mono text-amber-300">{selected}</span>
              {editorMode === 'rig' ? ' (Rig Select owns the viewport gizmo)' : ' (viewport gizmo detached)'}
            </div>}
            <button data-testid="transform-x-btn" aria-label="Move selected bone positive X" title="Move +0.1 on X" className="mr-1 mt-0.5 px-1 py-0 bg-slate-700 hover:bg-slate-600" onClick={() => {
              onNudgeBone?.(selected, { x: 0.1 });
            }}> +X </button>
            <button data-testid="transform-y-btn" aria-label="Move selected bone positive Y" title="Move +0.1 on Y" className="mr-1 px-1 py-0 bg-slate-700 hover:bg-slate-600" onClick={() => {
              onNudgeBone?.(selected, { y: 0.1 });
            }}> +Y </button>
            <button data-testid="transform-reset-btn" aria-label="Restore selected bone bind pose" className="ml-1 px-1 py-0 bg-slate-800 text-xs" title="Restore the selected deform bone local bind transform" onClick={() => {
              onNudgeBone?.(selected, { reset: true });
            }}> Bind </button>
            <div className="mt-1 flex flex-wrap items-center gap-0.5" role="group" aria-label="Rotate selected bone by axis">
              <span className="mr-0.5 text-slate-400">Rotate</span>
              {rotationNudgeControls.map(({ axis, direction, testId, delta }) => {
                const directionWord = direction < 0 ? 'negative' : 'positive';
                const sign = direction < 0 ? '−' : '+';
                return (
                  <button
                    key={testId}
                    data-testid={testId}
                    aria-label={`Rotate selected bone ${directionWord} ${axis}`}
                    title={`Rotate ${sign}11.5 degrees around ${axis}`}
                    className="px-1 py-0 bg-slate-700 hover:bg-slate-600"
                    onClick={() => onNudgeBone?.(selected, delta)}
                  >
                    {sign}{axis}
                  </button>
                );
              })}
            </div>
            {onToggleWeightPreview && (
              <button
                data-testid="weight-preview-btn"
                className="ml-2 px-1 py-0 bg-slate-700 hover:bg-slate-600 text-xs"
                onClick={onToggleWeightPreview}
              >
                {showWeightPreview ? 'Hide' : 'Show'} Weights
              </button>
            )}
            {onSetTransformMode && (
              <div className="inline-flex gap-0.5 ml-1 items-center">
                <button
                  data-testid="mode-translate-btn"
                  className={`px-1 py-0 text-xs ${transformMode === 'translate' ? 'bg-slate-500' : 'bg-slate-700 hover:bg-slate-600'}`}
                  onClick={() => onSetTransformMode('translate')}
                >T</button>
                <button
                  data-testid="mode-rotate-btn"
                  className={`px-1 py-0 text-xs ${transformMode === 'rotate' ? 'bg-slate-500' : 'bg-slate-700 hover:bg-slate-600'}`}
                  onClick={() => onSetTransformMode('rotate')}
                >R</button>
                <button
                  data-testid="mode-scale-btn"
                  className={`px-1 py-0 text-xs ${transformMode === 'scale' ? 'bg-slate-500' : 'bg-slate-700 hover:bg-slate-600'}`}
                  onClick={() => onSetTransformMode('scale')}
                >S</button>
              </div>
            )}
            {!compact && <span className="ml-1 text-slate-500">
              {editorMode === 'rig'
                ? '(rest-pose workspace; T/R/S selects the gizmo mode)'
                : editorMode === 'animate'
                  ? '(pose the bone, scrub to a time, then Insert or Update the key)'
                  : '(rest-pose workspace; Skin owns paint input)'}
            </span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default Inspector;
