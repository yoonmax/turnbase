import { describe, expect, it } from 'vitest';
import { randomScrambleForEvent } from 'cubing/scramble';
import { setSearchDebug } from 'cubing/search';
import { Alg } from 'cubing/alg';
import { cube3x3x3 } from 'cubing/puzzles';
import { applyMoves, faceletString, isSolved, solvedState, statesEqual } from '../../src/cube/CubeEngine.js';
import { invertMoves } from '../../src/cube/CubeMoves.js';
import { parseAlgorithm } from '../../src/cube/CubeNotationParser.js';
import { isLegal, toCubies } from '../../src/cube/CubeState.js';
import { PUZZLES, getPuzzle } from '../../src/scrambles/PuzzleRegistry.js';
import { scrambleSizeClass } from '../../src/scrambles/ScrambleDisplay.jsx';

setSearchDebug({ allowNodeStyleWorkers: true });

describe('puzzle registry', () => {
  it('states a generation method for every puzzle', () => {
    for (const p of PUZZLES) expect(['random-state', 'random-moves']).toContain(p.method);
  });

  it('every puzzle has a real way to draw it', () => {
    for (const p of PUZZLES) expect(Boolean(p.cube) !== Boolean(p.twisty)).toBe(true);
  });

  it('falls back to 3×3 for an unknown id, not a wrong puzzle', () => {
    expect(getPuzzle('nope').id).toBe('333');
  });
});

describe('3×3 scrambles from cubing.js', () => {
  it('parse, are legal, and agree with its own state tracking', async () => {
    const kpuzzle = await cube3x3x3.kpuzzle();
    const seen = new Set();
    for (let i = 0; i < 5; i += 1) {
      const text = (await randomScrambleForEvent('333')).toString(); // eslint-disable-line no-await-in-loop
      const parsed = parseAlgorithm(text);
      expect(parsed.ok, text).toBe(true);
      const state = applyMoves(solvedState(), parsed.moves);
      expect(isLegal(state)).toBe(true);
      expect(isSolved(state)).toBe(false);
      // Only face turns, so centers stay put and the two engines can be compared directly.
      expect(parsed.moves.every((m) => m.kind === 'face')).toBe(true);
      const cubies = toCubies(state);
      const theirs = kpuzzle.defaultPattern().applyAlg(new Alg(text)).patternData;
      expect(theirs.EDGES.pieces.filter((p, j) => p !== j).length).toBe(cubies.ep.filter((p, j) => p !== j).length);
      // Back to solved through the inverse.
      expect(statesEqual(applyMoves(state, invertMoves(parsed.moves)), solvedState())).toBe(true);
      seen.add(text);
    }
    expect(seen.size).toBe(5);
  }, 120000);
});

describe.each([
  ['222', 2],
  ['444', 4],
  ['555', 5],
])('%s scrambles', (event, n) => {
  it('parse and apply on the N×N engine', async () => {
    const text = (await randomScrambleForEvent(event)).toString();
    const parsed = parseAlgorithm(text, { n });
    expect(parsed.ok, text).toBe(true);
    const state = applyMoves(solvedState(n), parsed.moves, n);
    expect(isSolved(state, n)).toBe(false);
    expect(faceletString(applyMoves(state, invertMoves(parsed.moves), n), n)).toBe(faceletString(solvedState(n), n));
  }, 120000);
});

describe('display fit', () => {
  it('shrinks only long scrambles', () => {
    expect(scrambleSizeClass('R U')).toBe(1);
    expect(scrambleSizeClass('x'.repeat(200))).toBe(0.82);
    expect(scrambleSizeClass('x'.repeat(400))).toBe(0.72);
  });
});
