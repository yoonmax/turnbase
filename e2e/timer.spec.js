import { expect, test } from '@playwright/test';
import { noPageErrors, openTimer, runSolve, timerState } from './helpers.js';

test('opens directly on the timer, branded turnbase', async ({ page }) => {
  const errors = noPageErrors(page);
  await openTimer(page);
  await expect(page).toHaveTitle('turnbase');
  await expect(page.getByTestId('main-nav')).toContainText('turnbase');
  await expect(page.getByTestId('timer-digits')).toHaveText('0.00');
  expect(errors).toEqual([]);
});

test('hold, ready, start on release, stop', async ({ page }) => {
  await openTimer(page);
  await page.keyboard.down('Space');
  expect(await timerState(page)).toBe('holding');
  await page.waitForTimeout(350);
  expect(await timerState(page)).toBe('ready');
  const readyColor = await page.getByTestId('timer-digits').evaluate((el) => getComputedStyle(el).color);
  await page.keyboard.up('Space');
  expect(await timerState(page)).toBe('running');
  await page.waitForTimeout(400);
  const running = await page.getByTestId('timer-digits').textContent();
  expect(Number(running)).toBeGreaterThan(0.2);
  await page.keyboard.press('Space');
  expect(await timerState(page)).toBe('stopped');
  await expect(page.getByTestId('stat-count')).toHaveText('1');
  await expect(page.getByTestId('solve-row')).toHaveCount(1);
  expect(readyColor).not.toBe('rgb(28, 29, 31)');
});

test('a blocked main thread does not change the recorded time', async ({ page }) => {
  await openTimer(page);
  await page.keyboard.down('Space');
  await page.waitForTimeout(340);
  await page.keyboard.up('Space');
  // Nothing can paint or tick for 900 ms, as in the worst possible frame.
  const started = await page.evaluate(() => {
    const t = performance.now();
    while (performance.now() - t < 900);
    return performance.now();
  });
  await page.keyboard.press('Space');
  const stoppedAt = await page.evaluate(() => performance.now());
  await page.waitForTimeout(60);
  const shown = Number(await page.getByTestId('timer-digits').textContent());
  expect(shown).toBeGreaterThanOrEqual(0.9);
  expect(shown).toBeLessThan(0.9 + (stoppedAt - started + 200) / 1000);
});

