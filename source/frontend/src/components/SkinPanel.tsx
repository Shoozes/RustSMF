import * as THREE from 'three';
import {
  SKIN_AUTO_WEIGHT_ALGORITHMS,
  SKIN_AUTO_WEIGHT_ALGORITHM_LABELS,
  isSkinAutoWeightAlgorithm,
  type SkinAutoWeightAlgorithm,
  type SkinWeightEditMode,
} from '../utils/skinWeights';
import {
  getSkinPaintPoseWarning,
  SKIN_PAINT_POSE_LABELS,
  SKIN_PAINT_POSE_MODES,
  type SkinDiagnosticsSummary,
  type SkinPaintPoseMode,
  type SkinVertexDiagnostic,
} from '../utils/skinDiagnostics';

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
  skinPaintMode: SkinWeightEditMode;
  skinPaintPose: SkinPaintPoseMode;
  skinPaintTargetMode: 'vertex' | 'triangle';
  skinPaintRadius: number;
  skinPaintStrength: number;
  skinPaintTargetWeight: number;
  skinPaintFalloff: number;
  skinAutoWeightAlgorithm: SkinAutoWeightAlgorithm;
  skinAutoWeightPower: number;
  skinAutoWeightNormalWeighting: number;
  skinAutoWeightMaxInfluences: number;
  onSkinPaintModeChange: (next: SkinWeightEditMode) => void;
  onSkinPaintPoseChange: (next: SkinPaintPoseMode) => void;
  onSkinPaintTargetModeChange: (next: 'vertex' | 'triangle') => void;
  onSkinPaintRadiusChange: (value: number) => void;
  onSkinPaintStrengthChange: (value: number) => void;
  onSkinPaintTargetWeightChange: (value: number) => void;
  onSkinPaintFalloffChange: (value: number) => void;
  onSkinAutoWeightAlgorithmChange: (next: SkinAutoWeightAlgorithm) => void;
  onSkinAutoWeightPowerChange: (value: number) => void;
  onSkinAutoWeightNormalWeightingChange: (value: number) => void;
  onSkinAutoWeightMaxInfluencesChange: (value: number) => void;
  onUndoSkinPaint: () => void;
  onRedoSkinPaint: () => void;
  onNormalizeSkinWeights: () => void;
  onAutoSkinWeights: () => void;
  skinUndoAvailable: boolean;
  skinRedoAvailable: boolean;
  skinDiagnostics: SkinDiagnosticsSummary;
  skinSelectedVertex: SkinVertexDiagnostic | null;
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
  skinPaintPose,
  skinPaintTargetMode,
  skinPaintRadius,
  skinPaintStrength,
  skinPaintTargetWeight,
  skinPaintFalloff,
  skinAutoWeightAlgorithm,
  skinAutoWeightPower,
  skinAutoWeightNormalWeighting,
  skinAutoWeightMaxInfluences,
  onSkinPaintModeChange,
  onSkinPaintPoseChange,
  onSkinPaintTargetModeChange,
  onSkinPaintRadiusChange,
  onSkinPaintStrengthChange,
  onSkinPaintTargetWeightChange,
  onSkinPaintFalloffChange,
  onSkinAutoWeightAlgorithmChange,
  onSkinAutoWeightPowerChange,
  onSkinAutoWeightNormalWeightingChange,
  onSkinAutoWeightMaxInfluencesChange,
  onUndoSkinPaint,
  onRedoSkinPaint,
  onNormalizeSkinWeights,
  onAutoSkinWeights,
  skinUndoAvailable,
  skinRedoAvailable,
  skinDiagnostics,
  skinSelectedVertex,
  editorMode = 'skin',
}: SkinPanelProps) {
  const selectedBonePresent = !!selected && selected !== 'Scene';
  const hasSkeleton = !!skeleton && skeleton.bones.length > 0;
  const isPaintEnabled = selectedBonePresent && hasSkeleton;
  const sliderDisabled = !isPaintEnabled;
  const skinPaintPoseWarning = getSkinPaintPoseWarning(skinPaintPose);
  const powerOptionActive = ['segment-inverse-distance', 'segment-distance-normal', 'selected-branch'].includes(skinAutoWeightAlgorithm);
  const normalOptionActive = skinAutoWeightAlgorithm === 'segment-distance-normal';
  const maxInfluenceOptionActive = ['segment-inverse-distance', 'segment-distance-normal', 'selected-branch'].includes(skinAutoWeightAlgorithm);

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
        <label className="flex items-center justify-between gap-2 text-slate-400 mb-2">
          <span>Paint pose</span>
          <select
            data-testid="skin-paint-pose"
            value={skinPaintPose}
            disabled={!hasSkeleton}
            onChange={(e) => onSkinPaintPoseChange(e.target.value as SkinPaintPoseMode)}
            className="w-40 bg-slate-800 border border-slate-700 px-1 py-0.5 text-slate-200"
          >
            {SKIN_PAINT_POSE_MODES.map((mode) => (
              <option key={mode} value={mode}>{SKIN_PAINT_POSE_LABELS[mode]}</option>
            ))}
          </select>
        </label>
        {skinPaintPoseWarning && (
          <div className="text-amber-300 text-[10px] mb-2" data-testid="skin-paint-pose-warning">
            {skinPaintPoseWarning}
          </div>
        )}
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
          <button
            data-testid="skin-paint-mode-auto"
            className={`px-1 py-0 text-xs ${skinPaintMode === 'auto' ? 'bg-emerald-500' : 'bg-slate-700 hover:bg-slate-600'}`}
            disabled={!isPaintEnabled}
            onClick={() => onSkinPaintModeChange('auto')}
          >
            Auto
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
        <div className="grid gap-1.5 text-[10px] mb-2" data-testid="skin-autoskin-options">
          <label className="flex items-center justify-between gap-2 text-slate-400">
            <span>Brush target</span>
            <select
              data-testid="skin-paint-target-mode"
              value={skinPaintTargetMode}
              disabled={!isPaintEnabled}
              onChange={(e) => onSkinPaintTargetModeChange(e.target.value as 'vertex' | 'triangle')}
              className="w-40 bg-slate-800 border border-slate-700 px-1 py-0.5 text-slate-200"
            >
              <option value="vertex">Vertex</option>
              <option value="triangle">Triangle</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-slate-400">
            <span>Algorithm</span>
            <select
              data-testid="skin-autoskin-algorithm"
              value={skinAutoWeightAlgorithm}
              disabled={!hasSkeleton}
              onChange={(e) => {
                if (isSkinAutoWeightAlgorithm(e.target.value)) {
                  onSkinAutoWeightAlgorithmChange(e.target.value);
                }
              }}
              className="w-40 bg-slate-800 border border-slate-700 px-1 py-0.5 text-slate-200"
            >
              {SKIN_AUTO_WEIGHT_ALGORITHMS.map((algorithm) => (
                <option key={algorithm} value={algorithm}>
                  {SKIN_AUTO_WEIGHT_ALGORITHM_LABELS[algorithm]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-slate-400">
            <span>Power</span>
            <input
              data-testid="skin-autoskin-power"
              type="range"
              min="1"
              max="8"
              step="0.5"
              value={skinAutoWeightPower}
              disabled={!hasSkeleton || !powerOptionActive}
              onChange={(e) => onSkinAutoWeightPowerChange(Number(e.target.value))}
              className="w-40"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-slate-400">
            <span>Normal</span>
            <input
              data-testid="skin-autoskin-normal-weighting"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={skinAutoWeightNormalWeighting}
              disabled={!hasSkeleton || !normalOptionActive}
              onChange={(e) => onSkinAutoWeightNormalWeightingChange(Number(e.target.value))}
              className="w-40"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-slate-400">
            <span>Max</span>
            <input
              data-testid="skin-autoskin-max-influences"
              type="range"
              min="1"
              max="4"
              step="1"
              value={skinAutoWeightMaxInfluences}
              disabled={!hasSkeleton || !maxInfluenceOptionActive}
              onChange={(e) => onSkinAutoWeightMaxInfluencesChange(Number(e.target.value))}
              className="w-40"
            />
          </label>
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
            <span>Target weight</span>
            <input
              data-testid="skin-paint-target"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={skinPaintTargetWeight}
              disabled={sliderDisabled}
              onChange={(e) => onSkinPaintTargetWeightChange(Number(e.target.value))}
              className="w-40"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-slate-400">
            <span>Falloff</span>
            <input
              data-testid="skin-paint-falloff"
              type="range"
              min="0.1"
              max="4"
              step="0.1"
              value={skinPaintFalloff}
              disabled={sliderDisabled}
              onChange={(e) => onSkinPaintFalloffChange(Number(e.target.value))}
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
      <div className="mt-2 text-[10px] border-t border-slate-700 pt-1" data-testid="skin-diagnostics">
        <div className="text-slate-400 mb-1">Influence diagnostics</div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-300">
          <span>Meshes / vertices</span><span>{skinDiagnostics.meshCount} / {skinDiagnostics.vertexCount}</span>
          <span>Unweighted vertices</span><span>{skinDiagnostics.unweightedVertexCount}</span>
          <span>Invalid references</span><span>{skinDiagnostics.invalidReferenceCount}</span>
          <span>Invalid weights</span><span>{skinDiagnostics.invalidWeightCount}</span>
        </div>
        {skinSelectedVertex ? (
          <div className="mt-2" data-testid="skin-selected-vertex">
            <div className="text-amber-300">
              {skinSelectedVertex.meshName} vertex {skinSelectedVertex.vertexIndex} · sum {skinSelectedVertex.weightSum.toFixed(4)}
            </div>
            <div className="mt-1 space-y-1" data-testid="skin-influence-legend" aria-label="Influence legend">
              {skinSelectedVertex.slots.map((slot) => {
                const percentage = slot.weight !== null && Number.isFinite(slot.weight)
                  ? Math.min(100, Math.max(0, slot.weight * 100))
                  : 0;
                return (
                  <div key={`legend-${slot.slot}`} className="flex items-center gap-1 text-slate-400">
                    <span className="w-5">#{slot.slot + 1}</span>
                    <span className="h-1.5 flex-1 bg-slate-800 overflow-hidden">
                      <span className="block h-full bg-cyan-400" style={{ width: `${percentage}%` }} />
                    </span>
                    <span className="w-12 text-right">{slot.weight === null ? '—' : `${(slot.weight * 100).toFixed(1)}%`}</span>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-0.5 mt-1">
              {skinSelectedVertex.slots.map((slot) => (
                <div key={slot.slot} className={slot.issue ? 'text-rose-300 contents' : 'text-slate-300 contents'}>
                  <span>#{slot.slot + 1}</span>
                  <span>{slot.boneName ?? (slot.boneIndex === null ? 'invalid reference' : `Bone ${slot.boneIndex}`)}</span>
                  <span>{slot.weight === null ? '—' : slot.weight.toFixed(4)}</span>
                </div>
              ))}
            </div>
            {skinSelectedVertex.issueCodes.length > 0 && (
              <div className="text-rose-300 mt-1">Issues: {skinSelectedVertex.issueCodes.join(', ')}</div>
            )}
          </div>
        ) : (
          <div className="text-slate-500 mt-1">Hover a skinned vertex in the viewport to inspect its four raw slots.</div>
        )}
      </div>
      <div className="text-[10px] text-slate-500 mt-2">
        For non-SMF skinned imports, export remains a guarded SMF conversion. Use GLB export for scale/asset fidelity.
      </div>
    </div>
  );
}
