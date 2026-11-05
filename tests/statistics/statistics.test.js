import { describe, expect, it } from 'vitest';
import {
  DNF,
  averageOf5,
  bestOf,
  meanOf3,
  resultCs,
  rolling,
  rollingAverage,
  rollingMean3,
  roundAverage,
  trimFor,
  trimmedAverage,
} from '../../src/statistics/AverageCalculator.js';
import {
  bestAverageProgression,
  computeSessionStats,
  dailyCounts,
  filterSolves,
  histogram,
  median,
  personalBestProgression,
  rollingConsistency,
  standardDeviation,
} from '../../src/statistics/StatisticsEngine.js';
import { formatCs, formatDuration, formatMs } from '../../src/utils/format.js';

describe('results', () => {
  it('truncates to hundredths, never rounds up', () => {
    expect(resultCs(12349)).toBe(1234);
    expect(resultCs(12340)).toBe(1234);
    expect(resultCs(9)).toBe(0);
  });

  it('adds +2 before truncating', () => {
    expect(resultCs(12349, '+2')).toBe(1434);
  });

  it('DNF and DNS are not times', () => {
    expect(resultCs(1000, 'dnf')).toBe(DNF);
    expect(resultCs(1000, 'dns')).toBe(DNF);
  });

  it('truncates to whole seconds at 10 minutes and over (9f2)', () => {
    expect(resultCs(599999)).toBe(59999);
    expect(resultCs(600000)).toBe(60000);
    expect(resultCs(601999)).toBe(60100);
    expect(resultCs(599000, '+2')).toBe(60100);
  });
});

describe('rounding of averages (9f)', () => {
  it('rounds to the nearest hundredth, half up', () => {
    expect(roundAverage(1001, 2)).toBe(501);
    expect(roundAverage(1000, 3)).toBe(333);
    expect(roundAverage(1001, 3)).toBe(334);
  });

  it('uses exact arithmetic where floats would drift', () => {
    // 1.005 × 100 style cases: (1000+1000+1001)/3 = 1000.333…, (1+1+2)/3 = 1.333…
    expect(roundAverage(3001, 3)).toBe(1000);
    expect(roundAverage(3002, 3)).toBe(1001);
  });

  it('rounds to the nearest second over 10 minutes: X.49 down, X.50 up', () => {
    expect(roundAverage(60049, 1)).toBe(60000);
    expect(roundAverage(60050, 1)).toBe(60100);
    expect(roundAverage(180150, 3)).toBe(60100);
  });
});

describe('mean of 3', () => {
  it('is the arithmetic mean of all three', () => {
    expect(meanOf3([1000, 1100, 1200])).toBe(1100);
    expect(meanOf3([1000, 1000, 1001])).toBe(1000);
    expect(meanOf3([1000, 1001, 1001])).toBe(1001);
  });

  it('any DNF or DNS makes it DNF', () => {
    expect(meanOf3([1000, DNF, 1200])).toBe(DNF);
  });

  it('needs exactly three results', () => {
    expect(meanOf3([1000, 1100])).toBe(null);
  });
});

describe('average of 5', () => {
  it('drops best and worst', () => {
    expect(averageOf5([1000, 1100, 1200, 1300, 5000])).toBe(1200);
    expect(averageOf5([5000, 1100, 1000, 1300, 1200])).toBe(1200);
  });

  it('matches a worked official-style example with rounding', () => {
    expect(averageOf5([1234, 1111, 1357, 1456, 1099])).toBe(1234);
  });

  it('one DNF takes the worst position', () => {
    expect(averageOf5([1000, 1100, DNF, 1300, 1200])).toBe(1200);
  });

  it('two DNFs make it DNF', () => {
    expect(averageOf5([1000, DNF, DNF, 1300, 1200])).toBe(DNF);
  });

  it('+2 flows through the result value', () => {
    const values = [resultCs(10000), resultCs(11000), resultCs(12000, '+2'), resultCs(13000), resultCs(14000)];
    expect(averageOf5(values)).toBe(Math.round((1100 + 1300 + 1400) / 3));
  });

  it('needs exactly five results', () => {
    expect(averageOf5([1, 2, 3, 4])).toBe(null);
  });
});