test('the scrambler loads without console errors', async ({ page }) => {
  const errors = noPageErrors(page);
  await openTimer(page);
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test('an early release does not start the timer', async ({ page }) => {
  await openTimer(page);
  await page.keyboard.down('Space');
  await page.waitForTimeout(80);
  await page.keyboard.up('Space');
  expect(await timerState(page)).toBe('idle');
  await expect(page.getByTestId('solve-row')).toHaveCount(0);
});

test('Space does not scroll, repeat, or fire inside a text field', async ({ page }) => {
  await openTimer(page);
  await page.getByTestId('session-manage').click();
  await page.getByTestId('session-new-name').click();
  await page.keyboard.type('a b');
  await expect(page.getByTestId('session-new-name')).toHaveValue('a b');
  expect(await timerState(page)).toBe('idle');
  await page.keyboard.press('Escape');
});

test('losing focus during a hold cancels it', async ({ page }) => {
  await openTimer(page);
  await page.keyboard.down('Space');
  await page.waitForTimeout(350);
  expect(await timerState(page)).toBe('ready');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await timerState(page)).toBe('idle');
  await page.keyboard.up('Space');
  expect(await timerState(page)).toBe('idle');
});

test('Escape abandons a running solve without recording it', async ({ page }) => {
  await openTimer(page);
  await page.keyboard.down('Space');
  await page.waitForTimeout(340);
  await page.keyboard.up('Space');
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  expect(await timerState(page)).toBe('idle');
  await expect(page.getByTestId('solve-row')).toHaveCount(0);
});

test('+2 and DNF apply to the result and the raw time survives', async ({ page }) => {
  await openTimer(page);
  await runSolve(page);
  const raw = Number(await page.getByTestId('timer-digits').textContent());
  await page.getByTestId('penalty-+2').click();
  await expect(page.getByTestId('timer-digits')).toContainText('+');
  const plus = parseFloat(await page.getByTestId('timer-digits').textContent());
  expect(plus).toBeCloseTo(raw + 2, 1);
  await page.getByTestId('penalty-dnf').click();
  await expect(page.getByTestId('timer-digits')).toHaveText('DNF');
  await expect(page.getByTestId('stat-best')).toHaveText('–');
  await page.getByTestId('penalty-none').click();
  expect(Number(await page.getByTestId('timer-digits').textContent())).toBeCloseTo(raw, 2);
});

test('a mouse click on a penalty button does not let Space press it again', async ({ page }) => {
  await openTimer(page);
  await runSolve(page);
  await page.getByTestId('penalty-+2').click();
  await page.keyboard.down('Space');
  expect(await timerState(page)).toBe('holding');
  await page.keyboard.up('Space');
  await expect(page.getByTestId('stat-count')).toHaveText('1');
});

test('inspection counts down and applies +2 past 15 seconds', async ({ page }) => {
  test.setTimeout(45000);
  await openTimer(page);
  await page.goto('/settings');
  await page.getByTestId('setting-inspection').click();
  await page.getByTestId('nav-timer').click();
  await expect(page.getByTestId('timer-digits')).toBeVisible();
  await page.keyboard.press('Space');
  expect(await timerState(page)).toBe('inspection');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('timer-digits')).toHaveText('15');
  await page.waitForTimeout(15000);
  await expect(page.getByTestId('timer-digits')).toHaveText('+2');
  await page.keyboard.down('Space');
  await page.waitForTimeout(340);
  await page.keyboard.up('Space');
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(60);
  await expect(page.getByTestId('penalty-+2')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('solve-row').first().click();
  await expect(page.getByTestId('solve-detail')).toContainText('Inspection');
});

test('saves across reload, with the exact scramble the solve used', async ({ page }) => {
  await openTimer(page);
  const scramble = await page.getByTestId('scramble-text').textContent();
  await runSolve(page);
  await expect(page.getByTestId('scramble-text')).not.toHaveText(scramble);
  await page.getByTestId('penalty-+2').click();
  await page.waitForTimeout(100);
  await page.reload();
  await expect(page.getByTestId('solve-row')).toHaveCount(1);
  await page.getByTestId('solve-row').click();
  await expect(page.getByTestId('detail-scramble')).toHaveText(scramble);
  await expect(page.getByTestId('detail-penalty-+2')).toHaveAttribute('aria-pressed', 'true');
});

test('averages appear when a window fills, and deleting offers undo', async ({ page }) => {
  await openTimer(page);
  for (let i = 0; i < 5; i += 1) {
    await runSolve(page, { solveMs: 120 });
    await page.waitForTimeout(30);
  }
  await expect(page.getByTestId('stat-count')).toHaveText('5');
  await expect(page.getByTestId('stat-ao5')).not.toHaveText('–');
  await expect(page.getByTestId('stat-ao12')).toHaveText('–');
  await page.getByTestId('delete-latest').click();
  await expect(page.getByTestId('stat-count')).toHaveText('4');
  await page.getByTestId('toast-action').click();
  await expect(page.getByTestId('stat-count')).toHaveText('5');
});

test('session create, switch, rename, persist', async ({ page }) => {
  await openTimer(page);
  await runSolve(page);
  await page.getByTestId('session-manage').click();
  await page.getByTestId('session-new-name').fill('Morning Practice');
  await page.getByTestId('session-create').click();
  await expect(page.getByTestId('session-select')).toContainText('Morning Practice');
  await expect(page.getByTestId('solve-row')).toHaveCount(0);
  await runSolve(page);
  await runSolve(page);
  await expect(page.getByTestId('stat-count')).toHaveText('2');
  await page.reload();
  await expect(page.getByTestId('stat-count')).toHaveText('2');
  const value = await page.getByTestId('session-select').inputValue();
  const main = await page.getByTestId('session-select').locator('option', { hasText: 'Main 3×3' }).getAttribute('value');
  expect(value).not.toBe(main);
  await page.getByTestId('session-select').selectOption(main);
  await expect(page.getByTestId('stat-count')).toHaveText('1');
});

test('a 2×2 session gets a real 2×2 scramble and diagram, not a 3×3', async ({ page }) => {
  await openTimer(page);
  await page.getByTestId('session-manage').click();
  await page.getByTestId('session-new-name').fill('Two');
  await page.getByTestId('session-new-puzzle').selectOption('222');
  await page.getByTestId('session-create').click();
  await expect(page.getByTestId('scramble-text')).not.toContainText('Generating', { timeout: 30000 });
  await expect(page.getByTestId('cube-net').locator('rect')).toHaveCount(24);
  await expect(async () => {
    expect(await page.getByTestId('cube-net').locator('rect').count()).toBe(24);
  }).toPass();
});

test('a Pyraminx session draws through cubing.js', async ({ page }) => {
  await openTimer(page);
  await page.getByTestId('session-manage').click();
  await page.getByTestId('session-new-name').fill('Pyra');
  await page.getByTestId('session-new-puzzle').selectOption('pyram');
  await page.getByTestId('session-create').click();
  await expect(page.getByTestId('twisty-diagram')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('cube-net')).toHaveCount(0);
});

test('a pasted scramble is used, validated and labeled', async ({ page }) => {
  await openTimer(page);
  await page.getByTestId('scramble-own').click();
  await page.getByTestId('own-scramble-input').fill('R Q');
  await expect(page.getByTestId('own-scramble')).toContainText('"Q" is not a move');
  await expect(page.getByTestId('own-scramble-use')).toBeDisabled();
  await page.getByTestId('own-scramble-input').fill("R U2 F'");
  await page.getByTestId('own-scramble-use').click();
  await expect(page.getByTestId('scramble-text')).toHaveText("R U2 F'");
  await runSolve(page);
  await page.getByTestId('solve-row').click();
  await expect(page.getByTestId('detail-scramble')).toHaveText("R U2 F'");
  await expect(page.getByTestId('solve-detail')).toContainText('Entered by you');
});

test('data can be exported as JSON', async ({ page }) => {
  await openTimer(page);
  await runSolve(page);
  await page.getByTestId('nav-settings').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-all').click()]);
  expect(download.suggestedFilename()).toMatch(/^turnbase-backup-.*\.json$/);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const doc = JSON.parse(Buffer.concat(chunks).toString());
  expect(doc.format).toBe('turnbase-backup');
  expect(doc.solves).toHaveLength(1);
  expect(doc.solves[0].rawMs).toBeGreaterThan(100);
});

test('touch: a press on the surface starts and a tap stops', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 }, isMobile: true, baseURL: 'http://localhost:5211' });
  const page = await context.newPage();
  await openTimer(page);
  const box = await page.getByTestId('timer-display').boundingBox();
  const client = await context.newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + 20 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(350);
  expect(await timerState(page)).toBe('ready');
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  expect(await timerState(page)).toBe('running');
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(100);
  expect(await timerState(page)).toBe('stopped');
  await expect(page.getByTestId('stat-count')).toHaveText('1');
  // Nothing overflowed sideways on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await context.close();
});
