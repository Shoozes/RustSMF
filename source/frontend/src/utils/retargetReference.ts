export interface LocalReferenceCorrection {
  from: [number, number, number, number];
  to: [number, number, number, number];
}

/** Explicit local calibration, never an automatic angular clamp. */
export function parseLocalReferenceCorrections(value: unknown): Record<string, LocalReferenceCorrection> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Local reference corrections must be an object.');
  const entries = Object.entries(value);
  if (entries.length > 64) throw new Error('Local reference corrections exceed 64 bones.');
  const rotation = (value: unknown): LocalReferenceCorrection['from'] => {
    if (!Array.isArray(value) || value.length !== 4 || !Array.from(value).every(n => typeof n === 'number' && Number.isFinite(n))
      || Math.abs(Math.hypot(...value) - 1) > 1e-4) throw new Error('Local reference correction requires unit quaternions.');
    return [...value] as LocalReferenceCorrection['from'];
  };
  return Object.fromEntries(entries.map(([bone, raw]) => {
    if (!bone.trim() || bone.length > 160 || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid local reference correction bone.');
    const entry = raw as Record<string, unknown>;
    if (Object.keys(entry).some(key => key !== 'from' && key !== 'to')) throw new Error('Unknown local reference correction field.');
    return [bone, { from: rotation(entry.from), to: rotation(entry.to) }];
  }));
}
