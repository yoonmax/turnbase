// Application state. IndexedDB is the source of truth: every change is written
// through before the UI moves on, so a refresh can never lose a recorded solve.

import { create } from 'zustand';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../storage/SettingsRepository.js';
import { kvGet, kvSet, clearAll } from '../storage/Database.js';
import * as SessionRepo from '../storage/SessionRepository.js';
import * as SolveRepo from '../storage/SolveRepository.js';
import { importDocument } from '../storage/Backup.js';
import { buildSolve, withPenalty } from '../timer/SolveRecorder.js';
import { nextScramble, prefetchScrambles } from '../scrambles/ScrambleService.js';
import { newId } from '../utils/format.js';
import { applyAppearance } from './appearance.js';

let scrambleRequest = 0;
let toastCounter = 0;

export const useApp = create((set, get) => ({
  ready: false,
  settings: DEFAULT_SETTINGS,
  sessions: [],
  currentSessionId: null,
  solves: [],
  scramble: null,
  scramblePending: false,
  scrambleError: null,
  scrambleHistory: [],
  toasts: [],

  async init() {
    const settings = await loadSettings();
    applyAppearance(settings);
    let sessions = await SessionRepo.listSessions();
    if (!sessions.length) {
      sessions = [await SessionRepo.saveSession(SessionRepo.buildSession({ name: 'Main 3×3', puzzle: '333' }))];
    }
    const savedId = await kvGet('currentSessionId');
    const current =
      sessions.find((s) => s.id === savedId && !s.archived) ?? sessions.find((s) => !s.archived) ?? sessions[0];
    const solves = await SolveRepo.listSolves(current.id);
    set({ settings, sessions, currentSessionId: current.id, solves, ready: true });
    // Recorded straight away, so that importing an older session later cannot change
    // which session opens next time.
    await kvSet('currentSessionId', current.id);
    prefetchScrambles(current.puzzle);
    get().newScramble();
  },

  currentSession() {
    const { sessions, currentSessionId } = get();
    return sessions.find((s) => s.id === currentSessionId) ?? null;
  },

  // ─── Settings ──────────────────────────────────────
  async updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    applyAppearance(settings);
    await saveSettings(settings);
  },

  async resetSettings() {
    set({ settings: DEFAULT_SETTINGS });
    applyAppearance(DEFAULT_SETTINGS);
    await saveSettings(DEFAULT_SETTINGS);
  },

  // ─── Scrambles ─────────────────────────────────────
  async newScramble() {
    const session = get().currentSession();
    if (!session) return;
    const request = (scrambleRequest += 1);
    const previous = get().scramble;
    set({ scramblePending: true, scrambleError: null });
    try {
      const scramble = await nextScramble(session.puzzle);
      if (request !== scrambleRequest) return; // Superseded by a newer request.
      set((state) => ({
        scramble: { ...scramble, id: newId('scramble') },
        scramblePending: false,
        scrambleHistory: previous ? [...state.scrambleHistory, previous].slice(-50) : state.scrambleHistory,
      }));
    } catch (error) {
      if (request !== scrambleRequest) return;
      set({ scramblePending: false, scrambleError: error?.message ?? 'Scramble generation failed.' });
    }
  },

  /** A scramble from elsewhere, such as TNoodle. It is labeled as entered by the user. */
  setOwnScramble(text) {
    const session = get().currentSession();
    scrambleRequest += 1;
    const previous = get().scramble;
    set((state) => ({
      scramble: {
        id: newId('scramble'),
        text,
        meta: { puzzle: session.puzzle, method: 'user-entered', library: null, version: null, official: false },
      },
      scramblePending: false,
      scrambleError: null,
      scrambleHistory: previous ? [...state.scrambleHistory, previous].slice(-50) : state.scrambleHistory,
    }));
  },

  previousScramble() {
    const { scrambleHistory } = get();
    const session = get().currentSession();
    const usable = scrambleHistory.filter((s) => s.meta.puzzle === session?.puzzle);
    if (!usable.length) return;
    const last = usable[usable.length - 1];
    scrambleRequest += 1;
    set({
      scramble: { ...last },
      scramblePending: false,
      scrambleHistory: scrambleHistory.filter((s) => s !== last),
    });
  },

  // ─── Solves ────────────────────────────────────────
  async recordSolve(result, overrides = {}) {
    const { scramble, currentSessionId } = get();
    const session = get().currentSession();
    const solve = buildSolve({
      rawMs: result.rawMs,
      penalty: result.penalty,
      inspectionMs: result.inspectionMs,
      inspectionPenalty: result.inspectionPenalty,
      sessionId: currentSessionId,
      puzzle: session?.puzzle ?? '333',
      scramble: scramble?.text ?? '',
      scrambleMeta: scramble?.meta ?? null,
      source: session?.kind === 'virtual' ? 'virtual' : 'physical',
      ...overrides,
    });
    set((state) => ({ solves: [...state.solves, solve] }));
    await SolveRepo.saveSolve(solve);
    return solve;
  },

  /** Adds a solve to a named session, which need not be the current one. */
  async recordSolveTo(sessionId, fields) {
    const solve = buildSolve({ sessionId, ...fields });
    await SolveRepo.saveSolve(solve);
    if (sessionId === get().currentSessionId) {
      set((state) => ({ solves: [...state.solves, solve] }));
    }
    return solve;
  },

  async updateSolve(id, patch) {
    const solve = get().solves.find((s) => s.id === id);
    if (!solve) return null;
    const next = { ...solve, ...patch };
    set((state) => ({ solves: state.solves.map((s) => (s.id === id ? next : s)) }));
    await SolveRepo.saveSolve(next);
    return next;
  },

  async setPenalty(id, penalty) {
    const solve = get().solves.find((s) => s.id === id);
    if (!solve) return;
    const next = withPenalty(solve, penalty);
    set((state) => ({ solves: state.solves.map((s) => (s.id === id ? next : s)) }));
    await SolveRepo.saveSolve(next);
  },

  /** Deletes now and offers an undo that restores the exact records. */
  async deleteSolves(ids) {
    const removed = get().solves.filter((s) => ids.includes(s.id));
    if (!removed.length) return;
    set((state) => ({ solves: state.solves.filter((s) => !ids.includes(s.id)) }));
    await SolveRepo.deleteSolves(ids);
    get().pushToast({
      message: removed.length === 1 ? 'Solve deleted' : `${removed.length} solves deleted`,
      action: {
        label: 'Undo',
        run: async () => {
          await SolveRepo.saveSolves(removed);
          if (removed[0].sessionId === get().currentSessionId) {
            set((state) => ({
              solves: [...state.solves, ...removed].sort((a, b) => a.createdAt - b.createdAt),
            }));
          }
        },
      },
    });
  },

  // ─── Sessions ──────────────────────────────────────
  async switchSession(id) {
    if (id === get().currentSessionId) return;
    const session = get().sessions.find((s) => s.id === id);
    if (!session) return;
    const solves = await SolveRepo.listSolves(id);
    const samePuzzle = get().currentSession()?.puzzle === session.puzzle;
    set({ currentSessionId: id, solves });
    await kvSet('currentSessionId', id);
    if (!samePuzzle) {
      set({ scramble: null });
      prefetchScrambles(session.puzzle);
      get().newScramble();
    }
  },

  async createSession({ name, puzzle = '333', kind = 'physical' }, { activate = true } = {}) {
    const session = await SessionRepo.saveSession(SessionRepo.buildSession({ name, puzzle, kind }));
    set((state) => ({ sessions: [...state.sessions, session] }));
    if (activate) await get().switchSession(session.id);
    return session;
  },

  async renameSession(id, name) {
    const session = get().sessions.find((s) => s.id === id);
    if (!session) return;
    const next = { ...session, name };
    set((state) => ({ sessions: state.sessions.map((s) => (s.id === id ? next : s)) }));
    await SessionRepo.saveSession(next);
  },

  async setSessionArchived(id, archived) {
    const session = get().sessions.find((s) => s.id === id);
    if (!session) return;
    const next = { ...session, archived };
    set((state) => ({ sessions: state.sessions.map((s) => (s.id === id ? next : s)) }));
    await SessionRepo.saveSession(next);
    if (archived && id === get().currentSessionId) {
      const other = get().sessions.find((s) => !s.archived && s.id !== id);
      if (other) await get().switchSession(other.id);
      else await get().createSession({ name: 'Main 3×3' });
    }
  },

  async duplicateSession(id) {
    const session = get().sessions.find((s) => s.id === id);
    if (!session) return null;
    const copy = SessionRepo.buildSession({ name: `${session.name} copy`, puzzle: session.puzzle, kind: session.kind });
    await SessionRepo.saveSession(copy);
    const solves = await SolveRepo.listSolves(id);
    await SolveRepo.saveSolves(solves.map((s) => ({ ...s, id: newId('solve'), sessionId: copy.id })));
    set((state) => ({ sessions: [...state.sessions, copy] }));
    return copy;
  },

  async deleteSession(id) {
    await SessionRepo.deleteSession(id);
    set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) }));
    if (id === get().currentSessionId) {
      const other = get().sessions.find((s) => !s.archived);
      if (other) await get().switchSession(other.id);
      else await get().createSession({ name: 'Main 3×3' });
    }
  },

  /** The dedicated session virtual-cube solves go to, created on first use. */
  async ensureVirtualSession() {
    const existing = get().sessions.find((s) => s.kind === 'virtual' && !s.archived);
    if (existing) return existing;
    return get().createSession({ name: 'Virtual 3×3', puzzle: '333', kind: 'virtual' }, { activate: false });
  },

  // ─── Data ──────────────────────────────────────────
  async importBackup(doc) {
    const summary = await importDocument(doc);
    const settings = await loadSettings();
    applyAppearance(settings);
    const sessions = await SessionRepo.listSessions();
    const current = sessions.find((s) => s.id === get().currentSessionId) ?? sessions[0];
    const solves = await SolveRepo.listSolves(current.id);
    set({ settings, sessions, currentSessionId: current.id, solves });
    return summary;
  },

  async wipeEverything() {
    await clearAll();
    set({ sessions: [], solves: [], currentSessionId: null, settings: DEFAULT_SETTINGS, scramble: null, ready: false });
    await get().init();
  },

  // ─── Toasts ────────────────────────────────────────
  pushToast(toast) {
    const id = (toastCounter += 1);
    set((state) => ({ toasts: [...state.toasts, { id, ...toast }] }));
    setTimeout(() => get().dismissToast(id), toast.durationMs ?? 7000);
    return id;
  },

  dismissToast(id) {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
