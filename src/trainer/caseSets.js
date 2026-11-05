// What a practice session can draw from, and what counts as success on a case.

import { CATALOG, casesInSet } from '../algorithms/AlgorithmCatalog.js';
import { caseStateFor, f2lSolved, lastLayerEdgesOriented, lastLayerOriented, piecesHome, solvedUpToAuf, cornersPermutedUpToAuf } from '../algorithms/AlgorithmValidator.js';
import { applyMoves, isSolved } from '../cube/CubeEngine.js';
import { moveCounts } from '../cube/CubeMoves.js';
import { parseAlgorithm } from '../cube/CubeNotationParser.js';

export const TRAINING_SETS = [
  { id: 'pll', name: 'PLL' },
  { id: 'oll', name: 'OLL' },
  { id: 'f2l', name: 'F2L' },
  { id: 'beginner', name: 'Beginner' },
  { id: 'two-look', name: '2-look' },
  { id: 'custom', name: 'Custom' },
  { id: 'favorites', name: 'Favorites' },
  { id: 'unlearned', name: 'Not learned' },
];

export const TRAINING_MODES = [
  { id: 'recognition', name: 'Recognition', text: 'See a case and name it, as quickly as you can.' },
  { id: 'recall', name: 'Recall', text: 'See a case and remember its algorithm, then reveal it and judge yourself.' },
  { id: 'execution', name: 'Execution', text: 'Solve the case on the 3D cube, with a timer and move count.' },
  { id: 'flashcards', name: 'Flashcards', text: 'A case on one side and its algorithm on the other.' },
  { id: 'review', name: 'Spaced review', text: 'Only the cases due today, scheduled by SM-2.' },
];

/** A saved custom algorithm as a case: its goal is simply a solved cube. */
export function customEntry(record) {
  const parsed = parseAlgorithm(record.notation);
  if (!parsed.ok || !parsed.moves.length) return null;
  let state = null;
  const alg = { notation: record.notation, moves: parsed.moves, source: 'user', counts: moveCounts(parsed.moves) };
  return {
    id: `custom-${record.id}`,
    family: 'custom',
    setName: 'Custom',
    title: record.name,
    name: record.name,
    category: 'Custom',
    algs: [alg],
    primary: alg,
    moveCount: alg.counts.stm,
    get caseState() {
      if (!state) state = caseStateFor(parsed.moves);
      return state;
    },
  };
}

export function casesFor(setId, progress, customAlgs) {
  switch (setId) {
    case 'pll':
    case 'oll':
    case 'f2l':
    case 'beginner':
      return casesInSet(setId);
    case 'two-look':
      return [...casesInSet('2lo'), ...casesInSet('2lp')];
    case 'custom':
      return customAlgs.map(customEntry).filter(Boolean);
    case 'favorites':
      return CATALOG.filter((c) => progress.get(c.id)?.favorite);
    case 'unlearned':
      return CATALOG.filter((c) => !progress.get(c.id)?.learned);
    default:
      return [];
  }
}

/** Has the solver achieved what this case is about? */
export function goalReached(entry, state) {
  switch (entry.family) {
    case 'oll':
      return f2lSolved(state) && lastLayerOriented(state);
    case 'pll':
      return solvedUpToAuf(state);
    case 'f2l':
      return f2lSolved(state);
    case '2lo':
    case '2lp':
    case 'beginner': {
      const { goal } = entry;
      if (goal.solved) return solvedUpToAuf(state);
      if (goal.pieces) return piecesHome(state, goal.pieces);
      if (goal.edgesOriented) return f2lSolved(state) && lastLayerEdgesOriented(state);
      if (goal.oriented) return f2lSolved(state) && lastLayerOriented(state);
      if (goal.cornersPermuted) return f2lSolved(state) && lastLayerOriented(state) && cornersPermutedUpToAuf(state);
      return isSolved(state);
    }
    default:
      return isSolved(state);
  }
}

/** A case's state with a random angle of the top layer, as it would appear in a solve. */
export function practiceState(entry, auf) {
  const state = entry.caseState;
  if (!auf?.length) return state;
  // Beginner cross and corner cases are about exact placement, so only rotate the
  // top layer where that makes a true variant of the same case.
  if (['oll', 'pll', '2lo', '2lp'].includes(entry.family)) return applyMoves(state, auf);
  return state;
}
