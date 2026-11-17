import { describe, expect, it } from 'vitest';
import { DNF } from '../../src/statistics/AverageCalculator.js';
import { addSplit, splitStats, stageDurations } from '../../src/statistics/Splits.js';
import { roundAverage5, roundOutlook } from '../../src/statistics/Competition.js';
import { newBests } from '../../src/statistics/PersonalBests.js';

describe('splits', () => {
  it('keeps marks ordered, inside the solve, and at most three', () => {
    let s = addSplit([], 5000, 10000);
    s = addSplit(s, 1500, 10000);
    s = addSplit(s, 1500, 10000);
    s = addSplit(s, 12000, 10000);
    expect(s).toEqual([1500, 5000]);
    s = addSplit(s, 8000, 10000);
    expect(addSplit(s, 9000, 10000)).toEqual([1500, 5000, 8000]);
  });

  it('turns marks into four stage durations', () => {
    expect(stageDurations({ rawMs: 10000, splits: [1500, 5000, 8000] })).toEqual([1500, 3500, 3000, 2000]);
    expect(stageDurations({ rawMs: 10000, splits: [1500, 5000] })).toBeNull();
    expect(stageDurations({ rawMs: 10000 })).toBeNull();
  });

  it('summarizes each stage', () => {
    const stats = splitStats([
      { rawMs: 10000, splits: [1500, 5000, 8000] },
      { rawMs: 12000, splits: [2500, 7000, 9000] },
      { rawMs: 9000 },
    ]);
    expect(stats.map((s) => [s.id, s.count, s.mean, s.best])).toEqual([
      ['cross', 2, 200, 150],
      ['f2l', 2, 400, 350],
      ['oll', 2, 250, 200],
      ['pll', 2, 250, 200],
    ]);
    expect(stats.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1);
  });
});

describe('competition round', () => {
  it('gives best and worst possible averages', () => {
    expect(roundOutlook([1000, 1200, 1100, 1300])).toMatchObject({ bpa: 1100, wpa: 1200 });
    expect(roundOutlook([1000, DNF, 1100, 1300])).toMatchObject({ bpa: 1133, wpa: DNF });
    expect(roundOutlook([DNF, DNF, 1100, 1300]).bpa).toBe(DNF);
  });

  it('works out what the last solve needs, checked against the real average', () => {
    const four = [1000, 1200, 1100, 1300];
    for (const target of [1100, 1150, 1170, 1199]) {
      const { need } = roundOutlook(four, target);
      expect(need.kind).toBe('under');
      expect(roundAverage5([...four, need.cs])).toBeLessThanOrEqual(target);
      expect(roundAverage5([...four, need.cs + 1])).toBeGreaterThan(target);
    }
    expect(roundOutlook(four, 1099).need.kind).toBe('impossible');
    expect(roundOutlook(four, 1200).need.kind).toBe('guaranteed');
    const withDnf = roundOutlook([1000, DNF, 1100, 1300], 1200).need;
    expect(roundAverage5([1000, DNF, 1100, 1300, withDnf.cs])).toBeLessThanOrEqual(1200);
    expect(roundAverage5([1000, DNF, 1100, 1300, withDnf.cs + 1])).toBeGreaterThan(1200);
  });
});

describe('personal bests', () => {
  const solve = (i, ms, penalty = 'none') => ({ id: `s${i}`, rawMs: ms, penalty });
  it('reports a new single and the solves of a new average', () => {
    const before = [1200, 1100, 1300, 1250, 1150].map((ms, i) => solve(i, ms * 10));
    const after = [...before, solve(5, 9000)];
    const bests = newBests(before, after);
    expect(bests.map((b) => b.kind)).toEqual(['single', 'ao5']);
    expect(bests[0]).toMatchObject({ value: 900, previous: 11000 / 10 });
    expect(bests[1].solveIds).toEqual(['s1', 's2', 's3', 's4', 's5']);
  });

  it('does not count the first solve or a slower one', () => {
    expect(newBests([], [solve(0, 10000)])).toEqual([]);
    expect(newBests([solve(0, 10000)], [solve(0, 10000), solve(1, 12000)])).toEqual([]);
    expect(newBests([solve(0, 10000)], [solve(0, 10000), solve(1, 8000, 'dnf')])).toEqual([]);
  });
});

import { parseTimeCs } from '../../src/timer/competition.js';

describe('target times', () => {
  it('reads seconds and minutes', () => {
    expect(parseTimeCs('9.87')).toBe(987);
    expect(parseTimeCs('10')).toBe(1000);
    expect(parseTimeCs('10.5')).toBe(1050);
    expect(parseTimeCs('1:02.35')).toBe(6235);
    expect(parseTimeCs('1:75')).toBeNull();
    expect(parseTimeCs('abc')).toBeNull();
    expect(parseTimeCs('0')).toBeNull();
  });
});
