import { expect, test } from '@playwright/test';
import { cubeReady, expectPictureMatchesLogic, openTimer, runSolve } from './helpers.js';

const rootVar = (page, name) => page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);

test('choosing a palette changes the page, and survives a reload with no flash', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('setting-theme-light').click();
  const before = await rootVar(page, '--paper');
  await page.getByTestId('palette-ember').click();
  expect(await rootVar(page, '--paper')).not.toBe(before);
  const ember = await rootVar(page, '--paper');
  await page.waitForTimeout(150);
  // The boot script applies the theme before any app code runs.
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      window.__bootPaper = document.documentElement.style.getPropertyValue('--paper');
    });
  });
  await page.reload();
  await page.waitForSelector('[data-testid=settings-page]');
  expect(await page.evaluate(() => window.__bootPaper)).toBe(ember);
  await expect(page.getByTestId('palette-ember')).toHaveAttribute('aria-pressed', 'true');
});

test('a custom theme takes your colours and decides light or dark itself', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('palette-custom').click();
  await expect(page.getByTestId('custom-theme')).toBeVisible();
  await page.getByTestId('custom-paper').fill('#f0f8ff');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await rootVar(page, '--paper')).toBe('#f0f8ff');
  await page.getByTestId('custom-paper').fill('#102030');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByTestId('custom-accent').fill('#ff3366');
  expect(await rootVar(page, '--accent')).toBe('#ff3366');
  await expect(page.getByTestId('theme-toggle')).toHaveCount(0);
  await page.getByTestId('palette-glacier').click();
  await expect(page.getByTestId('theme-toggle')).toBeVisible();
});

test('accent, glass and glow controls have real effects', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('accent-picker').fill('#2563eb');
  expect(await rootVar(page, '--accent')).toBe('#2563eb');
  await page.getByTestId('accent-reset').click();
  expect(await rootVar(page, '--accent')).not.toBe('#2563eb');

  await page.getByTestId('setting-glass').fill('0');
  const filter = await page.getByTestId('main-nav').locator('.nav-links').evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(filter).toBe('none');
  await page.getByTestId('setting-glass').fill('1');
  const glassy = await page.getByTestId('main-nav').locator('.nav-links').evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(glassy).toContain('blur');

  await page.getByTestId('setting-bloom').fill('0');
  expect(await page.locator('.backdrop-blooms').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
});

test('the selection thumb sits exactly on the selected item, and follows it', async ({ page }) => {
  await page.goto('/settings');
  const thumb = (id) => page.getByTestId('main-nav').locator('.nav-links').evaluate((el, testId) => {
    const link = el.querySelector(`[data-testid="${testId}"]`);
    return { x: el.style.getPropertyValue('--thumb-x'), left: `${link.offsetLeft}px`, w: el.style.getPropertyValue('--thumb-w'), width: `${link.offsetWidth}px` };
  }, id);
  await page.waitForTimeout(200);
  let t = await thumb('nav-settings');
  expect(t.x).toBe(t.left);
  expect(t.w).toBe(t.width);
  await page.getByTestId('nav-cube').click();
  await page.waitForTimeout(200);
  t = await thumb('nav-cube');
  expect(t.x).toBe(t.left);
});

test('during a solve the page is only digits, and no glass is being composited', async ({ page }) => {
  await openTimer(page);
  await page.keyboard.down('Space');
  await page.waitForTimeout(340);
  await page.keyboard.up('Space');
  await page.waitForTimeout(300);
  expect(await page.getByTestId('main-nav').evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
  expect(await page.getByTestId('session-stats').evaluate((el) => getComputedStyle(el).backdropFilter)).toBe('none');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  expect(await page.getByTestId('main-nav').evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
});

test('penalty controls appear only for the solve just finished', async ({ page }) => {
  await openTimer(page);
  await expect(page.getByTestId('penalty-review')).toBeHidden();
  await runSolve(page);
  await expect(page.getByTestId('penalty-review')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('penalty-review')).toBeHidden();
});

test('the digits stay centred on the page, with the solve panel open or closed', async ({ page }) => {
  await openTimer(page);
  const centre = async () => {
    const box = await page.getByTestId('timer-digits').boundingBox();
    return box.x + box.width / 2;
  };
  const open = await centre();
  await page.getByTestId('rail-toggle').click();
  await page.waitForTimeout(600);
  expect(Math.abs((await centre()) - open)).toBeLessThan(1);
  expect(Math.abs(open - 720)).toBeLessThan(2);
  await expect(page.getByTestId('solve-rail')).toHaveAttribute('data-open', 'false');
});

test('the cube still matches its logic in a coloured theme', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('palette-orchid').click();
  await page.getByTestId('setting-theme-dark').click();
  await page.waitForTimeout(100);
  await page.goto('/cube?debug');
  await cubeReady(page);
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(350);
  await expectPictureMatchesLogic(page);
});

test('frame pacing: timer and cube hold full frame rate, with glass on', async ({ page }) => {
  await openTimer(page);
  // Rate of animation frames, and how many came noticeably late.
  const sample = (ms) =>
    page.evaluate(
      (duration) =>
        new Promise((resolve) => {
          const times = [];
          const start = performance.now();
          const step = (t) => {
            times.push(t);
            if (t - start < duration) requestAnimationFrame(step);
            else {
              const gaps = times.slice(1).map((v, i) => v - times[i]);
              const sorted = [...gaps].sort((a, b) => a - b);
              resolve({ fps: gaps.length / ((times[times.length - 1] - times[0]) / 1000), p95: sorted[Math.floor(sorted.length * 0.95)], worst: sorted[sorted.length - 1] });
            }
          };
          requestAnimationFrame(step);
        }),
      ms,
    );

  await page.keyboard.down('Space');
  await page.waitForTimeout(340);
  await page.keyboard.up('Space');
  const timer = await sample(2000);
  await page.keyboard.press('Space');
  console.log('timer running', JSON.stringify(timer));
  expect(timer.fps).toBeGreaterThan(50);

  await page.goto('/algorithms/pll-t?debug');
  await cubeReady(page);
  await page.getByTestId('player-loop').click();
  await page.getByTestId('player-play').click();
  // Real renders, not just animation frames: the cube draws only on demand.
  const counted = await page.evaluate(async () => {
    const api = window.__turnbaseCube;
    const before = api.frames();
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 2000));
    return (api.frames() - before) / ((performance.now() - t0) / 1000);
  });
  await page.getByTestId('player-play').click();
  console.log('cube rendered fps', counted.toFixed(1));
  expect(counted).toBeGreaterThan(50);
});
