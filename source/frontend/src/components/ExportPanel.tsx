import type { SmfDiagnosticReport, SmfRoundtripReport } from '../loaders';
import { LEGACY_SHELF_DECISIONS, getTextureExportPolicies } from '../utils/materialPolicy';
import { findDuplicateTextureGroups, type TextureSummary } from '../utils/textureCompat';
import type { GeometryDiagnosticsReport } from '../utils/geometryDiagnostics';

interface ExportPanelProps {
  sourceFormat: string;
  hasSkeleton: boolean;
  editorMode?: string;
  smfDiagnosticReport: SmfDiagnosticReport;
  materialTextures: TextureSummary[];
  geometryDiagnostics: GeometryDiagnosticsReport;
  restPoseGhostEnabled: boolean;
  onRestPoseGhostEnabledChange: (enabled: boolean) => void;
  motionTrailsEnabled: boolean;
  onMotionTrailsEnabledChange: (enabled: boolean) => void;
  onionSkinEnabled: boolean;
  onOnionSkinEnabledChange: (enabled: boolean) => void;
  smfRoundtripReport: SmfRoundtripReport | null;
  onRunSmfRoundtripCheck: () => void;
  onSaveSmfDiagnosticReport: () => void;
}

export default function ExportPanel({
  sourceFormat,
  hasSkeleton,
  editorMode = 'export',
  smfDiagnosticReport,
  materialTextures,
  geometryDiagnostics,
  restPoseGhostEnabled,
  onRestPoseGhostEnabledChange,
  motionTrailsEnabled,
  onMotionTrailsEnabledChange,
  onionSkinEnabled,
  onOnionSkinEnabledChange,
  smfRoundtripReport,
  onRunSmfRoundtripCheck,
  onSaveSmfDiagnosticReport,
}: ExportPanelProps) {
  const errors = smfDiagnosticReport.diagnostics.filter((item) => item.level === 'error').length;
  const warnings = smfDiagnosticReport.diagnostics.filter((item) => item.level === 'warning').length;
  const texturePolicies = getTextureExportPolicies(sourceFormat);
  const duplicateTextureGroups = findDuplicateTextureGroups(materialTextures);
  const roundtripStatus = smfRoundtripReport?.status ?? null;
  const poseDeltaDetails = smfRoundtripReport?.poseDeltaDetails ?? [];
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
        SMF export uses imported data when available; compatible non-SMF conversion is validated through shared mesh, rig, and animation space boundaries.
      </div>
      <div className="text-[10px] text-slate-500 mt-1">
        GLB remains the default fidelity path for runtime/scale/material-heavy workflows.
      </div>
      <div className="smf-material-textures" data-testid="geometry-diagnostics-panel">
        <div className="smf-diagnostics-title">Geometry and shader diagnostics</div>
        <div className="smf-diagnostics-summary">
          {geometryDiagnostics.meshes.length} submodel{geometryDiagnostics.meshes.length === 1 ? '' : 's'} · {geometryDiagnostics.totalVertices} vertices · {geometryDiagnostics.missingNormals} missing normals · {geometryDiagnostics.missingTangents} missing tangents · {geometryDiagnostics.missingUvs} missing UV sets · {geometryDiagnostics.leftHandedMeshes} left-handed
        </div>
        <div className="smf-diagnostics-summary" data-testid="shader-capability-summary">
          Shader: {geometryDiagnostics.shader.webgl2 ? 'WebGL2' : 'fallback'} · standard materials available · legacy preview {geometryDiagnostics.shader.legacyShaderPreview ? 'available' : 'not applicable'}
        </div>
        {geometryDiagnostics.meshes.length > 0 && (
          <ul className="smf-diagnostics-list" data-testid="geometry-diagnostic-list">
            {geometryDiagnostics.meshes.map((mesh) => (
              <li key={mesh.objectId} className="smf-diagnostic smf-diagnostic-info" data-testid="geometry-diagnostic-row">
                <span className="smf-diagnostic-code">{mesh.objectName}</span>
                <span>{mesh.submodelId} · {mesh.vertexCount} verts</span>
                <span>normal {mesh.normalStatus} · tangent {mesh.tangentStatus} · UV {mesh.uvStatus}</span>
                <span>{mesh.handedness} · materials {mesh.materialNames.join(', ') || 'none'}</span>
              </li>
            ))}
          </ul>
        )}
        {geometryDiagnostics.shader.notes.map((note) => <div key={note} className="text-[10px] text-slate-500">{note}</div>)}
      </div>
      <div className="smf-material-textures" data-testid="pose-display-panel">
        <div className="smf-diagnostics-title">Pose display</div>
        <div className="grid gap-1 text-[10px] text-slate-400">
          <label className="flex items-center gap-1">
            <input type="checkbox" data-testid="rest-pose-ghost-toggle" checked={restPoseGhostEnabled} onChange={(event) => onRestPoseGhostEnabledChange(event.target.checked)} />
            Rest-pose ghost
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" data-testid="motion-trails-toggle" checked={motionTrailsEnabled} onChange={(event) => onMotionTrailsEnabledChange(event.target.checked)} />
            Motion trails
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" data-testid="onion-skin-toggle" checked={onionSkinEnabled} onChange={(event) => onOnionSkinEnabledChange(event.target.checked)} />
            Onion span
          </label>
        </div>
        <div className="mt-1 text-[10px] text-slate-500">Overlays are viewport-only and are excluded from asset/project export.</div>
      </div>
      <div className="smf-material-textures" data-testid="texture-export-policy-panel">
        <div className="smf-diagnostics-title">Texture export policy</div>
        <div className="smf-diagnostics-summary">
          Repeat/filter and Tex are viewport previews. GLB/FBX export restores source materials and samplers; SMF follows the binary policy below.
        </div>
        <ul className="smf-diagnostics-list">
          {texturePolicies.map((policy) => (
            <li
              key={policy.action}
              className={`smf-diagnostic ${policy.texturePolicy === 'omitted' ? 'smf-diagnostic-warning' : 'smf-diagnostic-info'}`}
              data-testid="texture-export-policy-row"
              data-export-action={policy.action.toLowerCase()}
              data-export-format={policy.format.toLowerCase()}
              data-texture-policy={policy.texturePolicy}
            >
              <span className="smf-diagnostic-code">{policy.action} to {policy.format}</span>
              <span>{policy.texturePolicy}</span>
              <span className="smf-diagnostic-target">{policy.detail}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="smf-material-textures" data-testid="legacy-material-policy-panel">
        <div className="smf-diagnostics-title">Legacy shelf decisions</div>
        <ul className="smf-diagnostics-list">
          {LEGACY_SHELF_DECISIONS.map((item) => (
            <li key={item.action} className="smf-diagnostic smf-diagnostic-info" data-testid="legacy-material-policy-row">
              <span className="smf-diagnostic-code">{item.action}</span>
              <span>{item.decision}</span>
              <span className="smf-diagnostic-target">{item.reason}</span>
            </li>
          ))}
        </ul>
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
        <div className="smf-diagnostics-title mt-2">Shared texture preflight</div>
        {duplicateTextureGroups.length > 0 ? (
          <ul className="smf-diagnostics-list" data-testid="duplicate-texture-groups">
            {duplicateTextureGroups.map((group) => (
              <li key={group.source} className="smf-diagnostic smf-diagnostic-info" data-testid="duplicate-texture-group-row">
                <span className="smf-diagnostic-code">{group.uses.length} uses</span>
                <span>{group.textureNames.join(', ')}</span>
                <span className="smf-diagnostic-target">
                  Shared reference detected; no destructive geometry/material merge is applied.
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="smf-diagnostics-summary" data-testid="duplicate-texture-groups-empty">
            No cross-material shared texture candidates detected.
          </div>
        )}
      </div>
      <div className="smf-roundtrip" data-testid="smf-roundtrip-panel">
        <div className="smf-diagnostics-title">Roundtrip check</div>
        <button
          type="button"
          data-testid="smf-roundtrip-check-btn"
          onClick={onRunSmfRoundtripCheck}
          disabled={!smfDiagnosticReport.canExportSmf}
          title={smfDiagnosticReport.canExportSmf
            ? 'Run an SMF export and re-import check'
            : 'SMF roundtrip is unavailable until the current source has a verified SMF export path'}
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
              max vertex delta {smfRoundtripReport.vertexPositionMaxDelta.toFixed(6)} / normal delta {smfRoundtripReport.vertexNormalMaxDelta.toFixed(6)} / skin index changes {smfRoundtripReport.skinIndexMismatchCount} / skin weight delta {smfRoundtripReport.skinWeightMaxDelta.toFixed(6)} / bounds delta {smfRoundtripReport.meshBoundsMaxDelta.toFixed(6)} / bone pose delta {smfRoundtripReport.bonePoseMaxDelta.toFixed(6)} (samples {smfRoundtripReport.bonePoseSamplesChecked})
            </div>
            {poseDeltaDetails.length > 0 && (
              <>
                <div className="smf-roundtrip-check-heading">Worst pose deltas</div>
                <ul className="smf-diagnostics-list smf-roundtrip-pose-deltas" data-testid="smf-pose-delta-details">
                  {poseDeltaDetails.map((detail) => (
                    <li
                      key={`${detail.animationIndex}-${detail.frameIndex}-${detail.boneIndex}-${detail.maxComponentDelta}`}
                      className="smf-diagnostic smf-roundtrip-check smf-roundtrip-check-warning"
                      data-testid="smf-pose-delta-row"
                    >
                      <span className="smf-diagnostic-code">{detail.maxComponentDelta.toFixed(6)}</span>
                      <span>
                        {detail.animationName} {detail.frameLabel} frame {detail.frameIndex}, bone {detail.boneIndex}
                      </span>
                      <span className="smf-diagnostic-target">
                        parent {detail.beforeParent}{'->'}{detail.afterParent}, isBone {detail.beforeIsBone}{'->'}{detail.afterIsBone}
                      </span>
                      <span>
                        {detail.componentDeltas.map((delta, index) => `c${index}:${delta.toFixed(6)}`).join(' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
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
