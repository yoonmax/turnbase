// Facts about cube states, as used to verify the algorithm library. A case is never
// taken on trust: its state is derived by running the algorithm backward, and what
// it claims is then checked against that state.

import { applyAlg, applyMove, applyMoves, centerIds, getCubeModel, solvedState, statesEqual, isSolved } from '../cube/CubeEngine.js';
import { invertMoves } from '../cube/CubeMoves.js';
import { parseMoves } from '../cube/CubeNotationParser.js';
import { CORNER_NAMES, EDGE_NAMES, toCubies } from '../cube/CubeState.js';

const SOLVED = solvedState(3);
const HOME_CENTERS = centerIds(SOLVED).join();
const faceOf = (stickerId) => Math.floor(stickerId / 9);
const FACE = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
const at = (face, row, col) => FACE[face] * 9 + row * 3 + col;

const ROTATION_ALGS = [
  '', 'y', 'y2', "y'",
  'x', 'x y', 'x y2', "x y'",
  "x'", "x' y", "x' y2", "x' y'",
  'x2', 'x2 y', 'x2 y2', "x2 y'",
  'z', 'z y', 'z y2', "z y'",
  "z'", "z' y", "z' y2", "z' y'",
];
const ROTATIONS = ROTATION_ALGS.map((alg) => (alg ? parseMoves(alg) : []));

export const U_MOVES = ['', 'U', 'U2', "U'"].map((alg) => (alg ? parseMoves(alg) : []));

/**
 * The state an algorithm solves: its inverse applied to a solved cube, starting from
 * whichever cube orientation leaves the centers at home. That way an algorithm with
 * a net rotation in it, such as a y or an uneven slice, still shows the case in the
 * standard orientation, and applying it really does end in a solved cube.
 */
export function caseStateFor(moves) {
  const inverse = invertMoves(moves);
  for (const rotation of ROTATIONS) {
    const state = applyMoves(applyMoves(SOLVED, rotation), inverse);
    if (centerIds(state).join() === HOME_CENTERS) return state;
  }
  throw new Error('No orientation leaves the centers at home.');
}

// Reads colors relative to the current centers, so a rotated cube reads the same.
function colorReader(state) {
  const centers = {};
  for (const [face, index] of Object.entries(FACE)) centers[face] = faceOf(state[index * 9 + 4]);
  return { centers, colorAt: (face, row, col) => faceOf(state[at(face, row, col)]) };
}

export function crossSolved(state) {
  const { centers, colorAt } = colorReader(state);
  const dEdges = [[0, 1, 'F'], [1, 0, 'L'], [1, 2, 'R'], [2, 1, 'B']];
  return dEdges.every(([r, c, side]) => colorAt('D', r, c) === centers.D && colorAt(side, 2, 1) === centers[side]);
}

export function firstLayerSolved(state) {
  const { centers, colorAt } = colorReader(state);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) if (colorAt('D', r, c) !== centers.D) return false;
  for (const side of ['F', 'R', 'B', 'L']) {
    for (let c = 0; c < 3; c += 1) if (colorAt(side, 2, c) !== centers[side]) return false;
  }
  return true;
}

export function f2lSolved(state) {
  if (!firstLayerSolved(state)) return false;
  const { centers, colorAt } = colorReader(state);
  for (const side of ['F', 'R', 'B', 'L']) {
    if (colorAt(side, 1, 0) !== centers[side] || colorAt(side, 1, 2) !== centers[side]) return false;
  }
  return true;
}

export function lastLayerOriented(state) {
  const { centers, colorAt } = colorReader(state);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) if (colorAt('U', r, c) !== centers.U) return false;
  return true;
}

export function lastLayerEdgesOriented(state) {
  const { centers, colorAt } = colorReader(state);
  return [[0, 1], [1, 0], [1, 2], [2, 1]].every(([r, c]) => colorAt('U', r, c) === centers.U);
}

/** Solved, allowing a final turn of the U layer. */
export function solvedUpToAuf(state) {
  return U_MOVES.some((auf) => isSolved(applyMoves(state, auf)));
}

