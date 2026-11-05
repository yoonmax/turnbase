import { STORES, getDb } from './Database.js';

export async function listSolves(sessionId) {
  const db = await getDb();
  return db.getAllFromIndex(
    STORES.solves,
    'session_time',
    IDBKeyRange.bound([sessionId, -Infinity], [sessionId, Infinity]),
  );
}

export async function listAllSolves() {
  const db = await getDb();
  const all = await db.getAll(STORES.solves);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveSolve(solve) {
  const db = await getDb();
  await db.put(STORES.solves, solve);
  return solve;
}

export async function saveSolves(solves) {
  const db = await getDb();
  const tx = db.transaction(STORES.solves, 'readwrite');
  await Promise.all(solves.map((s) => tx.store.put(s)));
  await tx.done;
}

export async function deleteSolves(ids) {
  const db = await getDb();
  const tx = db.transaction(STORES.solves, 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}
