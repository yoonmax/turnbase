// Move vocabulary and geometry for N×N×N cubes.
//
// Coordinate frame: +x points right (R), +y points up (U), +z points at the
// viewer (F). Layers are indexed 0..n-1 along the positive axis, so on a 3×3
// x-layer 2 is the R face, 1 is M and 0 is L.
//
// "Clockwise" always means clockwise when looking at the named face from
// outside the cube, which is a negative rotation about an axis pointing out of
// that face. A move's `angle` is measured in quarter turns about the positive
// axis, using the right-hand rule.

export const AXIS = { x: 0, y: 1, z: 2 };

const FACES = {
  U: { axis: 1, side: 1 },
  D: { axis: 1, side: -1 },
  R: { axis: 0, side: 1 },
  L: { axis: 0, side: -1 },
  F: { axis: 2, side: 1 },
  B: { axis: 2, side: -1 },
};

// Slices follow a face: M follows L, E follows D, S follows F.
const SLICES = {
  M: { axis: 0, side: -1 },
  E: { axis: 1, side: -1 },
  S: { axis: 2, side: 1 },
};

// Rotations follow a face: x follows R, y follows U, z follows F.
const ROTATIONS = {
  x: { axis: 0, side: 1 },
  y: { axis: 1, side: 1 },
  z: { axis: 2, side: 1 },
};

/**
 * Builds a move object.
 * kind: 'face' | 'wide' | 'slice' | 'rotation'
 * family: the face, slice or rotation letter.
 * amount: signed quarter turns, normalized to -2, -1, 1 or 2.
 * outer/inner: for faces, the layers counted from the named face (1-based), so
 *   R is inner 1, outer 1; Rw is 1..2; 3Rw is 1..3; 2R is 2..2.
 */
export function makeMove(kind, family, amount, { inner = 1, outer = 1, notation = 'plain' } = {}) {
  return { kind, family, amount, inner, outer, notation, text: moveToString({ kind, family, amount, inner, outer, notation }) };
}

export function normalizeAmount(raw) {
  // R3 is R', R4 is nothing, R5 is R. A written half-turn direction (R2') stays.
  if (raw === 0) return 0;
  const sign = Math.sign(raw);
  const m = Math.abs(raw) % 4;
  if (m === 0) return 0;
  if (m === 2) return 2 * sign;
  return m === 1 ? sign : -sign;
}

export function moveToString(move) {
  const suffix = { 1: '', '-1': "'", 2: '2', '-2': "2'" }[move.amount] ?? '';
  if (move.kind === 'face') {
    if (move.inner === 1 && move.outer === 1) return `${move.family}${suffix}`;
    return `${move.inner}${move.family}${suffix}`;
  }
  if (move.kind === 'wide') {
    const prefix =
      move.inner > 1 ? `${move.inner}-${move.outer}` : move.outer > 2 ? `${move.outer}` : '';
    if (move.notation === 'lower' && !prefix) return `${move.family.toLowerCase()}${suffix}`;
    return `${prefix}${move.family}w${suffix}`;
  }
  return `${move.family}${suffix}`;
}

export function invertMove(move) {
  return makeMove(move.kind, move.family, -move.amount, move);
}

export function invertMoves(moves) {
  return moves.slice().reverse().map(invertMove);
}

export function withAmount(move, amount) {
  return makeMove(move.kind, move.family, amount, move);
}

/** Geometry of a move on an n-layered cube: which axis, layers and rotation. */
export function moveGeometry(move, n = 3) {
  let spec;
  let layers;
  if (move.kind === 'rotation') {
    spec = ROTATIONS[move.family];
    layers = Array.from({ length: n }, (_, i) => i);
  } else if (move.kind === 'slice') {
    spec = SLICES[move.family];
    layers = [(n - 1) / 2];
  } else {
    spec = FACES[move.family];
    layers = [];
    for (let depth = move.inner; depth <= move.outer; depth += 1) {
      layers.push(spec.side === 1 ? n - depth : depth - 1);
    }
  }
  // Clockwise seen from the +side is a negative rotation about the +axis.
  const quarter = -spec.side * move.amount;
  return { axis: spec.axis, layers, quarter };
}

/** Same moves on the same axis and layers merge: R R → R2, R R' → nothing. */
export function simplifyMoves(moves) {
  const out = [];
  for (const move of moves) {
    const last = out[out.length - 1];
    if (
      last &&
      last.kind === move.kind &&
      last.family === move.family &&
      last.inner === move.inner &&
      last.outer === move.outer
    ) {
      const total = normalizeAmount(last.amount + move.amount);
      out.pop();
      if (total !== 0) out.push(withAmount(move, total));
    } else {
      out.push(move);
    }
  }
  return out;
}

/** Common cubing move-count metrics. Rotations never count. */
export function moveCounts(moves) {
  const turning = moves.filter((m) => m.kind !== 'rotation');
  const htm = turning.reduce((sum, m) => sum + (m.kind === 'slice' ? 2 : 1), 0);
  const qtm = turning.reduce(
    (sum, m) => sum + Math.abs(m.amount) * (m.kind === 'slice' ? 2 : 1),
    0,
  );
  const stm = turning.length;
  const etm = moves.length;
  return { htm, qtm, stm, etm };
}

export function movesToString(moves) {
  return moves.map((m) => m.text).join(' ');
}

/** For reading: a half turn is the same either way, so R2' is shown as R2. */
export function movesToDisplay(moves) {
  return movesToString(moves).replace(/2'/g, '2');
}

export { FACES, SLICES, ROTATIONS };
