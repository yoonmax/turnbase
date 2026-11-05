// Learned status, favourites, practice results and custom algorithms, stored locally.

import { create } from 'zustand';
import { emptyProgress, listCustomAlgs, listProgress, saveCustomAlg, saveProgress, deleteCustomAlg } from '../storage/AlgorithmProgressRepository.js';
import { review } from './SpacedRepetition.js';
import { newId } from '../utils/format.js';

const KEEP_SAMPLES = 40;
let loading = null;

export const useProgress = create((set, get) => ({
  loaded: false,
  progress: new Map(),
  customAlgs: [],

  load() {
    if (!loading) {
      loading = Promise.all([listProgress(), listCustomAlgs()]).then(([records, customAlgs]) => {
        set({ progress: new Map(records.map((r) => [r.caseId, r])), customAlgs, loaded: true });
      });
    }
    return loading;
  },

  /** For after a backup is imported or everything is reset. */
  async reload() {
    loading = null;
    set({ loaded: false });
    await get().load();
  },

  async patch(caseId, fn) {
    // Never write before the saved record has been read, or it would be overwritten.
    await get().load();
    const current = get().progress.get(caseId) ?? emptyProgress(caseId);
    const next = fn(current);
    set((state) => {
      const map = new Map(state.progress);
      map.set(caseId, next);
      return { progress: map };
    });
    await saveProgress(next);
    return next;
  },

  toggleLearned(caseId) {
    return get().patch(caseId, (r) => ({ ...r, learned: !r.learned }));
  },

  toggleFavorite(caseId) {
    return get().patch(caseId, (r) => ({ ...r, favorite: !r.favorite }));
  },

  markUsed(caseId) {
    return get().patch(caseId, (r) => ({ ...r, timesUsed: (r.timesUsed ?? 0) + 1 }));
  },

  /** Records a practice result and reschedules the case. */
  recordPractice(caseId, { correct, quality, recognitionMs = null, executionMs = null, now = Date.now() }) {
    return get().patch(caseId, (r) => {
      const scheduled = review(r, quality ?? (correct ? 4 : 1), now);
      return {
        ...scheduled,
        attempts: r.attempts + 1,
        correct: r.correct + (correct ? 1 : 0),
        lastPracticed: now,
        recognitionMs: recognitionMs === null ? r.recognitionMs : [...r.recognitionMs, Math.round(recognitionMs)].slice(-KEEP_SAMPLES),
        executionMs: executionMs === null ? r.executionMs : [...r.executionMs, Math.round(executionMs)].slice(-KEEP_SAMPLES),
      };
    });
  },

  async addCustomAlg({ name, notation, category = 'Custom' }) {
    await get().load();
    const record = { id: newId('alg'), name, notation, category, createdAt: Date.now() };
    set((state) => ({ customAlgs: [...state.customAlgs, record] }));
    await saveCustomAlg(record);
    return record;
  },

  async removeCustomAlg(id) {
    set((state) => ({ customAlgs: state.customAlgs.filter((a) => a.id !== id) }));
    await deleteCustomAlg(id);
  },
}));
