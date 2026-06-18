interface ExportPanelProps {
  sourceFormat: string;
  hasSkeleton: boolean;
  editorMode?: string;
}

export default function ExportPanel({
  sourceFormat,
  hasSkeleton,
  editorMode = 'export',
}: ExportPanelProps) {
  return (
    <div className="inspector" data-testid="export-workspace-panel" data-editor-mode={editorMode}>
      <div className="panel-title">Export Workspace</div>
      <div className="text-xs text-slate-300">
        Export path is explicit by source and compatibility requirements.
      </div>
      <div className="text-[10px] text-slate-400 mt-2">Source format: {sourceFormat || 'unknown'}</div>
      <div className="text-[10px] text-slate-400 mt-1">Skinned skeleton loaded: {hasSkeleton ? 'yes' : 'no'}</div>
      <div className="text-[10px] text-slate-500 mt-2">
        SMF export uses imported data when available; non-SMF skinned export is guarded by converter limits.
      </div>
      <div className="text-[10px] text-slate-500 mt-1">
        GLB remains the default fidelity path for runtime/scale/material-heavy workflows.
      </div>
    </div>
  );
}