describe('trim sizes for unofficial rolling averages', () => {
  it('uses ceil(5%) from each end', () => {
    expect(trimFor(5)).toBe(1);
    expect(trimFor(12)).toBe(1);
    expect(trimFor(25)).toBe(2);
    expect(trimFor(50)).toBe(3);
    expect(trimFor(100)).toBe(5);
    expect(trimFor(1000)).toBe(50);
  });

  it('ao12 tolerates one DNF, not two', () => {
    const base = Array.from({ length: 12 }, (_, i) => 1000 + i);
    expect(trimmedAverage(base)).toBe(1006);
    expect(trimmedAverage([...base.slice(0, 11), DNF])).toBe(1006);
    expect(trimmedAverage([...base.slice(0, 10), DNF, DNF])).toBe(DNF);
  });

  it('ao50 tolerates three DNFs, not four', () => {
    const base = Array.from({ length: 50 }, (_, i) => 1000 + i);
    const with3 = base.map((v, i) => (i < 3 ? DNF : v));
    expect(trimmedAverage(with3)).not.toBe(DNF);
    const with4 = base.map((v, i) => (i < 4 ? DNF : v));
    expect(trimmedAverage(with4)).toBe(DNF);
  });
});

describe('rolling', () => {
  function naive(values, n, trim = trimFor(n)) {
    return values.map((_, i) => (i + 1 < n ? null : trimmedAverage(values.slice(i + 1 - n, i + 1), trim)));
  }

  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  it('is null until the window is full', () => {
    expect(rollingAverage([1, 2, 3, 4], 5)).toEqual([null, null, null, null]);
    expect(rollingAverage([100, 200, 300, 400, 500], 5)).toEqual([null, null, null, null, 300]);
  });

  it('mean of 3 uses no trim', () => {
    expect(rollingMean3([100, 200, 300, 400])).toEqual([null, null, 200, 300]);
    expect(rollingMean3([100, DNF, 300, 400])).toEqual([null, null, DNF, DNF]);
  });

  it.each([5, 12, 50, 100])('fast rolling ao%i equals a naive recomputation, DNFs included', (n) => {
    const rand = seeded(n);
    const values = Array.from({ length: 400 }, () => (rand() < 0.06 ? DNF : 800 + Math.floor(rand() * 1500)));
    expect(rolling(values, n)).toEqual(naive(values, n));
  });

  it('handles ao1000 over a long session quickly', () => {
    const rand = seeded(1);
    const values = Array.from({ length: 20000 }, () => (rand() < 0.03 ? DNF : 800 + Math.floor(rand() * 1500)));
    const started = performance.now();
    const series = rolling(values, 1000);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(series[999]).toBe(trimmedAverage(values.slice(0, 1000)));
    expect(series[19999]).toBe(trimmedAverage(values.slice(19000, 20000)));
  });

  it('best of a series prefers times over DNF', () => {
    expect(bestOf([null, DNF, 1200, 1100, DNF])).toEqual({ value: 1100, index: 3 });
    expect(bestOf([null, DNF]).value).toBe(DNF);
    expect(bestOf([null, null])).toEqual({ value: null, index: -1 });
  });
});

const solve = (rawMs, penalty = 'none', createdAt = 0, extra = {}) => ({
  rawMs, penalty, createdAt, sessionId: 's', puzzle: '333', ...extra,
});

