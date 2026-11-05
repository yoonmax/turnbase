// A hands-on cube with history: the logic behind free turning and undo/redo.

import { invertMove } from './CubeMoves.js';

export class ManualCube {
  constructor(controller) {
    this.controller = controller;
    this.history = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.snapshot = { history: this.history, canUndo: false, canRedo: false, version: 0 };
  }

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  emit() {
    this.snapshot = {
      history: this.history,
      canUndo: this.history.length > 0,
      canRedo: this.redoStack.length > 0,
      version: this.snapshot.version + 1,
    };
    for (const listener of this.listeners) listener();
  }

  turn(move) {
    this.controller.enqueue(move);
    this.history = [...this.history, move];
    this.redoStack = [];
    this.emit();
  }

  turnAll(moves, options) {
    for (const move of moves) this.controller.enqueue(move, options);
    this.history = [...this.history, ...moves];
    this.redoStack = [];
    this.emit();
  }

  undo() {
    if (!this.history.length) return;
    const move = this.history[this.history.length - 1];
    this.controller.enqueue(invertMove(move));
    this.history = this.history.slice(0, -1);
    this.redoStack = [...this.redoStack, move];
    this.emit();
  }

  redo() {
    if (!this.redoStack.length) return;
    const move = this.redoStack[this.redoStack.length - 1];
    this.controller.enqueue(move);
    this.history = [...this.history, move];
    this.redoStack = this.redoStack.slice(0, -1);
    this.emit();
  }

  /** Starts over from an exact state, forgetting history. */
  reset(state) {
    this.controller.setState(state);
    this.history = [];
    this.redoStack = [];
    this.emit();
  }
}
