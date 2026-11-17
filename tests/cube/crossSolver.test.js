import { describe, expect, it } from 'vitest';
import { applyMoves, solvedState } from '../../src/cube/CubeEngine.js';
import { parseMoves } from '../../src/cube/CubeNotationParser.js';
import { CROSS_SLOTS, PAIR_SLOTS, checkPlan, slotsSolved, solveCross } from '../../src/cube/CrossSolver.js';

const CROSS = CROSS_SLOTS;
const PAIRS = PAIR_SLOTS;
const piecesSolved = slotsSolved;

const SCRAMBLES = [
  "D2 F2 U' L2 D' R2 U F2 U' R2 U2 F' L' D2 B' U' L B' R2 U2",
  "R' U' F L2 D2 B2 R2 U' F2 D' R2 U2 L2 F' R' D2 R' U' B L' F R' U' F",
  "B2 D' L2 U R2 D B2 L2 U2 F2 U L' F U' B2 L' U2 F' D R",
  'F',
  '',
];

describe('cross solver', () => {
  it('finds a solved cross with no moves', () => {
    const result = solveCross('', { xcross: false });
    expect(result.cross.length).toBe(0);
  });

  it('finds the one-move cross', () => {
    expect(solveCross('F', { xcross: false }).cross.moves[0]).toBe("F'");
    expect(solveCross('R2', { xcross: false }).cross.length).toBe(1);
  });

  for (const bottom of ['D', 'U', 'F', 'B', 'R', 'L']) {
    it(`solves the ${bottom} cross and every X-cross, optimally checked`, () => {
      for (const scramble of SCRAMBLES.slice(0, 2)) {
        const result = solveCross(scramble, { bottom, max: 2 });
        const before = applyMoves(solvedState(3), [...parseMoves(scramble), ...parseMoves(result.rotation)]);
        expect(result.cross.length).toBeLessThanOrEqual(8);
        for (const text of result.cross.moves) {
          const after = applyMoves(before, parseMoves(text));
          expect(piecesSolved(after, CROSS)).toBe(true);
          expect(parseMoves(text).length).toBe(result.cross.length);
        }
        expect(result.xcross).toHaveLength(4);
        for (const x of result.xcross) {
          expect(x.length).toBeGreaterThanOrEqual(result.cross.length);
          for (const text of x.moves) {
            const after = applyMoves(before, parseMoves(text));
            expect(piecesSolved(after, [...CROSS, ...PAIRS[x.slot]])).toBe(true);
          }
        }
      }
    });
  }

  it('has no shorter cross than it reports', () => {
    // Brute force up to the reported length minus one.
    const scramble = SCRAMBLES[2];
    const result = solveCross(scramble, { xcross: false });
    const start = applyMoves(solvedState(3), parseMoves(scramble));
    const faces = ['U', 'R', 'F', 'D', 'L', 'B'];
    const turns = faces.flatMap((f) => ['', '2', "'"].map((s) => f + s));
    let frontier = [start];
    for (let depth = 0; depth < result.cross.length; depth += 1) {
      expect(frontier.some((s) => piecesSolved(s, CROSS))).toBe(false);
      if (depth >= 4) break;
      frontier = frontier.flatMap((s) => turns.map((t) => applyMoves(s, parseMoves(t))));
    }
  });

  it('checks a planned cross', () => {
    const scramble = SCRAMBLES[0];
    const result = solveCross(scramble, { bottom: 'U' });
    const plan = checkPlan(scramble, 'U', result.cross.moves[0]);
    expect(plan).toMatchObject({ ok: true, cross: true, length: result.cross.length });
    const best = result.xcross[0];
    expect(checkPlan(scramble, 'U', best.moves[0]).pairs).toContain(best.slot);
    expect(checkPlan(scramble, 'U', 'R').cross).toBe(false);
    expect(checkPlan(scramble, 'U', 'R Q').ok).toBe(false);
  });
});
