// Stage splits for CFOP solves, marked by hand while watching a solve's video.
// A solve's `splits` holds the end of the cross, F2L and OLL, in milliseconds from the
// start of the solve; PLL runs from the end of OLL to the stop.

import { roundAverage } from './AverageCalculator.js';

export const STAGES = [
  { id: 'cross', label: 'Cross' },
  { id: 'f2l', label: 'F2L' },
  { id: 'oll', label: 'OLL' },
  { id: 'pll', label: 'PLL' },
];
export const MARKS = STAGES.length - 1;

const valid = (splits, rawMs) =>
  Array.isArray(splits) && splits.length === MARKS && splits.every((t, i) => t > (i ? splits[i - 1] : 0) && t < rawMs);

/** Adds a mark at `ms`, keeping marks ordered and inside the solve. Returns the new list. */
export function addSplit(splits = [], ms, rawMs) {
  const t = Math.round(ms);
  if (!(t > 0 && t < rawMs) || splits.length >= MARKS || splits.includes(t)) return splits;
  return [...splits, t].sort((a, b) => a - b);
}

/** Durations of the four stages in ms, or null until all three marks are set. */
export function stageDurations(solve) {
  const { splits, rawMs } = solve ?? {};
  if (!valid(splits, rawMs)) return null;
  const edges = [0, ...splits, rawMs];
  return STAGES.map((_, i) => edges[i + 1] - edges[i]);
}

/** For each stage: how many solves, mean, best and the mean of the latest `recent`. */
export function splitStats(solves, { recent = 12 } = {}) {
  const rows = solves.map(stageDurations).filter(Boolean);
  return STAGES.map((stage, i) => {
    const values = rows.map((r) => Math.floor(r[i] / 10)); // centiseconds
    const latest = values.slice(-recent);
    const total = rows.reduce((sum, r) => sum + r.reduce((a, b) => a + b, 0), 0);
    const stageTotal = rows.reduce((sum, r) => sum + r[i], 0);
    return {
      ...stage,
      count: values.length,
      mean: values.length ? roundAverage(values.reduce((a, b) => a + b, 0), values.length) : null,
      best: values.length ? Math.min(...values) : null,
      recent: latest.length ? roundAverage(latest.reduce((a, b) => a + b, 0), latest.length) : null,
      share: total ? stageTotal / total : null,
    };
  });
}
