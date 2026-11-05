import { expect, test } from '@playwright/test';
import { cubeReady, expectPictureMatchesLogic, openTimer, runSolve, timerState } from './helpers.js';

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

test('a custom theme takes your colors and decides light or dark itself', async ({ page }) => {
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

test('a first-time visitor gets light with one plain background color, whatever the system prefers', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark', baseURL: 'http://localhost:5211', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForSelector('[data-testid=timer-digits]');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const opacity = Number(await page.locator('.backdrop-blooms').evaluate((el) => getComputedStyle(el).opacity));
  expect(opacity).toBe(0);
  await context.close();
});

test('someone with old saved settings moves to the new look, but a chosen dark theme stays', async ({ page }) => {
  await page.goto('/settings');
  const seed = (settings) =>
    page.evaluate(
      (value) =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open('turnbase');
          open.onsuccess = () => {
            const tx = open.result.transaction('kv', 'readwrite');
            tx.objectStore('kv').put({ key: 'settings', value });
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
      settings,
    );
  await seed({ theme: 'system', bloom: 0.7, holdMs: 450 });
  await page.reload();
  await page.waitForSelector('[data-testid=settings-page]');
  await expect(page.getByTestId('setting-theme-light')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('setting-holdMs-value')).toHaveText('450 ms');
  await seed({ theme: 'dark', bloom: 0.5 });
  await page.reload();
  await page.waitForSelector('[data-testid=settings-page]');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByTestId('setting-bloom-value')).toHaveText('50%');
});

test('holding turns the digits red, ready turns them green, with no glow behind', async ({ page }) => {
  await openTimer(page);
  const rgb = () => page.getByTestId('timer-digits').evaluate((el) => getComputedStyle(el).color.match(/[\d.]+/g).slice(0, 3).map(Number));
  await page.keyboard.down('Space');
  await page.waitForTimeout(150);
  const [r1, g1, b1] = await rgb();
  expect(await timerState(page)).toBe('holding');
  expect(r1).toBeGreaterThan(g1 * 2);
  expect(r1).toBeGreaterThan(b1 * 2);
  await page.waitForTimeout(350);
  const [r2, g2, b2] = await rgb();
  expect(await timerState(page)).toBe('ready');
  expect(g2).toBeGreaterThan(r2 * 2);
  expect(g2).toBeGreaterThan(b2);
  await expect(page.locator('.timer-glow')).toHaveCount(0);
  await page.keyboard.up('Space');
  await page.keyboard.press('Escape');
});

test('the timer is Montserrat ExtraBold, and its digits do not change width', async ({ page }) => {
  await openTimer(page);
  await page.evaluate(() => document.fonts.ready);
  const digits = page.getByTestId('timer-digits');
  const style = await digits.evaluate((el) => ({ family: getComputedStyle(el).fontFamily, weight: getComputedStyle(el).fontWeight }));
  expect(style.family).toContain('Montserrat');
  expect(style.weight).toBe('800');
  expect(await page.evaluate(() => document.fonts.check('800 40px "Montserrat Variable"', '0123456789'))).toBe(true);
  const widths = await digits.evaluate((el) =>
    '0123456789'.split('').map((d) => {
      const probe = el.cloneNode();
      probe.removeAttribute('data-testid');
      probe.style.display = 'inline-block';
      probe.textContent = d.repeat(4);
      el.parentElement.appendChild(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      return w;
    }),
  );
  expect(new Set(widths.map((w) => w.toFixed(1))).size).toBe(1);
});

for (const width of [640, 768, 1024]) {
  test(`the navigation fits without overlaps at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: 'http://localhost:5211', viewport: { width, height: 800 } });
    const page = await context.newPage();
    await page.goto('/settings');
    await page.waitForSelector('[data-testid=settings-page]');
    await page.evaluate(() => document.fonts.ready);
    const pill = await page.locator('.nav-links').boundingBox();
    expect(pill.x).toBeGreaterThanOrEqual(0);
    expect(pill.x + pill.width).toBeLessThanOrEqual(width);
    const word = page.locator('.nav > a');
    if (await word.isVisible()) {
      const box = await word.boundingBox();
      expect(box.x + box.width).toBeLessThan(pill.x);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await context.close();
  });
}

test('long times still fit on a phone', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://localhost:5211', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForSelector('[data-testid=session-select], [data-testid=mobile-history]');
  await page.getByTestId('timer-digits').evaluate((el) => {
    el.textContent = '1:23.45';
    el.dataset.long = 'true';
  });
  const box = await page.getByTestId('timer-digits').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  const stats = await page.getByTestId('session-stats').boundingBox();
  expect(stats.x).toBeGreaterThanOrEqual(0);
  expect(stats.x + stats.width).toBeLessThanOrEqual(390);
  await context.close();
});

test('penalty controls appear only for the solve just finished', async ({ page }) => {
  await openTimer(page);
  await expect(page.getByTestId('penalty-review')).toBeHidden();
  await runSolve(page);
  await expect(page.getByTestId('penalty-review')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('penalty-review')).toBeHidden();
});

test('the digits stay centerd on the page, with the solve panel open or closed', async ({ page }) => {
  await openTimer(page);
  const center = async () => {
    const box = await page.getByTestId('timer-digits').boundingBox();
    return box.x + box.width / 2;
  };
  const open = await center();
  await page.getByTestId('rail-toggle').click();
  await page.waitForTimeout(600);
  expect(Math.abs((await center()) - open)).toBeLessThan(1);
  expect(Math.abs(open - 720)).toBeLessThan(2);
  await expect(page.getByTestId('solve-rail')).toHaveAttribute('data-open', 'false');
});

test('the cube still matches its logic in a colored theme', async ({ page }) => {
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
