import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Star } from 'lucide-react';
import { applyMoves, isSolved } from '../cube/CubeEngine.js';
import { invertMoves, movesToDisplay } from '../cube/CubeMoves.js';
import { CameraViews, CubeScene } from '../cube/CubeScene.jsx';
import { MoveTimeline, PlayerControls } from '../cube/PlayerControls.jsx';
import { useControllerState, useCubeController, useSequencePlayer } from '../hooks/useCube.js';
import { CaseDiagram } from './CaseDiagram.jsx';
import { describeMove, findTriggers, playableMoves, recognitionNotes } from './AlgorithmCatalog.js';
import { useProgress } from '../trainer/TrainingProgress.js';
import { useApp } from '../app/store.js';
import { copyText } from '../utils/download.js';
import { goalReached } from '../trainer/caseSets.js';

/** One case, on a 3D cube set up in its exact starting state. */
export function AlgorithmDetail({ entry, onBack }) {
  const [algIndex, setAlgIndex] = useState(0);
  const controller = useCubeController({ state: entry.caseState });
  const { player, snapshot } = useSequencePlayer(controller, { baseState: entry.caseState, moves: entry.primary.moves });
  const scene = useRef(null);
  const state = useControllerState(controller);
  const record = useProgress((s) => s.progress.get(entry.id));
  const toggleLearned = useProgress((s) => s.toggleLearned);
  const toggleFavorite = useProgress((s) => s.toggleFavorite);
  const markUsed = useProgress((s) => s.markUsed);
  const pushToast = useApp((s) => s.pushToast);

  const { moves, preAuf } = useMemo(() => playableMoves(entry, algIndex), [entry, algIndex]);

  useEffect(() => {
    player.load({ baseState: entry.caseState, moves });
  }, [player, entry, moves]);

  useEffect(() => {
    markUsed(entry.id);
  }, [entry.id, markUsed]);

  const triggers = useMemo(() => findTriggers(moves), [moves]);
  const notes = useMemo(() => recognitionNotes(entry), [entry]);
  const highlighted = snapshot.activeIndex >= 0 ? snapshot.activeIndex : snapshot.index - 1;
  const current = moves[highlighted] ?? null;
  const solved = snapshot.index === moves.length && isSolved(state);
  const alg = entry.algs[algIndex];
  // Checked here and now, on the same engine, for the algorithm being shown.
  const verified = useMemo(() => goalReached(entry, applyMoves(entry.caseState, moves)), [entry, moves]);

  return (
    <div className="h-full overflow-y-auto scrollbar-quiet" data-testid="algorithm-detail">
      <div className="px-4 sm:px-6 pt-5 max-w-[52rem] mx-auto" style={{ paddingBottom: 'var(--page-bottom)' }}>
        <div className="flex items-center gap-2 mb-2">
          <button type="button" className="icon-btn xl:hidden -ml-1.5" aria-label="Back to the library" data-testid="detail-back" onClick={onBack}>
            <ArrowLeft size={16} strokeWidth={1.6} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-xl font-medium tracking-tight" data-testid="detail-title">
              {entry.family === 'oll' ? `OLL ${entry.number}: ${entry.name}` : entry.title}
            </h1>
            <p className="m-0 text-[0.8125rem] text-graphite">
              {entry.setName}, {entry.category.toLowerCase()}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label={record?.favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={Boolean(record?.favorite)}
            title="Favorite"
            data-testid="detail-favorite"
            onClick={() => toggleFavorite(entry.id)}
          >
            <Star size={15} strokeWidth={1.6} fill={record?.favorite ? 'currentColor' : 'none'} />
          </button>
          <button type="button" className="btn" aria-pressed={Boolean(record?.learned)} data-testid="detail-learned" onClick={() => toggleLearned(entry.id)}>
            <Check size={13} strokeWidth={1.8} />
            {record?.learned ? 'Learned' : 'Mark as learned'}
          </button>
        </div>

        <div className="relative">
          <CubeScene ref={scene} controller={controller} library className="h-[min(46dvh,23rem)]" minHeight={240} />
          <div className="absolute left-0 top-0 p-1 rounded-md" title="The case, from its starting state">
            <CaseDiagram entry={entry} size={72} />
          </div>
          {solved ? (
            <div className="absolute right-0 top-1 text-[0.8125rem] text-ready" data-testid="detail-solved" role="status">
              Solved
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 mt-2">
          <div className="min-h-[1.25rem] text-[0.8125rem] text-graphite" data-testid="current-move-explanation" aria-live="polite">
            {current ? (
              <>
                <span className="notation text-ink">{current.text}</span> {describeMove(current).toLowerCase()}
              </>
            ) : (
              'Press play, or step through one move at a time.'
            )}
          </div>
          <MoveTimeline player={player} snapshot={snapshot} moves={moves} library />
          <PlayerControls player={player} snapshot={snapshot} />
          <CameraViews sceneRef={scene} />
        </div>

        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5 mt-6 pt-5 border-t border-rule text-[0.875rem]">
          <section>
            <h2 className="m-0 mb-1.5 text-[0.8125rem] font-medium">How to recognize it</h2>
            {entry.explanation ? <p className="m-0 text-graphite">{entry.explanation}</p> : null}
            <ul className="m-0 p-0 list-none text-graphite" data-testid="recognition-notes">
              {notes.map((note) => (
                <li key={note} className="mb-0.5">
                  {note}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="m-0 mb-1.5 text-[0.8125rem] font-medium">This algorithm</h2>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-graphite">
              <dt>Length</dt>
              <dd className="m-0 text-ink">
                {alg.counts.stm} moves, {alg.counts.qtm} quarter turns
              </dd>
              <dt>Source</dt>
              <dd className="m-0 text-ink" data-testid="alg-source">
                {alg.source === 'search' ? 'Shortest solution, by computer search' : 'Written by hand, in common use'}
              </dd>
              <dt>Status</dt>
              <dd className="m-0 text-ink" data-testid="alg-status">
                {verified ? 'Verified on the cube engine' : 'Not verified'}
              </dd>
              <dt>Inverse</dt>
              <dd className="m-0 notation text-ink text-[0.75rem] leading-relaxed">{movesToDisplay(invertMoves(moves))}</dd>
            </dl>
            {triggers.length ? (
              <p className="m-0 mt-2 text-graphite">Contains {[...new Set(triggers.map((t) => t.name))].join(' and ')}.</p>
            ) : null}
          </section>
        </div>

        <details className="mt-6 pt-5 border-t border-rule text-[0.875rem]" data-testid="all-steps">
          <summary className="cursor-pointer text-[0.8125rem] font-medium">Every step in words</summary>
          <ol className="m-0 mt-2 pl-6 text-graphite">
            {moves.map((move, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <li key={i} className="mb-0.5">
                <span className="notation text-ink">{move.text}</span>: {describeMove(move).toLowerCase()}
              </li>
            ))}
          </ol>
        </details>

        {entry.algs.length > 1 ? (
          <section className="mt-6 pt-5 border-t border-rule">
            <h2 className="m-0 mb-1.5 text-[0.8125rem] font-medium">Other algorithms for this case</h2>
            <ul className="m-0 p-0 list-none flex flex-col" data-testid="alternatives">
              {entry.algs.map((option, i) => {
                const { preAuf: lead } = playableMoves(entry, i);
                return (
                  <li key={option.notation}>
                    <button
                      type="button"
                      aria-pressed={i === algIndex}
                      data-testid="alternative"
                      className={`w-full text-left flex items-baseline gap-3 px-2 py-1.5 rounded border-none bg-transparent row-hover ${i === algIndex ? 'text-ink' : 'text-graphite'}`}
                      onClick={() => setAlgIndex(i)}
                    >
                      <span className="notation text-[0.8125rem] flex-1">
                        {lead ? <span className="text-faint">({lead}) </span> : null}
                        {option.notation}
                      </span>
                      <span className="text-[0.75rem] text-faint whitespace-nowrap">{option.counts.stm} moves</span>
                      {i === algIndex ? <Check size={13} strokeWidth={1.8} /> : <span className="w-[13px]" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            className="btn"
            data-testid="detail-copy-alg"
            onClick={async () => {
              await copyText(`${preAuf ? `${preAuf} ` : ''}${alg.notation}`);
              pushToast({ message: 'Algorithm copied', durationMs: 1800 });
            }}
          >
            <Copy size={13} strokeWidth={1.6} />
            Copy algorithm
          </button>
        </div>
      </div>
    </div>
  );
}
