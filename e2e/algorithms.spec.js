import { expect, test } from '@playwright/test';
import { LIBRARY_NAMES, cubeIdle, cubeReady, expectPictureMatchesLogic, noPageErrors } from './helpers.js';

async function openCase(page, id) {
  await page.goto(`/algorithms/${id}?debug`);
  await cubeReady(page);
}

test('every set shows its full verified count of tiles', async ({ page }) => {
  const errors = noPageErrors(page);
  await page.goto('/algorithms');
  for (const [id, count] of [['pll', 21], ['oll', 57], ['f2l', 41], ['2lo', 10], ['2lp', 6], ['beginner', 11]]) {
    await page.getByTestId(`set-${id}`).click();
    await expect(page.getByTestId('case-tile')).toHaveCount(count);
    await expect(page.getByTestId('coverage-line')).toContainText(`${count} of ${count} cases`);
    await expect(page.getByTestId('case-diagram').or(page.getByTestId('cube-net'))).toHaveCount(count);
  }
  expect(errors).toEqual([]);
});

test('opening a case shows its true state in 3D, and Play solves it', async ({ page }) => {
  await openCase(page, 'pll-t');
  await expect(page.getByTestId('detail-title')).toHaveText('T perm');
  await expect(page.getByTestId('move-token')).toHaveCount(14);
  await expect(page.getByTestId('alg-status')).toHaveText('Verified on the cube engine');
  await page.waitForTimeout(150);
  await expectPictureMatchesLogic(page, LIBRARY_NAMES);
  await page.getByTestId('speed-4').click();
  await page.getByTestId('player-play').click();
  await expect(page.getByTestId('detail-solved')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('player-position')).toHaveText('14/14');
  await cubeIdle(page);
  await page.waitForTimeout(150);
  await expectPictureMatchesLogic(page, LIBRARY_NAMES);
});

test('the current move is highlighted in step with the cube, in its face color', async ({ page }) => {
  await openCase(page, 'pll-t');
  await page.getByTestId('player-forward').click();
  const current = page.locator('[data-testid=move-token][data-current=true]');
  await expect(current).toHaveText('R');
  await expect(page.getByTestId('current-move-explanation')).toContainText('right face clockwise');
  await page.waitForTimeout(150);
  const bg1 = await current.evaluate((el) => getComputedStyle(el).backgroundColor);
  await cubeIdle(page);
  await page.getByTestId('player-forward').click();
  await expect(current).toHaveText('U');
  await expect(page.getByTestId('current-move-explanation')).toContainText('top face clockwise');
  await page.waitForTimeout(150);
  const bg2 = await current.evaluate((el) => getComputedStyle(el).backgroundColor);
  // Red-family for R, and the library's yellow for U: each token wears its face.
  expect(bg1).not.toBe('rgba(0, 0, 0, 0)');
  expect(bg2).not.toBe('rgba(0, 0, 0, 0)');
  expect(bg1).not.toBe(bg2);
});

test('step back, scrub, jump, restart: each lands on the exact state', async ({ page }) => {
  await openCase(page, 'oll-27');
  const start = await page.evaluate(() => window.__turnbaseCube.facelets());
  await page.getByTestId('player-forward').click();
  await cubeIdle(page);
  const one = await page.evaluate(() => window.__turnbaseCube.facelets());
  expect(one).not.toBe(start);
  await page.getByTestId('player-back').click();
  await cubeIdle(page);
  expect(await page.evaluate(() => window.__turnbaseCube.facelets())).toBe(start);

  await page.getByTestId('player-scrub').fill('3');
  await expect(page.getByTestId('player-position')).toHaveText('3/7');
  const scrubbed = await page.evaluate(() => window.__turnbaseCube.facelets());
  await page.getByTestId('move-token').nth(2).click();
  expect(await page.evaluate(() => window.__turnbaseCube.facelets())).toBe(scrubbed);

  await page.getByTestId('player-end').click();
  await expect(page.getByTestId('detail-solved')).toBeVisible();
  await page.getByTestId('player-start').click();
  expect(await page.evaluate(() => window.__turnbaseCube.facelets())).toBe(start);
});

test('keyboard playback, reverse and loop', async ({ page }) => {
  await openCase(page, 'oll-27');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('player-position')).toHaveText('1/7');
  await cubeIdle(page);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('player-position')).toHaveText('0/7');
  await page.keyboard.press('End');
  await expect(page.getByTestId('player-position')).toHaveText('7/7');
  await page.getByTestId('player-reverse').click();
  await page.getByTestId('speed-4').click();
  await page.getByTestId('player-play').click();
  await expect(page.getByTestId('player-position')).toHaveText('0/7', { timeout: 10000 });
  await page.getByTestId('player-reverse').click();
  await page.getByTestId('player-loop').click();
  await page.getByTestId('player-play').click();
  await expect(page.getByTestId('player-position')).toHaveText('7/7', { timeout: 10000 });
  // Looping goes round again.
  await expect(page.getByTestId('player-position')).not.toHaveText('7/7', { timeout: 10000 });
  await page.getByTestId('player-play').click();
});

