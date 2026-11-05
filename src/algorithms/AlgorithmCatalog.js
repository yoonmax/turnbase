// The algorithm library as one list of cases. Case states come from the cube engine,
// so a diagram and its algorithm cannot disagree: the picture is the algorithm run
// backward from a solved cube.

import { BEGINNER, TWO_LOOK_OLL, TWO_LOOK_PLL } from '../data/algorithms/beginner.js';
import { F2L } from '../data/algorithms/f2l.js';
import { OLL } from '../data/algorithms/oll.js';
import { PLL } from '../data/algorithms/pll.js';
import { applyMoves } from '../cube/CubeEngine.js';
import { invertMoves, moveCounts, movesToString } from '../cube/CubeMoves.js';
import { parseMoves } from '../cube/CubeNotationParser.js';
import { caseStateFor, edgeShape, f2lSolved, lastLayerOriented, orientedCornerCount, pllPieces, sidePatterns, solvedUpToAuf, U_MOVES } from './AlgorithmValidator.js';

export const ALGORITHM_SETS = [
  { id: 'pll', name: 'PLL', method: 'CFOP', expected: 21, description: 'Permute the last layer.' },
  { id: 'oll', name: 'OLL', method: 'CFOP', expected: 57, description: 'Orient the last layer.' },
  { id: 'f2l', name: 'F2L', method: 'CFOP', expected: 41, description: 'Pair and insert a corner and edge in the front-right slot.' },
  { id: '2lo', name: '2-look OLL', method: 'Beginner CFOP', expected: 10, description: 'OLL in two steps: edges, then corners.' },
  { id: '2lp', name: '2-look PLL', method: 'Beginner CFOP', expected: 6, description: 'PLL in two steps: corners, then edges.' },
  { id: 'beginner', name: 'Beginner', method: 'Layer by layer', expected: 11, description: 'Solve the cube one layer at a time.' },
];

// Sets that turnbase does not include. They are named so nobody assumes otherwise.
export const UNAVAILABLE_SETS = ['COLL', 'CMLL', 'Winter Variation', 'ZBLL', 'Roux', '2×2 methods', 'Blindfolded commutators'];

function buildAlg(notation, source = 'community') {
  const moves = parseMoves(notation);
  return { notation, moves, source, counts: moveCounts(moves) };
}

function complexity(alg) {
  const { stm } = alg.counts;
  const awkward = alg.moves.filter((m) => m.kind !== 'face' || !['R', 'U'].includes(m.family)).length;
  const score = stm + awkward * 0.5;
  if (score <= 9) return 'Easy';
  if (score <= 15) return 'Medium';
  return 'Hard';
}

function makeEntry(fields) {
  const algs = fields.algs.map((notation, i) => buildAlg(notation, fields.sources?.[i] ?? 'community'));
  const primary = algs[0];
  let state = null;
  return {
    ...fields,
    algs,
    primary,
    moveCount: primary.counts.stm,
    complexity: complexity(primary),
    status: 'verified',
    get caseState() {
      if (!state) state = caseStateFor(primary.moves);
      return state;
    },
    get setup() {
      return movesToString(invertMoves(primary.moves));
    },
  };
}

const entries = [
  ...PLL.map((c) =>
    makeEntry({
      ...c,
      id: `pll-${c.name.toLowerCase()}`,
      family: 'pll',
      setName: 'PLL',
      method: 'CFOP',
      number: null,
      title: `${c.name} perm`,
      tags: ['pll', 'last layer', c.category.toLowerCase()],
    }),
  ),
  ...OLL.map((c) =>
    makeEntry({
      ...c,
      id: `oll-${c.number}`,
      family: 'oll',
      setName: 'OLL',
      method: 'CFOP',
      title: `OLL ${c.number}`,
      tags: ['oll', 'last layer', c.category.toLowerCase()],
    }),
  ),
  ...F2L.map((c) =>
    makeEntry({
      ...c,
      id: `f2l-${c.number}`,
      family: 'f2l',
      setName: 'F2L',
      method: 'CFOP',
      title: `F2L ${c.number}`,
      tags: ['f2l', 'pairing', c.category.toLowerCase()],
    }),
  ),
  ...TWO_LOOK_OLL.map((c) =>
    makeEntry({ ...c, id: `2lo-${c.id}`, family: '2lo', setName: '2-look OLL', method: 'Beginner CFOP', title: c.name, tags: ['2-look', 'oll', c.category.toLowerCase()] }),
  ),
  ...TWO_LOOK_PLL.map((c) =>
    makeEntry({ ...c, id: `2lp-${c.id}`, family: '2lp', setName: '2-look PLL', method: 'Beginner CFOP', title: c.name, tags: ['2-look', 'pll', c.category.toLowerCase()] }),
  ),
  ...BEGINNER.map((c) =>
    makeEntry({ ...c, id: `beginner-${c.id}`, family: 'beginner', setName: 'Beginner', method: 'Layer by layer', title: c.name, tags: ['beginner', c.category.toLowerCase()] }),
  ),
];

const byId = new Map(entries.map((e) => [e.id, e]));

export const CATALOG = entries;
export const getCase = (id) => byId.get(id) ?? null;
export const casesInSet = (family) => entries.filter((e) => e.family === family);

export function coverage() {
  return ALGORITHM_SETS.map((set) => {
    const cases = casesInSet(set.id);
    return { ...set, count: cases.length, algCount: cases.reduce((n, c) => n + c.algs.length, 0), complete: cases.length === set.expected };
  });
}

