import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronsUpDown, History, Maximize, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useApp } from '../app/store.js';
import { TimerDisplay } from '../timer/TimerDisplay.jsx';
import { TimerControls } from '../timer/TimerControls.jsx';
import { attachTimerInput, configureTimer, machine, setResultHandler } from '../timer/TimerEngine.js';
import { ScrambleDisplay } from '../scrambles/ScrambleDisplay.jsx';
import { ScramblePreview } from '../scrambles/ScramblePreview.jsx';
import { getPuzzle } from '../scrambles/PuzzleRegistry.js';
import { SolveHistory } from '../sessions/SolveHistory.jsx';
import { SessionManager } from '../sessions/SessionManager.jsx';
import { Modal } from '../components/Modal.jsx';
import { computeSessionStats } from '../statistics/StatisticsEngine.js';
import { formatCs } from '../utils/format.js';

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const update = () => setMatches(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

function Stat({ label, value, testId }) {
  return (
    <div className="flex flex-col items-center min-w-[3rem] sm:min-w-[3.5rem]">
      <span className="text-[0.875rem] sm:text-[0.9375rem] font-extrabold tabular" style={{ letterSpacing: '-0.03em' }} data-testid={testId}>
        {value}
      </span>
      <span className="text-[0.6875rem] text-graphite">{label}</span>
    </div>
  );
}

function SessionStats() {
  const solves = useApp((s) => s.solves);
  const extra = useApp((s) => s.settings.extraWindows);
  const stats = useMemo(() => computeSessionStats(solves, extra), [solves, extra]);
  return (
    <Link to="/statistics" className="glass no-underline text-ink flex items-start justify-center gap-2 sm:gap-4 rounded-full px-5 py-2" title="Open statistics" data-testid="session-stats">
      <Stat label="ao5" value={formatCs(stats.windows[5].current)} testId="stat-ao5" />
      <Stat label="ao12" value={formatCs(stats.windows[12].current)} testId="stat-ao12" />
      <Stat label="best" value={formatCs(stats.best)} testId="stat-best" />
      <Stat label="mean" value={formatCs(stats.mean)} testId="stat-mean" />
      <Stat label="solves" value={stats.count} testId="stat-count" />
    </Link>
  );
}

function SessionPicker() {
  const sessions = useApp((s) => s.sessions);
  const currentSessionId = useApp((s) => s.currentSessionId);
  const switchSession = useApp((s) => s.switchSession);
  const [managing, setManaging] = useState(false);
  const active = sessions.filter((s) => !s.archived);
  return (
    <div className="flex items-center gap-1">
      <select className="field flex-1 !bg-transparent" aria-label="Current session" value={currentSessionId ?? ''} data-testid="session-select" onChange={(e) => switchSession(e.target.value)}>
        {active.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button type="button" className="icon-btn" aria-label="Manage sessions" title="Manage sessions" data-testid="session-manage" onClick={() => setManaging(true)}>
        <ChevronsUpDown size={14} strokeWidth={1.8} />
      </button>
      <SessionManager open={managing} onClose={() => setManaging(false)} />
    </div>
  );
}

export default function TimerPage() {
  const surface = useRef(null);
  const settings = useApp((s) => s.settings);
  const scramble = useApp((s) => s.scramble);
  const session = useApp((s) => s.currentSession());
  const showDiagram = settings.showScrambleDiagram;
  const [railOpen, setRailOpen] = useState(() => {
    try {
      return localStorage.getItem('turnbase-rail') !== 'closed';
    } catch {
      return true;
    }
  });
  const [mobileHistory, setMobileHistory] = useState(false);
  const wide = useMediaQuery('(min-width: 1280px)');

  useEffect(() => {
    configureTimer(settings);
  }, [settings]);

  useEffect(() => {
    setResultHandler(async (result) => {
      const { recordSolve, newScramble } = useApp.getState();
      await recordSolve(result);
      newScramble();
    });
    const detach = attachTimerInput(surface.current);
    return () => {
      setResultHandler(null);
      detach();
    };
  }, []);

  // Solve shortcuts, separate from the timer's own trigger handling.
  useEffect(() => {
    const onKey = (event) => {
      if (!event.altKey || event.metaKey || event.ctrlKey) return;
      if (document.body.dataset.modalOpen === 'true') return;
      if (event.target.closest?.('input, textarea, select')) return;
      const { solves, setPenalty, deleteSolves, newScramble } = useApp.getState();
      const latest = solves[solves.length - 1];
      const actions = {
        Digit1: () => latest && setPenalty(latest.id, 'none'),
        Digit2: () => latest && setPenalty(latest.id, '+2'),
        Digit3: () => latest && setPenalty(latest.id, 'dnf'),
        KeyZ: () => latest && deleteSolves([latest.id]),
        KeyN: () => newScramble(),
      };
      const action = actions[event.code];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleRail = () => {
    const next = !railOpen;
    setRailOpen(next);
    try {
      localStorage.setItem('turnbase-rail', next ? 'open' : 'closed');
    } catch {
      // Not important enough to report.
    }
  };

  const puzzle = getPuzzle(session?.puzzle);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  return (
    <div className="h-full relative overflow-hidden" data-testid="timer-page">
      <main ref={surface} className="timer-surface absolute inset-0 flex flex-col select-none">
        <ScrambleDisplay />

        <div className="flex-1 min-h-0 flex items-center justify-center px-2">
          <TimerDisplay />
        </div>

        <div className="focus-fade flex flex-col items-center gap-2.5 px-3" style={{ paddingBottom: 'var(--page-bottom)' }}>
          <TimerControls />
          {showDiagram && !wide ? <ScramblePreview key={scramble?.id} puzzleId={puzzle.id} text={scramble?.text} width={110} /> : null}
          <div className="flex items-center gap-1 sm:gap-2">
            <SessionStats />
            {wide ? null : (
              <button type="button" className="icon-btn shrink-0" aria-label="Show solves" title="Show solves" data-testid="mobile-history" onClick={() => setMobileHistory(true)}>
                <History size={18} strokeWidth={1.8} />
              </button>
            )}
          </div>
        </div>

        {showDiagram && wide ? (
          <div className="focus-fade absolute left-5 bottom-5">
            <ScramblePreview key={scramble?.id} puzzleId={puzzle.id} text={scramble?.text} width={150} />
          </div>
        ) : null}

        {wide ? (
          <div className="focus-fade absolute right-4 flex items-center gap-0.5" style={{ bottom: 'calc(var(--page-bottom) - 4px)' }}>
            <button type="button" className="icon-btn" aria-label="Full screen" title="Full screen" data-testid="fullscreen" onClick={toggleFullscreen}>
              <Maximize size={15} strokeWidth={1.8} />
            </button>
            <button type="button" className="icon-btn" aria-label={railOpen ? 'Hide solves' : 'Show solves'} aria-expanded={railOpen} title={railOpen ? 'Hide solves' : 'Show solves'} data-testid="rail-toggle" onClick={toggleRail}>
              {railOpen ? <PanelRightClose size={16} strokeWidth={1.8} /> : <PanelRightOpen size={16} strokeWidth={1.8} />}
            </button>
          </div>
        ) : null}
      </main>

      {wide ? (
        <div className="focus-fade absolute right-3 bottom-16 w-[14.5rem] pointer-events-none" style={{ top: 'var(--page-top)' }}>
          <aside className="solve-rail glass max-h-full flex flex-col rounded-[24px] overflow-hidden pb-2 pointer-events-auto" data-open={railOpen} inert={!railOpen} data-testid="solve-rail">
            <div className="p-2 pb-1">
              <SessionPicker />
            </div>
            <SolveHistory />
          </aside>
        </div>
      ) : null}

      <Modal open={mobileHistory} onClose={() => setMobileHistory(false)} title="Solves" testId="mobile-history-panel">
        <div className="mb-3">
          <SessionPicker />
        </div>
        <div className="flex flex-col max-h-[60dvh] -mx-3">
          <SolveHistory />
        </div>
      </Modal>
    </div>
  );
}

// Exposed for the browser tests and for debugging timing behaviour.
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
  window.__turnbaseTimer = machine;
}
