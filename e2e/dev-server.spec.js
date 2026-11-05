import { expect, test } from '@playwright/test';

// The production build and the dev server load the scrambler differently. This runs
// only when a dev server is up: `npm run dev`, then `npm run test:e2e`.
test('the dev server can load the scrambler', async ({ page, request }) => {
  const up = await request.get('http://localhost:5210/').then((r) => r.ok()).catch(() => false);
  test.skip(!up, 'The dev server is not running.');
  await page.goto('http://localhost:5210/');
  await expect(page.getByTestId('scramble-text')).not.toContainText('Generating', { timeout: 30000 });
  await expect(page.getByTestId('scramble-text')).not.toContainText('did not respond');
  await expect(page.getByTestId('cube-net').locator('rect')).toHaveCount(54);
});
