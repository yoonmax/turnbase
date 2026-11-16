// How to reach a case from a solved cube, for setting it up by hand.
//
// The setup is the algorithm run backward, rewritten without whole-cube rotations so it
// can be done holding the cube still. Each move made after a rotation is translated into
// the physical move it really is, which the engine finds by comparing permutations rather
// than by a hand-written table. If wide or slice moves leave the centers turned, one
// rotation at the end brings the cube back to the orientation the diagram shows.

import { applyMoves, solvedState, statesEqual } from '../cube/CubeEngine.js';
import { invertMoves, makeMove, simplifyMoves } from '../cube/CubeMoves.js';
import { parseMoves } from '../cube/CubeNotationParser.js';
import { caseStateFor } from './AlgorithmValidator.js';

const SOLVED = solvedState(3);

const CANDIDATES = (() => {
  const out = [];
  for (const amount of [1, -1, 2]) {
    for (const face of ['U', 'D', 'R', 'L', 'F', 'B']) {
      out.push(makeMove('face', face, amount));
      out.push(makeMove('wide', face, amount, { inner: 1, outer: 2 }));
    }
    for (const slice of ['M', 'E', 'S']) out.push(makeMove('slice', slice, amount));
  }
  return out.map((move) => ({ move, state: applyMoves(SOLVED, [move]) }));
})();

const ROTATION_SEQUENCES = [
  '', 'x', "x'", 'x2', 'y', "y'", 'y2', 'z', "z'", 'z2',
  'x y', "x y'", 'x y2', "x' y", "x' y'", "x' y2", 'x2 y', "x2 y'", 'z y', "z y'", 'z y2', "z' y", "z' y'", "z' y2",
].map((text) => (text ? parseMoves(text) : []));

/** The same turns, with rotations folded into the faces they turn. */
export function withoutRotations(moves) {
  const physical = [];
  let frame = [];
  for (const move of moves) {
    if (move.kind === 'rotation') {
      frame = [...frame, move];
      continue;
    }
    if (!frame.length) {
      physical.push(move);
      continue;
    }
    // A move made after rotating is the move that does the same to a held-still cube.
    const target = applyMoves(SOLVED, [...frame, move, ...invertMoves(frame)]);
    const match = CANDIDATES.find((c) => statesEqual(c.state, target));
    if (!match) throw new Error(`No rotation-free form for ${move.text}`);
    physical.push(match.move);
  }
  return { moves: simplifyMoves(physical), rotation: frame };
}

/**
 * Moves that take a solved cube, held as the diagram shows it, to the case's start.
 * Returns { moves, finalRotation }, where finalRotation is empty unless the centers end
 * turned, and { all } joins them for display and playback.
 */
export function setupFor(entry) {
  const target = entry.caseState;
  for (const lead of ROTATION_SEQUENCES) {
    const { moves } = withoutRotations([...lead, ...invertMoves(entry.primary.moves)]);
    const reached = applyMoves(SOLVED, moves);
    for (const finish of ROTATION_SEQUENCES) {
      if (statesEqual(applyMoves(reached, finish), target)) {
        return { moves, finalRotation: finish, all: [...moves, ...finish] };
      }
    }
  }
  throw new Error(`No setup found for ${entry.id}`);
}

export { caseStateFor };
