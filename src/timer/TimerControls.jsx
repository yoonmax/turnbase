import { Trash2 } from 'lucide-react';
import { useApp } from '../app/store.js';
import { useTimerState } from './TimerEngine.js';
import { STATE } from './TimerStateMachine.js';

/** Penalty review for the latest solve. Stays quiet until there is one to review. */
export function TimerControls() {
  const state = useTimerState((s) => s.state);
  const latest = useApp((s) => s.solves[s.solves.length - 1] ?? null);
  const setPenalty = useApp((s) => s.setPenalty);
  const deleteSolves = useApp((s) => s.deleteSolves);

  const visible = latest && state === STATE.STOPPED;
  const options = [
    ['none', 'No penalty'],
    ['+2', '+2'],
    ['dnf', 'DNF'],
  ];

  return (
    <div className="flex items-center gap-1 h-8" style={{ visibility: visible ? 'visible' : 'hidden' }} data-testid="penalty-review">
      <div className="segmented">
        {options.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={latest?.penalty === value}
            data-testid={`penalty-${value}`}
            onClick={() => setPenalty(latest.id, value)}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="icon-btn"
        aria-label="Delete this solve"
        title="Delete this solve"
        data-testid="delete-latest"
        onClick={() => deleteSolves([latest.id])}
      >
        <Trash2 size={15} strokeWidth={1.6} />
      </button>
    </div>
  );
}
