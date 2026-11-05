// Library search. Exact and substring matches outrank loose ones, and notation is
// compared without regard to spacing or prime style, so "ruru" and "R U R' U'" meet.

const squash = (text) => text.toLowerCase().replace(/[\s’‘′ʼ`´']/g, '');

function fuzzyScore(query, target) {
  if (!query) return 1;
  const at = target.indexOf(query);
  if (at === 0) return 100 - target.length * 0.01;
  if (at > 0) return 70 - at * 0.1;
  // Loose: all characters in order, with a penalty for how spread out they are.
  let last = -1;
  let spread = 0;
  for (const ch of query) {
    const next = target.indexOf(ch, last + 1);
    if (next < 0) return 0;
    if (last >= 0) spread += next - last - 1;
    last = next;
  }
  const score = 30 - spread;
  return score > 0 && query.length >= 3 ? score : 0;
}

export function caseSearchText(entry) {
  return {
    name: squash(`${entry.setName} ${entry.number ?? ''} ${entry.name ?? ''} ${entry.title ?? ''}`),
    title: squash(entry.title ?? ''),
    alias: squash(entry.name ?? ''),
    number: entry.number !== null && entry.number !== undefined ? String(entry.number) : '',
    category: squash(entry.category ?? ''),
    method: squash(entry.method ?? ''),
    tags: squash((entry.tags ?? []).join(' ')),
    notation: entry.algs.map((a) => squash(a.notation)),
  };
}

// Notation with case kept, because r and R are different moves.
const squashNotation = (text) => text.replace(/[\s’‘′ʼ`´]/g, (c) => (/\s/.test(c) ? '' : "'"));

export function scoreCase(entry, rawQuery) {
  const query = squash(rawQuery);
  if (!query) return 1;
  const exact = squashNotation(rawQuery);
  if (entry.algs.some((a) => squashNotation(a.notation) === exact)) return 300;
  const text = caseSearchText(entry);
  if (text.number && text.number === query) return 200;
  if (text.title === query || text.alias === query) return 180;
  const scores = [
    fuzzyScore(query, text.name) * 1.1,
    fuzzyScore(query, text.category),
    fuzzyScore(query, text.method) * 0.8,
    fuzzyScore(query, text.tags) * 0.7,
    ...text.notation.map((n) => {
      // Notation only counts as a substring. In-order letters match nearly anything.
      const at = n.indexOf(query);
      if (at < 0) return 0;
      return at === 0 ? 90 : 60;
    }),
  ];
  return Math.max(...scores);
}

export function searchCases(entries, query) {
  if (!query.trim()) return entries;
  return entries
    .map((entry) => ({ entry, score: scoreCase(entry, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.entry);
}

export const SORTERS = {
  catalog: () => 0,
  shortest: (a, b) => a.moveCount - b.moveCount,
  longest: (a, b) => b.moveCount - a.moveCount,
};

/** Applies library filters. `progress` is a map of caseId to progress records. */
export function filterCases(entries, { family = null, category = null, learned = null, favorites = false, method = null, maxMoves = null } = {}, progress = new Map()) {
  return entries.filter((entry) => {
    if (family && entry.family !== family) return false;
    if (category && entry.category !== category) return false;
    if (method && entry.method !== method) return false;
    if (maxMoves && entry.moveCount > maxMoves) return false;
    const record = progress.get(entry.id);
    if (learned === true && !record?.learned) return false;
    if (learned === false && record?.learned) return false;
    if (favorites && !record?.favorite) return false;
    return true;
  });
}
