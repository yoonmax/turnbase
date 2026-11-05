// Generates src/data/algorithms/f2l.js.
//
// The 41 F2L cases are not a list to take on trust. They follow from the geometry of
// the front-right slot, once a turn of the U layer is treated as equivalent:
//
//   corner in the U layer (3 twists) × edge in the U layer (4 places × 2 flips) = 24
//   corner in the U layer (3 twists) × edge in the slot    (2 flips)            =  6
//   corner in the slot    (3 twists) × edge in the U layer (2 flips, up to AUF) =  6
//   corner in the slot    (3 twists) × edge in the slot    (2 flips), less solved = 5
//                                                                          total = 41
//
// For each case this script takes community-standard candidate algorithms, keeps
// the first that truly solves it, and also finds a shortest solution by exhaustive
// search in <R, U, F>. A case with no matching candidate uses the search result, and
// the data records which is which.
//
// Run with: node scripts/generate-f2l.mjs

import { writeFileSync } from 'node:fs';
import { applyMove, applyMoves, solvedState } from '../src/cube/CubeEngine.js';
import { invertMoves, movesToString } from '../src/cube/CubeMoves.js';
import { parseMoves } from '../src/cube/CubeNotationParser.js';
import { CORNER_NAMES, CORNER_STICKERS, EDGE_NAMES, EDGE_STICKERS, toCubies } from '../src/cube/CubeState.js';
import { U_MOVES } from '../src/algorithms/AlgorithmValidator.js';

const CANDIDATES = [
  "R U R'", "F' U' F", "U R U' R'", "U' F' U F",
  "U' R U R' U2 R U' R'", "U F' U' F U2 F' U F",
  "U' R U2 R' U2 R U' R'", "U F' U2 F U2 F' U F",
  "U' R U' R' U F' U' F", "U F' U F U' R U R'",
  "U' R U2 R' U F' U' F", "U F' U2 F U' R U R'",
  "U F' U' F U' R U R'", "U' R U R' U F' U' F",
  "R U2 R' U' R U R'", "F' U2 F U F' U' F",
  "U R U2 R' U R U' R'", "U' F' U2 F U' F' U F",
  "U2 R U R' U R U' R'", "U2 F' U' F U' F' U F",
  "R U R' U' R U R' U' R U R'", "U F' U2 F U F' U2 F", "U' R U2 R' U' R U2 R'",
  "R U' R' U R U' R'", "U' R U' R' U2 R U' R'", "U F' U F U2 F' U F",
  "R U' R' U' R U R' U' R U2 R'", "R U R' U' R U R'", "F' U F U' F' U F",
  "U R U' R' U' F' U F", "U' F' U F U R U' R'", "F' U' F U F' U' F",
  "R U' R' U2 R U' R'", "R U R' U2 R U' R' U R U' R'",
  "R U' R' U R U2 R' U R U' R'", "R U' R' U' R U R' U2 R U' R'",
  "R U R' U' R U2 R' U' R U R'", "F' U' F U F' U2 F U F' U' F",
  "R U' R' U F' U2 F U2 F' U F", "R U R' U2 U R U' R' U R U' R'",
  "U R U R' U2 R U R'", "U' F' U' F U2 F' U' F", "F' U F U2 F' U F",
  "R U2 R' U R U' R'", "F' U2 F U' F' U F", "R U' R' U F' U' F",
  "F' U F U' R U R'", "U2 R U' R' U' R U R'", "U2 F' U F U F' U' F",
  "U R U' R' U R U' R' U R U' R'", "U' F' U F U' F' U F U' F' U F",
  "R U R' U' F' U' F", "F' U' F U R U R'", "U F' U' F U F' U' F", "U' R U R' U' R U R'",
  "U' R U' R' U R U R'", "U F' U F U' F' U' F", "R' F R F' U R U' R'",
  "F' U F U F' U' F", "R U' R' U' R U R'", "U' R' F R F' R U' R'",
  "U R U2 R' U2 R U' R'", "U' F' U2 F U2 F' U F", "R U2 R' U2 R U' R'", "F' U2 F U2 F' U F",
];

// ─── Identifying a case ──────────────────────────────

const CORNER_DFR = CORNER_NAMES.indexOf('DFR');
const EDGE_FR = EDGE_NAMES.indexOf('FR');

// Where the FR pair is, canonical under U turns: the smallest description of any
// of the four U-layer angles.
function locate(state) {
  const c = toCubies(state);
  const cornerSlot = c.cp.indexOf(CORNER_DFR);
  const edgeSlot = c.ep.indexOf(EDGE_FR);
  return { cornerSlot, cornerTwist: c.co[cornerSlot], edgeSlot, edgeFlip: c.eo[edgeSlot] };
}

