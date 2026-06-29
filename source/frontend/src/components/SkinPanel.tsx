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
  skinEditHasDirtyState: boolean;
  skinEditBlockReason: string | null;
  skinPaintMode: 'set' | 'add' | 'subtract';
  skinPaintRadius: number;
  skinPaintStrength: number;
  skinPaintTarget: number;
  onSkinPaintModeChange: (next: 'set' | 'add' | 'subtract') => void;
  onSkinPaintRadiusChange: (value: number) => void;
  onSkinPaintStrengthChange: (value: number) => void;
  onSkinPaintTargetChange: (value: number) => void;
  onUndoSkinPaint: () => void;
  onRedoSkinPaint: () => void;
  onNormalizeSkinWeights: () => void;
  onAutoSkinWeights: () => void;
  skinUndoAvailable: boolean;
  skinRedoAvailable: boolean;
}

export default function SkinPanel({
  selected,
  skeleton,
  sourceFormat,
  showWeightPreview,
  onToggleWeightPreview,
  showBoneLabels,
  onToggleBoneLabels,
  skinEditHasDirtyState,
  skinEditBlockReason,
  skinPaintMode,
  skinPaintRadius,
  skinPaintStrength,
  skinPaintTarget,
  onSkinPaintModeChange,
  onSkinPaintRadiusChange,
  onSkinPaintStrengthChange,
  onSkinPaintTargetChange,
  onUndoSkinPaint,
  onRedoSkinPaint,
  onNormalizeSkinWeights,
  onAutoSkinWeights,
  skinUndoAvailable,
  skinRedoAvailable,
  editorMode = 'skin',
}: SkinPanelProps) {
  const selectedBonePresent = !!selected && selected !== 'Scene';
  const hasSkeleton = !!skeleton && skeleton.bones.length > 0;
  const isPaintEnabled = selectedBonePresent && hasSkeleton;
  const sliderDisabled = !isPaintEnabled;

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
      <div className="mt-2 text-[9px] border-t border-slate-700 pt-1">
        <div className="text-slate-400 mb-1">Skin paint</div>
        <div className="text-slate-300 text-[10px] mb-2">
          {isPaintEnabled ? 'Brush on painted mesh vertices to edit weights.' : 'Select a bone to enable skin painting.'}
        </div>
        <div className="flex gap-1 mb-2">
          <button
            data-testid="skin-paint-mode-set"
            className={`px-1 py-0 text-xs ${skinPaintMode === 'set' ? 'bg-emerald-500' : 'bg-slate-700 hover:bg-slate-600'}`}
            disabled={!isPaintEnabled}
            onClick={() => onSkinPaintModeChange('set')}
          >
            Set
          </button>
          <button
            data-testid="skin-paint-mode-add"
            className={`px-1 py-0 text-xs ${skinPaintMode === 'add' ? 'bg-emerald-500' : 'bg-slate-700 hover:bg-slate-600'}`}
            disabled={!isPaintEnabled}
            onClick={() => onSkinPaintModeChange('add')}
          >
            Add
          </button>
          <button
            data-testid="skin-paint-mode-subtract"
            className={`px-1 py-0 text-xs ${skinPaintMode === 'subtract' ? 'bg-emerald-500' : 'bg-slate-700 hover:bg-slate-600'}`}
            disabled={!isPaintEnabled}
            onClick={() => onSkinPaintModeChange('subtract')}
          >
            Subtract
          </button>
        </div>
        <div className="flex gap-1 mb-2">
          <button
            data-testid="skin-paint-undo-btn"
            className="px-1 py-0 text-xs bg-slate-700 hover:bg-slate-600"
            disabled={!skinUndoAvailable}
            onClick={onUndoSkinPaint}
          >
            Undo
          </button>
          <button
            data-testid="skin-paint-redo-btn"
            className="px-1 py-0 text-xs bg-slate-700 hover:bg-slate-600"
            disabled={!skinRedoAvailable}
            onClick={onRedoSkinPaint}
          >
            Redo
          </button>
        </div>
        <div className="flex gap-1 mb-2">
          <button
            data-testid="skin-normalize-btn"
            className="px-1 py-0 text-xs bg-slate-700 hover:bg-slate-600"
            disabled={!hasSkeleton}
            onClick={onNormalizeSkinWeights}
          >
            Normalize
          </button>
          <button
            data-testid="skin-autoskin-btn"
            className="px-1 py-0 text-xs bg-slate-700 hover:bg-slate-600"
            disabled={!hasSkeleton}
            onClick={onAutoSkinWeights}
          >
            Auto Skin
          </button>
        </div>
        <div className="grid gap-1.5 text-[10px]">
          <label className="flex items-center justify-between gap-2 text-slate-400">
            <span>Radius</span>
            <input
              data-testid="skin-paint-radius"
              type="range"
              min="0.05"
              max="1.5"
              step="0.05"
              value={skinPaintRadius}
              disabled={sliderDisabled}
              onChange={(e) => onSkinPaintRadiusChange(Number(e.target.value))}
              className="w-40"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-slate-400">
            <span>Strength</span>
            <input
              data-testid="skin-paint-strength"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={skinPaintStrength}
              disabled={sliderDisabled}
              onChange={(e) => onSkinPaintStrengthChange(Number(e.target.value))}
              className="w-40"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-slate-400">
            <span>Target</span>
            <input
              data-testid="skin-paint-target"
              type="range"
              min="1"
              max="4"
              step="1"
              value={skinPaintTarget}
              disabled={sliderDisabled}
              onChange={(e) => onSkinPaintTargetChange(Number(e.target.value))}
              className="w-40"
            />
          </label>
        </div>
      </div>
      <div className="mt-2 text-[10px] border-t border-slate-700 pt-1" data-testid="skin-dirty-state">
        <div className={skinEditHasDirtyState ? 'text-amber-300' : 'text-slate-500'}>
          {skinEditHasDirtyState ? 'Skin edit dirty: true' : 'Skin edit dirty: false'}
        </div>
        {skinEditBlockReason && (
          <div className="text-rose-300 mt-1" data-testid="skin-export-block">
            {skinEditBlockReason}
          </div>
        )}
      </div>
      <div className="text-[10px] text-slate-500 mt-2">
        For non-SMF skinned imports, export remains a guarded SMF conversion. Use GLB export for scale/asset fidelity.
      </div>
    </div>
  );
}
