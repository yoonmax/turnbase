import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useApp } from '../app/store.js';
import { formatCs } from '../utils/format.js';
import { DNF, rollingAverage } from '../statistics/AverageCalculator.js';
import { solveValue } from '../statistics/StatisticsEngine.js';
import { EmptyState } from '../components/EmptyState.jsx';
import { prefersReducedMotion } from '../app/appearance.js';
import { SolveDetail } from './SolveDetail.jsx';

const PAGE = 150;

function resultText(solve) {
  const value = solveValue(solve);
  if (solve.penalty === 'dns') return 'DNS';
  if (value === DNF) return 'DNF';
  return `${formatCs(value)}${solve.penalty === '+2' ? '+' : ''}`;
}

export function SolveHistory() {
  const solves = useApp((s) => s.solves);
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState(null);
  const listRef = useRef(null);
  const previousCount = useRef(solves.length);
  const previousLatest = useRef(solves[solves.length - 1]?.id);

  const ao5s = useMemo(() => rollingAverage(solves.map(solveValue), 5), [solves]);

  // A new solve slides in at the top of the list. Only a genuinely new one: session
  // switches and edits update the list without motion.
  useEffect(() => {
    const latest = solves[solves.length - 1]?.id;
    const added = solves.length === previousCount.current + 1 && latest !== previousLatest.current;
    previousCount.current = solves.length;
    previousLatest.current = latest;
    const first = listRef.current?.firstElementChild;
    if (added && first && !prefersReducedMotion()) {
      gsap.fromTo(first, { opacity: 0, height: 0 }, { opacity: 1, height: 28, duration: 0.2, ease: 'power2.out', clearProps: 'height,opacity' });
    }
  }, [solves]);

  const visible = useMemo(() => {
    const rows = [];
    for (let i = solves.length - 1; i >= Math.max(0, solves.length - limit); i -= 1) {
      rows.push({ solve: solves[i], number: i + 1, ao5: ao5s[i] });
    }
    return rows;
  }, [solves, limit, ao5s]);

  const openSolve = solves.find((s) => s.id === openId) ?? null;

  if (!solves.length) {
    return (
      <EmptyState title="No solves in this session">
        Hold Space until the digits turn green, then let go to start. Press any key to stop.
      </EmptyState>
    );
  }

  return (
    <>
      <ol ref={listRef} className="list-none m-0 px-1 overflow-y-auto flex-1 scrollbar-quiet" data-testid="solve-list">
        {visible.map(({ solve, number, ao5 }) => (
          <li key={solve.id} className="h-7 overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenId(solve.id)}
              data-testid="solve-row"
              className="w-full h-7 grid grid-cols-[1.75rem_1fr_3.5rem] gap-x-2 items-center px-2 rounded-lg bg-transparent border-none text-right row-hover notation text-[0.75rem]"
            >
              <span className="text-faint">{number}</span>
              <span className={solve.penalty === 'dnf' || solve.penalty === 'dns' ? 'text-danger' : ''}>{resultText(solve)}</span>
              <span className="text-graphite">{formatCs(ao5)}</span>
            </button>
          </li>
        ))}
        {solves.length > limit ? (
          <li className="py-2 flex justify-center">
            <button type="button" className="btn btn-quiet" onClick={() => setLimit((n) => n + PAGE)}>
              Show earlier solves
            </button>
          </li>
        ) : null}
      </ol>
      <SolveDetail solve={openSolve} number={openSolve ? solves.indexOf(openSolve) + 1 : 0} onClose={() => setOpenId(null)} />
    </>
  );
}
