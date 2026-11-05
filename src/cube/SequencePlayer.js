// Plays a move list on a controller. The sequence has a list of exact states, one
// per index, computed from the engine before anything plays. Scrubbing, restarting
// and interrupting all land on those states, so a position in the timeline always
// means exactly one cube state regardless of how playback got there.

import { applyMove } from './CubeEngine.js';
import { invertMove } from './CubeMoves.js';

export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4];

export class SequencePlayer {
  constructor(controller, { baseState = controller.state, moves = [], timeline = null } = {}) {
    this.controller = controller;
    this.listeners = new Set();
    this.speed = 1;
    this.loop = false;
    this.reverse = false;
    this.playing = false;
    this.timer = null;
    this.snapshot = null;
    this.load({ baseState, moves, timeline });
  }

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  emit() {
    this.snapshot = {
      index: this.index,
      total: this.moves.length,
      playing: this.playing,
      speed: this.speed,
      loop: this.loop,
      reverse: this.reverse,
      activeIndex: this.activeIndex,
    };
    for (const listener of this.listeners) listener();
  }

  /** Loads a sequence, and puts the cube at its start. */
  load({ baseState, moves, timeline = null, startAt = 0 }) {
    this.stopTimer();
    this.playing = false;
    this.baseState = baseState;
    this.moves = moves;
    this.timeline = timeline; // Optional per-move timestamps in ms, for replays.
    this.states = [baseState];
    for (const move of moves) {
      this.states.push(applyMove(this.states[this.states.length - 1], move, this.controller.n));
    }
    this.index = startAt;
    this.activeIndex = -1;
    this.token = (this.token ?? 0) + 1;
    this.controller.setState(this.states[startAt]);
    this.emit();
  }

  stateAt(index) {
    return this.states[index];
  }

  stopTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  // Lands exactly on the current index, canceling any turn in flight.
  settle() {
    this.stopTimer();
    this.token += 1;
    this.controller.setState(this.states[this.index]);
    this.activeIndex = -1;
  }

  animateTo(nextIndex, { onDone = null } = {}) {
    const forward = nextIndex > this.index;
    const move = forward ? this.moves[this.index] : invertMove(this.moves[nextIndex]);
    this.activeIndex = forward ? this.index : nextIndex;
    this.index = nextIndex;
    const token = (this.token += 1);
    this.controller.speed = this.speed;
    this.controller.enqueue(move, {
      onDone: () => {
        if (token !== this.token) return;
        this.activeIndex = -1;
        this.emit();
        onDone?.();
      },
    });
    this.emit();
  }

  stepForward() {
    this.pauseOnly();
    this.settle();
    if (this.index < this.moves.length) this.animateTo(this.index + 1);
    else this.emit();
  }

  stepBackward() {
    this.pauseOnly();
    this.settle();
    if (this.index > 0) this.animateTo(this.index - 1);
    else this.emit();
  }

  jumpTo(index) {
    this.pauseOnly();
    this.index = Math.max(0, Math.min(this.moves.length, index));
    this.settle();
    this.emit();
  }

  restart() {
    const wasPlaying = this.playing;
    this.jumpTo(this.reverse ? this.moves.length : 0);
    if (wasPlaying) this.play();
  }

  jumpToEnd() {
    this.jumpTo(this.moves.length);
  }

  play() {
    if (!this.moves.length) return;
    const atEnd = this.reverse ? this.index === 0 : this.index === this.moves.length;
    if (atEnd) {
      this.index = this.reverse ? this.moves.length : 0;
      this.settle();
    }
    this.playing = true;
    this.emit();
    this.advance();
  }

  pauseOnly() {
    this.playing = false;
    this.stopTimer();
  }

  pause() {
    this.pauseOnly();
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  // Ms to wait before the next move. Only replays have recorded gaps.
  gapBefore(index) {
    if (!this.timeline || this.reverse) return 0;
    const previous = index === 0 ? 0 : this.timeline[index - 1];
    return Math.max(0, this.timeline[index] - previous) / this.speed;
  }

  advance() {
    if (!this.playing) return;
    const finished = this.reverse ? this.index === 0 : this.index === this.moves.length;
    if (finished) {
      if (this.loop) {
        this.stopTimer();
        this.timer = setTimeout(() => {
          if (!this.playing) return;
          this.index = this.reverse ? this.moves.length : 0;
          this.settle();
          this.emit();
          this.timer = setTimeout(() => this.advance(), 200);
        }, 500);
        return;
      }
      this.playing = false;
      this.emit();
      return;
    }
    const next = this.index + (this.reverse ? -1 : 1);
    const go = () => this.animateTo(next, { onDone: () => this.advance() });
    const gap = this.gapBefore(this.index);
    // In a replay the recorded pause includes the turn itself, so the animation
    // runs at a brisk fixed rate and starts when the original move happened.
    if (gap > 0) this.timer = setTimeout(go, gap);
    else go();
  }

  setSpeed(speed) {
    this.speed = speed;
    this.controller.speed = speed;
    this.emit();
  }

  setLoop(loop) {
    this.loop = loop;
    this.emit();
  }

  setReverse(reverse) {
    this.reverse = reverse;
    this.emit();
  }

  dispose() {
    this.pauseOnly();
    this.token += 1;
    this.listeners.clear();
  }
}
