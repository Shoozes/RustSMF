export interface TextureExportPolicy {
  action: 'Export' | 'GLB' | 'FBX' | 'SMF';
  format: 'SMF' | 'GLB' | 'FBX' | 'none';
  texturePolicy: 'embedded' | 'omitted' | 'unavailable';
  detail: string;
}

export interface LegacyShelfDecision {
  action: 'Global snap' | 'Merge same textures' | 'Include textures';
  decision: string;
  reason: string;
}

const GLB_EMBEDDED = 'Binary GLB embeds supported material images; viewport-only display settings are excluded.';
const FBX_EMBEDDED = 'Binary FBX requests embedded images in the browser/desktop runtime; re-import to verify exporter compatibility.';
const SMF_EMBEDDED = 'SMF source export re-embeds imported RGBA texture records in the SMF binary.';
const SMF_OMITTED = 'Three-to-SMF conversion does not serialize material textures; use GLB when material fidelity matters.';

export function getTextureExportPolicies(sourceFormat: string): TextureExportPolicy[] {
  if (!sourceFormat) {
    return [{
      action: 'Export',
      format: 'none',
      texturePolicy: 'unavailable',
      detail: 'Load a model to resolve its format-specific export path.',
    }];
  }

  const primary: TextureExportPolicy = sourceFormat === 'smf'
    ? { action: 'Export', format: 'SMF', texturePolicy: 'embedded', detail: SMF_EMBEDDED }
    : sourceFormat === 'fbx'
      ? { action: 'Export', format: 'FBX', texturePolicy: 'embedded', detail: FBX_EMBEDDED }
      : { action: 'Export', format: 'GLB', texturePolicy: 'embedded', detail: GLB_EMBEDDED };

  return [
    primary,
    { action: 'GLB', format: 'GLB', texturePolicy: 'embedded', detail: GLB_EMBEDDED },
    { action: 'FBX', format: 'FBX', texturePolicy: 'embedded', detail: FBX_EMBEDDED },
    sourceFormat === 'smf'
      ? { action: 'SMF', format: 'SMF', texturePolicy: 'embedded', detail: SMF_EMBEDDED }
      : { action: 'SMF', format: 'SMF', texturePolicy: 'omitted', detail: SMF_OMITTED },
  ];
}

export const LEGACY_SHELF_DECISIONS: LegacyShelfDecision[] = [
  {
    action: 'Global snap',
    decision: 'Replaced by workspace snap',
    reason: 'Rig snap owns world units while Animate snap owns key time; one global value would mix incompatible units.',
  },
  {
    action: 'Merge same textures',
    decision: 'Preflight only',
    reason: 'The legacy action merged geometry/material ownership. RustSMF reports reuse candidates but does not mutate them without an undoable validated atlas workflow.',
  },
  {
    action: 'Include textures',
    decision: 'Resolved by format',
    reason: 'Current exporters do not own a separate-image file set, so an include toggle would promise a write path that does not exist.',
  },
];
