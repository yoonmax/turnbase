import { expect, test } from '@playwright/test';
import { cubeReady, typeMoves } from './helpers.js';

// Random choices made fixed, so a practice round is predictable: the first case in the
// set, and no extra turn of the top layer.
const fixRandom = (page) => page.addInitScript(() => { Math.random = () => 0.0001; });

test('recognition: identify a case, see the result, record it', async ({ page }) => {
  await page.goto('/trainer');
  await page.getByTestId('trainset-pll').click();
  await page.getByTestId('trainmode-recognition').click();
  await page.getByTestId('trainer-start').click();
  await expect(page.getByTestId('recognition-option')).toHaveCount(4);
  await page.locator('[data-testid=recognition-option][data-correct=true]').click();
  await expect(page.getByTestId('recognition-result')).toContainText('Right');
  await expect(page.getByTestId('practice-tally')).toHaveText('1 of 1 right');
  await page.getByTestId('recognition-next').click();
  await page.locator('[data-testid=recognition-option][data-correct=false]').first().click();
  await expect(page.getByTestId('recognition-result')).toContainText('Not quite');
  await expect(page.getByTestId('practice-tally')).toHaveText('1 of 2 right');
  await page.getByTestId('practice-exit').click();
  const success = await page.locator('[data-set=pll] td').nth(2).textContent();
  expect(success).toBe('50%');
  await page.reload();
  await expect(page.locator('[data-set=pll] td').nth(2)).toHaveText('50%');
});

test('practice diagrams draw no arrows, so they cannot give away the case', async ({ page }) => {
  await page.goto('/trainer');
  await page.getByTestId('trainset-pll').click();
  await page.getByTestId('trainmode-recognition').click();
  await page.getByTestId('trainer-start').click();
  await expect(page.getByTestId('case-diagram')).toBeVisible();
  await expect(page.locator('[data-testid=case-diagram] line')).toHaveCount(0);
});

test('recall: hidden until asked, then graded', async ({ page }) => {
  await page.goto('/trainer');
  await page.getByTestId('trainmode-recall').click();
  await page.getByTestId('trainer-start').click();
  await expect(page.getByTestId('trainer-algorithm')).toHaveCount(0);
  await page.getByTestId('trainer-reveal').click();
  await expect(page.getByTestId('trainer-algorithm')).toBeVisible();
  await page.getByTestId('grade-good').click();
  await expect(page.getByTestId('practice-tally')).toHaveText('1 of 1 right');
  await expect(page.getByTestId('trainer-algorithm')).toHaveCount(0);
});

test('flashcards turn over', async ({ page }) => {
  await page.goto('/trainer');
  await page.getByTestId('trainset-oll').click();
  await page.getByTestId('trainmode-flashcards').click();
  await page.getByTestId('trainer-start').click();
  await expect(page.getByTestId('case-diagram')).toBeVisible();
  await page.getByTestId('trainer-reveal').click();
  await expect(page.getByTestId('trainer-algorithm')).toBeVisible();
  await expect(page.getByTestId('case-diagram')).toHaveCount(0);
  await page.getByTestId('grade-forgot').click();
  await expect(page.getByTestId('practice-tally')).toHaveText('0 of 1 right');
});

test('spaced review removes what is no longer due', async ({ page }) => {
  await page.goto('/trainer');
  await page.getByTestId('trainset-beginner').click();
  await page.getByTestId('trainmode-review').click();
  await expect(page.getByTestId('trainer-start')).toHaveText('Practice 11 cases');
  await page.getByTestId('trainer-start').click();
  await page.getByTestId('trainer-reveal').click();
  await page.getByTestId('grade-easy').click();
  await page.getByTestId('practice-exit').click();
  await expect(page.getByTestId('trainer-start')).toHaveText('Practice 10 cases');
});

test('execution: solving the case on the 3D cube is detected and recorded', async ({ page }) => {
  await fixRandom(page);
  await page.goto('/trainer?debug');
  await page.getByTestId('trainset-pll').click();
  await page.getByTestId('trainmode-execution').click();
  await page.getByTestId('trainer-start').click();
  await cubeReady(page);
  await expect(page.getByTestId('execution-status')).toContainText('Solve this case');
  await page.getByTestId('execution-hint').click();
  // The first PLL case is Aa. Use a moves-only solution in Direct-profile keys.
  await expect(page.getByTestId('trainer-algorithm')).toHaveText("x R' U R' D2 R U' R' D2 R2 x'");
  await typeMoves(page, "x R' U R' D2 R U' R' D2 R2");
  await page.keyboard.press('Shift+KeyX');
  await expect(page.getByTestId('execution-status')).toContainText('Case solved', { timeout: 10000 });
  await expect(page.getByTestId('execution-count')).toHaveText('9 moves');
  await expect(page.getByTestId('practice-tally')).toHaveText('1 of 1 right');
  await page.getByTestId('execution-next').click();
  await expect(page.getByTestId('execution-status')).toContainText('Solve this case');
  await page.getByTestId('practice-exit').click();
  await expect(page.locator('[data-set=pll] td').nth(4)).not.toHaveText('–');
});

test('a wrong move does not end the round, and reset restores the case', async ({ page }) => {
  await fixRandom(page);
  await page.goto('/trainer?debug');
  await page.getByTestId('trainset-oll').click();
  await page.getByTestId('trainmode-execution').click();
  await page.getByTestId('trainer-start').click();
  await cubeReady(page);
  const start = await page.evaluate(() => window.__turnbaseCube.facelets());
  await page.keyboard.press('KeyR');
  await expect(page.getByTestId('execution-count')).toHaveText('1 moves');
  await expect(page.getByTestId('execution-status')).toContainText('Solve this case');
  await page.getByTestId('execution-reset').click();
  await expect(page.getByTestId('execution-count')).toHaveText('0 moves');
  expect(await page.evaluate(() => window.__turnbaseCube.facelets())).toBe(start);
  await page.getByTestId('execution-skip').click();
  await expect(page.getByTestId('practice-tally')).toHaveText('0 of 1 right');
});

test('sets with nothing in them say so', async ({ page }) => {
  await page.goto('/trainer');
  await page.getByTestId('trainset-favorites').click();
  await expect(page.getByTestId('trainer-page')).toContainText('Star cases');
  await page.getByTestId('trainset-custom').click();
  await expect(page.getByTestId('trainer-page')).toContainText('Save an algorithm');
});
