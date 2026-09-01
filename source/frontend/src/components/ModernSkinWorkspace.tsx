import { useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CursorClick,
  Drop,
  Eraser,
  PaintBrush,
  SlidersHorizontal,
} from '@phosphor-icons/react';
import { deriveMixamoMinimalBoneAliases } from '../utils/boneAliases';
import type { SkinWeightEditMode } from '../utils/skinWeights';

export type ModernSkinTool = 'pick' | 'paint' | 'erase' | 'smooth';

interface ModernSkinWorkspaceProps {
  selected: string;
  skeleton?: THREE.Skeleton;
  activeTool: ModernSkinTool;
  radius: number;
  strength: number;
  dirty: boolean;
  blockReason: string | null;
  undoAvailable: boolean;
  redoAvailable: boolean;
  onToolChange: (tool: ModernSkinTool) => void;
  onPaintModeChange: (mode: SkinWeightEditMode) => void;
  onRadiusChange: (value: number) => void;
  onStrengthChange: (value: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenAdvanced: (trigger: HTMLButtonElement) => void;
}

const TOOL_MODES: Record<Exclude<ModernSkinTool, 'pick'>, SkinWeightEditMode> = {
  paint: 'set',
  erase: 'subtract',
  smooth: 'smooth',
};

function SkinToolButton({
  tool,
  activeTool,
  label,
  shortcut,
  disabled,
  onSelect,
  children,
}: {
  tool: ModernSkinTool;
  activeTool: ModernSkinTool;
  label: string;
  shortcut: string;
  disabled?: boolean;
  onSelect: (tool: ModernSkinTool) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="modern-skin-tool"
      data-testid={`modern-skin-tool-${tool}`}
      data-active={activeTool === tool}
      aria-pressed={activeTool === tool}
      aria-label={`${label} (${shortcut})`}
      disabled={disabled}
      onClick={() => onSelect(tool)}
    >
      {children}
      <span>{label}</span>
      <kbd>{shortcut}</kbd>
    </button>
  );
}

export default function ModernSkinWorkspace({
  selected,
  skeleton,
  activeTool,
  radius,
  strength,
  dirty,
  blockReason,
  undoAvailable,
  redoAvailable,
  onToolChange,
  onPaintModeChange,
  onRadiusChange,
  onStrengthChange,
  onUndo,
  onRedo,
  onOpenAdvanced,
}: ModernSkinWorkspaceProps) {
  const aliases = useMemo(
    () => deriveMixamoMinimalBoneAliases(skeleton?.bones ?? []),
    [skeleton],
  );
  const hasSkeleton = !!skeleton && skeleton.bones.length > 0;
  const hasSelectedBone = hasSkeleton && !!selected && selected !== 'Scene';
  const selectedLabel = hasSelectedBone
    ? (aliases.get(selected)?.replace(/^mixamorig:/, '') ?? selected)
    : 'Choose a bone';

  const selectTool = (tool: ModernSkinTool) => {
    onToolChange(tool);
    if (tool !== 'pick') onPaintModeChange(TOOL_MODES[tool]);
  };

  return (
    <section
      className="modern-skin-workspace"
      data-testid="skin-workspace-panel"
      data-active-tool={activeTool}
      aria-label="Skin painting tools"
    >
      <div className="modern-skin-rail" role="toolbar" aria-label="Skin tools">
        <SkinToolButton tool="pick" activeTool={activeTool} label="Pick" shortcut="Q" disabled={!hasSkeleton} onSelect={selectTool}>
          <CursorClick size={24} aria-hidden="true" />
        </SkinToolButton>
        <SkinToolButton tool="paint" activeTool={activeTool} label="Paint" shortcut="P" disabled={!hasSelectedBone} onSelect={selectTool}>
          <PaintBrush size={24} aria-hidden="true" />
        </SkinToolButton>
        <SkinToolButton tool="erase" activeTool={activeTool} label="Erase" shortcut="E" disabled={!hasSelectedBone} onSelect={selectTool}>
          <Eraser size={24} aria-hidden="true" />
        </SkinToolButton>
        <SkinToolButton tool="smooth" activeTool={activeTool} label="Smooth" shortcut="S" disabled={!hasSkeleton} onSelect={selectTool}>
          <Drop size={24} aria-hidden="true" />
        </SkinToolButton>
        <div className="modern-skin-history" role="group" aria-label="Skin history">
          <button type="button" data-testid="modern-skin-undo" disabled={!undoAvailable} onClick={onUndo} aria-label="Undo skin stroke (Control Z)">
            <ArrowCounterClockwise size={20} aria-hidden="true" /><span>Undo</span><kbd>Ctrl Z</kbd>
          </button>
          <button type="button" data-testid="modern-skin-redo" disabled={!redoAvailable} onClick={onRedo} aria-label="Redo skin stroke (Control Shift Z)">
            <ArrowClockwise size={20} aria-hidden="true" /><span>Redo</span><kbd>Ctrl Y</kbd>
          </button>
        </div>
      </div>

      <div className="modern-skin-hint" aria-live="polite">
        {activeTool === 'pick'
          ? 'Click a bone on the model.'
          : activeTool === 'smooth'
            ? 'Smooth nearby skin weights · drag on the model'
            : `${activeTool === 'paint' ? 'Paint' : 'Erase'} ${selectedLabel} · drag on the model`}
      </div>

      <div className="modern-skin-float" data-testid="modern-skin-float">
        <div className="modern-skin-float-heading">
          <div>
            <span>Selected bone</span>
            <strong>{selectedLabel}</strong>
          </div>
          <button
            type="button"
            className="modern-skin-advanced"
            data-testid="modern-skin-advanced"
            onClick={(event) => onOpenAdvanced(event.currentTarget)}
          >
            <SlidersHorizontal size={17} aria-hidden="true" />
            Advanced
          </button>
        </div>
        <div className="modern-skin-quick-tools" role="group" aria-label="Quick paint tools">
          <button type="button" data-active={activeTool === 'paint'} disabled={!hasSelectedBone} onClick={() => selectTool('paint')}>
            <PaintBrush size={20} aria-hidden="true" /><span>Paint</span>
          </button>
          <button type="button" data-active={activeTool === 'erase'} disabled={!hasSelectedBone} onClick={() => selectTool('erase')}>
            <Eraser size={20} aria-hidden="true" /><span>Erase</span>
          </button>
        </div>
        <label className="modern-skin-range">
          <span>Brush size</span>
          <input
            data-testid="modern-skin-radius"
            type="range"
            min="0.05"
            max="1.5"
            step="0.05"
            value={radius}
            disabled={!hasSelectedBone}
            onChange={(event) => onRadiusChange(Number(event.target.value))}
          />
          <output>{radius.toFixed(2)}</output>
        </label>
        <label className="modern-skin-range">
          <span>Strength</span>
          <input
            data-testid="modern-skin-strength"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={strength}
            disabled={!hasSelectedBone}
            onChange={(event) => onStrengthChange(Number(event.target.value))}
          />
          <output>{Math.round(strength * 100)}%</output>
        </label>
        <div className="modern-skin-shortcuts" aria-label="Keyboard shortcuts">
          <span><kbd>Ctrl Z</kbd> Undo</span>
          <span><kbd>[</kbd><kbd>]</kbd> Size</span>
          <span><kbd>E</kbd> Erase</span>
        </div>
        <div className="modern-skin-state" data-testid="modern-skin-state">
          <span data-dirty={dirty}>{dirty ? 'Unsaved skin edits' : 'Skin ready'}</span>
          {blockReason && <span className="modern-skin-error" data-testid="modern-skin-export-block">{blockReason}</span>}
        </div>
      </div>
    </section>
  );
}
