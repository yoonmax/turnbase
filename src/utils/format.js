import { isDnf } from '../statistics/AverageCalculator.js';

const pad2 = (n) => String(n).padStart(2, '0');

/** Formats integer centiseconds as a result or average. Null reads as a dash. */
export function formatCs(cs, { placeholder = '–' } = {}) {
  if (cs === null || cs === undefined) return placeholder;
  if (isDnf(cs)) return 'DNF';
  const totalSeconds = Math.floor(cs / 100);
  const hundredths = cs % 100;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 10) {
    // At 10 minutes and over WCA results are whole seconds.
    return minutes >= 60
      ? `${Math.floor(minutes / 60)}:${pad2(minutes % 60)}:${pad2(seconds)}`
      : `${minutes}:${pad2(seconds)}`;
  }
  if (minutes > 0) return `${minutes}:${pad2(seconds)}.${pad2(hundredths)}`;
  return `${seconds}.${pad2(hundredths)}`;
}

/** Formats milliseconds to a chosen number of decimals, always truncating. */
export function formatMs(ms, decimals = 2) {
  const safe = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const seconds = totalSeconds % 60;
  const frac = decimals > 0 ? `.${String(safe % 1000).padStart(3, '0').slice(0, decimals)}` : '';
  if (hours > 0) return `${hours}:${pad2(minutes % 60)}:${pad2(seconds)}${frac}`;
  if (minutes > 0) return `${minutes}:${pad2(seconds)}${frac}`;
  return `${seconds}${frac}`;
}

/** Long durations for totals, such as "2h 14m". */
export function formatDuration(cs) {
  const totalSeconds = Math.floor((cs ?? 0) / 100);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDay(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function newId(prefix = 'id') {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}
