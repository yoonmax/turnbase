import { useState } from 'react';
import { useApp } from '../app/store.js';
import { useTimerState } from './TimerEngine.js';
import { STATE } from './TimerStateMachine.js';
import { CrossColorPicker, CrossSolutions } from '../trainer/CrossSolutions.jsx';
import { Modal } from '../components/Modal.jsx';

/**
 * After a 3×3 solve, the shortest cross and X-cross for the scramble just solved, so the
 * plan made during inspection can be compared with the best one.
 */
export function LastCross() {
  const state = useTimerState((s) => s.state);
  const enabled = useApp((s) => s.settings.showCrossSolutions);
  const latest = useApp((s) => s.solves[s.solves.length - 1] ?? null);
  const [open, setOpen] = useState(false);
  const shown = enabled && latest?.scramble && (latest.puzzle ?? '333') === '333' && (state === STATE.STOPPED || state === STATE.IDLE);
  if (!shown) return null;
  return (
    <div className="w-full max-w-[34rem] flex flex-col items-stretch gap-1 px-1" data-testid="last-cross">
      <CrossSolutions scramble={latest.scramble} compact testId="last-cross-solutions" />
      <button type="button" className="btn btn-quiet self-center text-[0.8125rem]" data-testid="last-cross-more" onClick={() => setOpen(true)}>
        Every slot and cross color
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Shortest cross" testId="last-cross-panel">
        <p className="m-0 mb-2 notation text-[0.8125rem] text-graphite">{latest.scramble}</p>
        <div className="mb-3">
          <CrossColorPicker />
        </div>
        <CrossSolutions scramble={latest.scramble} />
      </Modal>
    </div>
  );
}
