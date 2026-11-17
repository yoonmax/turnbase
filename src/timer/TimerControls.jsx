import { useState } from 'react';
import { Trash2, Video } from 'lucide-react';
import { useCamera } from '../camera/CameraRecorder.js';
import { ClipPlayer } from '../camera/ClipPlayer.jsx';
import { Modal } from '../components/Modal.jsx';
import { useApp } from '../app/store.js';
import { useTimerState } from './TimerEngine.js';
import { STATE } from './TimerStateMachine.js';

/** Penalty review for the latest solve. Stays quiet until there is one to review. */
export function TimerControls() {
  const state = useTimerState((s) => s.state);
  const latest = useApp((s) => s.solves[s.solves.length - 1] ?? null);
  const setPenalty = useApp((s) => s.setPenalty);
  const deleteSolves = useApp((s) => s.deleteSolves);
  const hasClip = useCamera((s) => Boolean(latest && s.clipIds.has(latest.id)));
  const [watching, setWatching] = useState(false);

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
      {hasClip ? (
        <button type="button" className="btn" data-testid="watch-latest" title="Watch this solve" onClick={() => setWatching(true)}>
          <Video size={14} strokeWidth={1.7} />
          Watch
        </button>
      ) : null}
      <Modal open={watching} onClose={() => setWatching(false)} title="Your solve" width="44rem" testId="watch-panel">
        {latest ? <ClipPlayer solveId={latest.id} onDeleted={() => setWatching(false)} /> : null}
      </Modal>
    </div>
  );
}
