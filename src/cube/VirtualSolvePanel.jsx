import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { applyMoves, solvedState } from './CubeEngine.js';
import { parseMoves } from './CubeNotationParser.js';
import { PHASE, VirtualSolveSession, turnsPerSecond } from './VirtualSolveSession.js';
import { nextScramble } from '../scrambles/ScrambleService.js';
import { useApp } from '../app/store.js';
import { useCubeKeyboard } from '../hooks/useCubeKeyboard.js';
import { formatMs } from '../utils/format.js';

const SolveReplay = lazy(() => import('../trainer/SolveReplay.jsx'));

/** A timed solve on the 3D cube. Results go to a virtual session, never a physical one. */
export function VirtualSolvePanel({ controller, onSessionActive }) {
  const [session] = useState(() => new VirtualSolveSession());
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const [moveCount, setMoveCount] = useState(0);
  const clock = useRef(null);
  const ensureVirtualSession = useApp((s) => s.ensureVirtualSession);
  const recordSolveTo = useApp((s) => s.recordSolveTo);

  const finish = useCallback(async () => {
    const target = await ensureVirtualSession();
    const solve = await recordSolveTo(target.id, {
      rawMs: session.elapsedMs,
      puzzle: '333',
      scramble: session.scramble,
      scrambleMeta: session.meta,
      source: 'virtual',
      moves: session.log,
    });
    setSaved({ solve, sessionName: target.name });
  }, [ensureVirtualSession, recordSolveTo, session]);

  const turn = useCallback(
    (move, timeStamp) => {
      controller.enqueue(move);
      const accepted = session.turn(move, controller.state, timeStamp ?? performance.now());
      if (!accepted) return;
      setMoveCount(session.moveCount);
      if (session.phase !== phase) setPhase(session.phase);
      if (session.phase === PHASE.DONE) finish();
    },
    [controller, session, phase, finish],
  );

  const inPlay = phase === PHASE.READY || phase === PHASE.SOLVING;
  useCubeKeyboard({ enabled: inPlay, onMove: turn });

  useEffect(() => {
    onSessionActive?.(inPlay ? turn : null);
  }, [inPlay, turn, onSessionActive]);

  // The running time is written straight to the DOM, without any React renders.
  useEffect(() => {
    if (phase !== PHASE.SOLVING) return undefined;
    let frame = 0;
    const paint = () => {
      if (clock.current) clock.current.textContent = formatMs(session.elapsed(performance.now()), 2);
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [phase, session]);

  const start = async () => {
    setLoading(true);
    setError(null);
    setSaved(null);
    try {
      const scramble = await nextScramble('333');
      const state = applyMoves(solvedState(), parseMoves(scramble.text));
      controller.setState(state);
      session.begin(scramble.text, scramble.meta);
      setMoveCount(0);
      setPhase(PHASE.READY);
    } catch (e) {
      setError(e?.message ?? 'The scramble generator did not respond.');
    } finally {
      setLoading(false);
    }
  };

  const cancel = () => {
    session.cancel();
    setPhase(PHASE.IDLE);
    controller.setState(solvedState());
  };

  return (
    <div className="flex flex-col gap-3" data-testid="virtual-panel">
      <p className="m-0 text-[0.8125rem] text-graphite">
        Solve the cube on screen. The clock starts on your first turn and stops when the cube is solved. Results go to their own session, and are not comparable with times on a physical cube.
      </p>

      <div className="flex items-baseline gap-5">
        <div ref={clock} className="display-num text-4xl" data-testid="virtual-clock">
          {phase === PHASE.DONE ? formatMs(session.elapsedMs, 2) : '0.00'}
        </div>
        <div className="text-[0.8125rem] text-graphite" data-testid="virtual-count">
          {moveCount} moves
        </div>
      </div>

      {inPlay ? (
        <p className="notation text-[0.75rem] leading-relaxed m-0" data-testid="virtual-scramble">
          {session.scramble}
        </p>
      ) : null}

      <div className="flex gap-2">
        {inPlay ? (
          <button type="button" className="btn" data-testid="virtual-cancel" onClick={cancel}>
            Give up
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={loading} data-testid="virtual-start" onClick={start}>
            {loading ? 'Scrambling' : phase === PHASE.DONE ? 'Solve another' : 'Scramble and get ready'}
          </button>
        )}
      </div>
      {error ? <p className="m-0 text-[0.8125rem] text-danger">{error}</p> : null}

      {phase === PHASE.DONE && saved ? (
        <div className="pt-3 border-t border-rule flex flex-col gap-3" data-testid="virtual-result">
          <p className="m-0 text-[0.8125rem] text-graphite">
            Solved in {session.moveCount} moves at {turnsPerSecond(session.log, session.elapsedMs).toFixed(2)} turns per second. Saved to {saved.sessionName}.
          </p>
          <Suspense fallback={null}>
            <SolveReplay solve={saved.solve} />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
