import { expect, test } from '@playwright/test';
import { cubeIdle, cubeReady, expectPictureMatchesLogic, facelets, noPageErrors, openTimer, typeMoves } from './helpers.js';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

async function openCube(page, tab = '') {
  await page.goto(`/cube?debug${tab ? `&tab=${tab}` : ''}`);
  await cubeReady(page);
}

test('renders a solved cube whose pixels match the engine', async ({ page }) => {
  const errors = noPageErrors(page);
  await openCube(page);
  expect(await facelets(page)).toBe(SOLVED);
  await expectPictureMatchesLogic(page);
  expect(errors).toEqual([]);
});

test('a key press turns the right face: logic, history, picture', async ({ page }) => {
  await openCube(page);
  await page.keyboard.press('KeyR');
  await cubeIdle(page);
  expect(await facelets(page)).toBe('UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB');
  await expect(page.getByTestId('move-history')).toHaveText('R');
  await page.waitForTimeout(100);
  await expectPictureMatchesLogic(page);
});

test('prime, double, slice, wide and rotation keys all work, and stay exact', async ({ page }) => {
  await openCube(page);
  await typeMoves(page, "R' U2 F");
  await page.keyboard.press('KeyM');
  await page.keyboard.press('KeyT'); // r
  await page.keyboard.press('KeyY'); // y
  await cubeIdle(page);
  await expect(page.getByTestId('move-history')).toHaveText("R' U2 F M r y");
  await page.waitForTimeout(100);
  await expectPictureMatchesLogic(page);
  await page.keyboard.press('Shift+KeyY');
  await page.keyboard.press('Shift+KeyT');
  await page.keyboard.press('Shift+KeyM');
  await typeMoves(page, "F' U2 R");
  await cubeIdle(page);
  expect(await facelets(page)).toBe(SOLVED);
});

test('no drift: hundreds of fast turns, and the picture still matches', async ({ page }) => {
  await openCube(page);
  const sequence = "R U F' L D2 B' R2 U' F L' D B2 ".repeat(12);
  await typeMoves(page, sequence);
  await cubeIdle(page);
  await page.waitForTimeout(150);
  await expectPictureMatchesLogic(page);
  await expect(page.getByTestId('history-count')).toHaveText('144');
});

test('mid-turn frames differ from rest, then settle exactly', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('setting-turnMs').fill('500');
  await openCube(page);
  const before = await page.getByTestId('cube-canvas').screenshot();
  await page.keyboard.press('KeyU');
  await page.waitForTimeout(220);
  expect(await page.evaluate(() => window.__turnbaseCube.controller.animating)).toBe(true);
  const during = await page.getByTestId('cube-canvas').screenshot();
  expect(during.equals(before)).toBe(false);
  await cubeIdle(page);
  await page.waitForTimeout(100);
  await expectPictureMatchesLogic(page);
});

test('undo, redo, reset, solved state', async ({ page }) => {
  await openCube(page);
  await expect(page.getByTestId('cube-solved')).toHaveText('Solved');
  await typeMoves(page, "R U");
  await cubeIdle(page);
  await expect(page.getByTestId('cube-solved')).toHaveText('Not solved');
  await page.getByTestId('cube-undo').click();
  await page.keyboard.press('Backspace');
  await cubeIdle(page);
  expect(await facelets(page)).toBe(SOLVED);
  await expect(page.getByTestId('cube-solved')).toHaveText('Solved');
  await page.getByTestId('cube-redo').click();
  await cubeIdle(page);
  await expect(page.getByTestId('move-history')).toHaveText('R');
  await page.getByTestId('cube-reset').click();
  expect(await facelets(page)).toBe(SOLVED);
  await expect(page.getByTestId('history-count')).toHaveText('0');
});

test('a whole-cube rotation keeps a solved cube solved', async ({ page }) => {
  await openCube(page);
  await page.keyboard.press('KeyX');
  await cubeIdle(page);
  await expect(page.getByTestId('cube-solved')).toHaveText('Solved');
  expect(await facelets(page)).not.toBe(SOLVED);
});

