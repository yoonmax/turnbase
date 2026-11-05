import { describe, expect, it } from 'vitest';
import { ALGORITHM_SETS, CATALOG, casesInSet, coverage, describeMove, findTriggers, getCase, playableMoves, recognitionNotes } from '../../src/algorithms/AlgorithmCatalog.js';
import { filterCases, scoreCase, searchCases } from '../../src/algorithms/AlgorithmSearch.js';
import {
  U_MOVES,
  caseStateFor,
  crossSolved,
  edgeShape,
  f2lSolved,
  firstLayerSolved,
  lastLayerEdgesOriented,
  lastLayerOriented,
  ollFingerprint,
  orientedCornerCount,
  piecesHome,
  pllFingerprint,
  pllPieces,
  preAufFor,
  sidePatterns,
  solvedUpToAuf,
  cornersPermutedUpToAuf,
} from '../../src/algorithms/AlgorithmValidator.js';
import { applyMoves, centreIds, isSolved, solvedState } from '../../src/cube/CubeEngine.js';
import { parseMoves } from '../../src/cube/CubeNotationParser.js';
import { isLegal } from '../../src/cube/CubeState.js';

const OLL = casesInSet('oll');
const PLL = casesInSet('pll');
const F2L = casesInSet('f2l');
const HOME_CENTRES = centreIds(solvedState()).join();

describe('every entry in the catalog', () => {
  it('has a unique id', () => {
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length);
  });

  for (const entry of CATALOG) {
    describe(entry.id, () => {
      it('has a legal starting state, with centres at home, which its algorithm solves', () => {
        expect(isLegal(entry.caseState)).toBe(true);
        expect(centreIds(entry.caseState).join()).toBe(HOME_CENTRES);
        const result = applyMoves(entry.caseState, entry.primary.moves);
        expect(isSolved(result)).toBe(true);
      });

      it('is not already solved at the start', () => {
        expect(solvedUpToAuf(entry.caseState)).toBe(false);
      });
    });
  }
});

describe('OLL', () => {
  it('has exactly the numbers 1 to 57', () => {
    expect(OLL.map((c) => c.number).sort((a, b) => a - b)).toEqual(Array.from({ length: 57 }, (_, i) => i + 1));
  });

  it('has 57 distinct orientation patterns', () => {
    const prints = OLL.map((c) => ollFingerprint(c.caseState));
    expect(new Set(prints).size).toBe(57);
    // The solved orientation is the 58th class, and no case may be it.
    expect(prints).not.toContain(ollFingerprint(solvedState()));
  });

  for (const entry of OLL) {
    it(`${entry.title}: keeps F2L, orients the last layer, from the case`, () => {
      const s = entry.caseState;
      expect(f2lSolved(s)).toBe(true);
      expect(lastLayerOriented(s)).toBe(false);
      for (const alg of entry.algs) {
        const pre = preAufFor(s, alg.moves, (r) => f2lSolved(r) && lastLayerOriented(r));
        expect(pre, `${alg.notation} does not solve ${entry.title}`).not.toBe(null);
      }
    });
  }

  // Structure of each number, stated independently of the algorithms. Edges on top:
  // dot, line, l or cross. Corners on top: how many show the top colour.
  const STRUCTURE = {
    1: ['dot', 0], 2: ['dot', 0], 3: ['dot', 1], 4: ['dot', 1], 17: ['dot', 2], 18: ['dot', 2], 19: ['dot', 2], 20: ['dot', 4],
    5: ['l', 1], 6: ['l', 1], 7: ['l', 1], 8: ['l', 1], 11: ['l', 1], 12: ['l', 1], 9: ['l', 1], 10: ['l', 1],
    35: ['l', 2], 37: ['l', 2], 13: ['line', 1], 14: ['line', 1], 15: ['line', 1], 16: ['line', 1],
    29: ['l', 2], 30: ['l', 2], 41: ['l', 2], 42: ['l', 2], 39: ['line', 2], 40: ['line', 2],
    36: ['l', 2], 38: ['l', 2], 34: ['line', 2], 46: ['line', 2], 31: ['l', 2], 32: ['l', 2], 43: ['l', 2], 44: ['l', 2],
    33: ['line', 2], 45: ['line', 2], 47: ['l', 0], 48: ['l', 0], 49: ['l', 0], 50: ['l', 0], 53: ['l', 0], 54: ['l', 0],
    51: ['line', 0], 52: ['line', 0], 55: ['line', 0], 56: ['line', 0],
    21: ['cross', 0], 22: ['cross', 0], 23: ['cross', 2], 24: ['cross', 2], 25: ['cross', 2], 26: ['cross', 1], 27: ['cross', 1],
    28: ['l', 4], 57: ['line', 4],
  };

  it('the structure table covers every case', () => {
    expect(Object.keys(STRUCTURE)).toHaveLength(57);
  });

  for (const entry of OLL) {
    it(`${entry.title} has the shape its number should have`, () => {
      const [edges, corners] = STRUCTURE[entry.number];
      expect(edgeShape(entry.caseState)).toBe(edges);
      expect(orientedCornerCount(entry.caseState)).toBe(corners);
    });
  }
});

