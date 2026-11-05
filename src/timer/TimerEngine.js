// Connects the pure state machine to the browser: input events, one animation
// loop, and direct DOM writes for the digits. React is deliberately not involved
// while a solve runs, so nothing re-renders 60 times a second, and heavy rendering
// elsewhere cannot affect the recorded time: start and stop come from the input
// events' own timestamps.

import { create } from 'zustand';
import { STATE, createTimerMachine } from './TimerStateMachine.js';
import { crossedCues, inspectionDisplay } from './InspectionEngine.js';
import { formatMs } from '../utils/format.js';
import { inspectionCue, readyCue, stopCue } from '../utils/sound.js';

export const useTimerState = create(() => ({ state: STATE.IDLE }));

export const machine = createTimerMachine();

let digitsEl = null;
let options = { decimals: 2, hideRunningTime: false, inspectionAudio: true, inspectionVisual: true, timerSound: false, trigger: 'space', stopWithAnyKey: true };
let onResult = null;
let frame = 0;
let cueTimer = 0;
let lastInspection = 0;

const now = () => performance.now();

// Event timestamps share performance.now()'s clock and mark when the input
// actually happened, which is more honest than when the handler got to run.
function eventTime(event) {
  const t = event?.timeStamp;
  const current = now();
  return Number.isFinite(t) && t > 0 && Math.abs(current - t) < 5000 ? t : current;
}

export function configureTimer(next) {
  options = { ...options, ...next };
  machine.configure({
    holdMs: options.holdMs,
    inspection: options.inspection,
    autoPenalties: options.inspectionAutoPenalties,
  });
}

export function bindTimerDom({ digits }) {
  digitsEl = digits;
}

export function setResultHandler(handler) {
  onResult = handler;
}

// Replacing the text node's data avoids creating nodes on every frame.
function setDigits(text) {
  const node = digitsEl.firstChild;
  if (node?.nodeType === 3) {
    if (node.data !== text) node.data = text;
  } else {
    digitsEl.textContent = text;
  }
  digitsEl.dataset.long = text.length > 5 ? 'true' : 'false';
}

function paint() {
  const t = now();
  machine.tick(t);
  const state = machine.state;
  if (digitsEl) {
    if (state === STATE.RUNNING) {
      setDigits(options.hideRunningTime ? 'solving' : formatMs(machine.elapsed(t), Math.min(options.decimals, 2) || 1));
      digitsEl.dataset.small = options.hideRunningTime ? 'true' : 'false';
      delete digitsEl.dataset.phase;
    } else if (state === STATE.INSPECTION || ((state === STATE.HOLDING || state === STATE.READY) && machine.inspectionElapsed(t) !== null)) {
      const shown = inspectionDisplay(machine.inspectionElapsed(t));
      setDigits(shown.text);
      digitsEl.dataset.small = 'false';
      if (options.inspectionVisual && state === STATE.INSPECTION) digitsEl.dataset.phase = shown.phase;
      else delete digitsEl.dataset.phase;
    }
  }
  frame = isAnimated(state) ? requestAnimationFrame(paint) : 0;
}

const isAnimated = (state) =>
  state === STATE.RUNNING || state === STATE.INSPECTION || state === STATE.HOLDING || state === STATE.READY;

function ensureLoop() {
  if (!frame && isAnimated(machine.state)) frame = requestAnimationFrame(paint);
}

function checkCues() {
  const elapsed = machine.inspectionElapsed(now());
  if (elapsed === null) return;
  if (options.inspectionAudio) crossedCues(lastInspection, elapsed).forEach(inspectionCue);
  lastInspection = elapsed;
}

machine.subscribe((event) => {
  if (event.type === 'result') {
    if (options.timerSound) stopCue();
    onResult?.(event.result);
    return;
  }
  if (event.type !== 'transition') return;
  document.documentElement.dataset.timer = event.to;
  useTimerState.setState({ state: event.to });
  if (event.to === STATE.READY && options.timerSound) readyCue();
  if (event.to === STATE.INSPECTION && event.from !== STATE.HOLDING && event.from !== STATE.READY) {
    lastInspection = 0;
    clearInterval(cueTimer);
    // An interval as well as the frame loop, so a cue still sounds if the tab is
    // in the background, where animation frames stop.
    cueTimer = setInterval(checkCues, 50);
  }
  if (event.to === STATE.RUNNING || event.to === STATE.IDLE || event.to === STATE.STOPPED) clearInterval(cueTimer);
  ensureLoop();
});

// ─── Input ───────────────────────────────────────────

const TRIGGER_KEYS = { space: ['Space'], enter: ['Enter', 'NumpadEnter'], twokey: ['KeyF', 'KeyJ'] };

