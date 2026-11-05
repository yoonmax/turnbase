// Input for the virtual cube: key profiles and the mapping from a drag on a sticker
// to a move. Everything here is pure, so it can be tested without a browser.

import { makeMove } from './CubeMoves.js';
import { parseAlgorithm } from './CubeNotationParser.js';

// ─── Keyboard ─────────────────────────────────────────

export const RESERVED_CODES = new Set(['Space', 'Enter', 'Tab', 'Escape', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

/** A key combination as a stable string, such as "Shift+KeyR". */
export function comboFromEvent(event) {
  const parts = [];
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(event.code);
  return parts.join('+');
}

export function comboLabel(combo) {
  return combo
    .split('+')
    .map((part) => {
      if (part.startsWith('Key')) return part.slice(3);
      if (part.startsWith('Digit')) return part.slice(5);
      return { Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', Backslash: '\\' }[part] ?? part;
    })
    .join(' + ');
}

function directBindings() {
  const out = {};
  const add = (key, move) => {
    out[key] = move;
    out[`Shift+${key}`] = `${move}'`;
    out[`Alt+${key}`] = `${move}2`;
  };
  for (const face of ['R', 'U', 'F', 'L', 'D', 'B']) add(`Key${face}`, face);
  add('KeyM', 'M');
  add('KeyE', 'E');
  add('KeyS', 'S');
  add('KeyX', 'x');
  add('KeyY', 'y');
  add('KeyZ', 'z');
  add('KeyT', 'r');
  add('KeyK', 'l');
  add('KeyI', 'u');
  add('KeyH', 'd');
  add('KeyG', 'f');
  add('KeyV', 'b');
  return out;
}

// A home-row layout in the style long used by virtual-cube solvers: index fingers
// turn R and L, and U is on the middle of each hand.
const SPEEDCUBER_BINDINGS = {
  KeyI: 'R', KeyK: "R'",
  KeyD: 'L', KeyE: "L'",
  KeyJ: 'U', KeyF: "U'",
  KeyH: 'F', KeyG: "F'",
  KeyS: 'D', KeyL: "D'",
  KeyW: 'B', KeyO: "B'",
  KeyU: 'r', KeyM: "r'",
  KeyV: 'l', KeyR: "l'",
  KeyX: "M'", Period: "M'",
  Digit5: 'M', Digit6: 'M',
  KeyT: 'x', KeyY: 'x',
  KeyB: "x'", KeyN: "x'",
  Semicolon: 'y', KeyA: "y'",
  KeyP: 'z', KeyQ: "z'",
  Comma: 'u', KeyC: "u'",
  KeyZ: 'd', Slash: "d'",
};

export const BUILT_IN_PROFILES = {
  direct: {
    id: 'direct',
    name: 'Direct',
    description: 'The key is the move: R turns R. Hold Shift for prime, Alt for a double turn.',
    builtIn: true,
    bindings: directBindings(),
  },
  speedcuber: {
    id: 'speedcuber',
    name: 'Home row',
    description: 'Both hands rest on the home row, for fast solving. Every key is one move.',
    builtIn: true,
    bindings: SPEEDCUBER_BINDINGS,
  },
};

/** The move a key event means under a profile, or null. */
export function moveForEvent(profile, event) {
  if (event.metaKey || event.ctrlKey) return null;
  const text = profile.bindings[comboFromEvent(event)];
  if (!text) return null;
  const parsed = parseAlgorithm(text);
  return parsed.ok && parsed.moves.length === 1 ? parsed.moves[0] : null;
}

/** Why a combination cannot be bound to a move, or null if it can. */
export function bindingProblem(profile, combo, moveText) {
  const code = combo.split('+').pop();
  if (RESERVED_CODES.has(code)) return { kind: 'reserved', message: `${comboLabel(combo)} is kept for playback and navigation.` };
  const existing = profile.bindings[combo];
  if (existing && existing !== moveText) return { kind: 'conflict', message: `${comboLabel(combo)} already turns ${existing}.`, with: existing };
  return null;
}

/** Every key that performs each move, for the reference overlay. */
export function bindingsByMove(profile) {
  const out = new Map();
  for (const [combo, move] of Object.entries(profile.bindings)) {
    if (!out.has(move)) out.set(move, []);
    out.get(move).push(combo);
  }
  return out;
}

/** Validates an imported profile, returning a clean copy. Throws on bad input. */
export function validateProfile(doc) {
  if (!doc || typeof doc !== 'object' || typeof doc.bindings !== 'object' || doc.bindings === null) {
    throw new Error('This file does not contain a key profile.');
  }
  const bindings = {};
  for (const [combo, move] of Object.entries(doc.bindings)) {
    const code = combo.split('+').pop();
    if (RESERVED_CODES.has(code)) throw new Error(`${comboLabel(combo)} cannot be bound.`);
    const parsed = parseAlgorithm(String(move));
    if (!parsed.ok || parsed.moves.length !== 1) throw new Error(`"${move}" is not a single move.`);
    bindings[combo] = parsed.moves[0].text;
  }
  return { name: String(doc.name ?? 'Imported').slice(0, 40), bindings };
}

// ─── Dragging on the cube ─────────────────────────────

const AXIS_VECTORS = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const FACE_BY_AXIS = [
  ['L', 'R'],
  ['D', 'U'],
  ['B', 'F'],
];
const SLICE_BY_AXIS = [
  { family: 'M', side: -1 },
  { family: 'E', side: -1 },
  { family: 'S', side: 1 },
];

/**
 * Turns a drag into a move. `sticker` has `pos` (doubled coordinates) and `normal`.
 * `project(point)` maps a cube-space point to screen pixels, and `drag` is the
 * pointer's displacement in pixels. The drag picks which of the sticker's two
 * in-plane directions it most resembles, and the layer turning that way moves.
 */
export function moveFromDrag({ sticker, n = 3, drag, project }) {
  const { normal, pos } = sticker;
  const tangents = AXIS_VECTORS.filter((axis) => axis.every((v, i) => v === 0 || normal[i] === 0));
  const origin = project(pos.map((c) => c / 2));
  let best = null;
  for (const tangent of tangents) {
    const tip = project(pos.map((c, i) => c / 2 + tangent[i]));
    const dir = [tip[0] - origin[0], tip[1] - origin[1]];
    const length = Math.hypot(dir[0], dir[1]) || 1;
    const along = (drag[0] * dir[0] + drag[1] * dir[1]) / length;
    if (!best || Math.abs(along) > Math.abs(best.along)) best = { tangent, along };
  }
  const direction = best.tangent.map((v) => v * Math.sign(best.along));
  // Rotating about n × t carries the surface point at n toward t.
  const axisVector = cross(normal, direction);
  const axis = axisVector.findIndex((v) => v !== 0);
  const quarter = axisVector[axis]; // Positive rotation about the +axis, or negative.
  const layer = (pos[axis] + (n - 1)) / 2;

  const middle = n % 2 === 1 && layer === (n - 1) / 2;
  if (middle && n === 3) {
    const { family, side } = SLICE_BY_AXIS[axis];
    return makeMove('slice', family, -side * quarter);
  }
  // Counted from whichever face is closer. Clockwise on a face is -side about the axis.
  const fromPositive = n - layer;
  const fromNegative = layer + 1;
  const usePositive = fromPositive <= fromNegative;
  const side = usePositive ? 1 : -1;
  const depth = usePositive ? fromPositive : fromNegative;
  const family = FACE_BY_AXIS[axis][usePositive ? 1 : 0];
  return makeMove('face', family, -side * quarter, { inner: depth, outer: depth });
}