function keyOf(state) {
  let best = null;
  for (const auf of U_MOVES) {
    const { cornerSlot, cornerTwist, edgeSlot, edgeFlip } = locate(applyMoves(state, auf));
    const key = `c${CORNER_NAMES[cornerSlot]}${cornerTwist} e${EDGE_NAMES[edgeSlot]}${edgeFlip}`;
    if (best === null || key < best) best = key;
  }
  return best;
}

// Everything except the target pair must already be in place: cross and other slots.
function othersHome(state) {
  const c = toCubies(state);
  const edges = ['DF', 'DR', 'DL', 'DB', 'FL', 'BL', 'BR'];
  const corners = ['DLF', 'DBL', 'DRB'];
  return (
    edges.every((name) => {
      const i = EDGE_NAMES.indexOf(name);
      return c.ep[i] === i && c.eo[i] === 0;
    }) &&
    corners.every((name) => {
      const i = CORNER_NAMES.indexOf(name);
      return c.cp[i] === i && c.co[i] === 0;
    })
  );
}

// ─── Enumerate the cases ─────────────────────────────

const SEARCH_MOVES = parseMoves("U U' U2 R R' R2 F F' F2");

// Places the pair directly. The result need not be a legal cube, because last-layer
// pieces are ignored here: the search below works only on tracked pieces, and the
// real case state then comes from running its solution backward from solved.
function enumerateCases() {
  const cornerSlots = ['URF', 'UFL', 'ULB', 'UBR', 'DFR'].map((n) => CORNER_NAMES.indexOf(n));
  const edgeSlots = ['UR', 'UF', 'UL', 'UB', 'FR'].map((n) => EDGE_NAMES.indexOf(n));
  const cases = new Map();
  for (const cs of cornerSlots) {
    for (const twist of [0, 1, 2]) {
      for (const es of edgeSlots) {
        for (const flip of [0, 1]) {
          const state = solvedState(3).slice();
          // Swap the slot's own corner down to DFR, untwisted.
          const pieceC = CORNER_STICKERS[CORNER_DFR];
          const slotC = CORNER_STICKERS[cs];
          if (cs !== CORNER_DFR) slotC.forEach((id, k) => { state[pieceC[k]] = id; });
          for (let k = 0; k < 3; k += 1) state[slotC[(twist + k) % 3]] = pieceC[k];
          const pieceE = EDGE_STICKERS[EDGE_FR];
          const slotE = EDGE_STICKERS[es];
          if (es !== EDGE_FR) slotE.forEach((id, k) => { state[pieceE[k]] = id; });
          state[slotE[0]] = pieceE[flip];
          state[slotE[1]] = pieceE[1 - flip];
          if (isPairHome(state)) continue;
          const key = keyOf(state);
          if (!cases.has(key)) cases.set(key, state);
        }
      }
    }
  }
  return cases;
}

function isPairHome(state) {
  const c = toCubies(state);
  return c.cp[CORNER_DFR] === CORNER_DFR && c.co[CORNER_DFR] === 0 && c.ep[EDGE_FR] === EDGE_FR && c.eo[EDGE_FR] === 0;
}

// Only the pieces F2L cares about. Last-layer pieces can be anywhere.
const TRACKED_EDGES = ['DF', 'DR', 'DL', 'DB', 'FL', 'BL', 'BR', 'FR'].map((n) => EDGE_NAMES.indexOf(n));
const TRACKED_CORNERS = ['DLF', 'DBL', 'DRB', 'DFR'].map((n) => CORNER_NAMES.indexOf(n));

function trackKey(state) {
  const c = toCubies(state);
  const edges = TRACKED_EDGES.map((p) => {
    const at = c.ep.indexOf(p);
    return `${at}${c.eo[at]}`;
  });
  const corners = TRACKED_CORNERS.map((p) => {
    const at = c.cp.indexOf(p);
    return `${at}${c.co[at]}`;
  });
  return `${edges.join('')}|${corners.join('')}`;
}

// ─── Shortest solutions ──────────────────────────────

// Backward search from the goal, cached, then forward from the case to meet it.
const backward = new Map();
(function buildBackward() {
  const start = solvedState(3);
  backward.set(trackKey(start), []);
  let layer = [{ state: start, path: [] }];
  for (let depth = 0; depth < 7; depth += 1) {
    const next = [];
    for (const { state, path } of layer) {
      for (const m of SEARCH_MOVES) {
        if (path.length && path[path.length - 1].family === m.family) continue;
        const s = applyMove(state, m);
        const k = trackKey(s);
        if (!backward.has(k)) {
          const p = [...path, m];
          backward.set(k, p);
          next.push({ state: s, path: p });
        }
      }
    }
    layer = next;
  }
})();

