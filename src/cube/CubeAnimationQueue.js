// The bridge between exact logic and smooth pictures.
//
// `state` is the canonical result of every move accepted so far, and it changes
// the instant a move is accepted. `visual` is the exact state currently on screen,
// which lags behind while moves animate. During a turn the renderer draws `visual`
// with one layer rotated by `pose().angle`. When the turn ends, the rotation is
// dropped and `visual` gets the move applied exactly. No rotation is ever
// accumulated, so thousands of turns cannot drift.

import { applyMove, solvedState } from './CubeEngine.js';
import { moveGeometry } from './CubeMoves.js';

export const EASINGS = {
  smooth: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  crisp: (t) => 1 - (1 - t) ** 3,
  linear: (t) => t,
};

export class CubeController {
  constructor({ n = 3, state = null, turnMs = 160, easing = 'smooth', instant = false, onTurnStart = null, now = () => performance.now() } = {}) {
    this.n = n;
    this.state = state ?? solvedState(n);
    this.visual = this.state;
    this.turnMs = turnMs;
    this.easing = easing;
    this.instant = instant;
    this.speed = 1;
    this.onTurnStart = onTurnStart;
    this.now = now;
    this.queue = [];
    this.active = null;
    this.listeners = new Set();
    this.version = 0;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  configure({ turnMs, easing, instant, onTurnStart }) {
    if (turnMs !== undefined) this.turnMs = turnMs;
    if (easing !== undefined) this.easing = easing;
    if (instant !== undefined) this.instant = instant;
    if (onTurnStart !== undefined) this.onTurnStart = onTurnStart;
  }

  get animating() {
    return this.active !== null || this.queue.length > 0;
  }

  /** Accepts a move: the state updates at once and the animation joins the queue. */
  enqueue(move, { onDone = null, instant = false, durationMs = null } = {}) {
    this.state = applyMove(this.state, move, this.n);
    this.queue.push({ move, onDone, instant, durationMs });
    this.emit();
    return this.state;
  }

  /** Jumps to an exact state, dropping anything still animating. */
  setState(state) {
    this.state = state;
    this.visual = state;
    this.queue = [];
    this.active = null;
    this.emit();
  }

  /** Finishes all animation immediately, without changing the destination. */
  flush() {
    const hadWork = this.animating;
    const pending = [];
    if (this.active?.onDone) pending.push(this.active.onDone);
    for (const item of this.queue) if (item.onDone) pending.push(item.onDone);
    this.visual = this.state;
    this.queue = [];
    this.active = null;
    if (hadWork) this.emit();
    for (const fn of pending) fn();
  }

  durationFor(item) {
    if (item.instant || this.instant) return 0;
    if (item.durationMs !== null) return item.durationMs;
    const quarters = Math.abs(item.move.amount);
    const base = this.turnMs * (quarters === 2 ? 1.5 : 1);
    // Fast typists get faster turns so the cube never falls far behind the keys.
    const backlog = 1 + Math.max(0, this.queue.length) * 0.45;
    return base / (backlog * this.speed);
  }

  /**
   * Advances time. Returns the pose to draw: the exact visual state, and which
   * layers are mid-rotation by how many radians.
   */
  update(time = this.now()) {
    let changed = false;
    for (;;) {
      if (!this.active) {
        const next = this.queue.shift();
        if (!next) break;
        const duration = this.durationFor(next);
        this.active = { ...next, geometry: moveGeometry(next.move, this.n), startedAt: time, duration };
        this.onTurnStart?.(next.move);
        changed = true;
      }
      const elapsed = time - this.active.startedAt;
      if (elapsed < this.active.duration) break;
      this.visual = applyMove(this.visual, this.active.move, this.n);
      const { onDone } = this.active;
      this.active = null;
      changed = true;
      onDone?.();
    }
    if (changed) this.version += 1;
    return this.pose(time);
  }

  pose(time = this.now()) {
    if (!this.active) return { visual: this.visual, axis: 0, layers: null, angle: 0 };
    const { geometry, startedAt, duration } = this.active;
    const raw = duration <= 0 ? 1 : Math.min(1, (time - startedAt) / duration);
    const eased = (EASINGS[this.easing] ?? EASINGS.smooth)(raw);
    return { visual: this.visual, axis: geometry.axis, layers: geometry.layers, angle: (eased * geometry.quarter * Math.PI) / 2 };
  }
}
