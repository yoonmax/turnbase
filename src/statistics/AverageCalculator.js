// Result arithmetic. Everything is integer centiseconds, with DNF as a sentinel,
// so there is no floating-point accumulation anywhere in these calculations.
//
// Official WCA semantics (Regulations 9f, April 1, 2026 edition):
//  - Results under 10 minutes are truncated to hundredths of a second. Results of
//    10 minutes or more are truncated to whole seconds.
//  - Averages and means are rounded to the nearest hundredth, or to the nearest
//    second once they are over 10 minutes.
//  - Mean of 3: arithmetic mean, and any DNF or DNS makes it DNF.
//  - Average of 5: drop best and worst, mean of the middle three. One DNF or DNS
//    can be the dropped worst, and more than one makes the average DNF.
//
// Unofficial convention for larger rolling averages (ao12, ao50, ao100, ao1000):
// drop the fastest and slowest ceil(5%) of the window, and average the rest. A
// window is DNF once its DNFs exceed that trim. ao12 therefore drops 1 from each
// end, ao50 drops 3, ao100 drops 5, and ao1000 drops 50. These are not competition
// formats.

export const DNF = 2147483647;
const TEN_MINUTES_CS = 60000;

export const isDnf = (value) => value === DNF;

/** A solve's result from integer milliseconds plus its penalty. */
export function resultCs(rawMs, penalty = 'none') {
  if (penalty === 'dnf' || penalty === 'dns') return DNF;
  const totalMs = rawMs + (penalty === '+2' ? 2000 : 0);
  const cs = Math.floor(totalMs / 10);
  return cs >= TEN_MINUTES_CS ? Math.floor(cs / 100) * 100 : cs;
}

/** Exact sum/count rounding, half up, without going through a float division. */
export function roundAverage(sum, count) {
  const cs = Math.floor((2 * sum + count) / (2 * count));
  if (cs >= TEN_MINUTES_CS) {
    return Math.floor((2 * sum + 100 * count) / (200 * count)) * 100;
  }
  return cs;
}

export function trimFor(windowSize) {
  return Math.ceil(windowSize * 0.05);
}

export function meanOf3(values) {
  if (values.length !== 3) return null;
  if (values.some(isDnf)) return DNF;
  return roundAverage(values[0] + values[1] + values[2], 3);
}

/** Trimmed average over all values, with `trim` dropped from each end. */
export function trimmedAverage(values, trim = trimFor(values.length)) {
  if (values.length <= 2 * trim) return null;
  const dnfs = values.filter(isDnf).length;
  if (dnfs > trim) return DNF;
  const sorted = Int32Array.from(values).sort();
  let sum = 0;
  for (let i = trim; i < sorted.length - trim; i += 1) sum += sorted[i];
  return roundAverage(sum, sorted.length - 2 * trim);
}

export function averageOf5(values) {
  if (values.length !== 5) return null;
  return trimmedAverage(values, 1);
}

/**
 * Rolling calculation over a series. The result at i covers the window ending at
 * i, and is null until the window is full. Maintains a sorted window, so a long
 * session is roughly O(N·n) with small constants rather than a full sort per step.
 */
export function rolling(values, windowSize, { trim = trimFor(windowSize) } = {}) {
  const out = new Array(values.length).fill(null);
  if (windowSize < 1 || values.length < windowSize) return out;
  const sorted = new Int32Array(windowSize + 1); // One spare: insert runs before remove.
  let size = 0;
  let total = 0; // Sum of the non-DNF values in the window.
  let dnfs = 0;

  const lowerBound = (x) => {
    let lo = 0;
    let hi = size;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const insert = (x) => {
    const at = lowerBound(x);
    sorted.copyWithin(at + 1, at, size);
    sorted[at] = x;
    size += 1;
    if (x === DNF) dnfs += 1;
    else total += x;
  };
  const remove = (x) => {
    const at = lowerBound(x);
    sorted.copyWithin(at, at + 1, size);
    size -= 1;
    if (x === DNF) dnfs -= 1;
    else total -= x;
  };

  for (let i = 0; i < values.length; i += 1) {
    insert(values[i]);
    if (i >= windowSize) remove(values[i - windowSize]);
    if (size === windowSize) {
      if (dnfs > trim) {
        out[i] = DNF;
      } else {
        // Everything except the trimmed ends. DNFs all sit in the slow trim.
        let dropped = 0;
        for (let k = 0; k < trim; k += 1) dropped += sorted[k];
        for (let k = size - trim; k < size; k += 1) {
          if (sorted[k] !== DNF) dropped += sorted[k];
        }
        out[i] = roundAverage(total - dropped, windowSize - 2 * trim);
      }
    }
  }
  return out;
}

export const rollingAverage = (values, n) => rolling(values, n);
export const rollingMean3 = (values) => rolling(values, 3, { trim: 0 });

/** The smallest non-null entry and where it is. A DNF only wins if all are DNF. */
export function bestOf(series) {
  let best = null;
  let index = -1;
  for (let i = 0; i < series.length; i += 1) {
    const v = series[i];
    if (v !== null && (best === null || v < best)) {
      best = v;
      index = i;
    }
  }
  return { value: best, index };
}
