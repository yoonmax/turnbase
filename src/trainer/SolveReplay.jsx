import { useMemo } from 'react';
import { applyMoves, solvedState } from '../cube/CubeEngine.js';
import { parseAlgorithm, parseMoves } from '../cube/CubeNotationParser.js';
import { CubeScene } from '../cube/CubeScene.jsx';
import { MoveTimeline, PlayerControls } from '../cube/PlayerControls.jsx';
import { countTurns, longestPauses, turnsPerSecond } from '../cube/VirtualSolveSession.js';
import { useCubeController, useSequencePlayer } from '../hooks/useCube.js';
import { formatMs } from '../utils/format.js';

const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4];

/** Plays back a recorded virtual solve, with its original timing at 1×. */
export default function SolveReplay({ solve }) {
  const data = useMemo(() => {
    const parsed = parseAlgorithm(solve.scramble);
    const base = parsed.ok ? applyMoves(solvedState(), parsed.moves) : solvedState();
    const moves = parseMoves(solve.moves.map((e) => e.m).join(' '));
    return { base, moves, timeline: solve.moves.map((e) => e.t) };
  }, [solve]);
  const controller = useCubeController({ state: data.base });
  const { player, snapshot } = useSequencePlayer(controller, { baseState: data.base, moves: data.moves, timeline: data.timeline });
  const pauses = useMemo(() => longestPauses(solve.moves), [solve]);
  const tps = turnsPerSecond(solve.moves, solve.rawMs);

  return (
    <div className="flex flex-col gap-3" data-testid="solve-replay">
      <h3 className="m-0 text-[0.8125rem] font-medium">Replay</h3>
      <dl className="m-0 flex flex-wrap gap-x-6 gap-y-1 text-[0.8125rem]">
        <div>
          <dt className="inline text-graphite">Moves </dt>
          <dd className="inline m-0 notation" data-testid="replay-moves">{countTurns(solve.moves)}</dd>
        </div>
        <div>
          <dt className="inline text-graphite">Turns per second </dt>
          <dd className="inline m-0 notation" data-testid="replay-tps">{tps.toFixed(2)}</dd>
        </div>
        {pauses.length ? (
          <div>
            <dt className="inline text-graphite">Longest pause </dt>
            <dd className="inline m-0 notation">{formatMs(pauses[0].ms, 2)}s</dd>
          </div>
        ) : null}
      </dl>
      <CubeScene controller={controller} className="h-64" minHeight={220} testId="replay-canvas" />
      <MoveTimeline player={player} snapshot={snapshot} moves={data.moves} compact />
      <PlayerControls player={player} snapshot={snapshot} speeds={REPLAY_SPEEDS} keyboard={false} />
    </div>
  );
}
