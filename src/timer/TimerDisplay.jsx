import { useEffect, useRef } from 'react';
import { bindTimerDom, useTimerState } from './TimerEngine.js';
import { STATE } from './TimerStateMachine.js';
import { useApp } from '../app/store.js';
import { formatMs } from '../utils/format.js';

function restingText(solve, decimals) {
  if (!solve) return formatMs(0, Math.min(decimals, 2));
  const base = formatMs(solve.rawMs + (solve.penalty === '+2' ? 2000 : 0), decimals);
  if (solve.penalty === 'dnf') return 'DNF';
  if (solve.penalty === 'dns') return 'DNS';
  return solve.penalty === '+2' ? `${base}+` : base;
}

/**
 * The digits. The element's text is owned by the timer engine during a solve, and
 * by this component at rest, so React never re-renders on a running frame.
 */
export function TimerDisplay({ onTimeClick }) {
  const digits = useRef(null);
  const state = useTimerState((s) => s.state);
  const latest = useApp((s) => s.solves[s.solves.length - 1] ?? null);
  const decimals = useApp((s) => s.settings.decimals);
  const inspecting = useApp((s) => s.settings.inspection);

  useEffect(() => {
    bindTimerDom({ digits: digits.current });
    return () => bindTimerDom({ digits: null });
  }, []);

  useEffect(() => {
    const el = digits.current;
    if (!el) return;
    if (state === STATE.IDLE || state === STATE.STOPPED) {
      const text = restingText(latest, decimals);
      el.textContent = text;
      el.dataset.long = text.length > 5 ? 'true' : 'false';
      el.dataset.small = 'false';
      delete el.dataset.phase;
    }
    if (state === STATE.HOLDING || state === STATE.READY) {
      // Reading 0 while arming makes the coming start obvious.
      if (!inspecting) el.textContent = formatMs(0, Math.min(decimals, 2) || 1);
    }
  }, [state, latest, decimals, inspecting]);

  const dnfRaw = latest && (latest.penalty === 'dnf' || latest.penalty === 'dns') && (state === STATE.IDLE || state === STATE.STOPPED);

  return (
    <div className="relative flex flex-col items-center" data-testid="timer-display">
      <div
        ref={digits}
        className="timer-digits tabular"
        data-testid="timer-digits"
        role="timer"
        aria-live="off"
        aria-label="Timer"
        onClick={onTimeClick}
      />
      {dnfRaw ? (
        <div className="notation text-sm text-graphite tabular mt-2">({formatMs(latest.rawMs, 2)})</div>
      ) : null}
    </div>
  );
}
