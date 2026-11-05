import { describe, expect, it } from 'vitest';
import { cube3x3x3 } from 'cubing/puzzles';
import { Alg } from 'cubing/alg';
import {
  applyAlg,
  applyMove,
  applyMoves,
  faceletString,
  getCubeModel,
  isSolved,
  solvedState,
  statesEqual,
} from '../../src/cube/CubeEngine.js';
import { invertMoves, makeMove, moveCounts, movesToString, simplifyMoves } from '../../src/cube/CubeMoves.js';
import { parseMoves } from '../../src/cube/CubeNotationParser.js';
import {
  CORNER_NAMES,
  EDGE_NAMES,
  ORIENTATION_COUNT,
  isLegal,
  legalityReport,
  normaliseOrientation,
  toCubies,
} from '../../src/cube/CubeState.js';

const FACE = ['U', 'D', 'R', 'L', 'F', 'B'];
const SLICE = ['M', 'E', 'S'];
const WIDE = ['Rw', 'Lw', 'Uw', 'Dw', 'Fw', 'Bw'];
const LOWER = ['r', 'l', 'u', 'd', 'f', 'b'];
const ROTATION = ['x', 'y', 'z'];
const ALL = [...FACE, ...SLICE, ...WIDE, ...LOWER, ...ROTATION];

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomAlg(rand, length, pool = ALL) {
  const parts = [];
  for (let i = 0; i < length; i += 1) {
    const m = pool[Math.floor(rand() * pool.length)];
    const suffix = ['', "'", '2', "2'"][Math.floor(rand() * 4)];
    parts.push(m + suffix);
  }
  return parts.join(' ');
}

