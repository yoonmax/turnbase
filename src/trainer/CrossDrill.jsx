import { useEffect, useMemo, useRef, useState } from 'react';
import { applyMoves, solvedState } from '../cube/CubeEngine.js';
import { parseAlgorithm, parseMoves } from '../cube/CubeNotationParser.js';
import { checkPlan } from '../cube/CrossSolver.js';
import { solveCrossAsync, warmCrossSolver } from '../cube/crossClient.js';
import { nextScramble } from '../scrambles/ScrambleService.js';
import { CubeNet } from '../scrambles/CubeNet.jsx';
import { useApp } from '../app/store.js';
import { CrossColorPicker, CrossSolutions, crossColorName } from './CrossSolutions.jsx';

const INSPECTION_S = 15;

function Countdown({ running, onEnd }) {
  const [left, setLeft] = useState(INSPECTION_S);
  useEffect(() => {
    if (!running) return undefined;
    const started = performance.now();
    const id = setInterval(() => {
      const next = Math.max(0, INSPECTION_S - Math.floor((performance.now() - started) / 1000));
      setLeft(next);
      if (next === 0) {
        clearInterval(id);
        onEnd();
      }
    }, 200);
    return () => clearInterval(id);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className={`text-[2rem] font-extrabold tabular ${left <= 3 ? 'text-danger' : left <= 7 ? 'text-warn' : ''}`} style={{ letterSpacing: '-0.03em' }} data-testid="cross-countdown" aria-live="off">
      {left}
    </span>
  );
}

/**
 * Cross planning: read the scramble during a 15 second inspection, write down the cross
 * you would do, then compare it with the shortest cross and X-cross.
 */
export function CrossDrill({ onExit }) {
  const settings = useApp((s) => s.settings);
  const bottom = settings.crossColor ?? 'U';
  const [scramble, setScramble] = useState(null);
  const [error, setError] = useState(false);
  const [plan, setPlan] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [verdict, setVerdict] = useState(null);
  const [tally, setTally] = useState({ done: 0, optimal: 0 });
  const [round, setRound] = useState(0);
  const input = useRef(null);

  useEffect(() => warmCrossSolver(), []);

  useEffect(() => {
    let live = true;
    setScramble(null);
    setError(false);
    nextScramble('333').then(
      ({ text }) => live && setScramble(text),
      () => live && setError(true),
    );
    return () => {
      live = false;
    };
  }, [round]);

  const state = useMemo(() => (scramble ? applyMoves(solvedState(3), parseMoves(scramble)) : null), [scramble]);
  const parsed = useMemo(() => parseAlgorithm(plan), [plan]);

  const reveal = async (withPlan) => {
    if (revealed) return;
    setRevealed(true);
    if (!withPlan || !plan.trim()) return;
    const checked = checkPlan(scramble, bottom, plan);
    if (!checked.ok) return;
    const best = await solveCrossAsync(scramble, bottom).catch(() => null);
    const optimal = best ? best.cross.length : null;
    const isOptimal = checked.cross && optimal !== null && checked.length <= optimal;
    setVerdict({ ...checked, optimal, isOptimal });
    setTally((t) => ({ done: t.done + 1, optimal: t.optimal + (isOptimal ? 1 : 0) }));
  };

  const next = () => {
    setPlan('');
    setRevealed(false);
    setVerdict(null);
    setRound((r) => r + 1);
  };

  return (
    <div className="flex flex-col gap-5" data-testid="cross-drill">
      <div className="flex items-center justify-between gap-3 text-[0.8125rem]">
        <button type="button" className="btn btn-quiet -ml-2" data-testid="practice-exit" onClick={onExit}>
          End session
        </button>
        <span className="text-graphite" data-testid="cross-tally">
          {tally.optimal} of {tally.done} optimal
        </span>
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <p className="m-0 notation text-[1.0625rem] leading-relaxed max-w-[44ch] min-h-[3.2em]" data-testid="cross-scramble">
          {error ? <span className="text-danger">The scramble generator did not respond.</span> : scramble ?? <span className="text-faint">Generating a scramble</span>}
        </p>
        {state ? <CubeNet state={state} width={200} title="Scrambled cube" /> : null}
        {scramble && !revealed ? <Countdown key={round} running onEnd={() => input.current?.focus()} /> : null}
      </div>

      {scramble ? (
        <form
          className="grid gap-1 max-w-md w-full mx-auto"
          onSubmit={(event) => {
            event.preventDefault();
            reveal(true);
          }}
        >
          <label htmlFor="cross-plan" className="text-[0.8125rem] text-graphite">
            Your {crossColorName(settings, bottom).toLowerCase()} cross, after the rotation
          </label>
          <div className="flex gap-2">
            <input
              id="cross-plan"
              ref={input}
              className="field notation flex-1"
              placeholder="R' D F2 L"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={plan}
              disabled={revealed}
              aria-invalid={!parsed.ok}
              data-testid="cross-plan"
              onChange={(e) => setPlan(e.target.value)}
            />
            {revealed ? (
              <button key="next" type="button" className="btn btn-primary" data-testid="cross-next" onClick={next}>
                Next scramble
              </button>
            ) : (
              <button key="check" type="submit" className="btn btn-primary" disabled={!parsed.ok} data-testid="cross-reveal">
                {plan.trim() ? 'Check' : 'Show'}
              </button>
            )}
          </div>
          {!parsed.ok ? <p className="m-0 text-[0.8125rem] text-danger">{parsed.error.message}</p> : null}
        </form>
      ) : null}

      {verdict ? (
        <p className={`m-0 text-center font-medium ${verdict.isOptimal ? 'text-ready' : verdict.cross ? '' : 'text-danger'}`} data-testid="cross-verdict" role="status">
          {!verdict.cross
            ? 'That does not solve the cross.'
            : verdict.isOptimal
              ? `Optimal: ${verdict.length} ${verdict.length === 1 ? 'move' : 'moves'}${verdict.pairs.length ? `, and it builds an X-cross (${verdict.pairs.join(', ')})` : ''}.`
              : `It works in ${verdict.length} moves. The shortest is ${verdict.optimal}.`}
        </p>
      ) : null}

      {revealed && scramble ? (
        <div className="glass rounded-[20px] p-4 max-w-[40rem] w-full mx-auto">
          <CrossSolutions scramble={scramble} testId="drill-solutions" />
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-1">
        <span className="text-[0.8125rem] text-graphite">Cross color</span>
        <CrossColorPicker />
      </div>
    </div>
  );
}
