import type { ImportedSmf } from './smf';

export type SmfDiagnosticLevel = 'info' | 'warning' | 'error';

export interface SmfDiagnostic {
  level: SmfDiagnosticLevel;
  code: string;
  message: string;
  target?: string;
}

export interface SmfDiagnosticReport {
  canExportSmf: boolean;
  diagnostics: SmfDiagnostic[];
}

export interface SmfRoundtripSummary {
  meshes: number;
  textures: number;
  bones: number;
  animations: number;
  vertices: number;
  triangles: number;
  animationFrames: number;
}

export interface SmfRoundtripReport {
  ok: boolean;
  before: SmfRoundtripSummary;
  after: SmfRoundtripSummary;
  messages: string[];
}

export function makeDiagnosticReport(diagnostics: SmfDiagnostic[]): SmfDiagnosticReport {
  return {
    diagnostics,
    canExportSmf: diagnostics.every((item) => item.level !== 'error'),
  };
}

export function pushDiagnostic(
  diagnostics: SmfDiagnostic[],
  level: SmfDiagnosticLevel,
  code: string,
  message: string,
  target?: string,
): void {
  diagnostics.push({ level, code, message, target });
}

export function summarizeImportedSmf(smf: ImportedSmf): SmfRoundtripSummary {
  return {
    meshes: smf.meshes.length,
    textures: smf.textures.length,
    bones: smf.bones.length,
    animations: smf.animations.length,
    vertices: smf.meshes.reduce((sum, mesh) => sum + mesh.verts, 0),
    triangles: smf.meshes.reduce((sum, mesh) => sum + mesh.triangles.length, 0),
    animationFrames: smf.animations.reduce((sum, animation) => sum + animation.frames.length, 0),
  };
}

export function compareSmfRoundtrip(beforeSmf: ImportedSmf, afterSmf: ImportedSmf): SmfRoundtripReport {
  const before = summarizeImportedSmf(beforeSmf);
  const after = summarizeImportedSmf(afterSmf);
  const messages: string[] = [];

  for (const key of Object.keys(before) as (keyof SmfRoundtripSummary)[]) {
    if (before[key] !== after[key]) {
      messages.push(`${key}: expected ${before[key]}, got ${after[key]}`);
    }
  }

  if (messages.length === 0) {
    messages.push('SMF roundtrip summary matched after export and reimport.');
  }

  return {
    ok: messages.length === 1 && messages[0].startsWith('SMF roundtrip summary matched'),
    before,
    after,
    messages,
  };
}
