// Camera clips of solves. Each is a video blob plus where the solve starts and ends in
// it. Clips stay on this device: they are never part of a backup export.
import { STORES, getDb } from './Database.js';

export const CLIP_LIMIT = 25; // Clips not marked to keep; older ones are removed.

export async function saveClip(clip) {
  const db = await getDb();
  await db.put(STORES.clips, clip);
  return clip;
}

export async function getClip(solveId) {
  const db = await getDb();
  return (await db.get(STORES.clips, solveId)) ?? null;
}

export async function updateClip(solveId, patch) {
  const db = await getDb();
  const clip = await db.get(STORES.clips, solveId);
  if (!clip) return null;
  const next = { ...clip, ...patch };
  await db.put(STORES.clips, next);
  return next;
}

export async function deleteClip(solveId) {
  const db = await getDb();
  await db.delete(STORES.clips, solveId);
}

/** Ids and sizes only, without reading any video data. */
export async function listClipInfo() {
  const db = await getDb();
  const out = [];
  let cursor = await db.transaction(STORES.clips).store.openCursor();
  while (cursor) {
    const { solveId, createdAt, kept, size } = cursor.value;
    out.push({ solveId, createdAt, kept: Boolean(kept), size: size ?? 0 });
    cursor = await cursor.continue();
  }
  return out;
}

/**
 * Removes clips whose solve was deleted (after a grace period, so undo still finds the
 * clip) and the oldest clips beyond the limit, unless marked to keep.
 */
export async function pruneClips(solveIds, { limit = CLIP_LIMIT, now = Date.now(), graceMs = 10 * 60 * 1000 } = {}) {
  const info = await listClipInfo();
  const known = new Set(solveIds);
  const remove = info.filter((c) => !known.has(c.solveId) && now - c.createdAt > graceMs).map((c) => c.solveId);
  const removing = new Set(remove);
  const unkept = info.filter((c) => !c.kept && !removing.has(c.solveId)).sort((a, b) => b.createdAt - a.createdAt);
  remove.push(...unkept.slice(limit).map((c) => c.solveId));
  if (!remove.length) return [];
  const db = await getDb();
  const tx = db.transaction(STORES.clips, 'readwrite');
  await Promise.all(remove.map((id) => tx.store.delete(id)));
  await tx.done;
  return remove;
}
