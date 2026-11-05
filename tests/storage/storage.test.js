import { beforeEach, describe, expect, it } from 'vitest';
import { clearAll, closeDb, kvGet, kvSet } from '../../src/storage/Database.js';
import { buildSession, deleteSession, listSessions, saveSession } from '../../src/storage/SessionRepository.js';
import { deleteSolves, listAllSolves, listSolves, saveSolve, saveSolves } from '../../src/storage/SolveRepository.js';
import { DEFAULT_SETTINGS, LOOK_VERSION, loadSettings, migrateSettings, saveSettings } from '../../src/storage/SettingsRepository.js';
import { emptyProgress, listProgress, saveProgress } from '../../src/storage/AlgorithmProgressRepository.js';
import { exportAll, importDocument, solvesToCsv, validateBackup } from '../../src/storage/Backup.js';
import { buildSolve } from '../../src/timer/SolveRecorder.js';

beforeEach(async () => {
  await clearAll();
});

describe('sessions and solves', () => {
  it('persists across a reconnection', async () => {
    const session = await saveSession(buildSession({ name: 'Main 3×3' }));
    await saveSolve(buildSolve({ rawMs: 10000, sessionId: session.id, scramble: 'R U' }));
    await closeDb();
    expect((await listSessions()).map((s) => s.name)).toEqual(['Main 3×3']);
    const solves = await listSolves(session.id);
    expect(solves).toHaveLength(1);
    expect(solves[0].scramble).toBe('R U');
  });

  it('keeps solves in time order and by session', async () => {
    const a = await saveSession(buildSession({ name: 'A' }));
    const b = await saveSession(buildSession({ name: 'B' }));
    await saveSolves([
      buildSolve({ rawMs: 3, sessionId: a.id, createdAt: 300 }),
      buildSolve({ rawMs: 1, sessionId: a.id, createdAt: 100 }),
      buildSolve({ rawMs: 2, sessionId: b.id, createdAt: 200 }),
    ]);
    expect((await listSolves(a.id)).map((s) => s.rawMs)).toEqual([1, 3]);
    expect((await listSolves(b.id)).map((s) => s.rawMs)).toEqual([2]);
  });

  it('deleting a session removes only its solves', async () => {
    const a = await saveSession(buildSession({ name: 'A' }));
    const b = await saveSession(buildSession({ name: 'B' }));
    await saveSolve(buildSolve({ rawMs: 1, sessionId: a.id }));
    await saveSolve(buildSolve({ rawMs: 2, sessionId: b.id }));
    await deleteSession(a.id);
    expect((await listSessions()).map((s) => s.name)).toEqual(['B']);
    expect((await listAllSolves()).map((s) => s.rawMs)).toEqual([2]);
  });

  it('deletes solves by id', async () => {
    const a = await saveSession(buildSession({ name: 'A' }));
    const one = await saveSolve(buildSolve({ rawMs: 1, sessionId: a.id }));
    await saveSolve(buildSolve({ rawMs: 2, sessionId: a.id }));
    await deleteSolves([one.id]);
    expect((await listSolves(a.id)).map((s) => s.rawMs)).toEqual([2]);
  });
});

describe('settings and key-value data', () => {
  it('merges saved settings over defaults, so new settings get a default', async () => {
    await saveSettings({ holdMs: 500 });
    const loaded = await loadSettings();
    expect(loaded.holdMs).toBe(500);
    expect(loaded.turnMs).toBe(DEFAULT_SETTINGS.turnMs);
  });

  it('defaults to light with one plain background color', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('light');
    expect(DEFAULT_SETTINGS.bloom).toBe(0);
  });

  it('moves old default look settings across, and leaves real choices alone', async () => {
    expect(migrateSettings({ theme: 'system', bloom: 0.7 })).toMatchObject({ theme: 'light', bloom: DEFAULT_SETTINGS.bloom, lookVersion: LOOK_VERSION });
    expect(migrateSettings({ theme: 'dark', bloom: 0.4 })).toMatchObject({ theme: 'dark', bloom: 0.4 });
    expect(migrateSettings({ lookVersion: LOOK_VERSION, theme: 'system', bloom: 0.7 })).toMatchObject({ theme: 'system', bloom: 0.7 });
    await saveSettings({ theme: 'system', bloom: 0.7 });
    expect((await loadSettings()).theme).toBe('light');
  });

  it('returns the fallback for a missing key', async () => {
    expect(await kvGet('nope', 7)).toBe(7);
    await kvSet('nope', 8);
    expect(await kvGet('nope', 7)).toBe(8);
  });
});

describe('algorithm progress', () => {
  it('round trips a record', async () => {
    await saveProgress({ ...emptyProgress('pll-t'), learned: true });
    const all = await listProgress();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ caseId: 'pll-t', learned: true });
  });
});

describe('backup', () => {
  it('survives an export, wipe and import exactly', async () => {
    const session = await saveSession(buildSession({ name: 'Main' }));
    const solve = await saveSolve(buildSolve({ rawMs: 12345, penalty: '+2', sessionId: session.id, scramble: "R U'", comment: 'hi', tags: ['pb'] }));
    await saveProgress({ ...emptyProgress('oll-1'), favorite: true });
    await saveSettings({ ...DEFAULT_SETTINGS, holdMs: 450 });

    const doc = JSON.parse(JSON.stringify(await exportAll()));
    await clearAll();
    expect(await listAllSolves()).toEqual([]);

    const summary = await importDocument(doc);
    expect(summary).toEqual({ sessions: 1, solves: 1 });
    expect((await listAllSolves())[0]).toEqual(solve);
    expect((await listProgress())[0].favorite).toBe(true);
    expect((await loadSettings()).holdMs).toBe(450);
  });

  it('imports twice without duplicating', async () => {
    const session = await saveSession(buildSession({ name: 'Main' }));
    await saveSolve(buildSolve({ rawMs: 1, sessionId: session.id }));
    const doc = await exportAll();
    await importDocument(doc);
    await importDocument(doc);
    expect(await listAllSolves()).toHaveLength(1);
  });

  it('rejects malformed files before writing anything', async () => {
    expect(validateBackup(null)[0]).toMatch(/JSON/);
    expect(validateBackup({ format: 'other' })[0]).toMatch(/not a turnbase/);
    const bad = {
      format: 'turnbase-backup',
      version: 0,
      sessions: [{ id: 'a', name: 'A' }],
      solves: [{ id: 'x', rawMs: -1, penalty: 'none', sessionId: 'a', createdAt: 1 }],
    };
    expect(validateBackup(bad)[0]).toMatch(/no valid time/);
    await expect(importDocument(bad)).rejects.toThrow();
    expect(await listAllSolves()).toEqual([]);
    const orphan = { ...bad, solves: [{ id: 'x', rawMs: 1, penalty: 'none', sessionId: 'zz', createdAt: 1 }] };
    expect(validateBackup(orphan)[0]).toMatch(/not in the file/);
  });

  it('writes CSV with escaping and neutralized formulas', () => {
    const csv = solvesToCsv(
      [{ ...buildSolve({ rawMs: 12340, sessionId: 's', scramble: "R U'" }), comment: 'said "wow", then =SUM(A1)', tags: ['a', 'b'] }],
      new Map([['s', '=Main']]),
    );
    const [header, row] = csv.split('\n');
    expect(header.startsWith('session,puzzle,date,result,raw_ms')).toBe(true);
    expect(row).toContain("'=Main");
    expect(row).toContain('12.34');
    expect(row).toContain('"said ""wow"", then =SUM(A1)"');
  });
});
