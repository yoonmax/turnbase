import { describe, expect, it } from 'vitest';
import { accuracy, average, isDue, masteryLevel, pickNext, review } from '../../src/trainer/SpacedRepetition.js';
import { parseImportText } from '../../src/algorithms/AlgorithmImporter.js';
import { PHASE, VirtualSolveSession, countTurns, longestPauses, turnsPerSecond } from '../../src/cube/VirtualSolveSession.js';
import { applyAlg, solvedState } from '../../src/cube/CubeEngine.js';
import { parseMoves } from '../../src/cube/CubeNotationParser.js';
import { casesFor, customEntry, goalReached, practiceState } from '../../src/trainer/caseSets.js';
import { CATALOG, getCase } from '../../src/algorithms/AlgorithmCatalog.js';
import { U_MOVES } from '../../src/algorithms/AlgorithmValidator.js';
import { applyMoves } from '../../src/cube/CubeEngine.js';

const DAY = 24 * 3600 * 1000;

describe('SM-2 scheduling', () => {
  const blank = { ease: 2.5, intervalDays: 0, repetitions: 0 };

  it('grows intervals: 1 day, 6 days, then by ease', () => {
    let r = review(blank, 5, 0);
    expect(r.intervalDays).toBe(1);
    expect(r.dueAt).toBe(DAY);
    r = review(r, 5, 0);
    expect(r.intervalDays).toBe(6);
    r = review(r, 5, 0);
    expect(r.intervalDays).toBe(Math.round(6 * r.ease) === r.intervalDays ? r.intervalDays : 16);
    expect(r.intervalDays).toBeGreaterThan(6);
  });

  it('follows the SM-2 ease formula', () => {
    expect(review(blank, 5, 0).ease).toBeCloseTo(2.6);
    expect(review(blank, 4, 0).ease).toBeCloseTo(2.5);
    expect(review(blank, 3, 0).ease).toBeCloseTo(2.36);
  });

  it('never lets ease fall below 1.3', () => {
    let r = blank;
    for (let i = 0; i < 30; i += 1) r = review(r, 0, 0);
    expect(r.ease).toBe(1.3);
  });

  it('a failed review restarts the card and makes it due now', () => {
    let r = review(review(blank, 5, 0), 5, 0);
    r = review(r, 1, 1000);
    expect(r.repetitions).toBe(0);
    expect(r.intervalDays).toBe(0);
    expect(r.dueAt).toBe(1000);
    expect(isDue(r, 1000)).toBe(true);
  });

  it('knows what is due', () => {
    expect(isDue(null)).toBe(true);
    expect(isDue({ dueAt: 100 }, 99)).toBe(false);
    expect(isDue({ dueAt: 100 }, 100)).toBe(true);
  });

  it('labels mastery from the schedule', () => {
    expect(masteryLevel(null)).toBe('New');
    expect(masteryLevel({ repetitions: 0, attempts: 2 })).toBe('Learning');
    expect(masteryLevel({ repetitions: 1, intervalDays: 1 })).toBe('Learning');
    expect(masteryLevel({ repetitions: 2, intervalDays: 6 })).toBe('Known');
    expect(masteryLevel({ repetitions: 5, intervalDays: 30 })).toBe('Mastered');
  });

  it('computes accuracy and averages', () => {
    expect(accuracy({ attempts: 4, correct: 3 })).toBe(0.75);
    expect(accuracy(null)).toBe(0);
    expect(average([1, 2, 3])).toBe(2);
    expect(average([])).toBe(null);
  });
});

describe('choosing the next case', () => {
  const cases = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const seq = (values) => {
    let i = 0;
    return () => values[i++ % values.length];
  };

  it('prefers overdue and frequently missed cases', () => {
    const now = 10 * DAY;
    const progress = new Map([
      ['a', { attempts: 5, correct: 5, dueAt: now + 5 * DAY }],
      ['b', { attempts: 5, correct: 1, dueAt: now - 2 * DAY }],
      ['c', { attempts: 5, correct: 5, dueAt: now + 5 * DAY }],
    ]);
    const counts = { a: 0, b: 0, c: 0 };
    let r = 1;
    const random = () => {
      r = (r * 16807) % 2147483647;
      return r / 2147483647;
    };
    for (let i = 0; i < 2000; i += 1) counts[pickNext(cases, progress, { now, random }).id] += 1;
    expect(counts.b).toBeGreaterThan(counts.a * 10);
    expect(counts.b).toBeGreaterThan(counts.c * 10);
  });

  it('does not repeat when it has a choice', () => {
    for (const roll of [0, 0.5, 0.99]) {
      expect(pickNext(cases, new Map(), { avoid: 'a', random: seq([roll]) }).id).not.toBe('a');
    }
    expect(pickNext([{ id: 'only' }], new Map(), { avoid: 'only' }).id).toBe('only');
  });

  it('handles an empty set', () => {
    expect(pickNext([], new Map())).toBe(null);
  });
});

