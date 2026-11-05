import { describe, expect, it } from 'vitest';
import { CubeController } from '../../src/cube/CubeAnimationQueue.js';
import { SequencePlayer } from '../../src/cube/SequencePlayer.js';
import { ManualCube } from '../../src/cube/ManualCube.js';
import { applyAlg, isSolved, solvedState, statesEqual } from '../../src/cube/CubeEngine.js';
import { parseMoves } from '../../src/cube/CubeNotationParser.js';
import { BUILT_IN_PROFILES, bindingProblem, bindingsByMove, comboFromEvent, moveForEvent, moveFromDrag, validateProfile } from '../../src/cube/CubeControls.js';
import { getCubeModel } from '../../src/cube/CubeEngine.js';
import { moveGeometry } from '../../src/cube/CubeMoves.js';

function testController(options = {}) {
  let t = 0;
  const c = new CubeController({ turnMs: 100, now: () => t, ...options });
  return { c, tick: (ms) => { t += ms; return c.update(t); }, time: () => t };
}

describe('animation queue', () => {
  it('state changes at once, the visual state only when the turn ends', () => {
    const { c, tick } = testController();
    const R = parseMoves('R')[0];
    c.enqueue(R);
    expect(statesEqual(c.state, applyAlg(solvedState(), 'R'))).toBe(true);
    expect(statesEqual(c.visual, solvedState())).toBe(true);
    const mid = tick(0);
    expect(mid.layers).toEqual([2]);
    expect(statesEqual(c.visual, solvedState())).toBe(true);
    tick(50);
    expect(c.animating).toBe(true);
    const end = tick(60);
    expect(end.layers).toBe(null);
    expect(end.angle).toBe(0);
    expect(statesEqual(c.visual, c.state)).toBe(true);
  });

  it('aims for exactly 90 degrees, in the correct direction', () => {
    const { c, tick } = testController({ easing: 'linear' });
    c.enqueue(parseMoves('R')[0]);
    tick(0);
    const pose = c.pose(99.9999);
    expect(pose.angle).toBeCloseTo(-Math.PI / 2, 4);
    c.setState(solvedState());
    c.enqueue(parseMoves("L'")[0]);
    tick(0);
    expect(c.pose(c.now() + 99.9999).angle).toBeCloseTo(-Math.PI / 2, 4);
    c.setState(solvedState());
    c.enqueue(parseMoves('U2')[0]);
    tick(0);
    expect(c.pose(c.now() + 149.9999).angle).toBeCloseTo(-Math.PI, 4);
  });

  it('runs a long queue in order and ends exact', () => {
    const { c, tick } = testController({ turnMs: 5 });
    const moves = parseMoves("R U R' U' F2 M x y' Rw d".repeat(20));
    for (const m of moves) c.enqueue(m);
    let guard = 0;
    while (c.animating && guard < 100000) {
      tick(3);
      guard += 1;
    }
    expect(c.animating).toBe(false);
    expect(statesEqual(c.visual, c.state)).toBe(true);
    expect(statesEqual(c.state, applyAlg(solvedState(), "R U R' U' F2 M x y' Rw d".repeat(20)))).toBe(true);
  });

  it('never lets two turns animate at once', () => {
    const { c, tick } = testController();
    const seen = [];
    c.configure({ onTurnStart: (m) => seen.push(m.text) });
    c.enqueue(parseMoves('R')[0]);
    c.enqueue(parseMoves('U')[0]);
    tick(1);
    expect(seen).toEqual(['R']);
  });

  it('speeds up as the backlog grows', () => {
    const { c } = testController();
    const R = parseMoves('R')[0];
    expect(c.durationFor({ move: R, instant: false, durationMs: null })).toBe(100);
    c.queue = [{ move: R }, { move: R }];
    expect(c.durationFor({ move: R, instant: false, durationMs: null })).toBeLessThan(100);
  });

  it('instant mode applies moves on the next update', () => {
    const { c, tick } = testController({ instant: true });
    c.enqueue(parseMoves('R')[0]);
    c.enqueue(parseMoves('U')[0]);
    tick(0);
    expect(c.animating).toBe(false);
    expect(statesEqual(c.visual, c.state)).toBe(true);
  });

  it('flush lands on the same state, and calls every completion', () => {
    const { c } = testController();
    let done = 0;
    c.enqueue(parseMoves('R')[0], { onDone: () => (done += 1) });
    c.enqueue(parseMoves('U')[0], { onDone: () => (done += 1) });
    c.flush();
    expect(done).toBe(2);
    expect(statesEqual(c.visual, c.state)).toBe(true);
  });
});