describe('PLL', () => {
  const NAMES = ['Aa', 'Ab', 'E', 'F', 'Ga', 'Gb', 'Gc', 'Gd', 'H', 'Ja', 'Jb', 'Na', 'Nb', 'Ra', 'Rb', 'T', 'Ua', 'Ub', 'V', 'Y', 'Z'];

  it('has exactly the 21 standard names', () => {
    expect(PLL.map((c) => c.name).sort()).toEqual([...NAMES].sort());
  });

  it('has 21 distinct permutation patterns', () => {
    const prints = PLL.map((c) => pllFingerprint(c.caseState));
    expect(new Set(prints).size).toBe(21);
    expect(prints).not.toContain(pllFingerprint(solvedState()));
  });

  for (const entry of PLL) {
    it(`${entry.name}: keeps F2L and orientation, and every variant solves it`, () => {
      const s = entry.caseState;
      expect(f2lSolved(s)).toBe(true);
      expect(lastLayerOriented(s)).toBe(true);
      expect(pllPieces(s)).toBe(entry.pieces);
      for (const alg of entry.algs) {
        const pre = preAufFor(s, alg.moves, solvedUpToAuf);
        expect(pre, `${alg.notation} does not solve ${entry.name}`).not.toBe(null);
      }
    });
  }

  // Which neighbouring sides show matching outer stickers (headlights) or full bars,
  // read off a solved-to-case state. These counts are what cubers recognise on sight.
  it('chiral pairs are mirror-distinct, not duplicates', () => {
    const pairs = [['Aa', 'Ab'], ['Ja', 'Jb'], ['Ra', 'Rb'], ['Na', 'Nb'], ['Ua', 'Ub'], ['Ga', 'Gc'], ['Gb', 'Gd']];
    for (const [a, b] of pairs) {
      expect(pllFingerprint(getCase(`pll-${a.toLowerCase()}`).caseState)).not.toBe(pllFingerprint(getCase(`pll-${b.toLowerCase()}`).caseState));
    }
  });

  it('Ua and Ub are each other’s inverse, as are Aa and Ab', () => {
    const inverseOf = (entry) => caseStateFor(parseMoves(entry.setup));
    expect(pllFingerprint(inverseOf(getCase('pll-ua')))).toBe(pllFingerprint(getCase('pll-ub').caseState));
    expect(pllFingerprint(inverseOf(getCase('pll-aa')))).toBe(pllFingerprint(getCase('pll-ab').caseState));
  });

  it('reads headlights and bars from the state', () => {
    // H perm: every side shows headlights and no bars.
    expect(sidePatterns(getCase('pll-h').caseState)).toEqual({ headlights: 4, bars: 0 });
    // E perm: no side has matching outer stickers at all.
    expect(sidePatterns(getCase('pll-e').caseState)).toEqual({ headlights: 0, bars: 0 });
    // Ua: one solved side (a bar) and three sets of headlights.
    expect(sidePatterns(getCase('pll-ua').caseState)).toEqual({ headlights: 3, bars: 1 });
  });
});

