/**
 * Simple sequence guard utility for preventing stale async results (e.g. overlapping file loads, dialog opens).
 * Extracted to promote testability and modularity (aligns with modularity watch #9 and async tests item 3).
 * Usage: const guard = createSeqGuard(); const seq = guard.next(); ... if (guard.isCurrent(seq)) { update state }
 */
export function createSeqGuard() {
  let current = 0;
  return {
    next: () => ++current,
    isCurrent: (seq: number) => seq === current,
    reset: () => { current = 0; },
  };
}