describe('sequence player', () => {
  const setup = (alg = "R U R' U'") => {
    const t = testController({ turnMs: 10 });
    const moves = parseMoves(alg);
    const player = new SequencePlayer(t.c, { baseState: solvedState(), moves });
    const run = () => {
      let guard = 0;
      while (t.c.animating && guard < 10000) {
        t.tick(5);
        guard += 1;
      }
    };
    return { ...t, moves, player, run };
  };

  it('stepping gives the exact state at each index, forward and backward', () => {
    const { c, player, run } = setup();
    const expected = ['', 'R', 'R U', "R U R'", "R U R' U'"].map((a) => applyAlg(solvedState(), a));
    expected.slice(1).forEach((state, i) => {
      player.stepForward();
      run();
      expect(player.index).toBe(i + 1);
      expect(statesEqual(c.visual, state)).toBe(true);
    });
    for (let i = expected.length - 2; i >= 0; i -= 1) {
      player.stepBackward();
      run();
      expect(player.index).toBe(i);
      expect(statesEqual(c.visual, expected[i])).toBe(true);
    }
  });

  it('stepping past either end does nothing', () => {
    const { player, run } = setup('R');
    player.stepBackward();
    run();
    expect(player.index).toBe(0);
    player.stepForward();
    run();
    player.stepForward();
    run();
    expect(player.index).toBe(1);
  });

  it('jumping lands on exact states with no animation', () => {
    const { c, player } = setup();
    player.jumpTo(3);
    expect(c.animating).toBe(false);
    expect(statesEqual(c.state, applyAlg(solvedState(), "R U R'"))).toBe(true);
    player.jumpTo(0);
    expect(statesEqual(c.state, solvedState())).toBe(true);
    player.jumpToEnd();
    expect(player.index).toBe(4);
  });

  it('a step during a turn lands exactly rather than stacking', () => {
    const { c, player, tick, run } = setup();
    player.stepForward();
    tick(2);
    player.stepForward();
    tick(2);
    player.stepForward();
    run();
    expect(player.index).toBe(3);
    expect(statesEqual(c.visual, applyAlg(solvedState(), "R U R'"))).toBe(true);
  });

  it('plays to the end and stops', () => {
    const { c, player, run } = setup();
    player.play();
    expect(player.playing).toBe(true);
    run();
    expect(player.index).toBe(4);
    expect(player.playing).toBe(false);
    expect(statesEqual(c.visual, applyAlg(solvedState(), "R U R' U'"))).toBe(true);
  });

  it('pause keeps the position, and play resumes from it', () => {
    const { player, run, tick } = setup();
    player.play();
    tick(1);
    player.pause();
    run();
    const at = player.index;
    expect(at).toBe(1);
    player.play();
    run();
    expect(player.index).toBe(4);
  });

  it('plays in reverse down to the start', () => {
    const { c, player, run } = setup();
    player.jumpToEnd();
    player.setReverse(true);
    player.play();
    run();
    expect(player.index).toBe(0);
    expect(statesEqual(c.visual, solvedState())).toBe(true);
  });

  it('play from the end restarts', () => {
    const { player, run } = setup();
    player.jumpToEnd();
    player.play();
    run();
    expect(player.index).toBe(4);
  });

  it('speed changes durations but not results', () => {
    const { c, player, run } = setup();
    player.setSpeed(4);
    player.play();
    expect(c.speed).toBe(4);
    run();
    expect(statesEqual(c.visual, applyAlg(solvedState(), "R U R' U'"))).toBe(true);
  });

  it('runs every move family through to the exact end state', () => {
    const alg = "R U2 F' L D' B2 M E' S2 Rw u' Fw2 x y2 z'";
    const { c, player, run } = setup(alg);
    player.play();
    run();
    expect(statesEqual(c.visual, applyAlg(solvedState(), alg))).toBe(true);
    player.setReverse(true);
    player.play();
    run();
    expect(statesEqual(c.visual, solvedState())).toBe(true);
  });
});

