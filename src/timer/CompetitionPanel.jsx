import { useEffect, useMemo, useState } from 'react';
import { Trophy, X } from 'lucide-react';
import { useApp } from '../app/store.js';
import { ROUND_SIZE, roundAverage5, roundOutlook } from '../statistics/Competition.js';
import { solveValue } from '../statistics/StatisticsEngine.js';
import { formatCs } from '../utils/format.js';
import { endRound, parseTimeCs, setRoundTarget, startRound, useRound } from './competition.js';

/** Starts or ends a competition round. */
export function RoundButton() {
  const active = useRound((s) => s.active);
  return (
    <button
      type="button"
      className="icon-btn shrink-0"
      aria-pressed={active}
      aria-label={active ? 'End the competition round' : 'Start a competition round'}
      title={active ? 'End the competition round' : 'Competition round: five solves with inspection'}
      data-testid="round-toggle"
      onClick={() => (active ? endRound() : startRound())}
    >
      <Trophy size={17} strokeWidth={1.8} />
    </button>
  );
}

function Slot({ value, dropped, index }) {
  return (
    <span className={`min-w-[3.25rem] text-center tabular font-extrabold ${value === undefined ? 'text-faint' : ''}`} data-testid={`round-slot-${index}`}>
      {value === undefined ? '–' : dropped ? `(${formatCs(value)})` : formatCs(value)}
    </span>
  );
}

/**
 * Five solves with inspection, averaged by WCA rules. Before the last solve it shows the
 * best and worst average still possible, and what the last solve needs for your target.
 */
export function CompetitionPanel() {
  const { active, target, solveIds, round } = useRound();
  const solves = useApp((s) => s.solves);
  const [targetText, setTargetText] = useState(target ? formatCs(target) : '');

  useEffect(() => {
    setTargetText(target ? formatCs(target) : '');
  }, [target]);

  const results = useMemo(() => {
    const byId = new Map(solves.map((s) => [s.id, s]));
    return solveIds.map((id) => byId.get(id)).filter(Boolean).map(solveValue);
  }, [solves, solveIds]);

  if (!active) return null;

  const done = results.length >= ROUND_SIZE;
  const average = done ? roundAverage5(results.slice(0, ROUND_SIZE)) : null;
  const outlook = results.length === ROUND_SIZE - 1 ? roundOutlook(results, target) : null;

  // Best and worst are shown in brackets once the round is complete, as on a score sheet.
  const dropped = new Set();
  if (done) {
    const order = results.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    dropped.add(order[0][1]);
    dropped.add(order[order.length - 1][1]);
  }

  const commitTarget = () => {
    const cs = targetText.trim() ? parseTimeCs(targetText) : null;
    if (targetText.trim() && cs === null) {
      setTargetText(target ? formatCs(target) : '');
      return;
    }
    setRoundTarget(cs);
  };

  let message = `Solve ${Math.min(results.length + 1, ROUND_SIZE)} of ${ROUND_SIZE}. Inspection is on for the round.`;
  if (outlook) {
    const parts = [`Best possible ${formatCs(outlook.bpa)}`, `worst possible ${formatCs(outlook.wpa)}`];
    if (outlook.need?.kind === 'under') parts.push(`need ${formatCs(outlook.need.cs)} or faster for a ${formatCs(target)} average`);
    if (outlook.need?.kind === 'guaranteed') parts.push(`a ${formatCs(target)} average is already safe`);
    if (outlook.need?.kind === 'impossible') parts.push(`a ${formatCs(target)} average is out of reach`);
    message = `${parts.join(' · ')}.`;
  }
  if (done) {
    const hit = target && average <= target;
    message = `Average ${formatCs(average)}${target ? (hit ? `, inside your target of ${formatCs(target)}` : `, target was ${formatCs(target)}`) : ''}.`;
  }

  return (
    <div className="focus-fade glass rounded-[20px] px-4 py-2.5 flex flex-col gap-1.5 w-full max-w-[34rem]" data-testid="round-panel">
      <div className="flex items-center gap-2">
        <span className="text-[0.75rem] text-graphite shrink-0">Round {round}</span>
        <div className="flex-1 flex items-center justify-around text-[0.9375rem]" style={{ letterSpacing: '-0.02em' }}>
          {Array.from({ length: ROUND_SIZE }, (_, i) => (
            <Slot key={i} index={i} value={results[i]} dropped={dropped.has(i)} />
          ))}
        </div>
        <button type="button" className="icon-btn shrink-0" aria-label="End the round" title="End the round" data-testid="round-end" onClick={endRound}>
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>
      <p className={`m-0 text-[0.8125rem] text-center ${done ? 'font-medium' : 'text-graphite'}`} role="status" data-testid="round-status">
        {message}
      </p>
      <div className="flex items-center justify-center gap-2 text-[0.8125rem]">
        <label htmlFor="round-target" className="text-graphite">
          Target average
        </label>
        <input
          id="round-target"
          className="field w-20 h-7 text-center notation"
          inputMode="decimal"
          placeholder="10.00"
          value={targetText}
          data-testid="round-target"
          onChange={(e) => setTargetText(e.target.value)}
          onBlur={commitTarget}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitTarget();
              e.currentTarget.blur();
            }
          }}
        />
        {done ? (
          <button type="button" className="btn btn-primary h-7" data-testid="round-next" onClick={startRound}>
            Next round
          </button>
        ) : null}
      </div>
    </div>
  );
}
