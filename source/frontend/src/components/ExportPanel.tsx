import type { SmfDiagnosticReport, SmfRoundtripReport } from '../loaders';

interface ExportPanelProps {
  sourceFormat: string;
  hasSkeleton: boolean;
  editorMode?: string;
  smfDiagnosticReport: SmfDiagnosticReport;
  smfRoundtripReport: SmfRoundtripReport | null;
  onRunSmfRoundtripCheck: () => void;
  onSaveSmfDiagnosticReport: () => void;
}

export default function ExportPanel({
  sourceFormat,
  hasSkeleton,
  editorMode = 'export',
  smfDiagnosticReport,
  smfRoundtripReport,
  onRunSmfRoundtripCheck,
  onSaveSmfDiagnosticReport,
}: ExportPanelProps) {
  const errors = smfDiagnosticReport.diagnostics.filter((item) => item.level === 'error').length;
  const warnings = smfDiagnosticReport.diagnostics.filter((item) => item.level === 'warning').length;
  const materialTextures = smfDiagnosticReport.materialTextures ?? [];
  const roundtripStatus = smfRoundtripReport?.status ?? null;
  const roundtripStatusText =
    roundtripStatus === 'passed'
      ? 'Roundtrip passed'
      : roundtripStatus === 'warning'
        ? 'Roundtrip warning'
        : 'Roundtrip mismatch';
  const roundtripClass =
    roundtripStatus === 'passed'
      ? 'smf-roundtrip-ok'
      : roundtripStatus === 'warning'
        ? 'smf-roundtrip-warning'
        : 'smf-roundtrip-fail';

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
      <div
        className="smf-diagnostics"
        data-testid="smf-diagnostics-panel"
        data-smf-can-export={smfDiagnosticReport.canExportSmf ? 'true' : 'false'}
      >
        <div className="smf-diagnostics-title">
          SMF diagnostics: {smfDiagnosticReport.canExportSmf ? 'ready' : 'blocked'}
        </div>
        <div className="smf-diagnostics-summary">
          {errors} error{errors === 1 ? '' : 's'} / {warnings} warning{warnings === 1 ? '' : 's'}
        </div>
        <ul className="smf-diagnostics-list">
          {smfDiagnosticReport.diagnostics.map((item) => (
            <li
              key={`${item.code}-${item.target || item.message}`}
              className={`smf-diagnostic smf-diagnostic-${item.level}`}
              data-testid={`smf-diagnostic-${item.level}`}
            >
              <span className="smf-diagnostic-code">{item.code}</span>
              <span>{item.message}</span>
              {item.target && <span className="smf-diagnostic-target">{item.target}</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="smf-material-textures" data-testid="smf-material-textures-panel">
        <div className="smf-diagnostics-title">Material textures</div>
        {materialTextures.length > 0 ? (
          <ul className="smf-diagnostics-list">
            {materialTextures.map((texture) => (
              <li
                key={`${texture.meshName}-${texture.materialIndex}-${texture.mapType}-${texture.textureName}-${texture.source}`}
                className="smf-diagnostic smf-diagnostic-info"
                data-testid="smf-material-texture-row"
              >
                <span className="smf-diagnostic-code">{texture.mapType}</span>
                <span>{texture.textureName}</span>
                <span className="smf-diagnostic-target">{texture.meshName}</span>
                <span>
                  material {texture.materialIndex}
                  {' '}
                  {texture.width && texture.height ? `${texture.width}x${texture.height}` : 'unreadable size'}
                  {' '}
                  {texture.isPowerOfTwo === null ? 'size unknown' : texture.isPowerOfTwo ? 'POT' : 'non-POT'}
                </span>
                <span className="smf-diagnostic-target">{texture.source}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="smf-diagnostics-summary" data-testid="smf-material-textures-empty">
            No skinned-mesh texture maps detected.
          </div>
        )}
      </div>
      <div className="smf-roundtrip" data-testid="smf-roundtrip-panel">
        <div className="smf-diagnostics-title">Roundtrip check</div>
        <button
          type="button"
          data-testid="smf-roundtrip-check-btn"
          onClick={onRunSmfRoundtripCheck}
        >
          Run SMF Check
        </button>
        <button
          type="button"
          data-testid="save-smf-report-btn"
          onClick={onSaveSmfDiagnosticReport}
        >
          Save Report
        </button>
        {smfRoundtripReport && (
          <div
            className={`smf-roundtrip-result ${roundtripClass}`}
            data-testid="smf-roundtrip-result"
            data-smf-roundtrip-ok={smfRoundtripReport.ok ? 'true' : 'false'}
            data-smf-roundtrip-status={smfRoundtripReport.status}
          >
            <div className="smf-roundtrip-status">
              {roundtripStatusText}
            </div>
            <div className="smf-roundtrip-summary">
              meshes {smfRoundtripReport.after.meshes}, bones {smfRoundtripReport.after.bones}, clips {smfRoundtripReport.after.animations}
            </div>
            <div className="smf-roundtrip-summary">
              max vertex delta {smfRoundtripReport.vertexPositionMaxDelta.toFixed(6)} / normal delta {smfRoundtripReport.vertexNormalMaxDelta.toFixed(6)} / bounds delta {smfRoundtripReport.meshBoundsMaxDelta.toFixed(6)} / bone pose delta {smfRoundtripReport.bonePoseMaxDelta.toFixed(6)} (samples {smfRoundtripReport.bonePoseSamplesChecked})
            </div>
            <div className="smf-roundtrip-check-heading">Compatibility checks</div>
            <ul className="smf-diagnostics-list smf-roundtrip-checks" data-testid="smf-roundtrip-check-list">
              {smfRoundtripReport.checks.map((check) => (
                <li
                  key={`${check.code}-${check.target || check.message}`}
                  className={`smf-diagnostic smf-roundtrip-check smf-roundtrip-check-${check.level}`}
                  data-testid={`smf-roundtrip-check-${check.level}`}
                  data-smf-roundtrip-check-code={check.code}
                >
                  <span className="smf-diagnostic-code">{check.code}</span>
                  <span className="smf-roundtrip-check-label">{check.label}</span>
                  <span>{check.message}</span>
                  {check.target && <span className="smf-diagnostic-target">{check.target}</span>}
                </li>
              ))}
            </ul>
            <ul className="smf-diagnostics-list">
              {smfRoundtripReport.messages.map((message) => (
                <li key={message} className="smf-diagnostic smf-diagnostic-info">
                  {message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