describe('manual cube', () => {
  it('tracks history through undo and redo', () => {
    const { c } = testController();
    const m = new ManualCube(c);
    const [R, U] = parseMoves('R U');
    m.turn(R);
    m.turn(U);
    expect(m.getSnapshot().history).toHaveLength(2);
    m.undo();
    expect(statesEqual(c.state, applyAlg(solvedState(), 'R'))).toBe(true);
    expect(m.getSnapshot().canRedo).toBe(true);
    m.redo();
    expect(statesEqual(c.state, applyAlg(solvedState(), 'R U'))).toBe(true);
    m.undo();
    m.undo();
    expect(isSolved(c.state)).toBe(true);
    expect(m.getSnapshot().canUndo).toBe(false);
    m.undo();
    expect(isSolved(c.state)).toBe(true);
  });

  it('a new turn clears redo', () => {
    const { c } = testController();
    const m = new ManualCube(c);
    const [R, U] = parseMoves('R U');
    m.turn(R);
    m.undo();
    m.turn(U);
    expect(m.getSnapshot().canRedo).toBe(false);
  });

  it('reset forgets history and lands on the given state', () => {
    const { c } = testController();
    const m = new ManualCube(c);
    m.turn(parseMoves('R')[0]);
    m.reset(solvedState());
    expect(c.animating).toBe(false);
    expect(m.getSnapshot().history).toEqual([]);
  });
});

describe('key profiles', () => {
  const event = (code, extra = {}) => ({ code, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, ...extra });

  it('direct profile: key, Shift for prime, Alt for double', () => {
    const p = BUILT_IN_PROFILES.direct;
    expect(moveForEvent(p, event('KeyR')).text).toBe('R');
    expect(moveForEvent(p, event('KeyR', { shiftKey: true })).text).toBe("R'");
    expect(moveForEvent(p, event('KeyR', { altKey: true })).text).toBe('R2');
    expect(moveForEvent(p, event('KeyM')).text).toBe('M');
    expect(moveForEvent(p, event('KeyT')).text).toBe('r');
    expect(moveForEvent(p, event('KeyX')).text).toBe('x');
  });

  it('home-row profile: single keys for each direction', () => {
    const p = BUILT_IN_PROFILES.speedcuber;
    expect(moveForEvent(p, event('KeyI')).text).toBe('R');
    expect(moveForEvent(p, event('KeyK')).text).toBe("R'");
    expect(moveForEvent(p, event('KeyJ')).text).toBe('U');
    expect(moveForEvent(p, event('KeyF')).text).toBe("U'");
    expect(moveForEvent(p, event('Semicolon')).text).toBe('y');
  });

  it('every built-in binding is a single valid move', () => {
    for (const profile of Object.values(BUILT_IN_PROFILES)) {
      for (const [combo, text] of Object.entries(profile.bindings)) {
        expect(parseMoves(text), combo).toHaveLength(1);
      }
    }
  });

  it('browser shortcuts stay with the browser', () => {
    const p = BUILT_IN_PROFILES.direct;
    expect(moveForEvent(p, event('KeyR', { metaKey: true }))).toBe(null);
    expect(moveForEvent(p, event('KeyR', { ctrlKey: true }))).toBe(null);
    expect(moveForEvent(p, event('Space'))).toBe(null);
  });

  it('reports conflicts and reserved keys', () => {
    const p = BUILT_IN_PROFILES.direct;
    expect(bindingProblem(p, 'KeyR', 'U')).toMatchObject({ kind: 'conflict', with: 'R' });
    expect(bindingProblem(p, 'KeyR', 'R')).toBe(null);
    expect(bindingProblem(p, 'KeyQ', 'R')).toBe(null);
    expect(bindingProblem(p, 'Space', 'R').kind).toBe('reserved');
    expect(bindingProblem(p, 'Shift+ArrowLeft', 'R').kind).toBe('reserved');
  });

  it('lists all keys for a move', () => {
    const map = bindingsByMove(BUILT_IN_PROFILES.speedcuber);
    expect(map.get('M').sort()).toEqual(['Digit5', 'Digit6']);
  });

  it('builds combos in a stable order', () => {
    expect(comboFromEvent(event('KeyR', { altKey: true, shiftKey: true }))).toBe('Alt+Shift+KeyR');
  });

  it('validates imported profiles', () => {
    expect(validateProfile({ name: 'x', bindings: { KeyQ: 'R’' } }).bindings).toEqual({ KeyQ: "R'" });
    expect(() => validateProfile({})).toThrow();
    expect(() => validateProfile({ bindings: { KeyQ: 'R U' } })).toThrow(/single move/);
    expect(() => validateProfile({ bindings: { Space: 'R' } })).toThrow(/cannot be bound/);
    expect(() => validateProfile({ bindings: { KeyQ: 'nonsense' } })).toThrow();
  });
});