describe('session aggregation', () => {
  it('computes counts, bests, and center values', () => {
    const solves = [
      solve(10000),
      solve(12000, '+2'),
      solve(9000),
      solve(15000, 'dnf'),
      solve(11000),
      solve(1000, 'dns'),
    ];
    const s = computeSessionStats(solves);
    expect(s.count).toBe(6);
    expect(s.completedCount).toBe(4);
    expect(s.dnfCount).toBe(1);
    expect(s.dnsCount).toBe(1);
    expect(s.plusTwoCount).toBe(1);
    expect(s.best).toBe(900);
    expect(s.bestIndex).toBe(2);
    expect(s.worst).toBe(1400);
    expect(s.current).toBe(DNF);
    expect(s.mean).toBe(roundAverage(1000 + 1400 + 900 + 1100, 4));
    expect(s.median).toBe(1050);
    expect(s.totalSolvingCs).toBe(4400);
    expect(s.windows[5].current).toBe(DNF);
    expect(s.windows[5].best).toBe(1167);
  });

  it('reports sensibly on an empty session', () => {
    const s = computeSessionStats([]);
    expect(s).toMatchObject({ count: 0, best: null, mean: null, median: null, stdDev: null, current: null });
    expect(s.windows[5].current).toBe(null);
  });

  it('supports extra window sizes', () => {
    const solves = Array.from({ length: 25 }, (_, i) => solve(10000 + i * 10));
    expect(computeSessionStats(solves, [25]).windows[25].current).toBeTruthy();
  });

  it('median of even and odd lists', () => {
    expect(median(Int32Array.from([1, 2, 3]))).toBe(2);
    expect(median(Int32Array.from([1, 2]))).toBe(2);
    expect(median(Int32Array.from([]))).toBe(null);
  });

  it('standard deviation is the sample deviation', () => {
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(standardDeviation([5])).toBe(null);
  });

  it('progressions only list improvements', () => {
    const solves = [solve(10000), solve(11000), solve(9000), solve(9000), solve(8000, 'dnf'), solve(8500)];
    expect(personalBestProgression(solves).map((p) => p.value)).toEqual([1000, 900, 850]);
    const many = [1000, 1000, 1000, 1000, 1000, 900, 900, 900, 900].map((cs) => solve(cs * 10));
    const prog = bestAverageProgression(many, 5);
    expect(prog.map((p) => p.value)).toEqual([1000, 967, 933, 900]);
  });

  it('consistency is null until the window fills', () => {
    const series = rollingConsistency(Array.from({ length: 5 }, () => solve(10000)), 5);
    expect(series.slice(0, 4)).toEqual([null, null, null, null]);
    expect(series[4]).toBe(0);
  });

  it('histogram bins cover every completed solve', () => {
    const { bins, dnf, width } = histogram([1000, 1010, 1020, 1500, DNF]);
    expect(dnf).toBe(1);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(4);
    expect(width).toBeGreaterThan(0);
    expect(bins[0].from).toBeLessThanOrEqual(1000);
    expect(bins[bins.length - 1].to).toBeGreaterThan(1500);
  });

  it('daily counts include empty days', () => {
    const a = new Date(2026, 0, 1, 10).getTime();
    const b = new Date(2026, 0, 3, 23).getTime();
    expect(dailyCounts([solve(1, 'none', a), solve(1, 'none', a + 1), solve(1, 'none', b)]).map((d) => d.count)).toEqual([2, 0, 1]);
  });

  it('filters by date, puzzle, tag and text', () => {
    const solves = [
      solve(1, 'none', 100, { puzzle: '333', tags: ['pb'], scramble: "R U F'" }),
      solve(1, 'none', 200, { puzzle: '222', tags: [], comment: 'lucky' }),
    ];
    expect(filterSolves(solves, { from: 150 })).toHaveLength(1);
    expect(filterSolves(solves, { to: 150 })).toHaveLength(1);
    expect(filterSolves(solves, { puzzle: '222' })).toHaveLength(1);
    expect(filterSolves(solves, { tag: 'pb' })).toHaveLength(1);
    expect(filterSolves(solves, { query: 'LUCK' })).toHaveLength(1);
    expect(filterSolves(solves, { query: "r u f'" })).toHaveLength(1);
  });
});

describe('formatting', () => {
  it('formats centiseconds', () => {
    expect(formatCs(null)).toBe('–');
    expect(formatCs(DNF)).toBe('DNF');
    expect(formatCs(1234)).toBe('12.34');
    expect(formatCs(5)).toBe('0.05');
    expect(formatCs(6005)).toBe('1:00.05');
    expect(formatCs(60000)).toBe('10:00');
    expect(formatCs(360000)).toBe('1:00:00');
  });

  it('formats milliseconds by truncation at any precision', () => {
    expect(formatMs(12349, 2)).toBe('12.34');
    expect(formatMs(12349, 3)).toBe('12.349');
    expect(formatMs(12349, 1)).toBe('12.3');
    expect(formatMs(12349, 0)).toBe('12');
    expect(formatMs(61005, 2)).toBe('1:01.00');
  });

  it('formats totals', () => {
    expect(formatDuration(100 * 3725)).toBe('1h 2m');
    expect(formatDuration(100 * 65)).toBe('1m 5s');
    expect(formatDuration(500)).toBe('5s');
  });
});

describe('performance on a very long session', () => {
  it('recomputes 50,000 solves fast enough to do after each solve', () => {
    const solves = Array.from({ length: 50000 }, (_, i) => solve(8000 + ((i * 7919) % 6000), i % 37 === 0 ? 'dnf' : 'none', i));
    const started = performance.now();
    const stats = computeSessionStats(solves);
    const elapsed = performance.now() - started;
    expect(stats.count).toBe(50000);
    expect(stats.windows[1000].best).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1500);
  });
});
