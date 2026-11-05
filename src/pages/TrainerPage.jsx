import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { CaseDiagram } from '../algorithms/CaseDiagram.jsx';
import { ALGORITHM_SETS, casesInSet } from '../algorithms/AlgorithmCatalog.js';
import { U_MOVES } from '../algorithms/AlgorithmValidator.js';
import { useProgress } from '../trainer/TrainingProgress.js';
import { TRAINING_MODES, TRAINING_SETS, casesFor, goalReached, practiceState } from '../trainer/caseSets.js';
import { accuracy, average, isDue, masteryLevel, pickNext } from '../trainer/SpacedRepetition.js';
import { CubeScene } from '../cube/CubeScene.jsx';
import { useControllerState, useCubeController } from '../hooks/useCube.js';
import { useCubeKeyboard } from '../hooks/useCubeKeyboard.js';
import { moveCounts } from '../cube/CubeMoves.js';
import { EmptyState } from '../components/EmptyState.jsx';
import { formatMs } from '../utils/format.js';
import { prefersReducedMotion } from '../app/appearance.js';
import { KeyboardOverlay } from '../cube/KeymapEditor.jsx';
import { Keyboard } from 'lucide-react';

const GRADES = [
  { quality: 1, label: 'Forgot', correct: false },
  { quality: 3, label: 'Hard', correct: true },
  { quality: 4, label: 'Good', correct: true },
  { quality: 5, label: 'Easy', correct: true },
];

const caseLabel = (entry) => (entry.family === 'oll' ? `OLL ${entry.number}: ${entry.name}` : entry.title);
const randomAuf = () => U_MOVES[Math.floor(Math.random() * 4)];

function Algorithm({ entry }) {
  return (
    <div>
      <p className="notation text-[1.0625rem] leading-relaxed m-0" data-testid="trainer-algorithm">
        {entry.primary.notation}
      </p>
      <p className="m-0 mt-1 text-[0.8125rem] text-graphite">{entry.primary.counts.stm} moves</p>
    </div>
  );
}

function CaseCard({ entry, auf, size = 168 }) {
  const state = useMemo(() => practiceState(entry, auf), [entry, auf]);
  return <CaseDiagram entry={entry} state={state} size={size} />;
}

// ─── Recognition ─────────────────────────────────────