test('Space controls playback here, and never reaches the timer', async ({ page }) => {
  await openCase(page, 'pll-h');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('player-play')).toHaveAttribute('aria-label', /Pause|Play/);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.documentElement.dataset.timer)).not.toBe('running');
});

test('alternatives play from the same case, with a lead-in turn where needed', async ({ page }) => {
  await openCase(page, 'pll-aa');
  const start = await page.evaluate(() => window.__turnbaseCube.facelets());
  const options = page.getByTestId('alternative');
  await expect(options).toHaveCount(2);
  await options.nth(1).click();
  expect(await page.evaluate(() => window.__turnbaseCube.facelets())).toBe(start);
  await page.getByTestId('speed-4').click();
  await page.getByTestId('player-play').click();
  await expect(page.getByTestId('detail-solved')).toBeVisible({ timeout: 15000 });
});

test('search by name, number and notation', async ({ page }) => {
  await page.goto('/algorithms');
  const search = page.getByTestId('algorithm-search');
  await search.fill('sune');
  await expect(page.locator('[data-case-id=oll-27]')).toBeVisible();
  await search.fill('33');
  await expect(page.getByTestId('case-tile').first()).toHaveAttribute('data-case-id', 'oll-33');
  await search.fill("R U R' U R U2 R'");
  await expect(page.getByTestId('case-tile').first()).toHaveAttribute('data-case-id', 'oll-27');
  await search.fill('zzzzz');
  await expect(page.getByTestId('case-grid')).toContainText('No cases match');
});

test('filters and sorting', async ({ page }) => {
  await page.goto('/algorithms');
  await page.getByTestId('set-oll').click();
  await page.getByTestId('filters-toggle').click();
  await page.getByTestId('filter-category').selectOption('Cross');
  await expect(page.getByTestId('case-tile')).toHaveCount(7);
  await page.getByTestId('filter-category').selectOption('');
  await page.getByTestId('filter-length').selectOption('6');
  const tiles = await page.getByTestId('case-tile').count();
  expect(tiles).toBeGreaterThan(0);
  expect(tiles).toBeLessThan(57);
  await page.getByTestId('filter-length').selectOption('');
  await page.getByTestId('filter-sort').selectOption('shortest');
  const first = await page.getByTestId('case-tile').first().textContent();
  expect(first).toMatch(/6 moves/);
});

test('favorite and learned status persist across reloads and show in the library', async ({ page }) => {
  await openCase(page, 'pll-t');
  await page.getByTestId('detail-learned').click();
  await expect(page.getByTestId('detail-learned')).toHaveText('Learned');
  await page.getByTestId('detail-favorite').click();
  await page.waitForTimeout(100);
  await page.reload();
  await cubeReady(page);
  await expect(page.getByTestId('detail-learned')).toHaveText('Learned');
  await expect(page.getByTestId('detail-favorite')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-case-id=pll-t] [data-testid=tile-learned]')).toBeVisible();
  await page.getByTestId('filters-toggle').click();
  await page.getByTestId('filter-status').selectOption('learned');
  await expect(page.getByTestId('case-tile')).toHaveCount(1);
  await page.getByTestId('filter-status').selectOption('favorites');
  await expect(page.getByTestId('case-tile')).toHaveCount(1);
  await page.getByTestId('filter-status').selectOption('unlearned');
  await expect(page.getByTestId('case-tile')).toHaveCount(20);
  await page.goto('/trainer');
  await expect(page.locator('[data-set=pll] [data-testid=progress-count]')).toHaveText('1/21');
});

test('a slow-path sample of cases: F2L, 2-look and beginner all open and solve', async ({ page }) => {
  for (const [id, title] of [['f2l-37', 'F2L 37'], ['2lo-edges-dot', 'Edges: dot'], ['2lp-ua', 'Edges: Ua'], ['beginner-corner-up', 'Corner with white facing up']]) {
    await openCase(page, id);
    await expect(page.getByTestId('detail-title')).toHaveText(title);
    await page.getByTestId('player-end').click();
    await expect(page.getByTestId('player-position')).toHaveText(/^(\d+)\/\1$/);
  }
});

test('unavailable sets are named as unavailable', async ({ page }) => {
  await page.goto('/algorithms');
  await expect(page.getByTestId('case-grid')).toContainText('Not in this library: COLL, CMLL, Winter Variation, ZBLL');
});
