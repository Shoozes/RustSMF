import React from 'react';
import * as THREE from 'three';

interface InspectorProps {
  selected: string;
  clips: THREE.AnimationClip[];
  currentClipName: string;
  onChangeClip: (clip: THREE.AnimationClip) => void;
  skeleton?: THREE.Skeleton;
  onSelectBone?: (boneName: string) => void;
}

const Inspector: React.FC<InspectorProps> = ({
  selected,
  clips,
  currentClipName,
  onChangeClip,
  skeleton,
  onSelectBone,
}) => {
  // Helper to reduce dupe (modularity/flex)
  const getRootBones = (bones: any[]) => bones.filter((b: any) => !b.parent || !bones.includes(b.parent as any));

  // State for collapsible bone hierarchy (starts with top-level roots expanded for usability)
  const [expandedBones, setExpandedBones] = React.useState<Set<string>>(new Set());

  // Reset expanded on skeleton change (e.g., new model load) to avoid stale state
  React.useEffect(() => {
    if (skeleton && skeleton.bones.length > 0) {
      const roots = getRootBones(skeleton.bones);
      setExpandedBones(new Set(roots.map((b: any) => b.name)));
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
  const renderBoneTree = (bone: any, depth: number): React.ReactNode => {
    const isSelected = selected === bone.name;
    const childBones = bone.children ? bone.children.filter((c: any) => c.isBone) : [];
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
            {childBones.map((child: any) => renderBoneTree(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };
  return (
    <div data-testid="inspector" className="inspector">
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
                {c.name || `clip_${idx}`} (${(c.duration || 0).toFixed(2)}s)
              </div>
            ))}
          </div>
        )}
        {skeleton && skeleton.bones.length > 0 && (
          <div className="mt-3">
            <div className="panel-title">Bones ({skeleton.bones.length})</div>
            <div className="max-h-24 overflow-auto text-[10px]">
              <ul className="pl-0 m-0 list-none">
                {getRootBones(skeleton.bones).map((root: any) => renderBoneTree(root, 0))}
              </ul>
            </div>
          </div>
        )}

        {/* Basic transform gizmo stub for selected bone (editor parity step).
            3D marker in viewport provides visual highlight on selection (list or raycast).
            Full IK/pose editing is future work. */}
        {selected && selected !== 'Scene' && (
          <div className="mt-2 text-[9px] border-t border-slate-700 pt-1">
            <div>Transform stub for: <span className="font-mono text-amber-300">{selected}</span></div>
            <button className="mr-1 mt-0.5 px-1 py-0 bg-slate-700 hover:bg-slate-600" onClick={() => console.log('stub: move +X on', selected)}> +X </button>
            <button className="mr-1 px-1 py-0 bg-slate-700 hover:bg-slate-600" onClick={() => console.log('stub: move +Y on', selected)}> +Y </button>
            <button className="px-1 py-0 bg-slate-700 hover:bg-slate-600" onClick={() => console.log('stub: rotate on', selected)}> rot </button>
            <span className="ml-1 text-slate-500">(stub)</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inspector;
