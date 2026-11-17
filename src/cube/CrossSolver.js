// Optimal cross and X-cross solutions for a 3×3 scramble, for planning practice.
//
// Every search runs with the chosen cross on D. A different cross color, or a different
// F2L slot, is reached by conjugating the scramble with a whole-cube rotation, so one set
// of tables covers all of them. Solutions are written in the frame the solver sees after
// the rotation that brings the cross to the bottom (for example "z2" for a white cross),
// which is how cubers hold the cube during inspection.
//
// Pieces are tracked one by one as slot * orientations + twist. Move tables for single
// pieces come from the canonical engine, so they cannot disagree with it.

import { applyMoves, getCubeModel, solvedState } from './CubeEngine.js';
import { makeMove } from './CubeMoves.js';
import { parseMoves } from './CubeNotationParser.js';
import { toCubies } from './CubeState.js';

const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
const AMOUNTS = [1, 2, -1];
const MOVES = FACES.flatMap((family) => AMOUNTS.map((amount) => makeMove('face', family, amount)));
const MOVE_COUNT = MOVES.length; // 18
const OPPOSITE = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

// Edge slots: UR UF UL UB DR DF DL DB FR FL BL BR. Corner slots: URF UFL ULB UBR DFR DLF DBL DRB.
const CROSS_EDGES = [4, 5, 6, 7];
const SLOTS = [
  { id: 'FR', edge: 8, corner: 4 },
  { id: 'FL', edge: 9, corner: 5 },
  { id: 'BL', edge: 10, corner: 6 },
  { id: 'BR', edge: 11, corner: 7 },
];

// ─── Single-piece move tables ─────────────────────────

let tables = null;

function moveTables() {
  if (tables) return tables;
  const edge = new Uint8Array(24 * MOVE_COUNT);
  const corner = new Uint8Array(24 * MOVE_COUNT);
  MOVES.forEach((move, m) => {
    // In the solved state each piece sits in its own slot, so after one move ep[s] names
    // the slot a piece came from, and eo[s] the flip it picked up on the way.
    const { cp, co, ep, eo } = toCubies(applyMoves(solvedState(3), [move]));
    for (let to = 0; to < 12; to += 1) {
      for (let flip = 0; flip < 2; flip += 1) edge[(ep[to] * 2 + flip) * MOVE_COUNT + m] = to * 2 + ((flip + eo[to]) % 2);
    }
    for (let to = 0; to < 8; to += 1) {
      for (let twist = 0; twist < 3; twist += 1) corner[(cp[to] * 3 + twist) * MOVE_COUNT + m] = to * 3 + ((twist + co[to]) % 3);
    }
  });
  tables = { edge, corner };
  return tables;
}

// ─── Pruning tables ───────────────────────────────────
// Cross: the four D edges, each 0..23, as a base-24 number. X-cross adds the slot's corner
// and, separately, the slot's edge, as a fifth digit. Unreached entries hold 255.

let pruning = null;

function bfs(size, start, digits, apply) {
  const dist = new Uint8Array(size).fill(255);
  let frontier = new Uint32Array([start]);
  dist[start] = 0;
  let depth = 0;
  const piece = new Uint8Array(digits);
  while (frontier.length) {
    const next = [];
    for (let k = 0; k < frontier.length; k += 1) {
      let index = frontier[k];
      for (let d = digits - 1; d >= 0; d -= 1) {
        piece[d] = index % 24;
        index = (index - piece[d]) / 24;
      }
      for (let m = 0; m < MOVE_COUNT; m += 1) {
        let child = 0;
        for (let d = 0; d < digits; d += 1) child = child * 24 + apply(d, piece[d], m);
        if (dist[child] === 255) {
          dist[child] = depth + 1;
          next.push(child);
        }
      }
    }
    frontier = Uint32Array.from(next);
    depth += 1;
  }
  return dist;
}

const SOLVED_CROSS = CROSS_EDGES.reduce((index, e) => index * 24 + e * 2, 0);
const SLOT = SLOTS[0];