describe('F2L', () => {
  it('has all 41 cases', () => {
    expect(F2L).toHaveLength(41);
    expect(new Set(F2L.map((c) => c.key)).size).toBe(41);
  });

  it('splits into the groups the geometry predicts', () => {
    const count = (name) => F2L.filter((c) => c.category === name).length;
    // Top-layer pairs: 4 ready + 20 others. Corner up, edge slot: 3 × 2. Corner slot,
    // edge up: 3 × 2. Both in slot: 3 × 2 less the solved case.
    expect(count('Pair ready to insert') + count('Corner up, edge up')).toBe(24);
    expect(count('Corner up, edge in slot')).toBe(6);
    expect(count('Corner in slot, edge up')).toBe(6);
    expect(count('Both in slot')).toBe(5);
  });

  for (const entry of F2L) {
    it(`${entry.title}: cross and other slots intact, target pair out, every variant solves it`, () => {
      const s = entry.caseState;
      expect(crossSolved(s)).toBe(true);
      expect(piecesHome(s, ['DF', 'DR', 'DL', 'DB', 'FL', 'BL', 'BR', 'DLF', 'DBL', 'DRB'])).toBe(true);
      expect(piecesHome(s, ['FR', 'DFR'])).toBe(false);
      for (const alg of entry.algs) {
        const pre = preAufFor(s, alg.moves, f2lSolved);
        expect(pre, `${alg.notation} does not solve ${entry.title}`).not.toBe(null);
      }
    });
  }
});

describe('beginner and two-look sets', () => {
  const checkGoal = (entry) => {
    const end = applyMoves(entry.caseState, entry.primary.moves);
    const { goal } = entry;
    if (goal.pieces) expect(piecesHome(end, goal.pieces)).toBe(true);
    if (goal.edgesOriented) expect(lastLayerEdgesOriented(end)).toBe(true);
    if (goal.oriented) expect(lastLayerOriented(end)).toBe(true);
    if (goal.cornersPermuted) expect(cornersPermutedUpToAuf(end)).toBe(true);
    if (goal.solved) expect(solvedUpToAuf(end)).toBe(true);
    expect(isLegal(end)).toBe(true);
  };
  const checkKeeps = (entry) => {
    const s = entry.caseState;
    for (const keep of entry.keeps ?? []) {
      if (keep === 'f2l') expect(f2lSolved(s)).toBe(true);
      if (keep === 'oriented') expect(lastLayerOriented(s)).toBe(true);
      if (keep === 'cross') expect(crossSolved(s)).toBe(true);
      if (keep === 'cross-others') expect(piecesHome(s, ['DR', 'DL', 'DB'])).toBe(true);
      if (keep === 'first-layer') expect(firstLayerSolved(s)).toBe(true);
    }
  };

  for (const entry of [...casesInSet('beginner'), ...casesInSet('2lo'), ...casesInSet('2lp')]) {
    it(`${entry.id} reaches its goal without disturbing what it keeps`, () => {
      checkGoal(entry);
      checkKeeps(entry);
      if (entry.startEdges) expect(edgeShape(entry.caseState)).toBe(entry.startEdges);
    });
  }

  it('cross cases start with the target edge out of place', () => {
    expect(piecesHome(getCase('beginner-cross-above').caseState, ['DF'])).toBe(false);
    expect(piecesHome(getCase('beginner-cross-flipped').caseState, ['DF'])).toBe(false);
  });

  it('first-layer corner cases have white where their names say', () => {
    const D_HOME = new Set([27, 28, 29, 30, 31, 32, 33, 34, 35]);
    const at = (entry, index) => D_HOME.has(getCase(entry).caseState[index]);
    // URF corner facelets: U row 2 col 2 (8), R row 0 col 0 (9), F row 0 col 2 (20).
    expect(at('beginner-corner-right', 9)).toBe(true);
    expect(at('beginner-corner-front', 20)).toBe(true);
    expect(at('beginner-corner-up', 8)).toBe(true);
  });

  it('middle-layer cases start with the first layer solved and the edge up top', () => {
    expect(firstLayerSolved(getCase('beginner-middle-right').caseState)).toBe(true);
    expect(firstLayerSolved(getCase('beginner-middle-left').caseState)).toBe(true);
    expect(piecesHome(getCase('beginner-middle-right').caseState, ['FR'])).toBe(false);
    expect(piecesHome(getCase('beginner-middle-left').caseState, ['FL'])).toBe(false);
  });

  it('two-look corner cases are the OLL cases they claim', () => {
    for (const entry of casesInSet('2lo').filter((c) => c.matchesOll)) {
      expect(ollFingerprint(entry.caseState)).toBe(ollFingerprint(getCase(`oll-${entry.matchesOll}`).caseState));
    }
  });

  it('two-look PLL cases are the PLL cases they claim', () => {
    for (const entry of casesInSet('2lp')) {
      expect(pllFingerprint(entry.caseState)).toBe(pllFingerprint(getCase(`pll-${entry.matchesPll.toLowerCase()}`).caseState));
    }
  });

  it('beginner last-layer corner step leaves edges alone', () => {
    expect(pllPieces(getCase('beginner-permute-corners').caseState)).toBe('corners:3');
    expect(pllPieces(getCase('beginner-permute-edges').caseState)).toBe('edges:3');
  });
});

