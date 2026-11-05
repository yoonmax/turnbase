import { newId } from '../utils/format.js';
import { STORES, getDb } from './Database.js';

export function buildSession({ name, puzzle = '333', kind = 'physical' }) {
  return {
    id: newId('session'),
    name,
    puzzle,
    kind, // 'physical' or 'virtual'. Virtual sessions hold virtual-cube solves only.
    archived: false,
    createdAt: Date.now(),
  };
}

export async function listSessions() {
  const db = await getDb();
  const all = await db.getAll(STORES.sessions);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveSession(session) {
  const db = await getDb();
  await db.put(STORES.sessions, session);
  return session;
}

/** Deletes a session and its solves in one transaction, so neither can orphan. */
export async function deleteSession(sessionId) {
  const db = await getDb();
  const tx = db.transaction([STORES.sessions, STORES.solves], 'readwrite');
  const index = tx.objectStore(STORES.solves).index('sessionId');
  let cursor = await index.openCursor(IDBKeyRange.only(sessionId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.objectStore(STORES.sessions).delete(sessionId);
  await tx.done;
}
