export function modernStatus(status: string): string {
  if (status.startsWith('Three.js viewport ready')) return 'Ready';
  if (/^Loaded(?: FBX| project)?:/i.test(status)) {
    // Resource warnings and synchronous fallback remain visible.
    if (/skipped|missing|unavailable|fallback|warning| — /i.test(status)) return status;
    return status.split(' | ')[0];
  }
  return status;
}