describe('coverage report', () => {
  it('states complete counts only when they are true', () => {
    for (const row of coverage()) {
      expect(row.count).toBe(row.expected);
      expect(row.complete).toBe(true);
    }
    expect(ALGORITHM_SETS.map((s) => s.expected)).toEqual([21, 57, 41, 10, 6, 11]);
  });
});

describe('playable moves', () => {
  it('adds the lead-in U an alternative needs', () => {
    for (const entry of [...OLL, ...PLL, ...F2L]) {
      entry.algs.forEach((_, i) => {
        const { moves } = playableMoves(entry, i);
        const result = applyMoves(entry.caseState, moves);
        const check = entry.family === 'pll' ? solvedUpToAuf(result) : entry.family === 'oll' ? f2lSolved(result) && lastLayerOriented(result) : f2lSolved(result);
        expect(check, `${entry.id} variant ${i}`).toBe(true);
      });
    }
  });
});

describe('search', () => {
  const names = (query) => searchCases(CATALOG, query).map((c) => c.id);

  it('finds by name', () => {
    expect(names('t perm')[0]).toBe('pll-t');
    expect(names('sune')).toContain('oll-27');
    expect(names('Anti-Sune')[0]).toBe('oll-26');
  });

  it('finds by case number', () => {
    expect(names('27')[0]).toBe('oll-27');
    expect(names('oll 45')[0]).toBe('oll-45');
  });

  it('finds by notation, ignoring spacing and primes', () => {
    expect(names("R U R' U R U2 R'")[0]).toBe('oll-27');
    expect(names('ruru2')).toEqual(expect.arrayContaining(['oll-27']));
  });

  it('finds by category, tag and method', () => {
    expect(names('knight')).toEqual(expect.arrayContaining(['oll-13', 'oll-14', 'oll-15', 'oll-16']));
    expect(names('layer by layer')).toContain('beginner-cross-above');
    expect(names('g perm')).toEqual(expect.arrayContaining(['pll-ga', 'pll-gb', 'pll-gc', 'pll-gd']));
  });

  it('tolerates a loose spelling', () => {
    expect(scoreCase(getCase('oll-27'), 'sne')).toBeGreaterThan(0);
  });

  it('returns nothing for nonsense', () => {
    expect(names('qqqqqq')).toEqual([]);
  });

  it('filters', () => {
    const progress = new Map([['pll-t', { learned: true, favorite: true }]]);
    expect(filterCases(CATALOG, { family: 'pll', learned: true }, progress).map((c) => c.id)).toEqual(['pll-t']);
    expect(filterCases(CATALOG, { family: 'pll', learned: false }, progress)).toHaveLength(20);
    expect(filterCases(CATALOG, { favorites: true }, progress)).toHaveLength(1);
    expect(filterCases(CATALOG, { family: 'oll', category: 'Cross' })).toHaveLength(7);
    expect(filterCases(CATALOG, { family: 'oll', maxMoves: 6 }).every((c) => c.moveCount <= 6)).toBe(true);
  });
});

describe('explanations', () => {
  it('describes moves in words', () => {
    const say = (t) => describeMove(parseMoves(t)[0]);
    expect(say('R')).toBe('Turn the right face clockwise');
    expect(say("U'")).toBe('Turn the top face counterclockwise');
    expect(say('F2')).toBe('Turn the front face half a turn');
    expect(say('M')).toContain('middle layer');
    expect(say('r')).toContain('right two layers');
    expect(say('y')).toContain('whole cube');
  });

  it('finds named triggers', () => {
    expect(findTriggers(parseMoves("F R U R' U' F'"))).toEqual([{ start: 1, length: 4, name: 'the sexy move' }]);
    expect(findTriggers(parseMoves("R' F R F'"))[0].name).toBe('the sledgehammer');
  });

  it('writes recognition notes from state', () => {
    expect(recognitionNotes(getCase('oll-27')).join(' ')).toContain('full cross');
    expect(recognitionNotes(getCase('oll-27')).join(' ')).toContain('1 corner shows');
    expect(recognitionNotes(getCase('pll-h')).join(' ')).toContain('Two pairs of edges swap');
    expect(recognitionNotes(getCase('f2l-1')).join(' ')).toContain('top layer');
  });

  it('U_MOVES is the four angles', () => {
    expect(U_MOVES).toHaveLength(4);
  });
});
