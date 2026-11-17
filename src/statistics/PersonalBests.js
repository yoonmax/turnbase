// New session records set by the latest solve: single, ao5 and ao12. A first result
// is not a record, since there was nothing to beat.

import { isDnf } from './AverageCalculator.js';
import { computeSessionStats } from './StatisticsEngine.js';

const KINDS = [
  { kind: 'single', label: 'single', size: 1 },
  { kind: 'ao5', label: 'average of 5', size: 5 },
  { kind: 'ao12', label: 'average of 12', size: 12 },
];

/** Records improved by adding the last solve of `after` to `before`. */
export function newBests(before, after) {
  if (after.length !== before.length + 1) return [];
  const was = computeSessionStats(before);
  const now = computeSessionStats(after);
  const pick = (stats, kind) => (kind === 'single' ? stats.best : stats.windows[kind === 'ao5' ? 5 : 12].best);
  const out = [];
  for (const { kind, label, size } of KINDS) {
    const previous = pick(was, kind);
    const value = pick(now, kind);
    if (previous === null || value === null || isDnf(value) || (!isDnf(previous) && value >= previous)) continue;
    out.push({ kind, label, value, previous, solveIds: after.slice(-size).map((s) => s.id) });
  }
  return out;
}
