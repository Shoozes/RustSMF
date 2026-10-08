import { useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import {
  CursorClick,
  Drop,
  Eraser,
  PaintBrush,
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
  onToolChange: (tool: ModernSkinTool) => void;
  onPaintModeChange: (mode: SkinWeightEditMode) => void;
  onRadiusChange: (value: number) => void;
  onStrengthChange: (value: number) => void;
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
      title={`${label} (${shortcut})`}
      disabled={disabled}
      onClick={() => onSelect(tool)}
    >
      {children}
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
  onToolChange,
  onPaintModeChange,
  onRadiusChange,
  onStrengthChange,
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
      </div>

      <div className="modern-skin-float" data-testid="modern-skin-float">
        <div className="modern-skin-float-heading">
          <div>
            <strong title="Selected bone">{selectedLabel}</strong>
          </div>
        </div>
        <label className="modern-skin-range">
          <span>Size</span>
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
        {(dirty || blockReason) && <div className="modern-skin-state" data-testid="modern-skin-state" aria-live="polite">
          {dirty && <span data-dirty={dirty}>Unsaved weights</span>}
          {blockReason && <span className="modern-skin-error" data-testid="modern-skin-export-block">{blockReason}</span>}
        </div>}
      </div>
    </section>
  );
}
