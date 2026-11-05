import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../app/store.js';
import { BarChart, Legend, LineChart, SERIES_COLOR, dayLabel } from '../statistics/StatisticsCharts.jsx';
import { SessionComparison } from '../statistics/SessionComparison.jsx';
import {
  bestAverageProgression,
  computeSessionStats,
  dailyCounts,
  filterSolves,
  histogram,
  personalBestProgression,
  rollingConsistency,
  solveValue,
} from '../statistics/StatisticsEngine.js';
import { isDnf, rollingAverage, rollingMean3, trimFor } from '../statistics/AverageCalculator.js';
import { formatCs, formatDate, formatDuration } from '../utils/format.js';
import { EmptyState } from '../components/EmptyState.jsx';
import { SolveDetail, resultLabel } from '../sessions/SolveDetail.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import { downloadText, slug } from '../utils/download.js';
import { solvesToCsv } from '../storage/Backup.js';
import { getPuzzle } from '../scrambles/PuzzleRegistry.js';
import { listAllSolves } from '../storage/SolveRepository.js';

const RANGES = [
  ['all', 'All time'],
  ['1', 'Today'],
  ['7', '7 days'],
  ['30', '30 days'],
  ['90', '90 days'],
];
const LAST_N = [
  ['0', 'All solves'],
  ['50', 'Last 50'],
  ['100', 'Last 100'],
  ['500', 'Last 500'],
  ['1000', 'Last 1000'],
];

const windowLabel = (n) => `ao${n}`;

function Row({ label, current, best, testId, hint }) {
  return (
    <tr className="border-t border-rule" data-testid={testId} title={hint}>
      <th scope="row" className="py-1 pr-4 font-normal text-left text-graphite">
        {label}
      </th>
      <td className="py-1 pr-4 text-right notation text-[0.8125rem]" data-role="current">
        {current}
      </td>
      <td className="py-1 text-right notation text-[0.8125rem]" data-role="best">
        {best}
      </td>
    </tr>
  );
}

