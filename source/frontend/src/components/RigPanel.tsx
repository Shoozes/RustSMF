import { useEffect, useState } from 'react';
import { RIG_SNAP_STEPS, type RigSpinAxis, type RigToolMode } from '../utils/rigEdits';
import {
  RIG_IK_CHAIN_LENGTHS,
  RIG_IK_ITERATION_OPTIONS,
  RIG_IK_MAX_ANGLE_OPTIONS,
  isRigIkPoleAxis,
  RIG_IK_TOLERANCE_OPTIONS,
  type RigIkSettings,
  type RigIkSolveResult,
} from '../utils/rigIk';
import type { RigValidationReport } from '../utils/rigValidation';
import { getSmfRigControlPolicy, listSmfRigPolicies, type SmfRigControl } from '../utils/smfRigPolicy';

interface RigPanelProps {
  report: RigValidationReport;
  selected: string;
  deformBoneNames: string[];
  selectedIsDeformBone: boolean;
  sourceFormat: string;
  onRenameSelectedBone: (nextName: string) => void;
  onReparentSelectedBone: (parentName: string) => void;
  onCreateChildBone: (name: string) => void;
  onSetSelectedBoneDetached: (detached: boolean) => void;
  onSpinRig: (axis: RigSpinAxis) => void;
  onDeleteSelectedBone: () => void;
  rigToolMode: RigToolMode;
  onRigToolModeChange: (mode: RigToolMode) => void;
  rigSnapStep: number;
  onRigSnapStepChange: (step: number) => void;
  rigIkSettings: RigIkSettings;
  onRigIkSettingsChange: (settings: Partial<RigIkSettings>) => void;
  rigIkLastResult: RigIkSolveResult | null;
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
  deformBoneNames,
  selectedIsDeformBone,
  sourceFormat,
  onRenameSelectedBone,
  onReparentSelectedBone,
  onCreateChildBone,
  onSetSelectedBoneDetached,
  onSpinRig,
  onDeleteSelectedBone,
  rigToolMode,
  onRigToolModeChange,
  rigSnapStep,
  onRigSnapStepChange,
  rigIkSettings,
  onRigIkSettingsChange,
  rigIkLastResult,
  editorMode = 'rig',
}: RigPanelProps) {
  const visibleIssues = report.issues.slice(0, 6);
  const isSmfSource = sourceFormat === 'smf';
  const smfControlReason = (control: SmfRigControl): string | undefined => (
    isSmfSource ? getSmfRigControlPolicy(control).reason : undefined
  );
  const [renameValue, setRenameValue] = useState(selected === 'Scene' ? '' : selected);
  const [createValue, setCreateValue] = useState(selected && selected !== 'Scene' ? `${selected}_child` : '');
  const [parentValue, setParentValue] = useState('');
  const canRename = !!selected && selected !== 'Scene' && selectedIsDeformBone && report.boneCount > 0 && !isSmfSource;
  const canCreateChild = canRename;
  const parentOptions = deformBoneNames.filter((name) => name && name !== selected);
  const canReparent = canRename && parentOptions.length > 0;
  const canChangeDetachState = !!selected && selected !== 'Scene' && report.boneCount > 0 && !isSmfSource;
  const canSpinRig = report.boneCount > 0 && !isSmfSource;
  const canUseEndpoint = selectedIsDeformBone && report.boneCount > 0;
  const canUseIk = selectedIsDeformBone && report.boneCount > 1;

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
        <div className="text-slate-400 text-[10px] mb-1">Tool</div>
        <div className="grid grid-cols-3 gap-1 mb-2" data-testid="rig-tool-row">
          <button
            data-testid="rig-tool-select"
            className={`px-1 py-0.5 text-xs ${rigToolMode === 'select' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 hover:bg-slate-600'}`}
            onClick={() => onRigToolModeChange('select')}
          >
            Select
          </button>
          <button
            data-testid="rig-tool-endpoint"
            className={`px-1 py-0.5 text-xs disabled:opacity-50 ${rigToolMode === 'endpoint' ? 'bg-sky-400 text-slate-950' : 'bg-slate-700 hover:bg-slate-600'}`}
            disabled={!canUseEndpoint}
            onClick={() => onRigToolModeChange('endpoint')}
            title="Drag the selected bone endpoint as one reversible pose edit"
          >
            Endpoint
          </button>
          <button
            data-testid="rig-tool-add-child"
            className={`px-1 py-0.5 text-xs disabled:opacity-50 ${rigToolMode === 'add-child' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 hover:bg-slate-600'}`}
            disabled={!canCreateChild}
            onClick={() => onRigToolModeChange('add-child')}
            title={smfControlReason('create-child')}
          >
            Add child
          </button>
          <button
            data-testid="rig-tool-move"
            className={`px-1 py-0.5 text-xs disabled:opacity-50 ${rigToolMode === 'move' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 hover:bg-slate-600'}`}
            disabled={!canCreateChild}
            onClick={() => onRigToolModeChange('move')}
            title={smfControlReason('move')}
          >
            Move
          </button>
          <button
            data-testid="rig-tool-rotate"
            className={`px-1 py-0.5 text-xs disabled:opacity-50 ${rigToolMode === 'rotate' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 hover:bg-slate-600'}`}
            disabled={!canCreateChild}
            onClick={() => onRigToolModeChange('rotate')}
            title={smfControlReason('rotate')}
          >
            Rotate
          </button>
          <button
            data-testid="rig-tool-ik"
            className={`px-1 py-0.5 text-xs disabled:opacity-50 ${rigToolMode === 'ik' ? 'bg-amber-400 text-slate-950' : 'bg-slate-700 hover:bg-slate-600'}`}
            disabled={!canUseIk}
            onClick={() => onRigToolModeChange('ik')}
            title="Pose the selected end effector through a constrained ancestor chain"
          >
            IK
          </button>
        </div>
        {rigToolMode === 'ik' && (
          <div className="mb-2 rounded border border-amber-500/40 bg-amber-950/20 p-1" data-testid="rig-ik-settings">
            <div className="mb-1 text-[10px] text-amber-200">IK pose chain</div>
            <div className="grid grid-cols-2 gap-1">
              <label className="text-[10px] text-slate-400">
                Joints
                <select
                  data-testid="rig-ik-chain-length"
                  value={rigIkSettings.chainLength}
                  onChange={(event) => onRigIkSettingsChange({ chainLength: Number(event.target.value) })}
                  className="block w-full bg-slate-900 border border-slate-700 px-1 py-0.5 text-xs text-slate-100"
                >
                  {RIG_IK_CHAIN_LENGTHS.map((length) => <option key={length} value={length}>{length}</option>)}
                </select>
              </label>
              <label className="text-[10px] text-slate-400">
                Pole
                <select
                  data-testid="rig-ik-pole-axis"
                  value={rigIkSettings.poleAxis}
                  onChange={(event) => {
                    if (isRigIkPoleAxis(event.target.value)) {
                      onRigIkSettingsChange({ poleAxis: event.target.value });
                    }
                  }}
                  className="block w-full bg-slate-900 border border-slate-700 px-1 py-0.5 text-xs text-slate-100"
                >
                  <option value="none">Off</option>
                  <option value="x">+X</option>
                  <option value="-x">-X</option>
                  <option value="y">+Y</option>
                  <option value="-y">-Y</option>
                  <option value="z">+Z</option>
                  <option value="-z">-Z</option>
                </select>
              </label>
              <label className="text-[10px] text-slate-400">
                Joint limit
                <select
                  data-testid="rig-ik-joint-limit"
                  value={rigIkSettings.maxJointAngleDegrees}
                  onChange={(event) => onRigIkSettingsChange({ maxJointAngleDegrees: Number(event.target.value) })}
                  className="block w-full bg-slate-900 border border-slate-700 px-1 py-0.5 text-xs text-slate-100"
                >
                  {RIG_IK_MAX_ANGLE_OPTIONS.map((angle) => <option key={angle} value={angle}>{angle}°</option>)}
                </select>
              </label>
              <label className="text-[10px] text-slate-400">
                Iterations
                <select
                  data-testid="rig-ik-iterations"
                  value={rigIkSettings.maxIterations}
                  onChange={(event) => onRigIkSettingsChange({ maxIterations: Number(event.target.value) })}
                  className="block w-full bg-slate-900 border border-slate-700 px-1 py-0.5 text-xs text-slate-100"
                >
                  {RIG_IK_ITERATION_OPTIONS.map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </label>
            </div>
            <label className="mt-1 block text-[10px] text-slate-400">
              Tolerance
              <select
                data-testid="rig-ik-tolerance"
                value={rigIkSettings.tolerance}
                onChange={(event) => onRigIkSettingsChange({ tolerance: Number(event.target.value) })}
                className="block w-full bg-slate-900 border border-slate-700 px-1 py-0.5 text-xs text-slate-100"
              >
                {RIG_IK_TOLERANCE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <div className="mt-1 text-[10px] text-slate-400">
              Drag the labeled target in any pane. Escape cancels the full chain. Rotations export as pose data; bone lengths stay fixed.
            </div>
            {rigIkLastResult && (
              <div
                data-testid="rig-ik-result"
                data-rig-ik-status={rigIkLastResult.status}
                className="mt-1 text-[10px] text-amber-200"
              >
                {rigIkLastResult.status.replace('-', ' ')} · {rigIkLastResult.distanceToTarget.toFixed(4)} target distance
              </div>
            )}
          </div>
        )}
        <label className="flex items-center gap-1 mb-2 text-[10px] text-slate-400">
          <span className="shrink-0">Snap</span>
          <select
            data-testid="rig-snap-step"
            value={String(rigSnapStep)}
            disabled={sourceFormat === 'smf'}
            onChange={(event) => onRigSnapStepChange(Number(event.target.value))}
            className="min-w-0 flex-1 bg-slate-900 border border-slate-700 px-1 py-0.5 text-xs text-slate-100 disabled:text-slate-500"
            aria-label="Rig snap step"
            title={smfControlReason('snap')}
          >
            {RIG_SNAP_STEPS.map((step) => (
              <option key={step} value={String(step)}>
                {step === 0 ? 'Off' : `${step} units`}
              </option>
            ))}
          </select>
        </label>
        <div className="text-slate-400 text-[10px] mb-1">Edit</div>
        <div className="flex gap-1 mb-2">
          <input
            data-testid="rig-rename-input"
            value={renameValue}
            disabled={!canRename}
            onChange={(event) => setRenameValue(event.target.value)}
            className="min-w-0 flex-1 bg-slate-900 border border-slate-700 px-1 py-0.5 text-xs text-slate-100 disabled:text-slate-500"
            aria-label="Bone name"
            title={smfControlReason('rename')}
          />
          <button
            data-testid="rig-rename-btn"
            className="px-1 py-0 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
            disabled={!canRename}
            onClick={() => onRenameSelectedBone(renameValue)}
            title={smfControlReason('rename')}
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
            title={smfControlReason('reparent')}
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
            title={smfControlReason('reparent')}
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
            title={smfControlReason('create-child')}
          />
          <button
            data-testid="rig-create-child-btn"
            className="px-1 py-0 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
            disabled={!canCreateChild}
            onClick={() => onCreateChildBone(createValue)}
            title={smfControlReason('create-child')}
          >
            Child
          </button>
        </div>
        <button
          data-testid="rig-delete-bone-btn"
          className="w-full px-1 py-0.5 text-xs bg-rose-950/70 hover:bg-rose-900/80 border border-rose-800/70 text-rose-100 disabled:opacity-50"
          disabled={!canRename}
          onClick={onDeleteSelectedBone}
          title={smfControlReason('delete')}
        >
          Delete Selected
        </button>
        <button
          data-testid="rig-detach-toggle-btn"
          data-rig-detach-mode={selectedIsDeformBone ? 'detach' : 'connect'}
          className="mt-1 w-full px-1 py-0.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 disabled:opacity-50"
          disabled={!canChangeDetachState}
          onClick={() => onSetSelectedBoneDetached(selectedIsDeformBone)}
          title={smfControlReason('detach-connect')}
        >
          {selectedIsDeformBone ? 'Detach Selected' : 'Connect Selected'}
        </button>
        <div className="mt-2 text-slate-400 text-[10px] mb-1">Spin</div>
        <div className="grid grid-cols-3 gap-1 mb-2" data-testid="rig-spin-row">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <button
              key={axis}
              data-testid={`rig-spin-${axis}-btn`}
              className="px-1 py-0.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 disabled:opacity-50"
              disabled={!canSpinRig}
              onClick={() => onSpinRig(axis)}
              title={smfControlReason('spin')}
            >
              {axis.toUpperCase()}
            </button>
          ))}
        </div>
        {isSmfSource && (
          <div className="mb-2 grid gap-1 rounded border border-slate-700 bg-slate-950/40 p-1" data-testid="smf-rig-policy">
            <div className="text-[10px] text-slate-300">SMF edit policy</div>
            {listSmfRigPolicies().map((policy) => (
              <div
                key={policy.id}
                data-testid={`smf-rig-policy-${policy.id}`}
                data-smf-rig-supported={String(policy.supported)}
                className={`text-[10px] leading-snug ${policy.supported ? 'text-emerald-300' : 'text-slate-500'}`}
              >
                <span className="font-medium">{policy.label}:</span> {policy.reason}
              </div>
            ))}
          </div>
        )}
        {selected && selected !== 'Scene' && !selectedIsDeformBone && sourceFormat !== 'smf' && (
          <div data-testid="rig-detached-selection-note" className="text-[10px] text-slate-500 mb-2">
            Detached hierarchy node is visible for selection; deform edits stay gated until the node is connected.
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
