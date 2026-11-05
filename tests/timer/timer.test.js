import { describe, expect, it } from 'vitest';
import { STATE, createTimerMachine } from '../../src/timer/TimerStateMachine.js';
import { crossedCues, inspectionDisplay, inspectionPenalty } from '../../src/timer/InspectionEngine.js';
import { buildSolve, withPenalty } from '../../src/timer/SolveRecorder.js';

const machine = (config) => createTimerMachine({ holdMs: 300, ...config });

describe('spacebar hold, start, stop', () => {
  it('holding reaches ready only after the threshold, and starts on release', () => {
    const m = machine();
    expect(m.state).toBe(STATE.IDLE);
    m.press(1000);
    expect(m.state).toBe(STATE.HOLDING);
    m.tick(1299);
    expect(m.state).toBe(STATE.HOLDING);
    m.tick(1300);
    expect(m.state).toBe(STATE.READY);
    m.release(1500);
    expect(m.state).toBe(STATE.RUNNING);
    m.press(11500);
    expect(m.state).toBe(STATE.STOPPED);
    expect(m.result.rawMs).toBe(10000);
  });

  it('measures from the release timestamp, not from when ready appeared', () => {
    const m = machine();
    m.press(0);
    m.tick(300);
    m.release(5000);
    m.press(5123.9);
    expect(m.result.rawMs).toBe(123);
  });

  it('an early release returns to the previous state without starting', () => {
    const m = machine();
    m.press(0);
    m.release(299);
    expect(m.state).toBe(STATE.IDLE);
    expect(m.result).toBe(null);
  });

  it('a release past the threshold starts even if no tick happened', () => {
    const m = machine();
    m.press(0);
    m.release(300);
    expect(m.state).toBe(STATE.RUNNING);
  });

  it('a threshold of zero is ready straight away', () => {
    const m = machine({ holdMs: 0 });
    m.press(0);
    expect(m.state).toBe(STATE.READY);
    m.release(0);
    expect(m.state).toBe(STATE.RUNNING);
  });

  it('precision: start and stop timestamps determine the time exactly', () => {
    const m = machine();
    m.press(100.25);
    m.release(1000.5);
    m.press(2234.5);
    expect(m.result.rawMs).toBe(1234);
  });
});

describe('key repeat and double inputs', () => {
  it('repeated presses while held do nothing', () => {
    const m = machine();
    expect(m.press(0)).toBe(true);
    expect(m.press(30)).toBe(false);
    expect(m.press(60)).toBe(false);
    m.tick(301);
    expect(m.state).toBe(STATE.READY);
    m.release(400);
    expect(m.state).toBe(STATE.RUNNING);
  });

  it('a bounce right after starting cannot stop the timer', () => {
    const m = machine({ minRunMs: 60 });
    m.press(0);
    m.release(300);
    expect(m.press(320)).toBe(false);
    expect(m.state).toBe(STATE.RUNNING);
    expect(m.press(361)).toBe(true);
    expect(m.state).toBe(STATE.STOPPED);
  });

  it('the release that follows a stop does not start anything', () => {
    const m = machine();
    m.press(0);
    m.release(300);
    m.press(5000);
    expect(m.state).toBe(STATE.STOPPED);
    m.release(5100);
    expect(m.state).toBe(STATE.STOPPED);
  });

  it('a stray release is ignored', () => {
    const m = machine();
    expect(m.release(10)).toBe(false);
    expect(m.state).toBe(STATE.IDLE);
  });

  it('the next attempt can start from the stopped state, keeping the last result on abort', () => {
    const m = machine();
    m.press(0);
    m.release(300);
    m.press(1300);
    m.release(1350);
    m.press(2000);
    expect(m.state).toBe(STATE.HOLDING);
    m.release(2100);
    expect(m.state).toBe(STATE.STOPPED);
    expect(m.result.rawMs).toBe(1000);
    m.press(3000);
    m.release(3400);
    expect(m.state).toBe(STATE.RUNNING);
  });
});

describe('lost focus', () => {
  it('blur during a hold cancels the hold', () => {
    const m = machine();
    m.press(0);
    m.tick(400);
    m.blur(450);
    expect(m.state).toBe(STATE.IDLE);
    expect(m.pressed).toBe(false);
    expect(m.release(500)).toBe(false);
    expect(m.state).toBe(STATE.IDLE);
  });

  it('blur while running keeps timing, and a later press still stops it', () => {
    const m = machine();
    m.press(0);
    m.release(300);
    m.blur(800);
    expect(m.state).toBe(STATE.RUNNING);
    m.press(1300);
    expect(m.result.rawMs).toBe(1000);
  });

  it('a stuck key cannot block the next press after blur', () => {
    const m = machine();
    m.press(0);
    m.blur(10);
    expect(m.press(20)).toBe(true);
  });
});