describe('dragging on the cube', () => {
  const model = getCubeModel(3);
  // A simple front-on orthographic view: x right, y up, and z shifts nothing much.
  const project = ([x, y, z]) => [100 + 50 * x + 12 * z, 100 - 50 * y - 8 * z];
  const stickerOf = (face, row, col) => model.stickers.find((s) => s.face === face && s.row === row && s.col === col);
  const drag = (sticker, dx, dy) => moveFromDrag({ sticker, n: 3, drag: [dx, dy], project }).text;

  it('front face, right column, up: R', () => {
    expect(drag(stickerOf('F', 1, 2), 0, -40)).toBe('R');
    expect(drag(stickerOf('F', 1, 2), 0, 40)).toBe("R'");
  });

  it('front face, left column, down: L', () => {
    expect(drag(stickerOf('F', 1, 0), 0, 40)).toBe('L');
    expect(drag(stickerOf('F', 1, 0), 0, -40)).toBe("L'");
  });

  it('front face, top row, left: U', () => {
    expect(drag(stickerOf('F', 0, 1), -40, 0)).toBe('U');
    expect(drag(stickerOf('F', 0, 1), 40, 0)).toBe("U'");
  });

  it('front face, bottom row, right: D', () => {
    expect(drag(stickerOf('F', 2, 1), 40, 0)).toBe('D');
  });

  it('front face, middle column, down: M', () => {
    expect(drag(stickerOf('F', 1, 1), 0, 40)).toBe('M');
  });

  it('front face, middle row, right: E', () => {
    expect(drag(stickerOf('F', 1, 1), 40, 0)).toBe('E');
  });

  it('top face, front row, right: F', () => {
    expect(drag(stickerOf('U', 2, 1), 40, 0)).toBe('F');
  });

  it('every drag starts the sticker moving toward the pointer, on every visible face', () => {
    // A small rotation of the sticker's surface point gives its initial velocity,
    // which should agree with the drag direction whatever the face and direction.
    const views = model.stickers.filter((s) => s.normal[2] === 1 || s.normal[1] === 1 || s.normal[0] === 1);
    const proj = ([x, y, z]) => [100 + 50 * x - 28 * z, 100 - 50 * y + 22 * z - 12 * x];
    for (const sticker of views) {
      for (const [dx, dy] of [[40, 0], [-40, 0], [0, 40], [0, -40]]) {
        const move = moveFromDrag({ sticker, n: 3, drag: [dx, dy], project: proj });
        const { axis, quarter } = moveGeometry(move, 3);
        const p = sticker.pos.map((c, i) => c / 2 + sticker.normal[i] * 0.5);
        const w = [0, 0, 0];
        w[axis] = Math.sign(quarter);
        const v = [w[1] * p[2] - w[2] * p[1], w[2] * p[0] - w[0] * p[2], w[0] * p[1] - w[1] * p[0]];
        // A corner sticker also swings off its plane. The drag concerns motion within it.
        const inPlane = v.map((c, i) => (sticker.normal[i] !== 0 ? 0 : c));
        const from = proj(p);
        const to = proj(p.map((c, i) => c + inPlane[i] * 0.01));
        const along = (to[0] - from[0]) * dx + (to[1] - from[1]) * dy;
        expect(along, `${sticker.face}${sticker.row}${sticker.col} ${dx},${dy} ${move.text}`).toBeGreaterThan(0);
      }
    }
  });
});
