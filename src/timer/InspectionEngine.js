// WCA-style inspection boundaries (Regulations, April 1, 2026 edition, A3 and A4).
// turnbase simulates these rules for practice. It is not certified equipment.

export const INSPECTION_LIMIT_MS = 15000;
export const INSPECTION_DNF_MS = 17000;
export const INSPECTION_CUES_MS = [8000, 12000];

/**
 * The penalty for starting after `elapsedMs` of inspection.
 * Under 15 s: none. From exactly 15.00 s to under 17 s: +2. From 17.00 s: DNF.
 */
export function inspectionPenalty(elapsedMs) {
  if (elapsedMs >= INSPECTION_DNF_MS) return 'dnf';
  if (elapsedMs >= INSPECTION_LIMIT_MS) return '+2';
  return 'none';
}

/** Cue times crossed between two readings, so a slow frame cannot skip a cue. */
export function crossedCues(previousMs, currentMs) {
  return INSPECTION_CUES_MS.filter((cue) => previousMs < cue && currentMs >= cue);
}

/** What the inspection display shows at `elapsedMs`. */
export function inspectionDisplay(elapsedMs) {
  if (elapsedMs >= INSPECTION_DNF_MS) return { text: 'DNF', phase: 'dnf' };
  if (elapsedMs >= INSPECTION_LIMIT_MS) return { text: '+2', phase: 'plus2' };
  const remaining = Math.ceil((INSPECTION_LIMIT_MS - elapsedMs) / 1000);
  const phase = elapsedMs >= 12000 ? 'late' : elapsedMs >= 8000 ? 'warn' : 'normal';
  return { text: String(remaining), phase };
}