describe('invalid transitions', () => {
  it('cancel discards a run without a result', () => {
    const m = machine();
    const results = [];
    m.subscribe((e) => e.type === 'result' && results.push(e.result));
    m.press(0);
    m.release(300);
    m.cancel(900);
    expect(m.state).toBe(STATE.IDLE);
    expect(m.result).toBe(null);
    expect(results).toEqual([]);
  });

  it('tick outside of a hold does nothing', () => {
    const m = machine();
    m.tick(99999);
    expect(m.state).toBe(STATE.IDLE);
    m.press(0);
    m.release(300);
    m.tick(99999);
    expect(m.state).toBe(STATE.RUNNING);
  });

  it('emits a single result per solve', () => {
    const m = machine();
    const results = [];
    m.subscribe((e) => e.type === 'result' && results.push(e.result));
    m.press(0);
    m.release(300);
    m.press(1000);
    m.press(1001);
    m.release(1002);
    expect(results).toHaveLength(1);
  });

  it('reset clears a finished result', () => {
    const m = machine();
    m.press(0);
    m.release(300);
    m.press(1000);
    m.release(1001);
    m.reset(1100);
    expect(m.state).toBe(STATE.IDLE);
    expect(m.result).toBe(null);
  });
});

describe('inspection boundaries', () => {
  it('follows the regulation boundaries exactly', () => {
    expect(inspectionPenalty(0)).toBe('none');
    expect(inspectionPenalty(14999.999)).toBe('none');
    expect(inspectionPenalty(15000)).toBe('+2');
    expect(inspectionPenalty(16999.999)).toBe('+2');
    expect(inspectionPenalty(17000)).toBe('dnf');
    expect(inspectionPenalty(60000)).toBe('dnf');
  });

  it('cues fire once at 8 and 12 seconds, even across a slow frame', () => {
    expect(crossedCues(7999, 8000)).toEqual([8000]);
    expect(crossedCues(8000, 8001)).toEqual([]);
    expect(crossedCues(7000, 13000)).toEqual([8000, 12000]);
  });

  it('displays the time remaining', () => {
    expect(inspectionDisplay(0).text).toBe('15');
    expect(inspectionDisplay(1).text).toBe('15');
    expect(inspectionDisplay(14999).text).toBe('1');
    expect(inspectionDisplay(15000).text).toBe('+2');
    expect(inspectionDisplay(17000).text).toBe('DNF');
  });

  function inspect(config, startAfterMs) {
    const m = machine({ inspection: true, holdMs: 0, ...config });
    m.press(0);
    expect(m.state).toBe(STATE.IDLE);
    m.release(100);
    expect(m.state).toBe(STATE.INSPECTION);
    m.press(100 + startAfterMs);
    m.release(100 + startAfterMs);
    expect(m.state).toBe(STATE.RUNNING);
    m.press(100 + startAfterMs + 10000);
    return m.result;
  }

  it('starting under 15 s carries no penalty', () => {
    const r = inspect({}, 14999);
    expect(r).toMatchObject({ penalty: 'none', inspectionMs: 14999, rawMs: 10000 });
  });

  it('starting at 15.00 s gives +2 without touching the raw time', () => {
    const r = inspect({}, 15000);
    expect(r).toMatchObject({ penalty: '+2', inspectionPenalty: '+2', rawMs: 10000 });
  });

  it('starting at 17.00 s is DNF without touching the raw time', () => {
    const r = inspect({}, 17000);
    expect(r).toMatchObject({ penalty: 'dnf', inspectionPenalty: 'dnf', rawMs: 10000 });
  });

  it('practice mode records what was earned but applies no penalty', () => {
    const r = inspect({ autoPenalties: false }, 16000);
    expect(r).toMatchObject({ penalty: 'none', inspectionPenalty: '+2', inspectionMs: 16000 });
  });

  it('holding during inspection and letting go early returns to inspection', () => {
    const m = machine({ inspection: true, holdMs: 300 });
    m.press(0);
    m.release(10);
    m.press(1000);
    expect(m.state).toBe(STATE.HOLDING);
    m.release(1100);
    expect(m.state).toBe(STATE.INSPECTION);
    expect(m.inspectionElapsed(1100)).toBe(1090);
  });

  it('inspection time runs to the release, including the hold', () => {
    const m = machine({ inspection: true, holdMs: 300 });
    m.press(0);
    m.release(0);
    m.press(14800);
    m.tick(15100);
    m.release(15200);
    expect(m.state).toBe(STATE.RUNNING);
    m.press(16200);
    expect(m.result.penalty).toBe('+2');
  });

  it('blur during inspection keeps inspection running', () => {
    const m = machine({ inspection: true });
    m.press(0);
    m.release(0);
    m.blur(5000);
    expect(m.state).toBe(STATE.INSPECTION);
  });
});

describe('solve records', () => {
  it('keeps raw duration and penalty separate', () => {
    const s = buildSolve({ rawMs: 12345, penalty: '+2', sessionId: 'a' });
    expect(s.rawMs).toBe(12345);
    expect(s.displayedCs).toBe(1434);
    expect(s.penaltySource).toBe('inspection');
    const cleared = withPenalty(s, 'none');
    expect(cleared.rawMs).toBe(12345);
    expect(cleared.displayedCs).toBe(1234);
    expect(cleared.penaltySource).toBe(null);
    const dnf = withPenalty(cleared, 'dnf');
    expect(dnf.rawMs).toBe(12345);
    expect(dnf.penaltySource).toBe('user');
  });
});
