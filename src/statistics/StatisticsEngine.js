// Aggregates over a list of solves. All values are centiseconds unless named
// otherwise. Mean, median and standard deviation are over completed solves: they
// exclude DNF and DNS, which have no time. Solves are expected oldest first.

import {
  DNF,
  bestOf,
  isDnf,
  resultCs,
  rollingAverage,
  rollingMean3,
  roundAverage,
} from './AverageCalculator.js';

export const STANDARD_WINDOWS = [5, 12, 50, 100, 1000];

export const solveValue = (solve) => resultCs(solve.rawMs, solve.penalty);

export function median(sortedValues) {
  const n = sortedValues.length;
  if (n === 0) return null;
  const mid = n >> 1;
  return n % 2 ? sortedValues[mid] : roundAverage(sortedValues[mid - 1] + sortedValues[mid], 2);
}

/** Sample standard deviation (n−1) in centiseconds, rounded. */
export function standardDeviation(values) {
  const n = values.length;
  if (n < 2) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  let squares = 0;
  for (const v of values) squares += (v - mean) * (v - mean);
  return Math.round(Math.sqrt(squares / (n - 1)));
}

export function computeSessionStats(solves, extraWindows = []) {
  const values = solves.map(solveValue);
  const completed = values.filter((v) => !isDnf(v));
  const sorted = Int32Array.from(completed).sort();
  const sum = completed.reduce((a, b) => a + b, 0);

  const windows = {};
  const allWindows = [...new Set([...STANDARD_WINDOWS, ...extraWindows])].sort((a, b) => a - b);
  for (const n of allWindows) {
    const series = rollingAverage(values, n);
    const best = bestOf(series);
    windows[n] = {
      current: series.length ? series[series.length - 1] : null,
      best: best.value,
      bestIndex: best.index,
    };
  }

  const mo3Series = rollingMean3(values);
  const bestMo3 = bestOf(mo3Series);

  return {
    count: solves.length,
    completedCount: completed.length,
    dnfCount: solves.filter((s) => s.penalty === 'dnf').length,
    dnsCount: solves.filter((s) => s.penalty === 'dns').length,
    plusTwoCount: solves.filter((s) => s.penalty === '+2').length,
    current: values.length ? values[values.length - 1] : null,
    best: completed.length ? sorted[0] : null,
    bestIndex: completed.length ? values.indexOf(sorted[0]) : -1,
    worst: completed.length ? sorted[sorted.length - 1] : null,
    worstIndex: completed.length ? values.indexOf(sorted[sorted.length - 1]) : -1,
    mean: completed.length ? roundAverage(sum, completed.length) : null,
    median: median(sorted),
    stdDev: standardDeviation(completed),
    totalSolvingCs: sum,
    mo3: { current: mo3Series.length ? mo3Series[mo3Series.length - 1] : null, best: bestMo3.value, bestIndex: bestMo3.index },
    windows,
  };
}

/** Bins for a histogram of completed solves, on a rounded bin width. */
export function histogram(values, targetBins = 20) {
  const completed = values.filter((v) => !isDnf(v));
  if (!completed.length) return { bins: [], width: 0, dnf: values.length };
  let low = Infinity;
  let high = -Infinity;
  for (const v of completed) {
    if (v < low) low = v;
    if (v > high) high = v;
  }
  const steps = [10, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000, 300000, 600000];
  const span = Math.max(high - low, 1);
  const width = steps.find((s) => span / s <= targetBins) ?? steps[steps.length - 1];
  const start = Math.floor(low / width) * width;
  const count = Math.floor((high - start) / width) + 1;
  const bins = Array.from({ length: count }, (_, i) => ({ from: start + i * width, to: start + (i + 1) * width, count: 0 }));
  for (const v of completed) bins[Math.floor((v - start) / width)].count += 1;
  return { bins, width, dnf: values.length - completed.length };
}

function dayKey(timestamp) {
  const d = new Date(timestamp);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Local-calendar day counts, including the empty days between first and last. */
export function dailyCounts(solves) {
  if (!solves.length) return [];
  const counts = new Map();
  for (const s of solves) {
    const k = dayKey(s.createdAt);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const first = new Date(Math.min(...solves.map((s) => s.createdAt)));
  const last = new Date(Math.max(...solves.map((s) => s.createdAt)));
  first.setHours(12, 0, 0, 0);
  last.setHours(12, 0, 0, 0);
  const out = [];
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d.getTime());
    out.push({ day: k, count: counts.get(k) ?? 0 });
  }
  return out;
}

/** Every solve that set a new best, in order. */
export function personalBestProgression(solves) {
  const out = [];
  let best = DNF;
  solves.forEach((solve, index) => {
    const v = solveValue(solve);
    if (v < best) {
      best = v;
      out.push({ index, value: v, solve });
    }
  });
  return out;
}

/** Each window of `n` that set a new best average, in order. */
export function bestAverageProgression(solves, n) {
  const series = rollingAverage(solves.map(solveValue), n);
  const out = [];
  let best = DNF;
  series.forEach((v, index) => {
    if (v !== null && v < best) {
      best = v;
      out.push({ index, value: v, solve: solves[index] });
    }
  });
  return out;
}

/** Rolling standard deviation over completed solves in each window: lower is steadier. */
export function rollingConsistency(solves, n = 12) {
  const values = solves.map(solveValue);
  return values.map((_, i) => {
    if (i + 1 < n) return null;
    const window = values.slice(i + 1 - n, i + 1).filter((v) => !isDnf(v));
    return standardDeviation(window);
  });
}

export function filterSolves(solves, { from = null, to = null, puzzle = null, tag = null, query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return solves.filter((s) => {
    if (from !== null && s.createdAt < from) return false;
    if (to !== null && s.createdAt > to) return false;
    if (puzzle && s.puzzle !== puzzle) return false;
    if (tag && !(s.tags ?? []).includes(tag)) return false;
    if (q) {
      const hay = `${s.scramble ?? ''} ${s.comment ?? ''} ${(s.tags ?? []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
