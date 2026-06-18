import * as THREE from 'three';

interface SkinPanelProps {
  selected: string;
  skeleton?: THREE.Skeleton;
  sourceFormat: string;
  showWeightPreview: boolean;
  onToggleWeightPreview?: () => void;
  showBoneLabels: boolean;
  onToggleBoneLabels?: () => void;
  editorMode?: string;
}

export default function SkinPanel({
  selected,
  skeleton,
  sourceFormat,
  showWeightPreview,
  onToggleWeightPreview,
  showBoneLabels,
  onToggleBoneLabels,
  editorMode = 'skin',
}: SkinPanelProps) {
  const selectedBonePresent = !!selected && selected !== 'Scene';
  const hasSkeleton = !!skeleton && skeleton.bones.length > 0;

  return (
    <div className="inspector" data-testid="skin-workspace-panel" data-editor-mode={editorMode}>
      <div className="panel-title">Skin Workspace</div>
      <div className="text-xs text-slate-300 mb-2">Skinned workflow for viewport-weight + bone selection checks</div>
      <div className="text-[10px] text-slate-400">Source format: {sourceFormat || 'unknown'}</div>
      <div className="text-[10px] text-slate-400 mt-1">Skin targets available: {hasSkeleton ? 'yes' : 'no'}</div>
      <div className="text-xs mt-3">
        <div className="mb-1 text-slate-400">Selected</div>
        <div className="font-mono text-amber-300 break-all">{selected || 'Scene'}</div>
        <div className="text-[10px] mt-1 text-slate-400">
          {selectedBonePresent
            ? 'Transforms from Inspector and gizmo affect this bone immediately.'
            : 'Select a bone to adjust weights before export conversion.'}
        </div>
      </div>
      <div className="mt-2 text-[9px] border-t border-slate-700 pt-1">
        {onToggleWeightPreview && (
          <button
            data-testid="skin-weight-preview-btn"
            className="px-1 py-0 bg-slate-700 hover:bg-slate-600 text-xs mr-1"
            onClick={onToggleWeightPreview}
          >
            {showWeightPreview ? 'Hide' : 'Show'} Weights
          </button>
        )}
        {onToggleBoneLabels && (
          <button
            data-testid="skin-bone-label-btn"
            className="px-1 py-0 bg-slate-700 hover:bg-slate-600 text-xs"
            onClick={onToggleBoneLabels}
          >
            {showBoneLabels ? 'Hide' : 'Show'} Labels
          </button>
        )}
      </div>
      <div className="text-[10px] text-slate-500 mt-2">
        For non-SMF skinned imports, export remains a guarded SMF conversion. Use GLB export for scale/asset fidelity.
      </div>
    </div>
  );
}
