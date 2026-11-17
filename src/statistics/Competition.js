// A competition round: five solves, averaged by WCA rules. Before the last solve, the
// best and worst averages still possible, and what the last solve needs for a target.

import { DNF, averageOf5, isDnf, roundAverage } from './AverageCalculator.js';

export const ROUND_SIZE = 5;

/**
 * Outlook from the first four results (centiseconds, DNF allowed) and an optional target.
 * need: { kind: 'impossible' } | { kind: 'guaranteed' } | { kind: 'under', cs }, where
 * a last result of `cs` or faster makes the average `target` or better.
 */
export function roundOutlook(firstFour, target = null) {
  if (firstFour.length !== ROUND_SIZE - 1) return null;
  const [a, b, c, d] = Int32Array.from(firstFour).sort();
  const dnfs = firstFour.filter(isDnf).length;
  const bpa = dnfs >= 2 ? DNF : roundAverage(a + b + c, 3);
  const wpa = dnfs >= 1 ? DNF : roundAverage(b + c + d, 3);
  let need = null;
  if (target !== null && target > 0) {
    if (isDnf(bpa) || bpa > target) need = { kind: 'impossible' };
    else if (!isDnf(wpa) && wpa <= target) need = { kind: 'guaranteed' };
    else {
      // The last result x lands in the middle three for any x from a to d, so the
      // average is round((b + c + x) / 3); rounding half up gives this bound.
      need = { kind: 'under', cs: 3 * target + 1 - b - c };
    }
  }
  return { bpa, wpa, need };
}

export function roundAverage5(results) {
  return results.length === ROUND_SIZE ? averageOf5(results) : null;
}
