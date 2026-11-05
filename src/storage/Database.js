// IndexedDB access. Structural changes bump DB_VERSION and go in the upgrade
// switch; changes to the shape of records go in RECORD_MIGRATIONS, which run once
// at open and are tracked in the kv store.

import { openDB } from 'idb';

const DB_NAME = 'turnbase';
const DB_VERSION = 1;

export const STORES = {
  sessions: 'sessions',
  solves: 'solves',
  kv: 'kv',
  progress: 'progress',
  customAlgs: 'customAlgs',
};

// Each entry upgrades records from version i to i + 1. Add to the end only.
export const RECORD_MIGRATIONS = [];
export const RECORD_VERSION = RECORD_MIGRATIONS.length;

let dbPromise = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore(STORES.sessions, { keyPath: 'id' });
          const solves = db.createObjectStore(STORES.solves, { keyPath: 'id' });
          solves.createIndex('sessionId', 'sessionId');
          solves.createIndex('session_time', ['sessionId', 'createdAt']);
          db.createObjectStore(STORES.kv, { keyPath: 'key' });
          db.createObjectStore(STORES.progress, { keyPath: 'caseId' });
          db.createObjectStore(STORES.customAlgs, { keyPath: 'id' });
        }
      },
      blocking() {
        dbPromise?.then((db) => db.close());
        dbPromise = null;
      },
    }).then(async (db) => {
      await runRecordMigrations(db);
      return db;
    });
  }
  return dbPromise;
}

async function runRecordMigrations(db) {
  const entry = await db.get(STORES.kv, 'recordVersion');
  let version = entry?.value ?? RECORD_VERSION;
  while (version < RECORD_MIGRATIONS.length) {
    await RECORD_MIGRATIONS[version](db);
    version += 1;
  }
  await db.put(STORES.kv, { key: 'recordVersion', value: version });
}

export async function kvGet(key, fallback = null) {
  const db = await getDb();
  const entry = await db.get(STORES.kv, key);
  return entry === undefined ? fallback : entry.value;
}

export async function kvSet(key, value) {
  const db = await getDb();
  await db.put(STORES.kv, { key, value });
}

/** Wipes every store. Only called behind a confirmation. */
export async function clearAll() {
  const db = await getDb();
  const names = Object.values(STORES);
  const tx = db.transaction(names, 'readwrite');
  await Promise.all(names.map((name) => tx.objectStore(name).clear()));
  await tx.done;
}

/** For tests: drops the connection so the next call reopens. */
export async function closeDb() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
}
