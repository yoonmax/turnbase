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

// The physical keyboard, by position. Moves are bound to positions, so a preset works the
// same whatever layout the computer is set to; the layout only changes the printed letters.
export const KEYBOARD_ROWS = [
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
];

// What each layout prints on those positions, row by row.
export const LAYOUT_LABELS = {
  qwerty: ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL;', 'ZXCVBNM,./'],
  dvorak: ['1234567890', "',.PYFGCRL", 'AOEUIDHTNS', ';QJKXBMWVZ'],
  colemak: ['1234567890', 'QWFPGJLUY;', 'ARSTDHNEIO', 'ZXCVBKM,./'],
};

const LABEL_BY_CODE = Object.fromEntries(
  Object.entries(LAYOUT_LABELS).map(([layout, rows]) => [
    layout,
    Object.fromEntries(KEYBOARD_ROWS.flatMap((codes, r) => codes.map((code, c) => [code, rows[r][c]]))),
  ]),
);

const OTHER_KEYS = { Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', Backslash: '\\' };

export function keyLabel(code, layout = 'qwerty') {
  return LABEL_BY_CODE[layout]?.[code] ?? LABEL_BY_CODE.qwerty[code] ?? OTHER_KEYS[code] ?? code.replace(/^Key|^Digit/, '');
}

export function comboLabel(combo, layout = 'qwerty') {
  return combo
    .split('+')
    .map((part) => (part === 'Alt' || part === 'Shift' ? part : keyLabel(part, layout)))
    .join(' + ');
}

// The standard virtual-cube layout: both hands on the home row, one key per move. Row by
// row, matching KEYBOARD_ROWS. Empty strings are keys with no move.
const STANDARD_GRID = [
  ["S'", 'E', '', '', 'M', 'M', '', '', "E'", 'S'],
  ["z'", 'B', "L'", "Lw'", 'x', 'x', 'Rw', 'R', "B'", 'z'],
  ["y'", 'D', 'L', "U'", "F'", 'F', 'U', "R'", "D'", 'y'],
  ['Dw', "M'", "Uw'", 'Lw', "x'", "x'", "Rw'", 'Uw', "M'", "Dw'"],
];

const STANDARD_BINDINGS = Object.fromEntries(
  KEYBOARD_ROWS.flatMap((codes, r) => codes.map((code, c) => [code, STANDARD_GRID[r][c]])).filter(([, move]) => move),
);

const preset = (id) => ({
  id,
  name: id,
  layout: id,
  description: `For a ${id} keyboard. Both hands rest on the home row, every key is one move, and pressing a key twice makes a double turn.`,
  builtIn: true,
  bindings: STANDARD_BINDINGS,
});

export const BUILT_IN_PROFILES = {
  qwerty: preset('qwerty'),
  dvorak: preset('dvorak'),
  colemak: preset('colemak'),
};

export const DEFAULT_PROFILE_ID = 'qwerty';

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
