import React from 'react';
import * as THREE from 'three';
import type { BoneNudgeDelta } from '../hooks/poseEdits';
import type { EditorMode } from '../store';

function isBone(child: THREE.Object3D): child is THREE.Bone {
  return (child as THREE.Bone).isBone === true;
}

function getRootBones(bones: THREE.Bone[]): THREE.Bone[] {
  return bones.filter((bone) => !bone.parent || !bones.includes(bone.parent as THREE.Bone));
}

interface InspectorProps {
  selected: string;
  clips: THREE.AnimationClip[];
  currentClipName: string;
  onChangeClip: (clip: THREE.AnimationClip) => void;
  skeleton?: THREE.Skeleton;
  onSelectBone?: (boneName: string) => void;
  showWeightPreview?: boolean;
  onToggleWeightPreview?: () => void;
  transformMode?: 'translate' | 'rotate' | 'scale';
  onSetTransformMode?: (mode: 'translate' | 'rotate' | 'scale') => void;
  onNudgeBone?: (boneName: string, delta: BoneNudgeDelta) => void;
  showBoneLabels?: boolean;
  onToggleBoneLabels?: () => void;
  editorMode?: EditorMode;
}

const Inspector: React.FC<InspectorProps> = ({
  selected,
  clips,
  currentClipName,
  onChangeClip,
  skeleton,
  onSelectBone,
  showWeightPreview = false,
  onToggleWeightPreview,
  transformMode = 'translate',
  onSetTransformMode,
  onNudgeBone,
  showBoneLabels = false,
  onToggleBoneLabels,
  editorMode = 'view',
}) => {
  // State for collapsible bone hierarchy (starts with top-level roots expanded for usability)
  const [expandedBones, setExpandedBones] = React.useState<Set<string>>(new Set());

  // Reset expanded on skeleton change (e.g., new model load) to avoid stale state
  React.useEffect(() => {
    if (skeleton && skeleton.bones.length > 0) {
      const roots = getRootBones(skeleton.bones);
      setExpandedBones(new Set(roots.map((bone) => bone.name)));
    } else {
      setExpandedBones(new Set());
    }
  }, [skeleton]);

  const toggleBone = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedBones(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // Recursive renderer for proper bone hierarchy tree (nested <ul><li>, collapsible, depth indent, follows .children)
  const renderBoneTree = (bone: THREE.Bone, depth: number): React.ReactNode => {
    const isSelected = selected === bone.name;
    const childBones = bone.children.filter(isBone);
    const hasChildren = childBones.length > 0;
    const isExpanded = expandedBones.has(bone.name);
    return (
      <li key={bone.name || depth} className="list-none">
        <div
          className={`cursor-pointer px-1 rounded hover:bg-slate-700 ${isSelected ? 'bg-slate-600' : ''}`}
          onClick={() => onSelectBone && onSelectBone(bone.name)}
          style={{ paddingLeft: `${depth * 12}px` }}
        >
          {hasChildren && (
            <span
              className="inline-block w-3 text-center mr-1 select-none"
              onClick={(e) => toggleBone(bone.name, e)}
            >
              {isExpanded ? '−' : '+'}
            </span>
          )}
          {bone.name}
        </div>
        {hasChildren && isExpanded && (
          <ul className="pl-0 m-0">
            {childBones.map((child) => renderBoneTree(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };
  return (
    <div data-testid="inspector" className="inspector" data-editor-mode={editorMode}>
      <div className="panel-title">Inspector</div>
      <div className="text-xs">
        <div className="mb-1 text-slate-400">Selected</div>
        <div className="font-mono text-amber-300 break-all">{selected}</div>
        <div className="mt-3 text-[10px] text-slate-400">
          Real SkinnedMesh + Skeleton + clips loaded here.<br />
          Timeline below drives the AnimationMixer.
        </div>
        {clips.length > 0 && (
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
              >
                {c.name || `clip_${idx}`} ({(c.duration || 0).toFixed(2)}s)
              </div>
            ))}
          </div>
        )}
        {skeleton && skeleton.bones.length > 0 && (
          <div className="mt-3">
            <div className="panel-title">Bones ({skeleton.bones.length})</div>
            <button
              data-testid="labels-toggle-btn"
              className="text-[9px] px-1 py-0 bg-slate-700 hover:bg-slate-600 mb-1"
              onClick={() => onToggleBoneLabels && onToggleBoneLabels()}
            >
              {showBoneLabels ? 'Hide' : 'Show'} labels (off by default for perf)
            </button>
            <div className="max-h-24 overflow-auto text-[10px]">
              <ul className="pl-0 m-0 list-none">
                {getRootBones(skeleton.bones).map((root) => renderBoneTree(root, 0))}
              </ul>
            </div>
          </div>
        )}

        {/* Bone transform controls (Cycle 3: 3D TransformControls gizmo in viewport + quick nudges + mode buttons.
            3D marker provides visual feedback. Nudge buttons feed the pose-edit layer; edits are captured at SMF export time. */}
        {selected && selected !== 'Scene' && (
          <div className="mt-2 text-[9px] border-t border-slate-700 pt-1">
            <div>Transform for: <span className="font-mono text-amber-300">{selected}</span> (gizmo active in viewport)</div>
            <button data-testid="transform-x-btn" className="mr-1 mt-0.5 px-1 py-0 bg-slate-700 hover:bg-slate-600" onClick={() => {
              onNudgeBone && onNudgeBone(selected, { x: 0.1 });
            }}> +X </button>
            <button data-testid="transform-y-btn" className="mr-1 px-1 py-0 bg-slate-700 hover:bg-slate-600" onClick={() => {
              onNudgeBone && onNudgeBone(selected, { y: 0.1 });
            }}> +Y </button>
            <button data-testid="transform-rot-btn" className="px-1 py-0 bg-slate-700 hover:bg-slate-600" onClick={() => {
              onNudgeBone && onNudgeBone(selected, { rotZ: 0.2 });
            }}> rot </button>
            <button data-testid="transform-reset-btn" className="ml-1 px-1 py-0 bg-slate-800 text-xs" onClick={() => {
              onNudgeBone && onNudgeBone(selected, { reset: true });
            }}> reset </button>
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
            <span className="ml-1 text-slate-500">(gizmo + nudges; T/R/S buttons or keys for mode; Space pause anim, anim may override)</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inspector;
