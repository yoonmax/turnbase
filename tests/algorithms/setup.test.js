import { describe, expect, it } from 'vitest';
import { CATALOG, getCase } from '../../src/algorithms/AlgorithmCatalog.js';
import { setupFor, withoutRotations } from '../../src/algorithms/setupMoves.js';
import { applyMoves, isSolved, solvedState, statesEqual } from '../../src/cube/CubeEngine.js';
import { movesToDisplay, movesToString } from '../../src/cube/CubeMoves.js';
import { parseMoves } from '../../src/cube/CubeNotationParser.js';

describe('rotation-free rewriting', () => {
  it('folds rotations into faces', () => {
    expect(movesToString(withoutRotations(parseMoves("y R U' x F")).moves)).toBe("B U' D");
  });

  it('gives the same cube, up to how it is held', () => {
    const alg = parseMoves("x R2 F R F' R U2 r' U r U2 x' y M' z2 S");
    const { moves, rotation } = withoutRotations(alg);
    expect(statesEqual(applyMoves(applyMoves(solvedState(), moves), rotation), applyMoves(solvedState(), alg))).toBe(true);
    expect(moves.every((m) => m.kind !== 'rotation')).toBe(true);
  });
});

describe('every case in the library can be set up by hand', () => {
  for (const entry of CATALOG) {
    it(`${entry.id}: the setup reaches the case exactly, and the algorithm then solves it`, () => {
      const setup = setupFor(entry);
      expect(setup.moves.every((m) => m.kind !== 'rotation')).toBe(true);
      const reached = applyMoves(solvedState(), setup.all);
      expect(statesEqual(reached, entry.caseState)).toBe(true);
      expect(isSolved(applyMoves(reached, entry.primary.moves))).toBe(true);
    });
  }

  it('most setups need no rotation at all', () => {
    const rotated = CATALOG.filter((e) => setupFor(e).finalRotation.length);
    expect(rotated.length).toBeLessThan(CATALOG.length / 4);
  });

  it('T perm is set up by its algorithm run backward', () => {
    expect(movesToDisplay(setupFor(getCase('pll-t')).all)).toBe("F R U' R' U R U R2 F' R U R U' R'");
  });
});