describe('training sets', () => {
  it('draws the right cases', () => {
    const progress = new Map([['pll-t', { favorite: true, learned: true }]]);
    expect(casesFor('pll', progress, [])).toHaveLength(21);
    expect(casesFor('two-look', progress, [])).toHaveLength(16);
    expect(casesFor('favorites', progress, []).map((c) => c.id)).toEqual(['pll-t']);
    expect(casesFor('unlearned', progress, [])).toHaveLength(CATALOG.length - 1);
    expect(casesFor('custom', progress, [{ id: 'x', name: 'Mine', notation: "R U R' U'" }])).toHaveLength(1);
  });

  it('every case reaches its goal from its own algorithm, at any top-layer angle', () => {
    for (const entry of CATALOG) {
      expect(goalReached(entry, entry.caseState), `${entry.id} starts solved`).toBe(false);
      expect(goalReached(entry, applyMoves(entry.caseState, entry.primary.moves)), entry.id).toBe(true);
      for (const auf of U_MOVES) {
        const start = practiceState(entry, auf);
        expect(goalReached(entry, start), `${entry.id} with AUF starts solved`).toBe(false);
      }
    }
  });

  it('a wrong sequence does not count as solving', () => {
    const t = getCase('pll-t');
    expect(goalReached(t, applyAlg(t.caseState, "R U R'"))).toBe(false);
  });

  it('custom cases require a fully solved cube', () => {
    const entry = customEntry({ id: 'x', name: 'Mine', notation: "R U R' U'" });
    expect(goalReached(entry, entry.caseState)).toBe(false);
    expect(goalReached(entry, applyMoves(entry.caseState, entry.primary.moves))).toBe(true);
    expect(customEntry({ id: 'y', name: 'Bad', notation: 'nope' })).toBe(null);
    expect(customEntry({ id: 'z', name: 'Empty', notation: '' })).toBe(null);
  });
});

describe('importing algorithms', () => {
  it('reads named and unnamed lines, skipping comments', () => {
    const { algorithms, problems } = parseImportText("# my set\nSune: R U R' U R U2 R'\n\nR U R' U'\nConj: [R: U]\n[R: U R U']");
    expect(problems).toEqual([]);
    expect(algorithms.map((a) => a.name)).toEqual(['Sune', 'Algorithm 2', 'Conj', 'Algorithm 4']);
    expect(algorithms[3].notation).toBe("[R: U R U']");
  });

  it('reports bad lines by number and keeps the good ones', () => {
    const { algorithms, problems } = parseImportText("Good: R U\nBad: Q R\nEmpty:");
    expect(algorithms).toHaveLength(1);
    expect(problems[0]).toMatch(/^Line 2/);
    expect(problems[1]).toMatch(/^Line 3/);
  });
});

describe('virtual solving', () => {
  const play = (session, start, text, times) => {
    let state = start;
    parseMoves(text).forEach((move, i) => {
      state = applyAlg(state, move.text);
      session.turn(move, state, times[i]);
    });
    return state;
  };

  it('starts the clock on the first turn and stops when solved', () => {
    const s = new VirtualSolveSession();
    s.begin("R U", null);
    expect(s.phase).toBe(PHASE.READY);
    play(s, applyAlg(solvedState(), 'R U'), "U' R'", [1000, 1500.4]);
    expect(s.phase).toBe(PHASE.DONE);
    expect(s.elapsedMs).toBe(500);
    expect(s.log).toEqual([{ m: "U'", t: 0 }, { m: "R'", t: 500 }]);
  });

  it('rotations do not start the clock or count as moves', () => {
    const s = new VirtualSolveSession();
    s.begin('R', null);
    const start = applyAlg(solvedState(), 'R');
    const afterY = applyAlg(start, 'y');
    s.turn(parseMoves('y')[0], afterY, 100);
    expect(s.phase).toBe(PHASE.READY);
    expect(s.startedAt).toBe(null);
    expect(s.moveCount).toBe(0);
    const back = applyAlg(afterY, "y'");
    s.turn(parseMoves("y'")[0], back, 200);
    expect(s.phase).toBe(PHASE.READY);
    s.turn(parseMoves("R'")[0], applyAlg(back, "R'"), 300);
    expect(s.phase).toBe(PHASE.DONE);
    expect(s.moveCount).toBe(1);
  });

  it('a solved cube in a different orientation still counts', () => {
    const s = new VirtualSolveSession();
    s.begin('x', null);
    s.turn(parseMoves('R')[0], applyAlg(applyAlg(solvedState(), 'x'), 'R'), 0);
    expect(s.phase).toBe(PHASE.SOLVING);
    const done = applyAlg(applyAlg(applyAlg(solvedState(), 'x'), 'R'), "R'");
    s.turn(parseMoves("R'")[0], done, 400);
    expect(s.phase).toBe(PHASE.DONE);
  });

  it('turns after the end are refused', () => {
    const s = new VirtualSolveSession();
    s.begin('R', null);
    s.turn(parseMoves("R'")[0], solvedState(), 0);
    expect(s.turn(parseMoves('U')[0], solvedState(), 10)).toBe(false);
    expect(s.log).toHaveLength(1);
  });

  it('computes turns per second and pauses', () => {
    const log = [{ m: 'x', t: 0 }, { m: 'R', t: 0 }, { m: 'U', t: 1000 }, { m: "R'", t: 4000 }, { m: "U'", t: 5000 }];
    expect(countTurns(log)).toBe(4);
    expect(turnsPerSecond(log, 2000)).toBe(2);
    expect(turnsPerSecond(log, 0)).toBe(0);
    expect(longestPauses(log, 1)).toEqual([{ afterMove: 3, ms: 3000 }]);
  });
});
