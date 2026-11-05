// Every puzzle turnbase offers, and exactly how it is scrambled and drawn.
//
// `method` describes the cubing.js generator for that event:
//   random-state: a uniformly random reachable state, then a solution to it.
//   random-moves: a long random move sequence. WCA Regulation 4b3e specifies this
//   approach for 5×5×5 and Megaminx, where random-state is not practical.
//
// `cube` is set for N×N×N puzzles, which turnbase's own engine models, draws and
// animates. Others are drawn by cubing.js, because turnbase has no engine for them.

export const PUZZLES = [
  { id: '333', name: '3×3', method: 'random-state', cube: 3, twisty: null },
  { id: '222', name: '2×2', method: 'random-state', cube: 2, twisty: null },
  { id: '444', name: '4×4', method: 'random-state', cube: 4, twisty: null },
  { id: '555', name: '5×5', method: 'random-moves', cube: 5, twisty: null },
  { id: 'pyram', name: 'Pyraminx', method: 'random-state', cube: null, twisty: 'pyraminx' },
  { id: 'skewb', name: 'Skewb', method: 'random-state', cube: null, twisty: 'skewb' },
  { id: 'minx', name: 'Megaminx', method: 'random-moves', cube: null, twisty: 'megaminx' },
  { id: 'sq1', name: 'Square-1', method: 'random-state', cube: null, twisty: 'square1' },
  { id: 'clock', name: 'Clock', method: 'random-state', cube: null, twisty: 'clock' },
];

const byId = new Map(PUZZLES.map((p) => [p.id, p]));

export const getPuzzle = (id) => byId.get(id) ?? PUZZLES[0];
export const SCRAMBLE_LIBRARY = 'cubing.js';
export const SCRAMBLE_LIBRARY_VERSION = '0.66.1';