/** Corners sit in their correct relative positions, allowing a U turn. */
export function cornersPermutedUpToAuf(state) {
  return U_MOVES.some((auf) => {
    const cubies = toCubies(applyMoves(state, auf));
    return cubies && [0, 1, 2, 3].every((i) => cubies.cp[i] === i);
  });
}

/** Whether named cubies (URF, DF, FR...) are home. Faces may be listed in any order. */
export function piecesHome(state, names) {
  const cubies = toCubies(state);
  if (!cubies) return false;
  const sorted = (s) => s.split('').sort().join('');
  return names.every((name) => {
    const key = sorted(name);
    if (name.length === 2) {
      const i = EDGE_NAMES.findIndex((n) => sorted(n) === key);
      return cubies.ep[i] === i && cubies.eo[i] === 0;
    }
    const i = CORNER_NAMES.findIndex((n) => sorted(n) === key);
    return cubies.cp[i] === i && cubies.co[i] === 0;
  });
}

// ─── Last-layer fingerprints ──────────────────────────

const U_RING = [
  ['U', 0, 0], ['U', 0, 1], ['U', 0, 2], ['U', 1, 2], ['U', 2, 2], ['U', 2, 1], ['U', 2, 0], ['U', 1, 0],
];
const SIDE_RING = ['B', 'R', 'F', 'L'];

/**
 * The orientation pattern as seen from above: which of the 20 top-layer stickers show
 * the U color. Canonical up to a turn of the U layer, so two states with the same
 * fingerprint are the same OLL case.
 */
export function ollFingerprint(state) {
  const { centers } = colorReader(state);
  const read = (s) => {
    const { colorAt: c } = colorReader(s);
    const top = U_RING.map(([f, r, col]) => (c(f, r, col) === centers.U ? '1' : '0')).join('');
    const sides = SIDE_RING.map((side) => [0, 1, 2].map((col) => (c(side, 0, col) === centers.U ? '1' : '0')).join('')).join('');
    return `${top}|${sides}`;
  };
  return U_MOVES.map((auf) => read(applyMoves(state, auf))).sort()[0];
}

/** Edge shape on top: 'dot', 'line', 'l' or 'cross'. */
export function edgeShape(state) {
  const { centers, colorAt } = colorReader(state);
  const up = [[0, 1], [1, 2], [2, 1], [1, 0]].map(([r, c]) => colorAt('U', r, c) === centers.U);
  const count = up.filter(Boolean).length;
  if (count === 4) return 'cross';
  if (count === 0) return 'dot';
  if (count === 2) return (up[0] && up[2]) || (up[1] && up[3]) ? 'line' : 'l';
  return 'illegal';
}

export function orientedCornerCount(state) {
  const { centers, colorAt } = colorReader(state);
  return [[0, 0], [0, 2], [2, 0], [2, 2]].filter(([r, c]) => colorAt('U', r, c) === centers.U).length;
}

// Which piece sits in each top slot, relative to the U-layer turn that aligns it.
function topPermutation(state) {
  const cubies = toCubies(state);
  if (!cubies) return null;
  return { corners: cubies.cp.slice(0, 4), edges: cubies.ep.slice(0, 4) };
}

function cycleType(permutation) {
  const seen = new Set();
  const cycles = [];
  permutation.forEach((_, start) => {
    if (seen.has(start)) return;
    let length = 0;
    for (let i = start; !seen.has(i); i = permutation[i]) {
      seen.add(i);
      length += 1;
    }
    if (length > 1) cycles.push(length);
  });
  return cycles.sort((a, b) => b - a).join('+');
}

/**
 * The permutation a PLL state needs, as the cycle sizes for corners and edges, for
 * whichever U-layer turn makes the case simplest. `corners:3`, for instance, is a
 * 3-cycle of corners with all edges in place.
 */
