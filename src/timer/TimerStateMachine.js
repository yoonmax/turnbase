// The timer as a pure state machine. Every event carries its own timestamp, so
// recorded times are differences between two input timestamps and depend on
// neither frame rate nor how promptly this code happened to run.
//
//   idle ──press──▶ holding ──(hold time)──▶ ready ──release──▶ running ──press──▶ stopped
//                      │ release too early        ▲                                   │
//                      ▼                          │                                   │
//                   previous state                └──────── holding ◀───press─────────┘
//
//   With inspection: idle ──press, release──▶ inspection ──press──▶ holding ...
//
// `stopped` doubles as penalty review: the result stays on screen until the next
// attempt starts or the user acts on it.

import { inspectionPenalty } from './InspectionEngine.js';

export const STATE = {
  IDLE: 'idle',
  INSPECTION: 'inspection',
  HOLDING: 'holding',
  READY: 'ready',
  RUNNING: 'running',
  STOPPED: 'stopped',
};

export const DEFAULT_TIMER_CONFIG = {
  holdMs: 300,
  inspection: false,
  autoPenalties: true,
  // A running timer ignores presses this soon after starting, which absorbs key
  // bounce and an accidental second tap without affecting any real solve.
  minRunMs: 60,
};

export function createTimerMachine(initialConfig = {}) {
  let config = { ...DEFAULT_TIMER_CONFIG, ...initialConfig };
  let state = STATE.IDLE;
  let pressed = false;
  let holdStart = 0;
  let returnState = STATE.IDLE; // Where an aborted hold goes back to.
  let armedInspection = false; // Press seen in idle, inspection starts on release.
  let inspectionStart = null;
  let runStart = null;
  let lastResult = null;

  const listeners = new Set();
  const emit = (type, detail) => {
    for (const listener of listeners) listener({ type, state, ...detail });
  };
  const go = (next, detail) => {
    if (next === state) return;
    const from = state;
    state = next;
    emit('transition', { from, to: next, ...detail });
  };

  const beginHold = (t) => {
    returnState = state;
    holdStart = t;
    go(config.holdMs <= 0 ? STATE.READY : STATE.HOLDING, { t });
  };

  const stopAt = (t) => {
    const rawMs = Math.max(0, Math.floor(t - runStart));
    lastResult = { ...pendingStart, rawMs, stoppedAt: t };
    runStart = null;
    inspectionStart = null;
    go(STATE.STOPPED, { t, result: lastResult });
    emit('result', { result: lastResult });
  };

  let pendingStart = null;

  const startAt = (t) => {
    const inspectionMs = inspectionStart === null ? null : t - inspectionStart;
    const earned = inspectionMs === null ? 'none' : inspectionPenalty(inspectionMs);
    pendingStart = {
      inspectionMs: inspectionMs === null ? null : Math.floor(inspectionMs),
      // What the rules would give, kept even when automatic penalties are off.
      inspectionPenalty: earned,
      penalty: config.autoPenalties ? earned : 'none',
    };
    runStart = t;
    go(STATE.RUNNING, { t });
  };

  const machine = {
    get state() {
      return state;
    },
    get config() {
      return config;
    },
    get result() {
      return lastResult;
    },
    get pressed() {
      return pressed;
    },
    configure(next) {
      config = { ...config, ...next };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    press(t) {
      if (pressed) return false; // Key repeat, or a press with no release between.
      switch (state) {
        case STATE.RUNNING:
          if (t - runStart < config.minRunMs) return false;
          pressed = true;
          stopAt(t);
          return true;
        case STATE.IDLE:
          pressed = true;
          if (config.inspection) {
            armedInspection = true;
            return true;
          }
          beginHold(t);
          return true;
        case STATE.STOPPED:
          pressed = true;
          if (config.inspection) {
            armedInspection = true;
            return true;
          }
          beginHold(t);
          return true;
        case STATE.INSPECTION:
          pressed = true;
          beginHold(t);
          return true;
        default:
          return false;
      }
    },

    release(t) {
      if (!pressed) return false;
      pressed = false;
      if (armedInspection) {
        armedInspection = false;
        inspectionStart = t;
        go(STATE.INSPECTION, { t });
        return true;
      }
      if (state === STATE.HOLDING || state === STATE.READY) {
        if (t - holdStart >= config.holdMs) {
          startAt(t);
        } else {
          go(returnState, { t, aborted: true });
        }
        return true;
      }
      return false; // The release that follows a stop, for instance.
    },

    /** Promotes holding to ready once the threshold passes. Safe to call anytime. */
    tick(t) {
      if (state === STATE.HOLDING && t - holdStart >= config.holdMs) {
        go(STATE.READY, { t });
      }
    },

    /** The window lost focus, so any key-up may never arrive. */
    blur(t) {
      const wasHolding = state === STATE.HOLDING || state === STATE.READY;
      pressed = false;
      armedInspection = false;
      if (wasHolding) go(returnState, { t, aborted: true });
      // A running timer or inspection keeps counting: the cube is still in play.
    },

    /** Abandons the current attempt without recording anything. */
    cancel(t) {
      pressed = false;
      armedInspection = false;
      runStart = null;
      inspectionStart = null;
      pendingStart = null;
      if (state !== STATE.IDLE) go(STATE.IDLE, { t, cancelled: true });
    },

    /** Clears a finished result, ready for the next attempt. */
    reset(t) {
      if (state === STATE.STOPPED) {
        lastResult = null;
        go(STATE.IDLE, { t });
      }
    },

    elapsed(t) {
      if (state === STATE.RUNNING) return t - runStart;
      return lastResult && state === STATE.STOPPED ? lastResult.rawMs : 0;
    },

    inspectionElapsed(t) {
      return inspectionStart === null ? null : t - inspectionStart;
    },

    holdProgress(t) {
      if (state !== STATE.HOLDING) return state === STATE.READY ? 1 : 0;
      return config.holdMs <= 0 ? 1 : Math.min(1, (t - holdStart) / config.holdMs);
    },
  };
  return machine;
}