function Totals({ stats }) {
  const items = [
    ['Solves', stats.count, 'count'],
    ['Current single', formatCs(stats.current), 'current'],
    ['Best single', formatCs(stats.best), 'best'],
    ['Worst single', formatCs(stats.worst), 'worst'],
    ['Mean', formatCs(stats.mean), 'mean'],
    ['Median', formatCs(stats.median), 'median'],
    ['Std deviation', formatCs(stats.stdDev), 'stddev'],
    ['DNF', stats.dnfCount, 'dnf'],
    ['DNS', stats.dnsCount, 'dns'],
    ['+2', stats.plusTwoCount, 'plus2'],
    ['Time solving', formatDuration(stats.totalSolvingCs), 'total'],
  ];
  return (
    <dl className="m-0 grid grid-cols-2 content-start gap-x-6 text-[0.8125rem]">
      {items.map(([label, value, id]) => (
        <div key={id} className="flex items-baseline justify-between gap-3 border-t border-rule py-1">
          <dt className="text-graphite">{label}</dt>
          <dd className="m-0 notation text-[0.8125rem]" data-testid={`total-${id}`}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, note, children, testId }) {
  return (
    <section className="flex flex-col gap-2 pt-5 border-t border-rule" data-testid={testId}>
      <div>
        <h2 className="m-0 text-[0.9375rem] font-medium">{title}</h2>
        {note ? <p className="m-0 mt-0.5 text-[0.8125rem] text-graphite max-w-[70ch]">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SolveTable({ solves, allSolves, query, setQuery, onOpen }) {
  const deleteSolves = useApp((s) => s.deleteSolves);
  const [selected, setSelected] = useState(() => new Set());
  const [limit, setLimit] = useState(50);
  const [confirming, setConfirming] = useState(false);
  const rows = useMemo(() => solves.slice().reverse().slice(0, limit), [solves, limit]);
  const toggle = (id) =>
    setSelected((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const numberOf = useMemo(() => new Map(allSolves.map((s, i) => [s.id, i + 1])), [allSolves]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="field w-64"
          placeholder="Search scrambles, comments, tags"
          aria-label="Search solves"
          value={query}
          data-testid="solve-search"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="btn" disabled={!selected.size} data-testid="bulk-delete" onClick={() => setConfirming(true)}>
          Delete selected {selected.size ? `(${selected.size})` : ''}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-[0.8125rem] border-collapse" data-testid="solve-table">
          <thead>
            <tr className="text-graphite text-left">
              <th className="w-7" aria-label="Select" />
              <th className="font-normal py-1 pr-3 text-right">No.</th>
              <th className="font-normal py-1 pr-3 text-right">Time</th>
              <th className="font-normal py-1 pr-3">Scramble</th>
              <th className="font-normal py-1 pr-3">Tags</th>
              <th className="font-normal py-1">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((solve) => (
              <tr key={solve.id} className="border-t border-rule row-hover" data-testid="solve-table-row">
                <td>
                  <input type="checkbox" aria-label={`Select solve ${numberOf.get(solve.id)}`} checked={selected.has(solve.id)} onChange={() => toggle(solve.id)} />
                </td>
                <td className="py-1 pr-3 text-right notation text-[0.75rem] text-faint">{numberOf.get(solve.id)}</td>
                <td className="py-1 pr-3 text-right notation text-[0.75rem]">
                  <button type="button" className="bg-transparent border-none p-0 underline decoration-rule-strong underline-offset-2" onClick={() => onOpen(solve.id)}>
                    {resultLabel(solve)}
                  </button>
                </td>
                <td className="py-1 pr-3 notation text-[0.6875rem] text-graphite max-w-[22rem] truncate">{solve.scramble}</td>
                <td className="py-1 pr-3 text-graphite">{(solve.tags ?? []).join(', ')}</td>
                <td className="py-1 text-graphite whitespace-nowrap">{formatDate(solve.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {solves.length > limit ? (
        <button type="button" className="btn btn-quiet self-start" onClick={() => setLimit((n) => n + 100)}>
          Show more
        </button>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title={`Delete ${selected.size} ${selected.size === 1 ? 'solve' : 'solves'}?`}
        body="You can undo this for a few seconds afterwards."
        confirmLabel="Delete solves"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          deleteSolves([...selected]);
          setSelected(new Set());
        }}
      />
    </div>
  );
}

export default function StatisticsPage() {
  const session = useApp((s) => s.currentSession());
  const sessionSolves = useApp((s) => s.solves);
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const sessions = useApp((s) => s.sessions);
  const currentSessionId = useApp((s) => s.currentSessionId);
  const switchSession = useApp((s) => s.switchSession);
  const [range, setRange] = useState('all');
  const [lastN, setLastN] = useState('0');
  const [tag, setTag] = useState('');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [windowInput, setWindowInput] = useState('');
  const [windowError, setWindowError] = useState(null);
  const [scope, setScope] = useState('session');
  const [puzzleSolves, setPuzzleSolves] = useState([]);
  const allSessionsScope = scope === 'puzzle';

  // Every session of this puzzle together, sorted by time. Read-only: solves are
  // edited in their own session.
  useEffect(() => {
    if (!allSessionsScope || !session) return undefined;
    let cancelled = false;
    listAllSolves().then((all) => {
      if (!cancelled) setPuzzleSolves(all.filter((s) => s.puzzle === session.puzzle && s.source === (session.kind === 'virtual' ? 'virtual' : 'physical')));
    });
    return () => {
      cancelled = true;
    };
  }, [allSessionsScope, session, sessionSolves]);

  const allSolves = allSessionsScope ? puzzleSolves : sessionSolves;

  const allTags = useMemo(() => [...new Set(allSolves.flatMap((s) => s.tags ?? []))].sort(), [allSolves]);

  const filtered = useMemo(() => {
    const from = range === 'all' ? null : Date.now() - Number(range) * 24 * 3600 * 1000;
    const list = filterSolves(allSolves, { from, tag: tag || null });
    return Number(lastN) ? list.slice(-Number(lastN)) : list;
  }, [allSolves, range, lastN, tag]);

  const searched = useMemo(() => filterSolves(filtered, { query }), [filtered, query]);
  const stats = useMemo(() => computeSessionStats(filtered, settings.extraWindows), [filtered, settings.extraWindows]);
  const values = useMemo(() => filtered.map(solveValue), [filtered]);

  const trend = useMemo(() => {
    const list = [{ label: 'Singles', dots: true, color: 'var(--graphite)', values: values.map((v) => (isDnf(v) ? null : v)) }];
    [5, 12, 50, 100].forEach((n, i) => {
      if (values.length >= n) list.push({ label: windowLabel(n), color: SERIES_COLOR(i), values: rollingAverage(values, n) });
    });
    return list;
  }, [values]);

  const distribution = useMemo(() => histogram(values), [values]);
  const daily = useMemo(() => dailyCounts(filtered), [filtered]);
  const bests = useMemo(() => personalBestProgression(filtered), [filtered]);
  const bestAo5 = useMemo(() => bestAverageProgression(filtered, 5), [filtered]);
  const consistency = useMemo(() => rollingConsistency(filtered, 12), [filtered]);
  const openSolve = sessionSolves.find((s) => s.id === openId) ?? null;

  useEffect(() => {
    setOpenId(null);
  }, [currentSessionId]);

  const windows = [...new Set([5, 12, 50, 100, 1000, ...settings.extraWindows])].sort((a, b) => a - b);
  const mo3 = useMemo(() => {
    const series = rollingMean3(values);
    return series[series.length - 1] ?? null;
  }, [values]);

  const addWindow = (event) => {
    event.preventDefault();
    const n = Number(windowInput);
    if (!Number.isInteger(n) || n < 3 || n > 100000) {
      setWindowError('Enter a whole number from 3 up.');
      return;
    }
    setWindowError(null);
    setWindowInput('');
    if (![5, 12, 50, 100, 1000].includes(n) && !settings.extraWindows.includes(n)) {
      updateSettings({ extraWindows: [...settings.extraWindows, n] });
    }
  };

  const exportCsv = () => {
    downloadText(`turnbase-${slug(session.name)}.csv`, solvesToCsv(filtered, new Map([[session.id, session.name]])), 'text/csv');
  };
  const exportStats = () => {
    downloadText(
      `turnbase-${slug(session.name)}-statistics.json`,
      JSON.stringify({ session: session.name, puzzle: session.puzzle, range, lastN, centiseconds: stats }, null, 2),
    );
  };

  const onlyAfter = bests.map((b) => b.index);
  const pbSeries = useMemo(() => {
    if (!filtered.length) return [];
    const best = new Array(filtered.length).fill(null);
    let current = null;
    filtered.forEach((_, i) => {
      if (onlyAfter.includes(i)) current = bests[onlyAfter.indexOf(i)].value;
      best[i] = current;
    });
    const ao5 = new Array(filtered.length).fill(null);
    let currentAo5 = null;
    const ao5Map = new Map(bestAo5.map((b) => [b.index, b.value]));
    filtered.forEach((_, i) => {
      if (ao5Map.has(i)) currentAo5 = ao5Map.get(i);
      ao5[i] = currentAo5;
    });
    return [
      { label: 'Best single', color: SERIES_COLOR(0), values: best },
      { label: 'Best ao5', color: SERIES_COLOR(1), values: ao5 },
    ];
  }, [filtered, bests, bestAo5]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full overflow-y-auto scrollbar-quiet page-scroll" data-testid="statistics-page">
      <div className="max-w-[64rem] mx-auto px-4 sm:px-6 flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="m-0 text-xl font-medium tracking-tight">Statistics</h1>
          <div className="flex flex-wrap items-center gap-2" data-testid="stat-filters">
            <div className="segmented" role="group" aria-label="Date range">
              {RANGES.map(([value, label]) => (
                <button key={value} type="button" aria-pressed={range === value} data-testid={`range-${value}`} onClick={() => setRange(value)}>
                  {label}
                </button>
              ))}
            </div>
            <select className="field max-w-[12rem]" aria-label="Session" value={currentSessionId ?? ''} data-testid="stat-session" onChange={(e) => switchSession(e.target.value)}>
              {sessions
                .filter((s) => !s.archived)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {getPuzzle(s.puzzle).name}: {s.name}
                  </option>
                ))}
            </select>
            <select className="field" aria-label="Which solves" value={scope} data-testid="stat-scope-select" onChange={(e) => setScope(e.target.value)}>
              <option value="session">This session</option>
              <option value="puzzle">All {getPuzzle(session?.puzzle).name} sessions</option>
            </select>
            <select className="field" aria-label="Chart range" value={lastN} data-testid="stat-last" onChange={(e) => setLastN(e.target.value)}>
              {LAST_N.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {allTags.length ? (
              <select className="field" aria-label="Tag" value={tag} data-testid="stat-tag" onChange={(e) => setTag(e.target.value)}>
                <option value="">All tags</option>
                {allTags.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            ) : null}
            <div className="ml-auto flex gap-2">
              <button type="button" className="btn" disabled={!filtered.length} data-testid="export-csv" onClick={exportCsv}>
                Export CSV
              </button>
              <button type="button" className="btn" disabled={!filtered.length} data-testid="export-stats" onClick={exportStats}>
                Export statistics
              </button>
            </div>
          </div>
          <p className="m-0 text-[0.8125rem] text-graphite" data-testid="stat-scope">
            {allSessionsScope ? `All ${getPuzzle(session?.puzzle).name} sessions` : session?.name}: {filtered.length} of {allSolves.length} solves.
          </p>
        </header>

        {!filtered.length ? (
          <EmptyState title={allSolves.length ? 'No solves match these filters' : 'No solves in this session yet'}>
            {allSolves.length ? 'Widen the date range, or choose another tag.' : 'Time a solve on the Timer page and it appears here.'}
          </EmptyState>
        ) : (
          <>
            <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-x-10 gap-y-6">
              <Totals stats={stats} />
              <div>
                <table className="w-full text-[0.8125rem] border-collapse" data-testid="average-table">
                  <thead>
                    <tr className="text-graphite">
                      <th className="font-normal text-left pb-1">Average</th>
                      <th className="font-normal text-right pb-1 pr-4">Current</th>
                      <th className="font-normal text-right pb-1">Best</th>
                    </tr>
                  </thead>
                  <tbody>
                    <Row label="mo3" current={formatCs(mo3)} best={formatCs(stats.mo3.best)} testId="row-mo3" hint="WCA mean of 3: no results dropped, and any DNF makes it DNF." />
                    {windows.map((n) => (
                      <Row key={n} label={windowLabel(n)} current={formatCs(stats.windows[n]?.current)} best={formatCs(stats.windows[n]?.best)} testId={`row-ao${n}`} hint={n === 5 ? 'WCA average of 5: best and worst dropped.' : `Unofficial: ${trimFor(n)} fastest and ${trimFor(n)} slowest dropped.`} />
                    ))}
                  </tbody>
                </table>
                <form className="flex items-center gap-2 mt-2" onSubmit={addWindow}>
                  <input className="field w-28" inputMode="numeric" placeholder="Window size" aria-label="Add a rolling window size" value={windowInput} data-testid="window-input" onChange={(e) => setWindowInput(e.target.value)} />
                  <button type="submit" className="btn" data-testid="window-add">
                    Add average
                  </button>
                  {settings.extraWindows.length ? (
                    <button type="button" className="btn btn-quiet" data-testid="window-clear" onClick={() => updateSettings({ extraWindows: [] })}>
                      Clear added
                    </button>
                  ) : null}
                </form>
                {windowError ? <p className="m-0 mt-1 text-[0.8125rem] text-danger">{windowError}</p> : null}
                <p className="m-0 mt-2 text-[0.75rem] text-faint max-w-[52ch]">
                  mo3 and ao5 follow WCA rules. Larger averages are not competition formats: each drops the fastest and slowest 5%, rounded up, and is DNF if its DNFs exceed that. Mean, median and deviation leave out DNF and DNS.
                </p>
              </div>
            </div>

            <Section title="Times over this session" note="Each dot is a solve. Select one to open it. DNFs have no time, so they leave gaps in the dots.">
              <Legend series={trend} />
              <LineChart
                series={trend}
                height={280}
                testId="trend-chart"
                title={`Solve times and rolling averages, ${filtered.length} solves`}
                onSelect={allSessionsScope ? undefined : (i) => setOpenId(filtered[i].id)}
              />
            </Section>

            <div className="grid md:grid-cols-2 gap-x-10 gap-y-6">
              <Section title="How your times spread" note={distribution.dnf ? `Leaves out ${distribution.dnf} DNF or DNS.` : 'Every completed solve, grouped by time.'}>
                <BarChart
                  testId="histogram"
                  title="Histogram of solve times"
                  bars={distribution.bins.map((b) => ({ key: b.from, value: b.count, label: formatCs(b.from), detail: `from ${formatCs(b.from)} to ${formatCs(b.to)}` }))}
                  tickEvery={Math.max(1, Math.ceil(distribution.bins.length / 5))}
                  formatValue={(v) => `${v} ${v === 1 ? 'solve' : 'solves'}`}
                />
              </Section>
              <Section title="Solves per day" note="Days with no solves are included.">
                <BarChart
                  testId="daily-chart"
                  title="Solves per day"
                  bars={daily.map((d) => ({ key: d.day, value: d.count, label: dayLabel(d.day), detail: dayLabel(d.day) }))}
                  tickEvery={Math.max(1, Math.ceil(daily.length / 5))}
                  formatValue={(v) => `${v} ${v === 1 ? 'solve' : 'solves'}`}
                />
              </Section>
              <Section title="Personal bests" note={`${bests.length} new best ${bests.length === 1 ? 'single' : 'singles'} and ${bestAo5.length} new best ao5 in this range.`}>
                <Legend series={pbSeries} />
                <LineChart series={pbSeries} height={180} testId="pb-chart" title="Best single and best ao5 so far, by solve" clipOutliers={false} />
              </Section>
              <Section title="Consistency" note="Standard deviation of each 12 solves, over completed solves. Lower is steadier.">
                <LineChart
                  series={[{ label: 'Deviation over 12', color: SERIES_COLOR(0), values: consistency }]}
                  height={180}
                  testId="consistency-chart"
                  title="Rolling standard deviation over 12 solves"
                />
              </Section>
            </div>

            {allSessionsScope ? null : (
              <Section title="Solves" note="Search, open or delete solves within the filters above.">
                <SolveTable solves={searched} allSolves={allSolves} query={query} setQuery={setQuery} onOpen={setOpenId} />
              </Section>
            )}
          </>
        )}

        <Section title="Compare sessions" testId="compare-section">
          <SessionComparison />
        </Section>
      </div>
      <SolveDetail solve={openSolve} number={openSolve ? sessionSolves.indexOf(openSolve) + 1 : 0} onClose={() => setOpenId(null)} />
    </div>
  );
}