test('dragging a sticker turns its layer. Dragging the backdrop only moves the camera', async ({ page }) => {
  await openCube(page);
  const points = await page.evaluate(() => window.__turnbaseCube.visible());
  const box = await page.getByTestId('cube-canvas').boundingBox();
  // Right column, middle row of the F face: sticker 23. Upward drag is R.
  const start = points.find((p) => p.id === 23);
  await page.mouse.move(box.x + start.x, box.y + start.y);
  await page.mouse.down();
  await page.mouse.move(box.x + start.x, box.y + start.y - 60, { steps: 6 });
  await page.mouse.up();
  await cubeIdle(page);
  await expect(page.getByTestId('move-history')).toHaveText('R');

  const beforeState = await facelets(page);
  await page.waitForTimeout(100);
  const beforeShot = await page.getByTestId('cube-canvas').screenshot();
  await page.mouse.move(box.x + 30, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 170, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect(await facelets(page)).toBe(beforeState);
  await expect(page.getByTestId('history-count')).toHaveText('1');
  expect((await page.getByTestId('cube-canvas').screenshot()).equals(beforeShot)).toBe(false);
});

test('the cube and the timer never share a key', async ({ page }) => {
  await openCube(page);
  await page.keyboard.down('Space');
  await page.waitForTimeout(350);
  await page.keyboard.up('Space');
  expect(await page.evaluate(() => document.documentElement.dataset.timer)).not.toBe('running');
  expect(await facelets(page)).toBe(SOLVED);

  await openTimer(page);
  const before = await page.getByTestId('stat-count').textContent();
  await page.keyboard.press('KeyR');
  await expect(page.getByTestId('stat-count')).toHaveText(before);
  expect(await page.evaluate(() => document.documentElement.dataset.timer)).toBe('idle');
});

test('typing in a field does not turn the cube', async ({ page }) => {
  await openCube(page);
  await page.getByTestId('free-input').fill('');
  await page.getByTestId('free-input').click();
  await page.keyboard.type("R U R' U'");
  expect(await facelets(page)).toBe(SOLVED);
  await expect(page.getByTestId('free-input')).toHaveValue("R U R' U'");
  await page.getByTestId('free-apply').click();
  await cubeIdle(page);
  await expect(page.getByTestId('move-history')).toHaveText("R U R' U'");
});

test('a bad algorithm shows a clear error and cannot be applied', async ({ page }) => {
  await openCube(page);
  await page.getByTestId('free-input').fill('R Q U');
  await expect(page.getByTestId('free-panel')).toContainText('"Q" is not a move');
  await expect(page.getByTestId('free-apply')).toBeDisabled();
});

test('key remapping: conflict detection, replace, persistence', async ({ page }) => {
  await openCube(page);
  await page.getByTestId('keys-open').click();
  await page.getByTestId('keymap-copy').click();
  await expect(page.getByTestId('keymap-profile')).toHaveValue(/keys_/);
  await page.locator('[data-move="R"] [data-testid="key-move"]').click();
  await page.keyboard.press('KeyU');
  await expect(page.getByTestId('keymap-message')).toContainText('already turns U');
  await page.getByTestId('keymap-replace').click();
  await page.locator('[data-move="U"] [data-testid="key-move"]').click();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('keymap-message')).toContainText('kept for playback');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyU');
  await cubeIdle(page);
  await expect(page.getByTestId('move-history')).toHaveText('R');
  await page.reload();
  await cubeReady(page);
  await page.keyboard.press('KeyU');
  await cubeIdle(page);
  await expect(page.getByTestId('move-history')).toHaveText('R');
});

test('the home-row profile turns the expected moves', async ({ page }) => {
  await openCube(page);
  await page.getByTestId('keys-open').click();
  await page.getByTestId('keymap-profile').selectOption('speedcuber');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyI');
  await page.keyboard.press('KeyF');
  await page.keyboard.press('KeyK');
  await cubeIdle(page);
  await expect(page.getByTestId('move-history')).toHaveText("R U' R'");
});