function pruningTables() {
  if (pruning) return pruning;
  const { edge, corner } = moveTables();
  const onEdge = (_d, p, m) => edge[p * MOVE_COUNT + m];
  const cross = bfs(24 ** 4, SOLVED_CROSS, 4, onEdge);
  const withCorner = bfs(24 ** 5, SOLVED_CROSS * 24 + SLOT.corner * 3, 5, (d, p, m) => (d === 4 ? corner[p * MOVE_COUNT + m] : edge[p * MOVE_COUNT + m]));
  const withEdge = bfs(24 ** 5, SOLVED_CROSS * 24 + SLOT.edge * 2, 5, onEdge);
  pruning = { cross, withCorner, withEdge };
  return pruning;
}

/** Builds the tables ahead of the first search, which otherwise pays for them. */
export function prepareCrossSolver() {
  pruningTables();
}

// ─── Search ───────────────────────────────────────────

function searchAll(start, depthOf, step, { max = 3, limit = 12 } = {}) {
  const path = [];
  const found = [];
  const dfs = (state, depth, lastFace) => {
    const h = depthOf(state);
    if (h > depth) return;
    if (h === 0 && depth === 0) {
      found.push(path.slice());
      return;
    }
    if (depth === 0) return;
    for (let m = 0; m < MOVE_COUNT; m += 1) {
      const face = (m / 3) | 0;
      if (face === lastFace) continue;
      // Opposite faces commute: try them in one order only.
      if (lastFace >= 0 && FACES[face] === OPPOSITE[FACES[lastFace]] && face < lastFace) continue;
      path.push(m);
      dfs(step(state, m), depth - 1, face);
      path.pop();
      if (found.length >= max) return;
    }
  };
  for (let depth = 0; depth <= limit; depth += 1) {
    dfs(start, depth, -1);
    if (found.length) return found.map((moves) => moves.map((m) => MOVES[m]));
  }
  return [];
}

function solveCrossPieces(pieces, options) {
  const { edge } = moveTables();
  const { cross } = pruningTables();
  const start = pieces.reduce((index, p) => index * 24 + p, 0);
  const step = (index, m) => {
    let out = 0;
    for (let d = 3; d >= 0; d -= 1) {
      const p = index % 24;
      index = (index - p) / 24;
      out += edge[p * MOVE_COUNT + m] * 24 ** (3 - d);
    }
    return out;
  };
  return searchAll(start, (i) => cross[i], step, options);
}

function solveXCrossPieces(crossPieces, slotEdge, slotCorner, options) {
  const { edge, corner } = moveTables();
  const { withCorner, withEdge } = pruningTables();
  // State: [cross index, slot edge, slot corner].
  const start = [crossPieces.reduce((index, p) => index * 24 + p, 0), slotEdge, slotCorner];
  const step = ([crossIndex, e, c], m) => {
    let out = 0;
    let index = crossIndex;
    for (let d = 3; d >= 0; d -= 1) {
      const p = index % 24;
      index = (index - p) / 24;
      out += edge[p * MOVE_COUNT + m] * 24 ** (3 - d);
    }
    return [out, edge[e * MOVE_COUNT + m], corner[c * MOVE_COUNT + m]];
  };
  const depthOf = ([crossIndex, e, c]) => Math.max(withCorner[crossIndex * 24 + c], withEdge[crossIndex * 24 + e]);
  return searchAll(start, depthOf, step, options);
}

// ─── Orientation ──────────────────────────────────────

const rot = (family, amount) => makeMove('rotation', family, amount);

// The rotation that brings each face of the scrambled cube to the bottom.
export const CROSS_ROTATIONS = {
  D: [],
  U: [rot('z', 2)],
  F: [rot('x', -1)],
  B: [rot('x', 1)],
  R: [rot('z', 1)],
  L: [rot('z', -1)],
};

const inverse = (moves) => moves.slice().reverse().map((m) => ({ ...m, amount: m.amount === 2 ? 2 : -m.amount }));

// Rotating the whole cube by y moves the side faces F → L → B → R → F.
const Y_FACE = { U: 'U', D: 'D', F: 'L', L: 'B', B: 'R', R: 'F' };

function relabel(moves, quarters) {
  return moves.map((move) => {
    let family = move.family;
    for (let i = 0; i < quarters; i += 1) family = Y_FACE[family];
    return makeMove('face', family, move.amount);
  });
}

