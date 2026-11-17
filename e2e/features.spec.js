import { expect, test } from '@playwright/test';
import { cubeReady, expectPictureMatchesLogic, facelets, noPageErrors, openTimer, runSolve } from './helpers.js';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
// Sticker ids run U R F D L B, nine each.
const faceOf = (id) => 'URFDLB'[Math.floor(id / 9)];
const visibleFaces = async (page) => new Set((await page.evaluate(() => window.__turnbaseCube.visible())).map((s) => faceOf(s.id)));

test('holding Tab swings the camera to the back and springs back, with no move', async ({ page }) => {
  const errors = noPageErrors(page);
  await page.goto('/cube?debug');
  await cubeReady(page);
  expect([...(await visibleFaces(page))].sort()).toEqual(['F', 'R', 'U']);

  await page.keyboard.down('Tab');
  await page.waitForTimeout(700);
  expect([...(await visibleFaces(page))].sort()).toEqual(['B', 'L', 'U']);
  await expectPictureMatchesLogic(page);
  await page.keyboard.up('Tab');
  await page.waitForTimeout(1000);
  expect([...(await visibleFaces(page))].sort()).toEqual(['F', 'R', 'U']);

  expect(await facelets(page)).toBe(SOLVED);
  await expect(page.getByTestId('history-count')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('the Peek button works while held', async ({ page }) => {
  await page.goto('/cube?debug');
  await cubeReady(page);
  const box = await page.getByTestId('peek').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  expect(await visibleFaces(page)).toContain('B');
  await page.mouse.up();
  await page.waitForTimeout(1000);
  expect(await visibleFaces(page)).not.toContain('B');
  expect(await facelets(page)).toBe(SOLVED);
});

test('tiles are flat: every visible tile shows its exact color, with no sheen', async ({ page }) => {
  await page.goto('/cube?debug');
  await cubeReady(page);
  const scheme = { U: [0xf4, 0xf3, 0xee], R: [0xc8, 0x10, 0x2e], F: [0x00, 0x9b, 0x48] };
  for (const view of ['front', 'top', 'under']) {
    await page.getByTestId(`view-${view}`).click();
    await page.waitForTimeout(800);
    const points = await page.evaluate(() => window.__turnbaseCube.visible());
    const box = await page.getByTestId('cube-canvas').boundingBox();
    const shot = (await page.screenshot()).toString('base64');
    const colors = await page.evaluate(
      async ({ data, spots }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return spots.map(({ x, y }) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data).slice(0, 3));
      },
      { data: shot, spots: points.map((p) => ({ x: p.x + box.x, y: p.y + box.y })) },
    );
    points.forEach((p, i) => {
      const want = scheme[faceOf(p.id)];
      if (!want) return;
      const off = Math.max(...want.map((c, k) => Math.abs(c - colors[i][k])));
      // The far corners are slightly faded by the depth fog; a sheen would be far brighter.
      expect(off, `sticker ${p.id} in ${view} view: ${colors[i]}`).toBeLessThanOrEqual(14);
    });
  }
});

test('after a solve, the timer shows the shortest cross and X-cross for that scramble', async ({ page }) => {
  const errors = noPageErrors(page);
  await openTimer(page);
  await runSolve(page);
  const solutions = page.getByTestId('last-cross-solutions');
  await expect(solutions).toHaveAttribute('data-status', 'done', { timeout: 30000 });
  await expect(page.getByTestId('cross-best')).toContainText('move');
  await expect(solutions).toContainText('White cross');
  await expect(solutions).toContainText('z2');
  await page.getByTestId('last-cross-more').click();
  await expect(page.getByTestId('last-cross-panel').locator('[data-testid^="xcross-"]')).toHaveCount(4);
  await page.getByTestId('cross-color-D').click();
  await expect(page.getByTestId('last-cross-panel')).toContainText('Yellow cross');
  expect(errors).toEqual([]);
});

test('cross planning drill checks a plan against the optimal cross', async ({ page }) => {
  await page.goto('/trainer');
  await page.getByTestId('cross-start').click();
  await expect(page.getByTestId('cross-scramble')).not.toContainText('Generating', { timeout: 30000 });
  await expect(page.getByTestId('cross-countdown')).toBeVisible();
  await page.getByTestId('cross-plan').fill('R');
  await page.getByTestId('cross-reveal').click();
  await expect(page.getByTestId('cross-verdict')).toContainText('does not solve', { timeout: 30000 });
  await expect(page.getByTestId('drill-solutions')).toHaveAttribute('data-status', 'done', { timeout: 30000 });

  // The optimal answer itself is graded optimal.
  const best = (await page.getByTestId('cross-best').locator('.notation').textContent()).trim();
  await page.getByTestId('cross-next').click();
  await expect(page.getByTestId('cross-scramble')).not.toContainText('Generating', { timeout: 30000 });
  await page.getByTestId('cross-reveal').click();
  await expect(page.getByTestId('drill-solutions')).toHaveAttribute('data-status', 'done', { timeout: 30000 });
  expect(best.length).toBeGreaterThan(0);
  await expect(page.getByTestId('cross-tally')).toContainText('0 of 1');
});

test('phones vibrate on ready, start and stop', async ({ page }) => {
  await page.addInitScript(() => {
    window.__buzz = [];
    Object.defineProperty(navigator, 'vibrate', { value: (p) => (window.__buzz.push(p), true), configurable: true });
  });
  await openTimer(page);
  await runSolve(page);
  expect(await page.evaluate(() => window.__buzz)).toEqual([12, 28, [22, 60, 22]]);
});

test('installable: manifest, icons and a service worker that works offline', async ({ page, context }) => {
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);
  expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);

  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.goto('/cube?debug');
  await cubeReady(page);
  await page.goto('/?debug');
  await expect(page.getByTestId('timer-digits')).toBeVisible();
  await expect(page.getByTestId('scramble-text')).not.toContainText('Generating', { timeout: 30000 });
  await expect(page.getByTestId('scramble-text')).not.toContainText('did not respond');
  await page.goto('/settings');
  await expect(page.getByTestId('install-app')).toContainText('work offline');
  await context.setOffline(false);
});
