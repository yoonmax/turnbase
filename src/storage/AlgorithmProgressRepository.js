import { STORES, getDb } from './Database.js';

export function emptyProgress(caseId) {
  return {
    caseId,
    learned: false,
    favorite: false,
    preferredAlg: null,
    attempts: 0,
    correct: 0,
    recognitionMs: [],
    executionMs: [],
    lastPracticed: null,
    // SM-2 fields, see trainer/SpacedRepetition.js.
    ease: 2.5,
    intervalDays: 0,
    repetitions: 0,
    dueAt: null,
    timesUsed: 0,
  };
}

export async function listProgress() {
  const db = await getDb();
  return db.getAll(STORES.progress);
}

export async function saveProgress(record) {
  const db = await getDb();
  await db.put(STORES.progress, record);
  return record;
}

export async function listCustomAlgs() {
  const db = await getDb();
  const all = await db.getAll(STORES.customAlgs);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveCustomAlg(record) {
  const db = await getDb();
  await db.put(STORES.customAlgs, record);
  return record;
}

export async function deleteCustomAlg(id) {
  const db = await getDb();
  await db.delete(STORES.customAlgs, id);
}
