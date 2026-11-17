// A competition round on the timer page: the next five solves, with inspection on.
import { create } from 'zustand';
import { ROUND_SIZE } from '../statistics/Competition.js';

const KEY = 'turnbase-round';

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && Array.isArray(saved.solveIds)) return { active: Boolean(saved.active), target: saved.target ?? null, solveIds: saved.solveIds, round: saved.round ?? 1 };
  } catch {
    // A fresh round is fine.
  }
  return { active: false, target: null, solveIds: [], round: 1 };
}

export const useRound = create(() => (typeof window === 'undefined' ? { active: false, target: null, solveIds: [], round: 1 } : load()));

useRound.subscribe((state) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ active: state.active, target: state.target, solveIds: state.solveIds, round: state.round }));
  } catch {
    // Remembering the round across reloads is a convenience.
  }
});

export function startRound() {
  useRound.setState((s) => ({ active: true, solveIds: [], round: s.active ? s.round + 1 : 1 }));
}

export function endRound() {
  useRound.setState({ active: false, solveIds: [] });
}

export function setRoundTarget(cs) {
  useRound.setState({ target: cs });
}

export function recordRoundSolve(id) {
  const { active, solveIds } = useRound.getState();
  if (!active || solveIds.length >= ROUND_SIZE) return;
  useRound.setState({ solveIds: [...solveIds, id] });
}

/** "9.87", "1:02.35" or "62.35" as centiseconds, or null. */
export function parseTimeCs(text) {
  const m = String(text ?? '').trim().match(/^(?:(\d+):)?(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const minutes = Number(m[1] ?? 0);
  const seconds = Number(m[2]);
  if (m[1] !== undefined && seconds >= 60) return null;
  const cs = Number((m[3] ?? '0').padEnd(2, '0'));
  const total = (minutes * 60 + seconds) * 100 + cs;
  return total > 0 ? total : null;
}