test('camera views change the picture, not the cube', async ({ page }) => {
  await openCube(page);
  await page.waitForTimeout(100);
  const front = await page.getByTestId('cube-canvas').screenshot();
  await page.getByTestId('view-top').click();
  await page.waitForTimeout(800);
  expect((await page.getByTestId('cube-canvas').screenshot()).equals(front)).toBe(false);
  expect(await facelets(page)).toBe(SOLVED);
  await expectPictureMatchesLogic(page);
});

test('style and color settings take effect', async ({ page }) => {
  await openCube(page);
  await page.waitForTimeout(100);
  const stickered = await page.getByTestId('cube-canvas').screenshot();
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('setting-cubeStyle-stickerless').click();
  await page.waitForTimeout(150);
  await page.goto('/cube?debug');
  await cubeReady(page);
  expect((await page.getByTestId('cube-canvas').screenshot()).equals(stickered)).toBe(false);
  await expectPictureMatchesLogic(page);
});

test('editor: inverse start, stepping, solved at the end', async ({ page }) => {
  await openCube(page, 'editor');
  await page.getByTestId('editor-input').fill("[R U R', D]");
  await expect(page.getByTestId('editor-status')).toContainText('8 moves');
  await expect(page.getByTestId('move-token')).toHaveCount(8);
  await expect(page.getByTestId('editor-inverse')).toContainText("D R U R' D' R U' R'");
  await page.getByTestId('player-forward').click();
  await expect(page.getByTestId('player-position')).toHaveText('1/8');
  await cubeIdle(page);
  await page.getByTestId('player-back').click();
  await expect(page.getByTestId('player-position')).toHaveText('0/8');
  await cubeIdle(page);
  await page.getByTestId('speed-4').click();
  await page.getByTestId('player-play').click();
  await expect(page.getByTestId('player-position')).toHaveText('8/8', { timeout: 10000 });
  await cubeIdle(page);
  expect(await facelets(page)).toBe(SOLVED);
  await expect(page.getByTestId('editor-result')).toHaveText('Ends with a solved cube.');
});

test('editor: start from solved, reports a different end, reports notation errors', async ({ page }) => {
  await openCube(page, 'editor');
  await page.getByTestId('editor-start').selectOption('solved');
  await expect(page.getByTestId('editor-result')).toHaveText('Ends with the state shown here.');
  await page.getByTestId('editor-input').fill('R (U');
  await expect(page.getByTestId('editor-status')).toContainText('never closed');
});

test('editor: start from a library case, and save an algorithm', async ({ page }) => {
  await openCube(page, 'editor');
  await page.getByTestId('editor-start').selectOption('case');
  await page.getByTestId('editor-case').selectOption('pll-t');
  await page.getByTestId('editor-input').fill("R U R' U' R' F R2 U' R' U' R U R' F'");
  await expect(page.getByTestId('editor-result')).toHaveText('Ends with a solved cube.');
  await page.getByTestId('editor-name').fill('My T');
  await page.getByTestId('editor-save').click();
  await expect(page.getByTestId('saved-algs')).toContainText('My T');
  await page.waitForTimeout(100);
  await page.reload();
  await cubeReady(page);
  await expect(page.getByTestId('saved-algs')).toContainText('My T');
});

test('notation reference plays a move on the cube', async ({ page }) => {
  await openCube(page, 'notation');
  await expect(page.getByTestId('notation-card')).toHaveCount(18);
  await page.locator('[data-testid=notation-card][data-move=M]').click();
  await cubeIdle(page);
  expect(await facelets(page)).not.toBe(SOLVED);
});

