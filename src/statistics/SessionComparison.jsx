import { useEffect, useMemo, useState } from 'react';
import { listSolves } from '../storage/SolveRepository.js';
import { useApp } from '../app/store.js';
import { computeSessionStats, solveValue } from './StatisticsEngine.js';
import { rollingAverage } from './AverageCalculator.js';
import { LineChart, Legend, SERIES_COLOR } from './StatisticsCharts.jsx';
import { formatCs } from '../utils/format.js';
import { getPuzzle } from '../scrambles/PuzzleRegistry.js';

const MAX_COMPARED = 4;

/** Up to four sessions side by side: a table, and ao12 over solve number. */
export function SessionComparison() {
  const sessions = useApp((s) => s.sessions);
  const currentId = useApp((s) => s.currentSessionId);
  const solvesVersion = useApp((s) => s.solves);
  const [chosen, setChosen] = useState(() => [currentId]);
  const [data, setData] = useState(new Map());

  useEffect(() => {
    let cancelled = false;
    Promise.all(chosen.map(async (id) => [id, await listSolves(id)])).then((rows) => {
      if (!cancelled) setData(new Map(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [chosen, solvesVersion]);

  const rows = useMemo(
    () =>
      chosen
        .map((id) => {
          const session = sessions.find((s) => s.id === id);
          if (!session) return null;
          const solves = data.get(id) ?? [];
          return { session, solves, stats: computeSessionStats(solves) };
        })
        .filter(Boolean),
    [chosen, sessions, data],
  );

  const series = useMemo(
    () =>
      rows.map((row, i) => ({
        label: row.session.name,
        color: SERIES_COLOR(chosen.indexOf(row.session.id) === -1 ? i : chosen.indexOf(row.session.id)),
        values: rollingAverage(row.solves.map(solveValue), 12),
      })),
    [rows, chosen],
  );

  const toggle = (id) => {
    setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= MAX_COMPARED ? list : [...list, id]));
  };

  return (
    <div className="flex flex-col gap-3" data-testid="session-comparison">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sessions to compare">
        {sessions
          .filter((s) => !s.archived)
          .map((session) => (
            <button key={session.id} type="button" className="btn" aria-pressed={chosen.includes(session.id)} data-testid="compare-session" onClick={() => toggle(session.id)}>
              {session.name}
            </button>
          ))}
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-[0.8125rem] border-collapse" data-testid="compare-table">
            <thead>
              <tr className="text-graphite text-right">
                <th className="font-normal py-1 pr-3 text-left">Session</th>
                <th className="font-normal py-1 pr-3">Solves</th>
                <th className="font-normal py-1 pr-3">Mean</th>
                <th className="font-normal py-1 pr-3">Best</th>
                <th className="font-normal py-1 pr-3">Best ao5</th>
                <th className="font-normal py-1 pr-3">Best ao12</th>
                <th className="font-normal py-1">Std dev</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ session, stats }) => (
                <tr key={session.id} className="border-t border-rule text-right notation text-[0.75rem]">
                  <td className="py-1.5 pr-3 text-left font-[family-name:var(--font-ui)] text-[0.8125rem]">
                    {session.name} <span className="text-faint">{getPuzzle(session.puzzle).name}</span>
                  </td>
                  <td className="py-1.5 pr-3">{stats.count}</td>
                  <td className="py-1.5 pr-3">{formatCs(stats.mean)}</td>
                  <td className="py-1.5 pr-3">{formatCs(stats.best)}</td>
                  <td className="py-1.5 pr-3">{formatCs(stats.windows[5].best)}</td>
                  <td className="py-1.5 pr-3">{formatCs(stats.windows[12].best)}</td>
                  <td className="py-1.5">{formatCs(stats.stdDev)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {series.some((s) => s.values.some((v) => v !== null)) ? (
        <>
          <Legend series={series} />
          <LineChart series={series} height={200} testId="compare-chart" title="Rolling average of 12 by solve number, per session" />
        </>
      ) : (
        <p className="m-0 text-[0.8125rem] text-graphite">Rolling ao12 appears once a chosen session has 12 solves.</p>
      )}
    </div>
  );
}
