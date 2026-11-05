// The canonical cube engine: every scramble, algorithm, manual turn and diagram
// goes through these functions.
//
// A state is a Uint16Array with one entry per sticker position, holding the id of
// the sticker currently there. Sticker ids are positions on the solved cube, so
// a state is a permutation and cannot express an arrangement that rotating layers
// could not reach. Move permutations are derived from 3D geometry rather than
// written by hand, which rules out typos in move tables.

import { moveGeometry } from './CubeMoves.js';
import { parseMoves } from './CubeNotationParser.js';

export const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];

// As viewed from outside each face: where a sticker's column and row run.
const FACE_FRAMES = {
  U: { normal: [0, 1, 0], right: [1, 0, 0], down: [0, 0, 1] },
  R: { normal: [1, 0, 0], right: [0, 0, -1], down: [0, -1, 0] },
  F: { normal: [0, 0, 1], right: [1, 0, 0], down: [0, -1, 0] },
  D: { normal: [0, -1, 0], right: [1, 0, 0], down: [0, 0, -1] },
  L: { normal: [-1, 0, 0], right: [0, 0, 1], down: [0, -1, 0] },
  B: { normal: [0, 0, -1], right: [-1, 0, 0], down: [0, -1, 0] },
};

// Exact integer quarter turn about +axis (right-hand rule).
function rotateVec([x, y, z], axis) {
  if (axis === 0) return [x, -z, y];
  if (axis === 1) return [z, y, -x];
  return [-y, x, z];
}

function rotateTimes(v, axis, quarters) {
  let out = v;
  for (let i = 0; i < quarters; i += 1) out = rotateVec(out, axis);
  return out;
}

const models = new Map();

export function getCubeModel(n = 3) {
  if (models.has(n)) return models.get(n);
  const stickers = [];
  const index = new Map();
  const key = (pos, normal) => `${pos.join(',')}|${normal.join(',')}`;

  FACE_ORDER.forEach((face, faceIndex) => {
    const { normal, right, down } = FACE_FRAMES[face];
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) {
        // Doubled coordinates keep even cubes on integers: on a 3×3 each
        // component is -2, 0 or 2.
        const u = 2 * col - (n - 1);
        const v = 2 * row - (n - 1);
        const pos = [0, 1, 2].map((a) => normal[a] * (n - 1) + right[a] * u + down[a] * v);
        const id = stickers.length;
        stickers.push({ id, face, faceIndex, row, col, pos, normal });
        index.set(key(pos, normal), id);
      }
    }
  });

  const model = {
    n,
    stickers,
    count: stickers.length,
    perFace: n * n,
    stickerAt: (pos, normal) => index.get(key(pos, normal)),
    permCache: new Map(),
  };

  model.permutation = (axis, layers, quarter) => {
    const q = ((quarter % 4) + 4) % 4;
    const cacheKey = `${axis}|${layers.join('.')}|${q}`;
    const cached = model.permCache.get(cacheKey);
    if (cached) return cached;
    const coords = new Set(layers.map((l) => 2 * l - (n - 1)));
    const perm = new Uint16Array(stickers.length);
    for (const s of stickers) {
      if (coords.has(s.pos[axis])) {
        perm[s.id] = index.get(key(rotateTimes(s.pos, axis, q), rotateTimes(s.normal, axis, q)));
      } else {
        perm[s.id] = s.id;
      }
    }
    model.permCache.set(cacheKey, perm);
    return perm;
  };

  models.set(n, model);
  return model;
}

export function solvedState(n = 3) {
  const { count } = getCubeModel(n);
  const state = new Uint16Array(count);
  for (let i = 0; i < count; i += 1) state[i] = i;
  return state;
}

export function applyMove(state, move, n = 3) {
  const model = getCubeModel(n);
  const { axis, layers, quarter } = moveGeometry(move, n);
  const perm = model.permutation(axis, layers, quarter);
  const next = new Uint16Array(state.length);
  for (let i = 0; i < state.length; i += 1) next[perm[i]] = state[i];
  return next;
}

export function applyMoves(state, moves, n = 3) {
  let current = state;
  for (const move of moves) current = applyMove(current, move, n);
  return current;
}

/** Convenience for trusted notation. */
export function applyAlg(state, notation, n = 3) {
  return applyMoves(state, parseMoves(notation, { n }), n);
}

export function statesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export function stateKey(state) {
  return Array.prototype.join.call(state, ',');
}

/** Index of the home face (U R F D L B order) of the sticker at each position. */
export function faceletColors(state, n = 3) {
  const { perFace } = getCubeModel(n);
  const colors = new Uint8Array(state.length);
  for (let i = 0; i < state.length; i += 1) colors[i] = Math.floor(state[i] / perFace);
  return colors;
}

/** The six faces as rows of home-face letters, for diagrams and tests. */
export function faceletString(state, n = 3) {
  const colors = faceletColors(state, n);
  return Array.from(colors, (c) => FACE_ORDER[c]).join('');
}

/** Solved in any orientation: every face is one color. */
export function isSolved(state, n = 3) {
  const { perFace } = getCubeModel(n);
  for (let f = 0; f < 6; f += 1) {
    const first = Math.floor(state[f * perFace] / perFace);
    for (let i = 1; i < perFace; i += 1) {
      if (Math.floor(state[f * perFace + i] / perFace) !== first) return false;
    }
  }
  return true;
}

/** Sticker ids of the 3×3 centers, by position, in U R F D L B order. */
export function centerIds(state) {
  return [4, 13, 22, 31, 40, 49].map((i) => state[i]);
}