test('virtual solve: scramble, solve by keyboard, auto-stop, separate session, replay', async ({ page }) => {
  await openTimer(page);
  const physicalCount = await page.getByTestId('stat-count').textContent();
  const physicalSession = await page.getByTestId('session-select').inputValue();
  await page.goto('/cube?debug&tab=virtual');
  await page.getByTestId('virtual-start').click();
  await expect(page.getByTestId('virtual-scramble')).toBeVisible({ timeout: 30000 });
  await cubeReady(page);
  const scramble = await page.getByTestId('virtual-scramble').textContent();
  const inverse = scramble.trim().split(/\s+/).reverse().map((m) => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : `${m}'`)).join(' ');

  // A rotation first: no moves counted, and the clock does not start.
  await page.keyboard.press('KeyY');
  await page.keyboard.press('Shift+KeyY');
  await expect(page.getByTestId('virtual-count')).toHaveText('0 moves');
  await expect(page.getByTestId('virtual-clock')).toHaveText('0.00');

  await typeMoves(page, inverse);
  await expect(page.getByTestId('virtual-result')).toBeVisible({ timeout: 20000 });
  const moveTotal = inverse.split(' ').length;
  await expect(page.getByTestId('virtual-count')).toHaveText(`${moveTotal} moves`);
  await expect(page.getByTestId('replay-moves')).toHaveText(String(moveTotal));
  expect(Number(await page.getByTestId('replay-tps').textContent())).toBeGreaterThan(0);

  // The replay runs on its own cube, from the scrambled state.
  const replay = page.getByTestId('solve-replay');
  await replay.getByTestId('speed-4').click();
  await replay.getByTestId('player-end').click();
  await expect(replay.getByTestId('player-position')).toHaveText(`${moveTotal + 2}/${moveTotal + 2}`);

  // Physical session untouched, and the virtual one holds a virtual solve.
  await page.goto('/');
  await expect(page.getByTestId('session-select')).toHaveValue(physicalSession);
  await expect(page.getByTestId('stat-count')).toHaveText(physicalCount);
  await page.getByTestId('session-select').selectOption({ label: 'Virtual 3×3' });
  await expect(page.getByTestId('stat-count')).toHaveText('1');
  await page.getByTestId('solve-row').click();
  await expect(page.getByTestId('solve-detail')).toContainText('virtual cube');
  await expect(page.getByTestId('detail-scramble')).toHaveText(scramble);
  await expect(page.getByTestId('solve-replay')).toBeVisible();
});

test('scramble viewer: diagram matches the 3D state, and steps through', async ({ page }) => {
  await page.goto('/?debug');
  await page.waitForSelector('[data-testid=cube-net]');
  const netFills = await page.getByTestId('cube-net').first().locator('rect').evaluateAll((r) => r.map((x) => x.getAttribute('data-fill')));
  await page.getByTestId('scramble-preview').click();
  await cubeReady(page);
  await expect(page.getByTestId('scramble-viewer')).toBeVisible();
  const modalNet = page.getByTestId('scramble-viewer').getByTestId('cube-net');
  await expect(async () => {
    const fills = await modalNet.locator('rect').evaluateAll((r) => r.map((x) => x.getAttribute('data-fill')));
    expect(fills).toEqual(netFills);
  }).toPass();
  await page.waitForTimeout(200);
  await expectPictureMatchesLogic(page);
  const text = await page.getByTestId('scramble-text').textContent();
  const total = text.trim().split(/\s+/).length;
  await expect(page.getByTestId('player-position')).toHaveText(`${total}/${total}`);
  await page.getByTestId('player-back').click();
  await expect(page.getByTestId('player-position')).toHaveText(`${total - 1}/${total}`);
  await page.getByTestId('player-start').click();
  await expect(page.getByTestId('player-position')).toHaveText(`0/${total}`);
  expect(await facelets(page)).toBe(SOLVED);
  // A modal blocks the timer's trigger.
  await page.keyboard.down('Space');
  expect(await page.evaluate(() => document.documentElement.dataset.timer)).toBe('idle');
  await page.keyboard.up('Space');
});

test('a 4×4 scramble opens on a real 4×4', async ({ page }) => {
  await page.goto('/?debug');
  await page.getByTestId('session-manage').click();
  await page.getByTestId('session-new-name').fill('Four');
  await page.getByTestId('session-new-puzzle').selectOption('444');
  await page.getByTestId('session-create').click();
  await expect(page.getByTestId('cube-net').locator('rect')).toHaveCount(96, { timeout: 60000 });
  await page.getByTestId('scramble-preview').click();
  await cubeReady(page);
  expect((await facelets(page)).length).toBe(96);
});
