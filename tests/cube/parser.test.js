import { describe, expect, it } from 'vitest';
import { Alg } from 'cubing/alg';
import { parseAlgorithm, parseMoves } from '../../src/cube/CubeNotationParser.js';
import { invertMoves, movesToString } from '../../src/cube/CubeMoves.js';

const norm = (text, options) => {
  const r = parseAlgorithm(text, options);
  if (!r.ok) throw new Error(r.error.message);
  return r.normalized;
};

describe('standard notation', () => {
  it('reads face turns, primes and doubles', () => {
    expect(norm("R U R' U'")).toBe("R U R' U'");
    expect(norm("R2 U2' F2")).toBe("R2 U2' F2");
    expect(norm("R'2")).toBe("R2'");
  });

  it('normalises typographic primes', () => {
    expect(norm('R’ U‘ F′ Dʼ L` B´')).toBe("R' U' F' D' L' B'");
  });

  it('reads slices, wide moves, lowercase and rotations', () => {
    expect(norm("M E' S2")).toBe("M E' S2");
    expect(norm("Rw Lw' Uw2 Dw Fw Bw2'")).toBe("Rw Lw' Uw2 Dw Fw Bw2'");
    expect(norm("r l' u2 d f b'")).toBe("r l' u2 d f b'");
    expect(norm("x y' z2")).toBe("x y' z2");
  });

  it('reads runs without spaces', () => {
    expect(norm("RUR'U'")).toBe("R U R' U'");
    expect(norm("R2U2")).toBe('R2 U2');
  });

  it('reduces counts: R3 is R\', R4 is nothing, R5 is R', () => {
    expect(norm('R3')).toBe("R'");
    expect(norm('R4')).toBe('');
    expect(norm('R5')).toBe('R');
    expect(norm("R3'")).toBe('R');
  });

  it('reads big-cube layers', () => {
    expect(norm("3Rw2 Uw' 2R", { n: 5 })).toBe("3Rw2 Uw' 2R");
    expect(norm('2-3Rw', { n: 5 })).toBe('2-3Rw');
  });
});

describe('structure', () => {
  it('expands repeated groups', () => {
    expect(norm("(R U R' U')3")).toBe("R U R' U' R U R' U' R U R' U'");
    expect(norm("(R U)2'")).toBe("U' R' U' R'");
    expect(norm("(R U)'")).toBe("U' R'");
  });

  it('expands commutators and conjugates', () => {
    expect(norm("[R U R', D]")).toBe("R U R' D R U' R' D'");
    expect(norm("[R: U R U']")).toBe("R U R U' R'");
  });

  it('expands nesting', () => {
    expect(norm("[R: [U, D]]")).toBe("R U D U' D' R'");
    expect(norm("([R, U]2 F)'")).toBe(movesToString(invertMoves(parseMoves("R U R' U' R U R' U' F"))));
    expect(norm('[[R, U], F]')).toBe("R U R' U' F U R U' R' F'");
  });

  it('ignores comments', () => {
    expect(norm("R U // trigger\nR' /* then */ U'")).toBe("R U R' U'");
  });
});

describe('errors say what is wrong and where', () => {
  const cases = [
    ['Q', 0, 'not a move'],
    ['R U (F', 4, 'never closed'],
    ['R)', 1, 'nothing opening'],
    ['[R, U', 0, 'never closed'],
    ['[R U]', 0, 'commutator'],
    ['R, U', 1, 'square brackets'],
    ["R''", 2, 'double prime'],
    ["'R", 0, 'prime'],
    ['X', 0, 'lowercase'],
    ['m', 0, 'ambiguous'],
    ['3M', 0, 'cannot take'],
    ['R0', 1, 'does nothing'],
    ['4Rw', 0, 'at most'],
    ['2R3Rw', 2, 'Put a space'],
    ['/* open', 0, 'never closed'],
    ['2', 0, 'needs a move'],
    ['@', 0, 'not part of'],
  ];
  for (const [text, index, message] of cases) {
    it(JSON.stringify(text), () => {
      const r = parseAlgorithm(text);
      expect(r.ok).toBe(false);
      expect(r.error.message.toLowerCase()).toContain(message.toLowerCase());
      expect(r.error.index).toBe(index);
    });
  }

  it('rejects notation that is ambiguous on a given size', () => {
    expect(parseAlgorithm('r', { n: 4 }).ok).toBe(false);
    expect(parseAlgorithm('M', { n: 4 }).ok).toBe(false);
    expect(parseAlgorithm('Rw', { n: 2 }).ok).toBe(false);
    expect(parseAlgorithm('Rw', { n: 4 }).ok).toBe(true);
  });

  it('never throws on junk', () => {
    for (const s of ['', '   ', '((((', ']]]', '[,]', '[:]', "()'", '(R)0', '1-', 'Rww', '٣R']) {
      expect(() => parseAlgorithm(s)).not.toThrow();
    }
  });
});

describe('agreement with a mature parser (cubing.js Alg)', () => {
  const samples = [
    "R U R' U'",
    "(R U R' U')3",
    "[R U R', D]",
    "[R: U R U']",
    "[R: [U, D]]",
    "[[R, U], F]",
    "(R U)2'",
    "([R, U]2 F)'",
    "F (R U R' U') F'",
    "r U R' U' r' F R F'",
    "M2 U M2 U2 M2 U M2",
    "[F: [R, U]]",
    "x R2 D2 R U R' D2 R U' R x'",
  ];
  for (const text of samples) {
    it(text, () => {
      const theirs = new Alg(text).expand().toString();
      const ours = norm(text);
      // cubing.js writes R2' as R2'; compare move by move.
      expect(ours.split(' ')).toEqual(theirs.split(' ').filter(Boolean));
    });
  }
});