export function pllPieces(state) {
  let best = null;
  for (const auf of U_MOVES) {
    const perm = topPermutation(applyMoves(state, auf));
    if (!perm) return null;
    const corners = cycleType(perm.corners);
    const edges = cycleType(perm.edges);
    const parts = [];
    if (corners) parts.push(`corners:${corners}`);
    if (edges) parts.push(`edges:${edges}`);
    const moved = perm.corners.filter((p, i) => p !== i).length + perm.edges.filter((p, i) => p !== i).length;
    // On a tie, shorter cycles: a G perm reads as two 3-cycles, not a 2-cycle and a 4-cycle.
    const longest = Math.max(...`${corners}+${edges}`.split('+').map((n) => Number(n) || 0));
    if (!best || moved < best.moved || (moved === best.moved && longest < best.longest)) {
      best = { moved, longest, text: parts.join(' ') };
    }
  }
  return best.text;
}

/**
 * Where each misplaced last-layer piece has to go: the arrows on a PLL diagram. Slots are
 * 0-3 in cubie order, UR UF UL UB for edges and URF UFL ULB UBR for corners.
 */
export function pllArrows(state) {
  const cubies = toCubies(state);
  if (!cubies) return { edges: [], corners: [] };
  const read = (pieces) => {
    const out = [];
    for (let slot = 0; slot < 4; slot += 1) {
      if (pieces[slot] !== slot && pieces[slot] < 4) out.push({ from: slot, to: pieces[slot] });
    }
    return out;
  };
  return { edges: read(cubies.ep), corners: read(cubies.cp) };
}

/** Sticker colors on the four sides, relative to a chosen U-turn: a PLL's identity. */
function pllSides(state) {
  const { centers, colorAt } = colorReader(state);
  const order = [centers.B, centers.R, centers.F, centers.L];
  const name = (color) => order.indexOf(color);
  return SIDE_RING.map((side) => [0, 1, 2].map((c) => name(colorAt(side, 0, c))).join('')).join('');
}

/**
 * Canonical up to both a turn of the U layer and a recoloring by that turn, so two
 * states share this fingerprint exactly when they are the same PLL case.
 */
export function pllFingerprint(state) {
  const options = [];
  for (const first of U_MOVES) {
    for (const second of U_MOVES) {
      const rotated = applyMoves(applyMoves(state, first), second);
      options.push(pllSides(rotated));
    }
  }
  // Rotate the whole picture, too: the case does not depend on how it is held.
  const canonicalize = (sides) => {
    const shifts = [];
    for (let k = 0; k < 4; k += 1) {
      const rotated = sides.slice(k * 3) + sides.slice(0, k * 3);
      shifts.push(rotated.replace(/\d/g, (d) => String((Number(d) - k + 4) % 4)));
    }
    return shifts.sort()[0];
  };
  return options.map(canonicalize).sort()[0];
}

/** Side patterns a human looks for: how many headlights and full bars are visible. */
export function sidePatterns(state) {
  const { colorAt } = colorReader(state);
  let headlights = 0;
  let bars = 0;
  for (const side of SIDE_RING) {
    const [a, b, c] = [colorAt(side, 0, 0), colorAt(side, 0, 1), colorAt(side, 0, 2)];
    if (a === b && b === c) bars += 1;
    else if (a === c) headlights += 1;
  }
  return { headlights, bars };
}

// ─── Algorithm checks ─────────────────────────────────

/**
 * Finds the U-turn (if any) that makes an algorithm work from a given state.
 * Returns the turn's notation, or null. Alternatives are often written for a
 * different angle of the same case, which is what this accounts for.
 */
export function preAufFor(state, moves, works) {
  for (const auf of U_MOVES) {
    const result = applyMoves(applyMoves(state, auf), moves);
    if (works(result)) return auf.map((m) => m.text).join(' ');
  }
  return null;
}

/** Does this algorithm take the case state to the case's goal? */
export function checkOllAlgorithm(caseState, moves) {
  const pre = preAufFor(caseState, moves, (s) => f2lSolved(s) && lastLayerOriented(s));
  return { ok: pre !== null, preAuf: pre };
}

export function checkPllAlgorithm(caseState, moves) {
  const pre = preAufFor(caseState, moves, (s) => solvedUpToAuf(s));
  return { ok: pre !== null, preAuf: pre };
}