function RecognitionRound({ entry, cases, auf, onDone }) {
  const started = useRef(performance.now());
  const [picked, setPicked] = useState(null);
  const options = useMemo(() => {
    // Others from the same set where possible, since those are what it gets confused with.
    const pool = cases.filter((c) => c.id !== entry.id && c.family === entry.family);
    const others = (pool.length >= 3 ? pool : cases.filter((c) => c.id !== entry.id)).slice().sort(() => Math.random() - 0.5).slice(0, 3);
    return [entry, ...others].sort(() => Math.random() - 0.5);
  }, [entry, cases]);

  const choose = (option) => {
    if (picked) return;
    setPicked(option.id);
    const ms = performance.now() - started.current;
    const correct = option.id === entry.id;
    onDone({ correct, recognitionMs: ms, quality: correct ? (ms < 3000 ? 5 : 4) : 1 });
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <CaseCard entry={entry} auf={auf} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md" data-testid="recognition-options">
        {options.map((option) => {
          const isAnswer = picked && option.id === entry.id;
          const isWrong = picked === option.id && option.id !== entry.id;
          return (
            <button
              key={option.id}
              type="button"
              className="btn h-10"
              data-testid="recognition-option"
              data-correct={option.id === entry.id}
              style={isAnswer ? { borderColor: 'var(--ready)', color: 'var(--ready)' } : isWrong ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : undefined}
              onClick={() => choose(option)}
            >
              {caseLabel(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Recall and flashcards ───────────────────────────

function RevealRound({ entry, auf, flashcard, onDone }) {
  const [revealed, setRevealed] = useState(false);
  const started = useRef(performance.now());
  const card = useRef(null);
  const [recognitionMs, setRecognitionMs] = useState(null);

  const reveal = () => {
    setRecognitionMs(performance.now() - started.current);
    if (flashcard && card.current && !prefersReducedMotion()) {
      gsap.fromTo(card.current, { rotateY: -90, opacity: 0.4 }, { rotateY: 0, opacity: 1, duration: 0.28, ease: 'power2.out' });
    }
    setRevealed(true);
  };

  return (
    <div className="flex flex-col items-center gap-5" style={{ perspective: 900 }}>
      <div ref={card} className="flex flex-col items-center gap-4 min-h-[15rem]" data-testid="flashcard">
        {flashcard && revealed ? null : <CaseCard entry={entry} auf={auf} />}
        {revealed ? (
          <div className="text-center">
            <p className="m-0 mb-2 text-[0.9375rem] font-medium" data-testid="trainer-case-name">
              {caseLabel(entry)}
            </p>
            <Algorithm entry={entry} />
          </div>
        ) : null}
      </div>
      {revealed ? (
        <div className="flex gap-2 flex-wrap justify-center" data-testid="grade-buttons">
          {GRADES.map((grade) => (
            <button key={grade.label} type="button" className="btn" data-testid={`grade-${grade.label.toLowerCase()}`} onClick={() => onDone({ correct: grade.correct, quality: grade.quality, recognitionMs })}>
              {grade.label}
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="btn btn-primary" data-testid="trainer-reveal" onClick={reveal}>
          {flashcard ? 'Turn over' : 'Show the algorithm'}
        </button>
      )}
    </div>
  );
}

// ─── Execution ───────────────────────────────────────

function ExecutionRound({ entry, auf, onDone }) {
  const start = useMemo(() => practiceState(entry, auf), [entry, auf]);
  const controller = useCubeController({ state: start });
  const state = useControllerState(controller);
  const [moves, setMoves] = useState([]);
  const [finished, setFinished] = useState(null);
  const [showAlg, setShowAlg] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const startedAt = useRef(null);
  const clock = useRef(null);

  const turn = (move, timeStamp) => {
    if (finished) return;
    const t = timeStamp ?? performance.now();
    if (startedAt.current === null && move.kind !== 'rotation') startedAt.current = t;
    controller.enqueue(move);
    const next = [...moves, move];
    setMoves(next);
    if (goalReached(entry, controller.state)) {
      const ms = startedAt.current === null ? 0 : t - startedAt.current;
      setFinished({ ms, count: moveCounts(next).stm });
      onDone({ correct: true, quality: showAlg ? 3 : ms < 5000 ? 5 : 4, executionMs: ms }, { keepOpen: true });
    }
  };

  useCubeKeyboard({ enabled: !finished, onMove: turn });

  useEffect(() => {
    if (finished) return undefined;
    let frame = 0;
    const paint = () => {
      if (clock.current && startedAt.current !== null) clock.current.textContent = formatMs(performance.now() - startedAt.current, 2);
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [finished]);

  return (
    <div className="flex flex-col gap-3" data-testid="execution-round">
      <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
        <div className="flex flex-col gap-2 sm:w-44">
          <CaseCard entry={entry} auf={auf} size={132} />
          <div ref={clock} className="display-num text-2xl" data-testid="execution-clock">
            {finished ? formatMs(finished.ms, 2) : '0.00'}
          </div>
          <div className="text-[0.8125rem] text-graphite" data-testid="execution-count">
            {moveCounts(moves).stm} moves
          </div>
          <div className="text-[0.8125rem]" role="status" data-testid="execution-status">
            {finished ? <span className="text-ready">Case solved.</span> : <span className="text-graphite">Solve this case.</span>}
          </div>
        </div>
        <CubeScene controller={controller} interactive={!finished} onMove={turn} library className="h-[min(50dvh,24rem)]" minHeight={240} testId="execution-canvas" />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {!finished ? (
          <>
            <button type="button" className="btn" data-testid="execution-hint" onClick={() => setShowAlg(true)}>
              Show the algorithm
            </button>
            <button
              type="button"
              className="btn"
              data-testid="execution-reset"
              onClick={() => {
                controller.setState(start);
                setMoves([]);
                startedAt.current = null;
                if (clock.current) clock.current.textContent = '0.00';
              }}
            >
              Reset this case
            </button>
            <button type="button" className="btn btn-quiet" data-testid="execution-skip" onClick={() => onDone({ correct: false, quality: 1 })}>
              Give up
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" data-testid="execution-next" onClick={() => onDone(null)}>
            Next case
          </button>
        )}
        <button type="button" className="btn btn-quiet" data-testid="execution-keys" onClick={() => setShowKeys(true)}>
          <Keyboard size={14} strokeWidth={1.6} />
          Keys
        </button>
      </div>
      {showAlg || finished ? <Algorithm entry={entry} /> : null}
      <KeyboardOverlay open={showKeys} onClose={() => setShowKeys(false)} />
    </div>
  );
}

// ─── Session and progress ────────────────────────────

function Practice({ cases, mode, onExit }) {
  const progress = useProgress((s) => s.progress);
  const recordPractice = useProgress((s) => s.recordPractice);
  const [current, setCurrent] = useState(() => ({ entry: pickNext(cases, useProgress.getState().progress), auf: randomAuf(), round: 0 }));
  const [result, setResult] = useState(null);
  const [tally, setTally] = useState({ done: 0, right: 0 });
  const entry = current?.entry;

  const next = () => {
    setResult(null);
    setCurrent((prev) => ({ entry: pickNext(cases, useProgress.getState().progress, { avoid: prev.entry.id }), auf: randomAuf(), round: prev.round + 1 }));
  };

  const finish = (outcome, { keepOpen = false } = {}) => {
    if (outcome) {
      recordPractice(entry.id, outcome);
      setTally((t) => ({ done: t.done + 1, right: t.right + (outcome.correct ? 1 : 0) }));
    }
    if (mode === 'recognition' && outcome) {
      setResult(outcome);
      return;
    }
    if (!keepOpen) next();
  };

  if (!entry) return null;
  const record = progress.get(entry.id);

  return (
    <div className="flex flex-col gap-5" data-testid="practice">
      <div className="flex items-center justify-between gap-3 text-[0.8125rem]">
        <button type="button" className="btn btn-quiet -ml-2" data-testid="practice-exit" onClick={onExit}>
          End session
        </button>
        <span className="text-graphite" data-testid="practice-tally">
          {tally.right} of {tally.done} right
        </span>
        <span className="text-graphite" data-testid="practice-mastery">
          {masteryLevel(record)}
        </span>
      </div>
      {mode === 'recognition' ? <RecognitionRound key={current.round} entry={entry} cases={cases} auf={current.auf} onDone={finish} /> : null}
      {mode === 'recall' || mode === 'review' ? <RevealRound key={current.round} entry={entry} auf={current.auf} flashcard={false} onDone={finish} /> : null}
      {mode === 'flashcards' ? <RevealRound key={current.round} entry={entry} auf={current.auf} flashcard onDone={finish} /> : null}
      {mode === 'execution' ? <ExecutionRound key={current.round} entry={entry} auf={current.auf} onDone={finish} /> : null}
      {result ? (
        <div className="flex flex-col items-center gap-3 text-center" data-testid="recognition-result">
          <p className={`m-0 font-medium ${result.correct ? 'text-ready' : 'text-danger'}`}>
            {result.correct ? 'Right' : 'Not quite'}: {caseLabel(entry)}, in {formatMs(result.recognitionMs, 2)}s
          </p>
          <Algorithm entry={entry} />
          <button type="button" className="btn btn-primary" data-testid="recognition-next" onClick={next}>
            Next case
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ProgressSummary() {
  const progress = useProgress((s) => s.progress);
  const rows = ALGORITHM_SETS.map((set) => {
    const cases = casesInSet(set.id);
    const records = cases.map((c) => progress.get(c.id)).filter(Boolean);
    const learned = records.filter((r) => r.learned).length;
    const attempts = records.reduce((n, r) => n + r.attempts, 0);
    const correct = records.reduce((n, r) => n + r.correct, 0);
    const recognition = average(records.flatMap((r) => r.recognitionMs));
    const execution = average(records.flatMap((r) => r.executionMs));
    const due = records.filter((r) => r.attempts && isDue(r)).length;
    return { set, total: cases.length, learned, attempts, correct, recognition, execution, due };
  });
  return (
    <div data-testid="progress-summary" className="overflow-x-auto">
      <table className="w-full text-[0.8125rem] border-collapse min-w-[30rem]">
        <thead>
          <tr className="text-graphite text-left">
            <th className="font-normal py-1 pr-3">Set</th>
            <th className="font-normal py-1 pr-3">Learned</th>
            <th className="font-normal py-1 pr-3 text-right">Success</th>
            <th className="font-normal py-1 pr-3 text-right">Recognition</th>
            <th className="font-normal py-1 pr-3 text-right">Execution</th>
            <th className="font-normal py-1 text-right">Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ set, total, learned, attempts, correct, recognition, execution, due }) => (
            <tr key={set.id} className="border-t border-rule" data-testid="progress-row" data-set={set.id}>
              <td className="py-1.5 pr-3">{set.name}</td>
              <td className="py-1.5 pr-3">
                <div className="flex items-center gap-2">
                  <span className="notation text-[0.75rem] w-12" data-testid="progress-count">
                    {learned}/{total}
                  </span>
                  <span className="h-0.5 w-16 bg-rule rounded relative overflow-hidden" aria-hidden="true">
                    <span className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${(learned / total) * 100}%` }} />
                  </span>
                </div>
              </td>
              <td className="py-1.5 pr-3 text-right notation text-[0.75rem]">{attempts ? `${Math.round((correct / attempts) * 100)}%` : '–'}</td>
              <td className="py-1.5 pr-3 text-right notation text-[0.75rem]">{recognition ? `${formatMs(recognition, 2)}s` : '–'}</td>
              <td className="py-1.5 pr-3 text-right notation text-[0.75rem]">{execution ? `${formatMs(execution, 2)}s` : '–'}</td>
              <td className="py-1.5 text-right notation text-[0.75rem]">{due || '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HardestCases() {
  const progress = useProgress((s) => s.progress);
  const hardest = useMemo(
    () =>
      [...progress.values()]
        .filter((r) => r.attempts >= 2)
        .sort((a, b) => accuracy(a) - accuracy(b))
        .slice(0, 5),
    [progress],
  );
  if (!hardest.length) return null;
  return (
    <p className="m-0 mt-3 text-[0.8125rem] text-graphite">
      Most often missed:{' '}
      {hardest.map((r) => `${r.caseId.replace('-', ' ').toUpperCase()} (${Math.round(accuracy(r) * 100)}%)`).join(', ')}.
    </p>
  );
}

export default function TrainerPage() {
  const load = useProgress((s) => s.load);
  const loaded = useProgress((s) => s.loaded);
  const progress = useProgress((s) => s.progress);
  const customAlgs = useProgress((s) => s.customAlgs);
  const [setId, setSetId] = useState('pll');
  const [modeId, setModeId] = useState('recognition');
  const [running, setRunning] = useState(null);

  useEffect(() => {
    load();
  }, [load]);

  const cases = useMemo(() => {
    const all = casesFor(setId, progress, customAlgs);
    if (modeId !== 'review') return all;
    return all.filter((c) => {
      const r = progress.get(c.id);
      return !r || !r.attempts || isDue(r);
    });
  }, [setId, modeId, progress, customAlgs]);

  if (!loaded) return null;

  if (running) {
    return (
      <div className="h-full overflow-y-auto scrollbar-quiet page-scroll" data-testid="trainer-page">
        <div className="max-w-[56rem] mx-auto px-4 sm:px-6">
          <Practice cases={running.cases} mode={running.mode} onExit={() => setRunning(null)} />
        </div>
      </div>
    );
  }

  const mode = TRAINING_MODES.find((m) => m.id === modeId);

  return (
    <div className="h-full overflow-y-auto scrollbar-quiet page-scroll" data-testid="trainer-page">
      <div className="max-w-[46rem] mx-auto px-4 sm:px-6 flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h1 className="m-0 text-xl font-medium tracking-tight">Practice</h1>
          <div className="grid gap-1">
            <span className="text-[0.8125rem] text-graphite">Cases</span>
            <div className="segmented flex-wrap justify-self-start" role="group" aria-label="Cases to practice">
              {TRAINING_SETS.map((set) => (
                <button key={set.id} type="button" aria-pressed={set.id === setId} data-testid={`trainset-${set.id}`} onClick={() => setSetId(set.id)}>
                  {set.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1">
            <span className="text-[0.8125rem] text-graphite">Mode</span>
            <div className="segmented flex-wrap justify-self-start" role="group" aria-label="Practice mode">
              {TRAINING_MODES.map((m) => (
                <button key={m.id} type="button" aria-pressed={m.id === modeId} data-testid={`trainmode-${m.id}`} onClick={() => setModeId(m.id)}>
                  {m.name}
                </button>
              ))}
            </div>
            <p className="m-0 mt-1 text-[0.8125rem] text-graphite">{mode.text}</p>
          </div>
          {cases.length ? (
            <div className="flex items-center gap-3">
              <button type="button" className="btn btn-primary" data-testid="trainer-start" onClick={() => setRunning({ cases, mode: modeId })}>
                Practice {cases.length} {cases.length === 1 ? 'case' : 'cases'}
              </button>
            </div>
          ) : (
            <EmptyState title={modeId === 'review' ? 'Nothing is due' : 'No cases here yet'}>
              {setId === 'custom'
                ? 'Save an algorithm in the editor on the Cube page to practice it here.'
                : setId === 'favorites'
                  ? 'Star cases in the algorithm library to practice them here.'
                  : modeId === 'review'
                    ? 'Everything in this set is scheduled for later. Practice another set, or come back then.'
                    : 'Every case in the library is marked learned.'}
            </EmptyState>
          )}
        </section>
        <section className="pt-5 border-t border-rule">
          <h2 className="m-0 mb-2 text-[0.9375rem] font-medium">Progress</h2>
          <ProgressSummary />
          <HardestCases />
        </section>
      </div>
    </div>
  );
}