function shortestSolution(state) {
  let layer = [{ state, path: [] }];
  const seen = new Set([trackKey(state)]);
  for (let depth = 0; depth < 8; depth += 1) {
    let best = null;
    for (const { state: s, path } of layer) {
      const hit = backward.get(trackKey(s));
      if (hit) {
        const full = [...path, ...invertMoves(hit)];
        if (!best || full.length < best.length) best = full;
      }
    }
    if (best) return best;
    const next = [];
    for (const { state: s, path } of layer) {
      for (const m of SEARCH_MOVES) {
        if (path.length && path[path.length - 1].family === m.family) continue;
        const n = applyMove(s, m);
        const k = trackKey(n);
        if (!seen.has(k)) {
          seen.add(k);
          next.push({ state: n, path: [...path, m] });
        }
      }
    }
    layer = next;
  }
  throw new Error('No solution found');
}

// ─── Assemble ────────────────────────────────────────

const cases = enumerateCases();
console.log('cases found', cases.size);

const byCandidate = new Map();
for (const text of CANDIDATES) {
  const moves = parseMoves(text);
  // The case this algorithm solves, derived from its inverse.
  const state = applyMoves(solvedState(3), invertMoves(moves));
  if (!othersHome(state)) {
    console.log('rejected: disturbs other pieces', text);
    continue;
  }
  if (isPairHome(state)) {
    console.log('rejected: leaves the pair home', text);
    continue;
  }
  const key = keyOf(state);
  if (!byCandidate.has(key)) byCandidate.set(key, []);
  const list = byCandidate.get(key);
  if (!list.includes(text)) list.push(text);
}

const GROUP_ORDER = ['Pair ready to insert', 'Corner up, edge up', 'Corner up, edge in slot', 'Corner in slot, edge up', 'Both in slot'];

function group(key) {
  const [corner, edge] = key.split(' ');
  const cornerInSlot = corner.startsWith('cDFR');
  const edgeInSlot = edge.startsWith('eFR');
  if (cornerInSlot && edgeInSlot) return 'Both in slot';
  if (cornerInSlot) return 'Corner in slot, edge up';
  if (edgeInSlot) return 'Corner up, edge in slot';
  return 'Corner up, edge up';
}

const entries = [...cases.entries()].map(([key, state]) => {
  const candidates = byCandidate.get(key) ?? [];
  const shortest = movesToString(shortestSolution(state)).replace(/2'/g, '2');
  const shortLen = shortest.split(' ').length;
  const algs = [];
  const sources = [];
  if (candidates.length) {
    algs.push(candidates[0]);
    sources.push('community');
    if (candidates[1]) {
      algs.push(candidates[1]);
      sources.push('community');
    }
  }
  if (!algs.includes(shortest)) {
    algs.push(shortest);
    sources.push('search');
  }
  let g = group(key);
  // A pair that needs at most 4 moves counts as ready.
  if (g === 'Corner up, edge up' && shortLen <= 4) g = 'Pair ready to insert';
  return { key, group: g, algs, sources, shortLen };
});

entries.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.shortLen - b.shortLen || a.key.localeCompare(b.key));

const NAMES = {
  'Pair ready to insert': 'Ready pair',
  'Corner up, edge up': 'Top layer',
  'Corner up, edge in slot': 'Edge in slot',
  'Corner in slot, edge up': 'Corner in slot',
  'Both in slot': 'In slot',
};
const counters = {};
const lines = entries.map((e, i) => {
  counters[e.group] = (counters[e.group] ?? 0) + 1;
  return `  { number: ${i + 1}, name: '${NAMES[e.group]} ${counters[e.group]}', category: '${e.group}', key: '${e.key}', algs: ${JSON.stringify(e.algs)}, sources: ${JSON.stringify(e.sources)} },`;
});

const output = `// Generated by scripts/generate-f2l.mjs. Do not edit by hand.
//
// All 41 F2L cases for the front-right slot, one per placement of the corner and edge
// up to a U turn. Numbering is turnbase's own, by group and then by shortest solution.
// It is not the numbering used by any other site.
//
// sources: 'community' is a commonly taught sequence. 'search' is a shortest solution
// in <R, U, F>, found by exhaustive search. Both are checked by tests/algorithms.

export const F2L = [
${lines.join('\n')}
];
`;
writeFileSync('src/data/algorithms/f2l.js', output);
const community = entries.filter((e) => e.sources[0] === 'community').length;
console.log(`wrote ${entries.length} cases, ${community} with community algorithms, ${entries.length - community} search-only`);
for (const g of GROUP_ORDER) console.log(g, entries.filter((e) => e.group === g).length);