/** Pieces of a state, read in the frame where `rotation` has been done first. */
function piecesAfter(scrambleMoves, rotation) {
  // Conjugation: r⁻¹ S r is S with every face renamed to where r sends it.
  const state = applyMoves(solvedState(3), [...inverse(rotation), ...scrambleMoves, ...rotation]);
  const cubies = toCubies(state);
  if (!cubies) return null;
  const edgeAt = new Array(12);
  const cornerAt = new Array(8);
  cubies.ep.forEach((piece, slot) => {
    edgeAt[piece] = slot * 2 + cubies.eo[slot];
  });
  cubies.cp.forEach((piece, slot) => {
    cornerAt[piece] = slot * 3 + cubies.co[slot];
  });
  return { edgeAt, cornerAt };
}

const toText = (moves) => moves.map((m) => m.text).join(' ');

/**
 * The shortest cross for the face `bottom` of the scrambled cube (in scramble orientation)
 * and the shortest X-cross for each slot. Returns null if the scramble cannot be read.
 */
export function solveCross(scramble, { bottom = 'D', xcross = true, max = 3 } = {}) {
  let scrambleMoves;
  try {
    scrambleMoves = typeof scramble === 'string' ? parseMoves(scramble, { n: 3 }) : scramble;
  } catch {
    return null;
  }
  const rotation = CROSS_ROTATIONS[bottom];
  const base = piecesAfter(scrambleMoves, rotation);
  if (!base) return null;

  const crossSolutions = solveCrossPieces(CROSS_EDGES.map((e) => base.edgeAt[e]), { max });
  const result = {
    bottom,
    rotation: toText(rotation),
    cross: { moves: crossSolutions.map(toText), length: crossSolutions[0]?.length ?? 0 },
    xcross: [],
  };
  if (!xcross) return result;

  // Each slot is turned to the front right with y turns, solved there, and renamed back.
  result.xcross = SLOTS.map((slot, k) => {
    const yTurns = k === 0 ? [] : [rot('y', k === 2 ? 2 : k === 1 ? -1 : 1)];
    const pieces = piecesAfter(scrambleMoves, [...rotation, ...yTurns]);
    const found = solveXCrossPieces(CROSS_EDGES.map((e) => pieces.edgeAt[e]), pieces.edgeAt[SLOT.edge], pieces.cornerAt[SLOT.corner], { max });
    const quarters = { 0: 0, 1: 1, 2: 2, 3: 3 }[k];
    const named = found.map((moves) => relabel(moves, quarters));
    return { slot: slot.id, moves: named.map(toText), length: named[0]?.length ?? 0 };
  });
  result.xcross.sort((a, b) => a.length - b.length);
  return result;
}

// ─── Checking a plan ──────────────────────────────────

const NORMAL = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };

/** Whether every sticker of the pieces at these slots (such as "DF" or "DFR") matches its center. */
export function slotsSolved(state, slots) {
  const model = getCubeModel(3);
  const colorAt = (pos, face) => Math.floor(state[model.stickerAt(pos, NORMAL[face])] / model.perFace);
  const center = (face) => colorAt(NORMAL[face].map((c) => c * 2), face);
  return slots.every((name) => {
    const faces = name.split('');
    const pos = [0, 1, 2].map((a) => faces.reduce((sum, f) => sum + NORMAL[f][a] * 2, 0));
    return faces.every((f) => colorAt(pos, f) === center(f));
  });
}

export const CROSS_SLOTS = ['DF', 'DR', 'DB', 'DL'];
export const PAIR_SLOTS = { FR: ['FR', 'DFR'], FL: ['FL', 'DFL'], BL: ['BL', 'DBL'], BR: ['BR', 'DBR'] };

/**
 * What a planned sequence achieves, done after the scramble and the cross rotation:
 * { ok, cross, pairs, length }, or { ok: false, error } if it cannot be read.
 */
export function checkPlan(scramble, bottom, planText) {
  let plan;
  try {
    plan = parseMoves(planText, { n: 3 });
  } catch (error) {
    return { ok: false, error: error.message };
  }
  const state = applyMoves(solvedState(3), [...parseMoves(scramble, { n: 3 }), ...CROSS_ROTATIONS[bottom], ...plan]);
  // Rotations in the plan move the cross away from D; read whichever face holds it.
  const cross = slotsSolved(state, CROSS_SLOTS);
  const pairs = cross ? Object.keys(PAIR_SLOTS).filter((slot) => slotsSolved(state, PAIR_SLOTS[slot])) : [];
  return { ok: true, cross, pairs, length: plan.filter((m) => m.kind !== 'rotation').length };
}
