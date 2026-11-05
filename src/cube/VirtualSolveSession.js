// One solve on the virtual cube, as a precise event log.
//
// Moves are timestamped from the first turn, which is when the clock starts. Rotating
// the camera is not a move and never reaches this log. Whole-cube rotations are logged
// so a replay is exact, but they do not count toward moves or turns per second.

import { isSolved } from './CubeEngine.js';

export const PHASE = { IDLE: 'idle', READY: 'ready', SOLVING: 'solving', DONE: 'done' };

export class VirtualSolveSession {
  constructor() {
    this.phase = PHASE.IDLE;
    this.scramble = '';
    this.meta = null;
    this.log = [];
    this.startedAt = null;
    this.elapsedMs = 0;
  }

  begin(scramble, meta) {
    this.phase = PHASE.READY;
    this.scramble = scramble;
    this.meta = meta;
    this.log = [];
    this.startedAt = null;
    this.elapsedMs = 0;
  }

  /** Records a turn. `state` is the cube state after it, `t` a monotonic timestamp. */
  turn(move, state, t) {
    if (this.phase === PHASE.DONE || this.phase === PHASE.IDLE) return false;
    if (this.phase === PHASE.READY) {
      // A rotation only looks at the cube, so it does not start the clock.
      if (move.kind === 'rotation') {
        this.log.push({ m: move.text, t: 0 });
        return true;
      }
      this.phase = PHASE.SOLVING;
      this.startedAt = t;
    }
    this.log.push({ m: move.text, t: Math.max(0, Math.round(t - this.startedAt)) });
    if (isSolved(state)) {
      this.phase = PHASE.DONE;
      this.elapsedMs = Math.floor(t - this.startedAt);
    }
    return true;
  }

  cancel() {
    this.phase = PHASE.IDLE;
    this.log = [];
    this.startedAt = null;
  }

  elapsed(t) {
    if (this.phase === PHASE.SOLVING) return t - this.startedAt;
    return this.elapsedMs;
  }

  get moveCount() {
    return countTurns(this.log);
  }
}

const ROTATION = /^[xyz]/;

export function countTurns(log) {
  return log.filter((event) => !ROTATION.test(event.m)).length;
}

/** Turns per second over a whole solve. */
export function turnsPerSecond(log, elapsedMs) {
  if (!elapsedMs) return 0;
  return countTurns(log) / (elapsedMs / 1000);
}

/** The longest gaps between consecutive moves: where the solver stopped to think. */
export function longestPauses(log, limit = 3) {
  const pauses = [];
  for (let i = 1; i < log.length; i += 1) {
    pauses.push({ afterMove: i, ms: log[i].t - log[i - 1].t });
  }
  return pauses.sort((a, b) => b.ms - a.ms).slice(0, limit);
}
