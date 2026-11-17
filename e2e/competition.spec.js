import { expect, test } from '@playwright/test';
import { noPageErrors, openTimer, timerState } from './helpers.js';

/** With inspection: tap to inspect, hold until ready, let go, then stop. */
async function inspectedSolve(page, solveMs) {
  await page.keyboard.press('Space');
  await expect.poll(() => timerState(page)).toBe('inspection');
  await page.waitForTimeout(300);
  await page.keyboard.down('Space');
  await page.waitForTimeout(350);
  await page.keyboard.up('Space');
  await page.waitForTimeout(solveMs);
  await page.keyboard.press('Space');
  await expect.poll(() => timerState(page)).toBe('stopped');
  await page.waitForTimeout(300);
}

test('a competition round: inspection, best and worst possible, target, and the average', async ({ page }) => {
  const errors = noPageErrors(page);
  await openTimer(page);
  await page.getByTestId('round-toggle').click();
  await expect(page.getByTestId('round-panel')).toBeVisible();
  await expect(page.getByTestId('round-status')).toContainText('Solve 1 of 5');

  for (const ms of [900, 1200, 1000, 1500]) await inspectedSolve(page, ms);
  for (let i = 0; i < 4; i += 1) await expect(page.getByTestId(`round-slot-${i}`)).not.toHaveText('–');
  await expect(page.getByTestId('round-status')).toContainText('Best possible');
  await expect(page.getByTestId('round-status')).toContainText('worst possible');

  // A target between best and worst possible tells you what the last solve needs.
  const [bpa, wpa] = await page.getByTestId('round-status').evaluate((el) => (el.textContent.match(/\d+\.\d\d/g) ?? []).map(Number));
  const target = ((bpa + wpa) / 2).toFixed(2);
  await page.getByTestId('round-target').fill(target);
  await page.getByTestId('round-target').press('Enter');
  await expect(page.getByTestId('round-status')).toContainText(`or faster for a ${target} average`);

  await inspectedSolve(page, 1100);
  await expect(page.getByTestId('round-status')).toContainText('Average');
  await expect(page.getByTestId('round-slot-0')).toContainText('(');
  await page.getByTestId('round-next').click();
  await expect(page.getByTestId('round-status')).toContainText('Solve 1 of 5');
  await page.getByTestId('round-end').click();
  await expect(page.getByTestId('round-panel')).toHaveCount(0);
  expect(errors).toEqual([]);
});
