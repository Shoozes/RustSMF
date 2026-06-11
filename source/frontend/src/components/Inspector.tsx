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
              {skeleton.bones.map((b, idx) => {
                const parentName = b.parent ? (b.parent as any).name : null;
                const indent = parentName ? '  ' : '';
                return (
                  <div
                    key={idx}
                    className={`cursor-pointer px-1 rounded hover:bg-slate-700 ${selected === b.name ? 'bg-slate-600' : ''}`}
                    onClick={() => onSelectBone && onSelectBone(b.name)}
                  >
                    {indent}{b.name}{parentName ? ` (parent: ${parentName})` : ''}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inspector;
