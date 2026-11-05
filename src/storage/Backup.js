// Export and import. A backup is one JSON document. Importing validates first and
// only then writes, in a single transaction, so a bad file cannot leave partial data.

import { resultCs } from '../statistics/AverageCalculator.js';
import { RECORD_VERSION, STORES, getDb, kvGet, kvSet } from './Database.js';
import { formatCs } from '../utils/format.js';

export const BACKUP_FORMAT = 'turnbase-backup';

export async function exportAll() {
  const db = await getDb();
  const [sessions, solves, progress, customAlgs] = await Promise.all([
    db.getAll(STORES.sessions),
    db.getAll(STORES.solves),
    db.getAll(STORES.progress),
    db.getAll(STORES.customAlgs),
  ]);
  return {
    format: BACKUP_FORMAT,
    version: RECORD_VERSION,
    exportedAt: new Date().toISOString(),
    sessions,
    solves,
    progress,
    customAlgs,
    settings: await kvGet('settings', {}),
    keymaps: await kvGet('keymaps', null),
  };
}

export function exportSessionDocument(session, solves) {
  return {
    format: BACKUP_FORMAT,
    version: RECORD_VERSION,
    exportedAt: new Date().toISOString(),
    sessions: [session],
    solves,
  };
}

const PENALTIES = new Set(['none', '+2', 'dnf', 'dns']);

/** Returns a list of problems. An empty list means the document can be imported. */
export function validateBackup(doc) {
  const problems = [];
  if (!doc || typeof doc !== 'object') return ['The file is not a JSON object.'];
  if (doc.format !== BACKUP_FORMAT) return ['This is not a turnbase backup file.'];
  if (doc.version > RECORD_VERSION) {
    problems.push('This backup comes from a newer version of turnbase.');
  }
  if (!Array.isArray(doc.sessions)) problems.push('The backup has no session list.');
  if (!Array.isArray(doc.solves)) problems.push('The backup has no solve list.');
  if (problems.length) return problems;
  const ids = new Set();
  doc.sessions.forEach((s, i) => {
    if (typeof s?.id !== 'string' || typeof s?.name !== 'string') problems.push(`Session ${i + 1} is malformed.`);
    else ids.add(s.id);
  });
  doc.solves.forEach((s, i) => {
    if (typeof s?.id !== 'string' || !Number.isInteger(s?.rawMs) || s.rawMs < 0) {
      problems.push(`Solve ${i + 1} has no valid time.`);
    } else if (!PENALTIES.has(s.penalty)) {
      problems.push(`Solve ${i + 1} has an unknown penalty.`);
    } else if (!ids.has(s.sessionId)) {
      problems.push(`Solve ${i + 1} belongs to a session that is not in the file.`);
    } else if (typeof s.createdAt !== 'number') {
      problems.push(`Solve ${i + 1} has no timestamp.`);
    }
  });
  return problems.slice(0, 5);
}

/** Merges a validated document. Records with the same id are replaced. */
export async function importDocument(doc) {
  const problems = validateBackup(doc);
  if (problems.length) throw new Error(problems.join(' '));
  const db = await getDb();
  const tx = db.transaction(Object.values(STORES), 'readwrite');
  const writes = [];
  for (const s of doc.sessions) writes.push(tx.objectStore(STORES.sessions).put(s));
  for (const s of doc.solves) {
    writes.push(tx.objectStore(STORES.solves).put({ ...s, displayedCs: resultCs(s.rawMs, s.penalty) }));
  }
  for (const p of doc.progress ?? []) writes.push(tx.objectStore(STORES.progress).put(p));
  for (const a of doc.customAlgs ?? []) writes.push(tx.objectStore(STORES.customAlgs).put(a));
  await Promise.all(writes);
  await tx.done;
  if (doc.settings) await kvSet('settings', doc.settings);
  if (doc.keymaps) await kvSet('keymaps', doc.keymaps);
  return { sessions: doc.sessions.length, solves: doc.solves.length };
}

const csvCell = (value) => {
  const text = String(value ?? '');
  // A leading =, +, - or @ is a formula in a spreadsheet, so neutralise it.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function solvesToCsv(solves, sessionNames = new Map()) {
  const header = [
    'session', 'puzzle', 'date', 'result', 'raw_ms', 'penalty', 'inspection_ms', 'source', 'scramble', 'comment', 'tags',
  ];
  const rows = solves.map((s) => [
    sessionNames.get(s.sessionId) ?? s.sessionId,
    s.puzzle,
    new Date(s.createdAt).toISOString(),
    formatCs(resultCs(s.rawMs, s.penalty)),
    s.rawMs,
    s.penalty,
    s.inspectionMs ?? '',
    s.source,
    s.scramble,
    s.comment,
    (s.tags ?? []).join(' '),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}
