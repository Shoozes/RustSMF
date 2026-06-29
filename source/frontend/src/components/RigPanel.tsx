import { useEffect, useState } from 'react';
import type { RigValidationReport } from '../utils/rigValidation';

interface RigPanelProps {
  report: RigValidationReport;
  selected: string;
  boneNames: string[];
  sourceFormat: string;
  onRenameSelectedBone: (nextName: string) => void;
  onReparentSelectedBone: (parentName: string) => void;
  onCreateChildBone: (name: string) => void;
  editorMode?: string;
}

function statusClass(status: RigValidationReport['status']): string {
  if (status === 'error') return 'text-rose-300';
  if (status === 'warning') return 'text-amber-300';
  return 'text-emerald-300';
}

export default function RigPanel({
  report,
  selected,
  boneNames,
  sourceFormat,
  onRenameSelectedBone,
  onReparentSelectedBone,
  onCreateChildBone,
  editorMode = 'rig',
}: RigPanelProps) {
  const visibleIssues = report.issues.slice(0, 6);
  const [renameValue, setRenameValue] = useState(selected === 'Scene' ? '' : selected);
  const [createValue, setCreateValue] = useState(selected && selected !== 'Scene' ? `${selected}_child` : '');
  const [parentValue, setParentValue] = useState('');
  const canRename = !!selected && selected !== 'Scene' && report.boneCount > 0 && sourceFormat !== 'smf';
  const canCreateChild = canRename;
  const parentOptions = boneNames.filter((name) => name && name !== selected);
  const canReparent = canRename && parentOptions.length > 0;

  useEffect(() => {
    setRenameValue(selected === 'Scene' ? '' : selected);
    setCreateValue(selected && selected !== 'Scene' ? `${selected}_child` : '');
  }, [selected]);

  useEffect(() => {
    if (!parentOptions.includes(parentValue)) {
      setParentValue(parentOptions[0] ?? '');
    }
  }, [parentOptions, parentValue]);

  return (
    <div className="inspector" data-testid="rig-workspace-panel" data-editor-mode={editorMode}>
      <div className="panel-title">Rig Workspace</div>
      <div className="text-[10px] text-slate-400">Selected: <span className="font-mono text-amber-300">{selected || 'Scene'}</span></div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
        <div className="bg-slate-900/60 px-1 py-1 rounded">
          <div className="text-slate-500">Bones</div>
          <div data-testid="rig-bone-count" className="text-slate-200">{report.boneCount}</div>
        </div>
        <div className="bg-slate-900/60 px-1 py-1 rounded">
          <div className="text-slate-500">Skinned Meshes</div>
          <div data-testid="rig-skinned-mesh-count" className="text-slate-200">{report.skinnedMeshCount}</div>
        </div>
      </div>
      <div className="mt-2 border-t border-slate-700 pt-2">
        <div className="text-slate-400 text-[10px] mb-1">Edit</div>
        <div className="flex gap-1 mb-2">
          <input
            data-testid="rig-rename-input"
            value={renameValue}
            disabled={!canRename}
            onChange={(event) => setRenameValue(event.target.value)}
            className="min-w-0 flex-1 bg-slate-900 border border-slate-700 px-1 py-0.5 text-xs text-slate-100 disabled:text-slate-500"
            aria-label="Bone name"
          />
          <button
            data-testid="rig-rename-btn"
            className="px-1 py-0 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
            disabled={!canRename}
            onClick={() => onRenameSelectedBone(renameValue)}
          >
            Rename
          </button>
        </div>
        <div className="flex gap-1 mb-2">
          <select
            data-testid="rig-reparent-parent"
            value={parentValue}
            disabled={!canReparent}
            onChange={(event) => setParentValue(event.target.value)}
            className="min-w-0 flex-1 bg-slate-900 border border-slate-700 px-1 py-0.5 text-xs text-slate-100 disabled:text-slate-500"
            aria-label="Parent bone"
          >
            {parentOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button
            data-testid="rig-reparent-btn"
            className="px-1 py-0 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
            disabled={!canReparent || !parentValue}
            onClick={() => onReparentSelectedBone(parentValue)}
          >
            Reparent
          </button>
        </div>
        <div className="flex gap-1 mb-2">
          <input
            data-testid="rig-create-child-input"
            value={createValue}
            disabled={!canCreateChild}
            onChange={(event) => setCreateValue(event.target.value)}
            className="min-w-0 flex-1 bg-slate-900 border border-slate-700 px-1 py-0.5 text-xs text-slate-100 disabled:text-slate-500"
            aria-label="New child bone name"
          />
          <button
            data-testid="rig-create-child-btn"
            className="px-1 py-0 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
            disabled={!canCreateChild}
            onClick={() => onCreateChildBone(createValue)}
          >
            Child
          </button>
        </div>
        {sourceFormat === 'smf' && (
          <div className="text-[10px] text-slate-500 mb-2">
            SMF source nodes keep indexed names for fidelity export.
          </div>
        )}
        <div className="text-slate-400 text-[10px] mb-1">Validation</div>
        <div data-testid="rig-validation-status" className={`text-xs ${statusClass(report.status)}`}>
          {report.status === 'pass'
            ? 'Rig validation: pass'
            : report.status === 'warning'
              ? `Rig validation: ${report.issues.length} warning${report.issues.length === 1 ? '' : 's'}`
              : `Rig validation: ${report.issues.length} issue${report.issues.length === 1 ? '' : 's'}`}
        </div>
        {visibleIssues.length > 0 && (
          <div className="mt-2 grid gap-1" data-testid="rig-validation-issues">
            {visibleIssues.map((issue, index) => (
              <div
                key={`${issue.code}-${index}`}
                className={`text-[10px] leading-snug border-l-2 pl-1 ${issue.severity === 'error' ? 'border-rose-400 text-rose-200' : 'border-amber-400 text-amber-200'}`}
                data-testid={`rig-validation-issue-${index}`}
              >
                <div className="font-mono">{issue.code}</div>
                <div>{issue.message}</div>
              </div>
            ))}
          </div>
        )}
        {report.issues.length > visibleIssues.length && (
          <div className="text-[10px] text-slate-500 mt-1">
            {report.issues.length - visibleIssues.length} more issue{report.issues.length - visibleIssues.length === 1 ? '' : 's'} hidden.
          </div>
        )}
      </div>
    </div>
  );
}