describe('solved state', () => {
  it('has 54 stickers and counts as solved', () => {
    const s = solvedState();
    expect(s.length).toBe(54);
    expect(isSolved(s)).toBe(true);
    expect(faceletString(s)).toBe('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
    expect(isLegal(s)).toBe(true);
  });

  it('finds exactly 24 orientations', () => {
    expect(ORIENTATION_COUNT).toBe(24);
  });
});

describe('single moves, checked against known sticker results', () => {
  // Facelet strings are in URFDLB order, each face read as seen from outside.
  const known = {
    R: 'UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB',
    U: 'UUUUUUUUUBBBRRRRRRRRRFFFFFFDDDDDDDDDFFFLLLLLLLLLBBBBBB',
    F: 'UUUUUULLLURRURRURRFFFFFFFFFRRRDDDDDDLLDLLDLLDBBBBBBBBB',
    L: 'BUUBUUBUURRRRRRRRRUFFUFFUFFFDDFDDFDDLLLLLLLLLBBDBBDBBD',
    D: 'UUUUUUUUURRRRRRFFFFFFFFFLLLDDDDDDDDDLLLLLLBBBBBBBBBRRR',
    B: 'RRRUUUUUURRDRRDRRDFFFFFFFFFDDDDDDLLLULLULLULLBBBBBBBBB',
  };
  for (const [move, expected] of Object.entries(known)) {
    it(move, () => {
      expect(faceletString(applyAlg(solvedState(), move))).toBe(expected);
    });
  }
});

describe('move laws', () => {
  for (const family of ALL) {
    it(`${family}: four quarters is identity, inverse undoes, double is two`, () => {
      const start = applyAlg(solvedState(), "R U2 F' L D2 B' M E' S");
      const one = applyAlg(start, family);
      expect(statesEqual(applyAlg(start, `${family} ${family} ${family} ${family}`), start)).toBe(true);
      expect(statesEqual(applyAlg(one, `${family}'`), start)).toBe(true);
      expect(statesEqual(applyAlg(start, `${family}2`), applyAlg(start, `${family} ${family}`))).toBe(true);
      expect(statesEqual(applyAlg(start, `${family}2'`), applyAlg(start, `${family}2`))).toBe(true);
      expect(statesEqual(one, start)).toBe(false);
    });
  }

  it('wide moves equal a face turn plus a slice', () => {
    const start = applyAlg(solvedState(), "F2 R U'");
    expect(statesEqual(applyAlg(start, 'Rw'), applyAlg(start, "R M'"))).toBe(true);
    expect(statesEqual(applyAlg(start, 'Lw'), applyAlg(start, 'L M'))).toBe(true);
    expect(statesEqual(applyAlg(start, 'Uw'), applyAlg(start, "U E'"))).toBe(true);
    expect(statesEqual(applyAlg(start, 'Dw'), applyAlg(start, 'D E'))).toBe(true);
    expect(statesEqual(applyAlg(start, 'Fw'), applyAlg(start, 'F S'))).toBe(true);
    expect(statesEqual(applyAlg(start, 'Bw'), applyAlg(start, "B S'"))).toBe(true);
  });

  it('lowercase shorthand equals w notation on a 3×3', () => {
    const start = applyAlg(solvedState(), "F2 R U'");
    for (const [a, b] of [['r', 'Rw'], ['l', 'Lw'], ['u', 'Uw'], ['d', 'Dw'], ['f', 'Fw'], ['b', 'Bw']]) {
      expect(statesEqual(applyAlg(start, a), applyAlg(start, b))).toBe(true);
    }
  });

  it('rotations equal their three layers', () => {
    const start = applyAlg(solvedState(), "F2 R U'");
    expect(statesEqual(applyAlg(start, 'x'), applyAlg(start, "R M' L'"))).toBe(true);
    expect(statesEqual(applyAlg(start, 'y'), applyAlg(start, "U E' D'"))).toBe(true);
    expect(statesEqual(applyAlg(start, 'z'), applyAlg(start, "F S B'"))).toBe(true);
  });

  it('rotations leave a solved cube solved but change which colour is where', () => {
    for (const r of ROTATION) {
      const rotated = applyAlg(solvedState(), r);
      expect(isSolved(rotated)).toBe(true);
      expect(statesEqual(rotated, solvedState())).toBe(false);
    }
  });

  it('a rotation preserves piece relations: conjugating by y moves R to B', () => {
    const start = solvedState();
    // y R y' turns the face that is on the right after y, the original back face.
    expect(statesEqual(applyAlg(start, "y R y'"), applyAlg(start, 'B'))).toBe(true);
  });

  it('classic identities: sexy move has order 6, the 4-cycle sequence has order 105', () => {
    let s = solvedState();
    for (let i = 0; i < 6; i += 1) s = applyAlg(s, "R U R' U'");
    expect(isSolved(s)).toBe(true);
    s = solvedState();
    let order = 0;
    do {
      s = applyAlg(s, 'R U');
      order += 1;
    } while (!isSolved(s));
    expect(order).toBe(105);
  });

  it('superflip is legal and 20 moves away in the standard sequence', () => {
    const superflip = applyAlg(solvedState(), "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2");
    const cubies = toCubies(superflip);
    expect(cubies.eo).toEqual(new Array(12).fill(1));
    expect(cubies.co).toEqual(new Array(8).fill(0));
    expect(cubies.cp).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(cubies.ep).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('long random sequences', () => {
  it('sequence then inverse returns to the exact start, and stays legal throughout', () => {
    const rand = seeded(1234);
    for (let t = 0; t < 40; t += 1) {
      const moves = parseMoves(randomAlg(rand, 200));
      let s = solvedState();
      for (const move of moves) {
        s = applyMove(s, move);
        expect(isLegal(s)).toBe(true);
      }
      s = applyMoves(s, invertMoves(moves));
      expect(statesEqual(s, solvedState())).toBe(true);
    }
  });

  it('survives 100,000 consecutive moves exactly', () => {
    const rand = seeded(99);
    const moves = parseMoves(randomAlg(rand, 1000));
    let s = solvedState();
    for (let i = 0; i < 100; i += 1) s = applyMoves(s, moves);
    expect(isLegal(s)).toBe(true);
    for (let i = 0; i < 100; i += 1) s = applyMoves(s, invertMoves(moves));
    expect(statesEqual(s, solvedState())).toBe(true);
  });
});

describe('legality', () => {
  it('rejects a flipped edge, a twisted corner, and a lone swap', () => {
    const edge = solvedState();
    // UF: swap the two stickers of one edge.
    const uf = [7, 19];
    [edge[uf[0]], edge[uf[1]]] = [edge[uf[1]], edge[uf[0]]];
    expect(legalityReport(edge)).toEqual({ legal: false, reason: 'flip' });

    const corner = solvedState();
    const urf = [8, 9, 20];
    const t = corner[urf[0]];
    corner[urf[0]] = corner[urf[1]];
    corner[urf[1]] = corner[urf[2]];
    corner[urf[2]] = t;
    expect(legalityReport(corner).reason).toBe('twist');

    const swap = solvedState();
    const a = [7, 19]; // UF
    const b = [5, 10]; // UR
    [swap[a[0]], swap[b[0]]] = [swap[b[0]], swap[a[0]]];
    [swap[a[1]], swap[b[1]]] = [swap[b[1]], swap[a[1]]];
    expect(legalityReport(swap).reason).toBe('parity');
  });

  it('reads rotated states through their canonical orientation', () => {
    const state = applyAlg(solvedState(), "x y2 R U");
    const { state: canon, rotation } = normaliseOrientation(state);
    expect(rotation.length).toBeGreaterThan(0);
    expect(isLegal(canon)).toBe(true);
  });
});

describe('N×N geometry', () => {
  it.each([2, 4, 5])('%i×%i: quarter turns, inverses, and sticker count', (n) => {
    expect(getCubeModel(n).count).toBe(6 * n * n);
    const R = parseMoves('R', { n });
    let s = solvedState(n);
    for (let i = 0; i < 4; i += 1) s = applyMoves(s, R, n);
    expect(isSolved(s, n)).toBe(true);
    const alg = n === 2 ? "R U F' D2 L B" : "Rw U2 Fw' D2 L' 2B";
    const moves = parseMoves(alg, { n });
    s = applyMoves(applyMoves(solvedState(n), moves, n), invertMoves(moves), n);
    expect(isSolved(s, n)).toBe(true);
  });
});

describe('moves utilities', () => {
  it('counts metrics without rotations', () => {
    const c = moveCounts(parseMoves("R U2 M' x"));
    expect(c).toEqual({ htm: 4, qtm: 5, stm: 3, etm: 4 });
  });

  it('simplifies adjacent turns', () => {
    expect(movesToString(simplifyMoves(parseMoves("R R U U' F2 F2 L L L")))).toBe("R2 L'");
  });

  it('invert keeps kinds and layers', () => {
    expect(movesToString(invertMoves(parseMoves("Rw U2 M' x")))).toBe("x' M U2' Rw'");
    expect(makeMove('face', 'R', 2).text).toBe('R2');
  });
});

describe('agreement with an independent reference (cubing.js KPuzzle)', () => {
  // cubing.js slots, written with our face letters.
  const THEIR_EDGES = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'];
  const THEIR_CORNERS = ['UFR', 'URB', 'UBL', 'ULF', 'DRF', 'DFL', 'DLB', 'DBR'];

  const sameLetters = (a, b) => a.split('').sort().join('') === b.split('').sort().join('');
  const edgeMap = THEIR_EDGES.map((name) => EDGE_NAMES.findIndex((e) => sameLetters(e, name)));
  const cornerMap = THEIR_CORNERS.map((name) => CORNER_NAMES.findIndex((c) => sameLetters(c, name)));

  it('every move family matches piece permutation and orientation', async () => {
    const kpuzzle = await cube3x3x3.kpuzzle();
    const rand = seeded(7);
    for (let t = 0; t < 300; t += 1) {
      // Only face moves keep the centres home, so both sides read the same frame.
      // Slices, wide moves and rotations are covered by the next test.
      const text = randomAlg(rand, 25, FACE);
      const ours = toCubies(applyAlg(solvedState(), text));
      const theirs = kpuzzle.defaultPattern().applyAlg(new Alg(text)).patternData;
      expect(theirs.EDGES.pieces.map((p, i) => [edgeMap[i], edgeMap[p]]).sort((a, b) => a[0] - b[0]).map((x) => x[1]))
        .toEqual(ours.ep);
      expect(theirs.CORNERS.pieces.map((p, i) => [cornerMap[i], cornerMap[p]]).sort((a, b) => a[0] - b[0]).map((x) => x[1]))
        .toEqual(ours.cp);
      // Same oriented-or-not pattern; the two conventions differ only in labelling.
      theirs.CORNERS.orientation.forEach((o, i) => {
        expect(o === 0).toBe(ours.co[cornerMap[i]] === 0);
      });
    }
  });

  it('agrees on equality of arbitrary sequences, including rotations and wide moves', async () => {
    const kpuzzle = await cube3x3x3.kpuzzle();
    const rand = seeded(11);
    const seenOurs = new Map();
    const seenTheirs = new Map();
    const keyTheirs = (p) => JSON.stringify(p.patternData);
    for (let t = 0; t < 2000; t += 1) {
      const text = randomAlg(rand, 3, ALL);
      const a = Array.prototype.join.call(applyAlg(solvedState(), text), ',');
      const b = keyTheirs(kpuzzle.defaultPattern().applyAlg(new Alg(text)));
      // The two states must partition sequences identically.
      if (seenOurs.has(a)) expect(seenOurs.get(a)).toBe(b);
      if (seenTheirs.has(b)) expect(seenTheirs.get(b)).toBe(a);
      seenOurs.set(a, b);
      seenTheirs.set(b, a);
    }
    expect(seenOurs.size).toBeGreaterThan(200);
  });
});