function isTypingTarget(target) {
  if (!target || !target.closest) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

// Whether the user last moved focus by keyboard. The browser's own :focus-visible can't
// answer this, because it turns true for a clicked control the moment any key is pressed.
let focusedByKeyboard = false;
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => { focusedByKeyboard = false; }, true);
  window.addEventListener('keydown', (event) => { if (event.key === 'Tab') focusedByKeyboard = true; }, true);
}

function isKeyboardFocusedControl(target) {
  // A control the user tabbed to keeps its normal Space and Enter behavior. After a
  // mouse click it does not, so the next Space starts a solve instead of pressing the
  // button again. That includes the nav link clicked to get to this page.
  return focusedByKeyboard && Boolean(target?.closest?.('button, a, summary'));
}

const held = new Set();
const blocked = () => document.body.dataset.modalOpen === 'true';

function onKeyDown(event) {
  const state = machine.state;
  if (state === STATE.RUNNING) {
    if (event.repeat) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      machine.cancel(eventTime(event));
      return;
    }
    const stops = options.stopWithAnyKey
      ? !['Meta', 'Alt', 'Control', 'Tab', 'CapsLock'].includes(event.key) && !event.metaKey
      : TRIGGER_KEYS[options.trigger].includes(event.code);
    if (stops) {
      event.preventDefault();
      held.add(event.code);
      machine.press(eventTime(event));
    }
    return;
  }

  if (blocked() || isTypingTarget(event.target)) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === 'Escape' && state !== STATE.IDLE && state !== STATE.STOPPED) {
    event.preventDefault();
    machine.cancel(eventTime(event));
    return;
  }

  const keys = TRIGGER_KEYS[options.trigger];
  if (!keys.includes(event.code)) return;
  if (isKeyboardFocusedControl(event.target)) return;
  event.preventDefault(); // Also stops Space from scrolling the page.
  if (event.repeat) return;
  held.add(event.code);
  const armed = options.trigger === 'twokey' ? keys.every((k) => held.has(k)) : true;
  if (armed) machine.press(eventTime(event));
}

function onKeyUp(event) {
  const wasHeld = held.delete(event.code);
  if (!wasHeld) return;
  event.preventDefault();
  if (machine.pressed) machine.release(eventTime(event));
}

function onWindowBlur() {
  held.clear();
  machine.blur(now());
}

function onVisibility() {
  if (document.hidden) onWindowBlur();
  else ensureLoop();
}

// Touch and pen only: a mouse click on the page should stay a normal click.
function onSurfaceDown(event) {
  if (event.pointerType === 'mouse') return;
  if (event.target.closest?.('button, a, input, select, textarea')) return;
  event.preventDefault();
  machine.press(eventTime(event));
}

function onSurfaceUp(event) {
  if (event.pointerType === 'mouse') return;
  if (machine.pressed) machine.release(eventTime(event));
}

function onAnyPointerWhileRunning(event) {
  if (machine.state === STATE.RUNNING && event.pointerType !== 'mouse') {
    event.preventDefault();
    machine.press(eventTime(event));
  }
}

// Mouse clicks leave focus on the control, and the next key press would then count as
// keyboard use of that control. Dropping focus after a pointer click means Space always
// goes to the timer, while tabbing to a control still lets Space press it.
function onClick(event) {
  if (event.detail === 0 || blocked()) return;
  const active = document.activeElement;
  if (active?.matches?.('button, a, summary')) active.blur();
}

/** Attaches input for the lifetime of the timer page. Returns a detach function. */
export function attachTimerInput(surface) {
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('click', onClick);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pointerdown', onAnyPointerWhileRunning, true);
  surface?.addEventListener('pointerdown', onSurfaceDown);
  window.addEventListener('pointerup', onSurfaceUp);
  window.addEventListener('pointercancel', onWindowBlur);
  document.documentElement.dataset.timer = machine.state;
  if (!focusedByKeyboard && document.activeElement?.matches?.('button, a, summary')) document.activeElement.blur();
  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', onWindowBlur);
    window.removeEventListener('click', onClick);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pointerdown', onAnyPointerWhileRunning, true);
    surface?.removeEventListener('pointerdown', onSurfaceDown);
    window.removeEventListener('pointerup', onSurfaceUp);
    window.removeEventListener('pointercancel', onWindowBlur);
    held.clear();
    machine.blur(now());
    if (machine.state !== STATE.RUNNING && machine.state !== STATE.INSPECTION) {
      document.documentElement.dataset.timer = 'off';
    }
  };
}

export const timerIsBusy = () => {
  const s = machine.state;
  return s === STATE.RUNNING || s === STATE.INSPECTION || s === STATE.HOLDING || s === STATE.READY;
};