/** The exact moves to show for one of a case's algorithms, including any lead-in U. */
export function playableMoves(entry, algIndex = 0) {
  const alg = entry.algs[algIndex] ?? entry.primary;
  const check = PRE_AUF_CHECKS[entry.family];
  if (algIndex === 0 || !check) return { moves: alg.moves, preAuf: '' };
  for (const auf of U_MOVES) {
    if (check(applyMoves(applyMoves(entry.caseState, auf), alg.moves))) {
      return { moves: [...auf, ...alg.moves], preAuf: auf.map((m) => m.text).join(' ') };
    }
  }
  return { moves: alg.moves, preAuf: '' };
}

const PRE_AUF_CHECKS = {
  oll: (s) => f2lSolved(s) && lastLayerOriented(s),
  pll: solvedUpToAuf,
  f2l: f2lSolved,
};

const SHAPE_WORDS = { dot: 'a dot, with no edges oriented', line: 'a line of two opposite edges', l: 'an L of two adjacent edges', cross: 'a full cross' };

const CORNER_FROM_KEY = { 0: 'facing up', 1: 'facing right', 2: 'facing front' };

/** Recognition notes, written from the case's own state rather than by hand. */
export function recognitionNotes(entry) {
  const state = entry.caseState;
  if (entry.family === 'oll') {
    const corners = orientedCornerCount(state);
    return [`The edges on top form ${SHAPE_WORDS[edgeShape(state)]}.`, `${corners} ${corners === 1 ? 'corner shows' : 'corners show'} the top color.`];
  }
  if (entry.family === 'pll') {
    const pieces = pllPieces(state);
    const { headlights, bars } = sidePatterns(state);
    const lines = [];
    const cornerPart = /corners:([\d+]+)/.exec(pieces)?.[1];
    const edgePart = /edges:([\d+]+)/.exec(pieces)?.[1];
    if (cornerPart === '3') lines.push('Three corners cycle.');
    if (cornerPart === '2') lines.push('Two corners swap.');
    if (cornerPart === '2+2') lines.push('Two pairs of corners swap.');
    if (!cornerPart) lines.push('The corners are already in place.');
    if (edgePart === '3') lines.push('Three edges cycle.');
    if (edgePart === '2') lines.push('Two edges swap.');
    if (edgePart === '2+2') lines.push('Two pairs of edges swap.');
    if (!edgePart) lines.push('The edges are already in place.');
    lines.push(`Around the sides as drawn: ${headlights} ${headlights === 1 ? 'set' : 'sets'} of headlights, ${bars} full ${bars === 1 ? 'bar' : 'bars'}.`);
    return lines;
  }
  if (entry.family === 'f2l') {
    const [corner, edge] = entry.key.split(' ');
    const cornerInSlot = corner.startsWith('cDFR');
    const edgeInSlot = edge.startsWith('eFR');
    const twist = corner.slice(-1);
    const lines = [];
    lines.push(cornerInSlot ? (twist === '0' ? 'The corner is in the slot, with the cross color down.' : 'The corner is in the slot, twisted.') : `The corner is in the top layer, with the cross color ${CORNER_FROM_KEY[twist]} when held above the slot.`);
    lines.push(edgeInSlot ? (edge.endsWith('0') ? 'The edge is in the slot, already correct.' : 'The edge is in the slot, flipped.') : 'The edge is in the top layer.');
    return lines;
  }
  return entry.explanation ? [] : [];
}

const FACE_WORDS = { R: 'right face', L: 'left face', U: 'top face', D: 'bottom face', F: 'front face', B: 'back face' };
const WIDE_WORDS = { R: 'right two layers', L: 'left two layers', U: 'top two layers', D: 'bottom two layers', F: 'front two layers', B: 'back two layers' };
const OTHER_WORDS = {
  M: 'middle layer, in the direction of L',
  E: 'equator layer, in the direction of D',
  S: 'standing layer, in the direction of F',
  x: 'whole cube, in the direction of R',
  y: 'whole cube, in the direction of U',
  z: 'whole cube, in the direction of F',
};

/** One move in words. Direction is always as seen looking at that face. */
export function describeMove(move) {
  const turn = Math.abs(move.amount) === 2 ? 'half a turn' : move.amount > 0 ? 'clockwise' : 'counterclockwise';
  if (move.kind === 'face') {
    if (move.inner > 1) return `Layer ${move.inner} from the ${FACE_WORDS[move.family].replace(' face', '')}: ${turn}`;
    return `Turn the ${FACE_WORDS[move.family]} ${turn}`;
  }
  if (move.kind === 'wide') return `Turn the ${move.outer > 2 ? `${move.family} side ${move.outer} layers` : WIDE_WORDS[move.family]} ${turn}`;
  const words = OTHER_WORDS[move.family];
  return `Turn the ${words.split(',')[0]} ${turn}${words.includes(',') ? ` (${words.split(', ')[1]})` : ''}`;
}

export const TRIGGERS = [
  { notation: "R U R' U'", name: 'the sexy move' },
  { notation: "R' F R F'", name: 'the sledgehammer' },
  { notation: "F R' F' R", name: 'the hedgeslammer' },
  { notation: "L' U' L U", name: 'the left sexy move' },
  { notation: "R U R'", name: 'a pair insert' },
  { notation: "R U2 R'", name: 'a double-turn insert' },
];

/** Named move groups inside an algorithm, longest first, without overlap. */
export function findTriggers(moves) {
  const text = moves.map((m) => m.text);
  const found = [];
  const used = new Set();
  for (const trigger of TRIGGERS) {
    const parts = trigger.notation.split(' ');
    for (let i = 0; i + parts.length <= text.length; i += 1) {
      if (parts.every((p, k) => text[i + k] === p && !used.has(i + k))) {
        parts.forEach((_, k) => used.add(i + k));
        found.push({ start: i, length: parts.length, name: trigger.name });
      }
    }
  }
  return found.sort((a, b) => a.start - b.start);
}
