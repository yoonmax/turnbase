import { expect, test } from '@playwright/test';
import { noPageErrors, openTimer, runSolve } from './helpers.js';

// Chromium's built-in fake camera: a moving test pattern, with permission granted.
test.use({
  launchOptions: { args: ['--use-angle=metal', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera', 'clipboard-read', 'clipboard-write'],
});

async function turnOnRecording(page) {
  await page.goto('/settings');
  await page.getByTestId('setting-recordSolves').click();
  await expect(page.getByTestId('setting-recordSolves')).toHaveAttribute('aria-checked', 'true');
}

test('records a solve and plays it back slowed down, a frame at a time', async ({ page }) => {
  const errors = noPageErrors(page);
  await turnOnRecording(page);
  await openTimer(page);
  await expect(page.getByTestId('camera-state')).toHaveText('Camera on', { timeout: 15000 });

  await runSolve(page, { solveMs: 1500 });
  await expect(page.getByTestId('watch-latest')).toBeVisible({ timeout: 10000 });
  const solveText = (await page.getByTestId('timer-digits').textContent()).trim();
  await page.getByTestId('watch-latest').click();

  const video = page.getByTestId('clip-video');
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-testid="clip-video"]');
    return v && Number.isFinite(v.duration) && v.duration > 1.5 && v.readyState >= 2;
  }, null, { timeout: 15000 });

  // Starts just before the solve, with the overlay at zero.
  await expect(page.getByTestId('clip-time')).toHaveText('0.00');

  // Slow motion: at 0.25×, two seconds of playing moves about half a second.
  await page.getByTestId('clip-speed-0.25').click();
  expect(await video.evaluate((v) => v.playbackRate)).toBe(0.25);
  const before = await video.evaluate((v) => v.currentTime);
  await page.getByTestId('clip-play').click();
  await page.waitForTimeout(2000);
  await page.getByTestId('clip-play').click();
  const moved = (await video.evaluate((v) => v.currentTime)) - before;
  expect(moved).toBeGreaterThan(0.3);
  expect(moved).toBeLessThan(0.8);

  // One frame forward and back.
  const at = await video.evaluate((v) => v.currentTime);
  await page.getByTestId('clip-frame-forward').click();
  await page.waitForTimeout(150);
  const forward = (await video.evaluate((v) => v.currentTime)) - at;
  expect(forward).toBeGreaterThan(0.01);
  // One frame at the camera's own rate (the fake camera runs at 20 a second).
  expect(forward).toBeLessThan(0.07);
  await page.getByTestId('clip-frame-back').click();
  await page.waitForTimeout(150);
  expect(Math.abs((await video.evaluate((v) => v.currentTime)) - at)).toBeLessThan(0.005);

  // At the end of the clip the overlay shows the recorded time.
  await video.evaluate((v) => {
    v.currentTime = v.duration - 0.05;
  });
  await expect(page.getByTestId('clip-time')).toHaveText(solveText);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('row-has-clip').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a hold that is let go too early leaves no clip, and clips can be deleted', async ({ page }) => {
  await turnOnRecording(page);
  await openTimer(page);
  await expect(page.getByTestId('camera-state')).toHaveText('Camera on', { timeout: 15000 });
  await page.keyboard.down('Space');
  await page.waitForTimeout(100);
  await page.keyboard.up('Space');
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('row-has-clip')).toHaveCount(0);

  await runSolve(page, { solveMs: 600 });
  await expect(page.getByTestId('watch-latest')).toBeVisible({ timeout: 10000 });
  await page.getByTestId('watch-latest').click();
  await page.getByTestId('clip-delete').click();
  await expect(page.getByTestId('watch-panel')).toHaveCount(0);
  await expect(page.getByTestId('watch-latest')).toHaveCount(0);
  await expect(page.getByTestId('row-has-clip')).toHaveCount(0);
});

test('with recording off, the camera is never opened', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cameraCalls = 0;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (...args) => {
      window.__cameraCalls += 1;
      return original(...args);
    };
  });
  await openTimer(page);
  await runSolve(page);
  await expect(page.getByTestId('camera-preview')).toHaveCount(0);
  expect(await page.evaluate(() => window.__cameraCalls)).toBe(0);
});
