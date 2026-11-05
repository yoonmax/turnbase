import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { applyMoves, solvedState } from '../cube/CubeEngine.js';
import { parseAlgorithm } from '../cube/CubeNotationParser.js';
import { getPuzzle } from './PuzzleRegistry.js';
import { CubeNet } from './CubeNet.jsx';
import { Modal } from '../components/Modal.jsx';
import { loadTwisty } from './ScrambleService.js';

const ScrambleViewer = lazy(() => import('../cube/ScrambleViewer.jsx'));

/** cubing.js draws the puzzles turnbase has no engine for. */
export function TwistyDiagram({ puzzle, scramble, size = 170 }) {
  const host = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let player = null;
    loadTwisty()
      .then(({ TwistyPlayer }) => {
        if (cancelled || !host.current) return;
        player = new TwistyPlayer({
          puzzle,
          alg: scramble,
          visualization: '2D',
          controlPanel: 'none',
          background: 'none',
          hintFacelets: 'none',
        });
        player.style.width = `${size}px`;
        player.style.height = `${Math.round(size * 0.78)}px`;
        host.current.replaceChildren(player);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      player?.remove();
    };
  }, [puzzle, scramble, size]);

  if (failed) return <p className="m-0 text-[0.8125rem] text-graphite">The diagram did not load.</p>;
  return <div ref={host} data-testid="twisty-diagram" style={{ width: size, minHeight: Math.round(size * 0.78) }} />;
}

export function scrambleState(puzzle, text) {
  if (!puzzle.cube || !text) return null;
  const parsed = parseAlgorithm(text, { n: puzzle.cube });
  if (!parsed.ok) return null;
  return applyMoves(solvedState(puzzle.cube), parsed.moves, puzzle.cube);
}

/** Small diagram of a scramble. Click it to open the full viewer. */
export function ScramblePreview({ puzzleId, text, width = 168 }) {
  const puzzle = getPuzzle(puzzleId);
  const [open, setOpen] = useState(false);
  const state = useMemo(() => scrambleState(puzzle, text), [puzzle, text]);

  if (!text) return <div style={{ width, height: width * 0.75 }} />;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block p-0 bg-transparent border-none rounded-md"
        aria-label="Open this scramble on the cube"
        title="Open this scramble on the cube"
        data-testid="scramble-preview"
      >
        {puzzle.cube ? <CubeNet state={state} n={puzzle.cube} width={width} title="Scramble diagram" /> : <TwistyDiagram puzzle={puzzle.twisty} scramble={text} size={width} />}
      </button>
      <ScrambleViewerModal open={open} onClose={() => setOpen(false)} puzzleId={puzzleId} text={text} />
    </>
  );
}

export function ScrambleViewerModal({ open, onClose, puzzleId, text }) {
  const puzzle = getPuzzle(puzzleId);
  return (
    <Modal open={open} onClose={onClose} title="Scramble" width={puzzle.cube ? '52rem' : '34rem'} testId="scramble-viewer">
      {!open ? null : puzzle.cube ? (
        <Suspense fallback={<div className="h-80 flex items-center justify-center text-graphite text-[0.8125rem]">Loading the cube</div>}>
          <ScrambleViewer text={text} n={puzzle.cube} />
        </Suspense>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <TwistyDiagram puzzle={puzzle.twisty} scramble={text} size={420} />
          <p className="notation text-[0.8125rem] leading-relaxed text-center m-0 whitespace-pre-line">{text}</p>
        </div>
      )}
    </Modal>
  );
}
