// Cubie-level reading of a 3×3 state: corner and edge permutation and orientation,
// whole-cube orientation, and the legality check that proves a state is reachable.

import { applyMove, applyMoves, centerIds, getCubeModel, solvedState } from './CubeEngine.js';
import { makeMove } from './CubeMoves.js';

const NORMAL = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };

function slotPosition(faces) {
  const pos = [0, 0, 0];
  for (const f of faces) {
    const v = NORMAL[f];
    pos[0] += v[0] * 2;
    pos[1] += v[1] * 2;
    pos[2] += v[2] * 2;
  }
  return pos;
}

function slotStickers(name) {
  const model = getCubeModel(3);
  const faces = name.split('');
  const pos = slotPosition(faces);
  return faces.map((f) => model.stickerAt(pos, NORMAL[f]));
}

// Corner facelets run clockwise starting from the U or D facelet.
export const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
export const EDGE_NAMES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

export const CORNER_STICKERS = CORNER_NAMES.map(slotStickers);
export const EDGE_STICKERS = EDGE_NAMES.map(slotStickers);

const cornerLookup = new Map();
CORNER_STICKERS.forEach((trio, piece) => {
  trio.forEach((id, twist) => cornerLookup.set(id, { piece, twist }));
});
const edgeLookup = new Map();
EDGE_STICKERS.forEach((pair, piece) => {
  pair.forEach((id, flip) => edgeLookup.set(id, { piece, flip }));
});

const rotationMoves = {
  x: makeMove('rotation', 'x', 1),
  y: makeMove('rotation', 'y', 1),
  z: makeMove('rotation', 'z', 1),
};

// All 24 orientations, each as a shortest sequence of rotations, found by search.
const ORIENTATIONS = (() => {
  const found = new Map();
  const start = solvedState(3);
  const queue = [{ state: start, moves: [] }];
  found.set(centerIds(start).join(), []);
  while (queue.length) {
    const { state, moves } = queue.shift();
    for (const axis of ['x', 'y', 'z']) {
      const nextState = applyMove(state, rotationMoves[axis]);
      const key = centerIds(nextState).join();
      if (!found.has(key)) {
        const nextMoves = [...moves, rotationMoves[axis]];
        found.set(key, nextMoves);
        queue.push({ state: nextState, moves: nextMoves });
      }
    }
  }
  return found;
})();

export const ORIENTATION_COUNT = ORIENTATIONS.size;

/**
 * Turns the whole cube so the centers are in their home positions. Rotations do
 * not alter how pieces relate, so this is the canonical form for comparisons.
 * Returns { state, rotation }, where rotation is the sequence applied.
 */
export function normalizeOrientation(state) {
  // Search over rotations for the one that sends centers home.
  const key = centerIds(state).join();
  const home = centerIds(solvedState(3)).join();
  if (key === home) return { state, rotation: [] };
  for (const rotation of ORIENTATIONS.values()) {
    const rotated = applyMoves(state, rotation);
    if (centerIds(rotated).join() === home) return { state: rotated, rotation };
  }
  return null; // Centers are not a rotation of the solved centers: illegal.
}

/**
 * Reads a state (in canonical orientation) as cubies.
 * cp[i]/co[i]: the corner in slot i and its twist. ep[i]/eo[i]: likewise for edges.
 * Returns null if the stickers in some slot do not form a real piece.
 */
export function toCubies(inputState) {
  const normalized = normalizeOrientation(inputState);
  if (!normalized) return null;
  const { state } = normalized;
  const cp = [];
  const co = [];
  for (const trio of CORNER_STICKERS) {
    const seen = trio.map((id) => cornerLookup.get(state[id]));
    if (seen.some((s) => !s) || new Set(seen.map((s) => s.piece)).size !== 1) return null;
    // Twist: which of the slot's facelets holds the piece's U/D sticker.
    const where = seen.findIndex((s) => s.twist === 0);
    // The other two must follow clockwise, or the piece has been mirrored.
    if (seen[(where + 1) % 3].twist !== 1 || seen[(where + 2) % 3].twist !== 2) return null;
    cp.push(seen[0].piece);
    co.push(where);
  }
  const ep = [];
  const eo = [];
  for (const pair of EDGE_STICKERS) {
    const seen = pair.map((id) => edgeLookup.get(state[id]));
    if (seen.some((s) => !s) || seen[0].piece !== seen[1].piece) return null;
    ep.push(seen[0].piece);
    eo.push(seen[0].flip);
  }
  return { cp, co, ep, eo };
}

function parity(perm) {
  const seen = new Array(perm.length).fill(false);
  let result = 0;
  for (let i = 0; i < perm.length; i += 1) {
    if (seen[i]) continue;
    let length = 0;
    for (let j = i; !seen[j]; j = perm[j]) {
      seen[j] = true;
      length += 1;
    }
    result ^= (length - 1) & 1;
  }
  return result;
}

/**
 * The three laws of the cube: corner and edge parity match, corner twists sum to
 * 0 mod 3, edge flips sum to 0 mod 2. A state passes exactly when it is reachable.
 */
export function legalityReport(state) {
  const cubies = toCubies(state);
  if (!cubies) return { legal: false, reason: 'pieces' };
  const { cp, co, ep, eo } = cubies;
  if (new Set(cp).size !== 8 || new Set(ep).size !== 12) return { legal: false, reason: 'duplicates' };
  if (co.reduce((a, b) => a + b, 0) % 3 !== 0) return { legal: false, reason: 'twist' };
  if (eo.reduce((a, b) => a + b, 0) % 2 !== 0) return { legal: false, reason: 'flip' };
  if (parity(cp) !== parity(ep)) return { legal: false, reason: 'parity' };
  return { legal: true, reason: null };
}

export function isLegal(state) {
  return legalityReport(state).legal;
}
