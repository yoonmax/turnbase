import { expect, test } from '@playwright/test';
import { importDoc, makeSessionDoc, noPageErrors } from './helpers.js';

async function loadSession(page, times, options) {
  await page.goto('/');
  await page.waitForSelector('[data-testid=session-select]');
  await importDoc(page, makeSessionDoc(times, options));
  await page.goto('/');
  await page.getByTestId('session-select').selectOption({ label: options?.name ?? 'Test session' });
  await page.getByTestId('nav-statistics').click();
  await expect(page.getByTestId('statistics-page')).toBeVisible();
}

test('numbers match a hand calculation, including +2 and DNF', async ({ page }) => {
  const errors = noPageErrors(page);
  // Results: 10.00, 12.00+2=14.00, 9.00, DNF, 11.00. ao5 drops 9.00 and DNF: (10+14+11)/3 = 11.67.
  await loadSession(page, [10000, [12000, '+2'], 9000, [15000, 'dnf'], 11000]);
  await expect(page.getByTestId('total-count')).toHaveText('5');
  await expect(page.getByTestId('total-best')).toHaveText('9.00');
  await expect(page.getByTestId('total-worst')).toHaveText('14.00');
  await expect(page.getByTestId('total-mean')).toHaveText('11.00');
  await expect(page.getByTestId('total-median')).toHaveText('10.50');
  await expect(page.getByTestId('total-dnf')).toHaveText('1');
  await expect(page.getByTestId('total-plus2')).toHaveText('1');
  await expect(page.getByTestId('total-total')).toHaveText('44s');
  await expect(page.getByTestId('row-ao5').locator('[data-role=current]')).toHaveText('11.67');
  // The last three include the DNF, so the mean of 3 is DNF.
  await expect(page.getByTestId('row-mo3').locator('[data-role=current]')).toHaveText('DNF');
  await expect(page.getByTestId('row-ao12').locator('[data-role=current]')).toHaveText('–');
  expect(errors).toEqual([]);
});

test('ao12 drops one from each end, and a second DNF makes it DNF', async ({ page }) => {
  const twelve = [10000, 11000, 12000, 13000, 14000, 15000, 16000, 17000, 18000, 19000, 20000, 90000];
  await loadSession(page, twelve);
  // Middle ten: 11..20, mean 15.50.
  await expect(page.getByTestId('row-ao12').locator('[data-role=current]')).toHaveText('15.50');
  await page.getByTestId('solve-search').fill('');
  await page.getByTestId('solve-table-row').first().locator('button').click();
  await page.getByTestId('detail-penalty-dnf').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('row-ao12').locator('[data-role=current]')).toHaveText('15.50');
  await page.getByTestId('solve-table-row').nth(1).locator('button').click();
  await page.getByTestId('detail-penalty-dnf').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('row-ao12').locator('[data-role=current]')).toHaveText('DNF');
});

test('charts draw, respond to hover, and open a solve', async ({ page }) => {
  const times = Array.from({ length: 60 }, (_, i) => 12000 + Math.round(Math.sin(i) * 1500) - i * 30);
  await loadSession(page, times);
  for (const id of ['trend-chart', 'histogram', 'daily-chart', 'pb-chart', 'consistency-chart']) {
    await expect(page.getByTestId(id).locator('svg')).toBeVisible();
  }
  await expect(page.getByTestId('chart-legend').first()).toContainText('ao50');
  const chart = page.getByTestId('trend-chart');
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(chart.getByTestId('chart-tooltip')).toContainText('Singles');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('solve-detail')).toBeVisible();
  await expect(page.getByTestId('detail-scramble')).toBeVisible();
});

test('filter by date and last N, and add a custom average', async ({ page }) => {
  const times = Array.from({ length: 40 }, (_, i) => 10000 + i * 100);
  await loadSession(page, times, { start: Date.now() - 20 * 86400000 });
  await page.getByTestId('stat-last').selectOption('50');
  await expect(page.getByTestId('stat-scope')).toContainText('40 of 40');
  await page.getByTestId('stat-last').selectOption('0');
  await page.getByTestId('range-1').click();
  await expect(page.getByTestId('stat-scope')).toContainText('0 of 40');
  await expect(page.getByTestId('statistics-page')).toContainText('No solves match');
  await page.getByTestId('range-all').click();
  await page.getByTestId('window-input').fill('25');
  await page.getByTestId('window-add').click();
  await expect(page.getByTestId('row-ao25')).toBeVisible();
  await page.getByTestId('window-input').fill('1');
  await page.getByTestId('window-add').click();
  await expect(page.getByTestId('statistics-page')).toContainText('from 3 up');
});

test('search, tags, bulk delete and undo', async ({ page }) => {
  const times = [10000, 11000, 12000];
  await loadSession(page, times, { extra: (i) => ({ tags: i === 1 ? ['pb'] : [], comment: i === 2 ? 'lucky cross' : '' }) });
  await page.getByTestId('solve-search').fill('lucky');
  await expect(page.getByTestId('solve-table-row')).toHaveCount(1);
  await page.getByTestId('solve-search').fill('');
  await page.getByTestId('stat-tag').selectOption('pb');
  await expect(page.getByTestId('stat-scope')).toContainText('1 of 3');
  await page.getByTestId('stat-tag').selectOption('');
  await page.getByTestId('solve-table-row').nth(0).locator('input').check();
  await page.getByTestId('solve-table-row').nth(1).locator('input').check();
  await page.getByTestId('bulk-delete').click();
  await page.getByTestId('confirm-action').click();
  await expect(page.getByTestId('stat-scope')).toContainText('1 of 1');
  await page.getByTestId('toast-action').click();
  await expect(page.getByTestId('stat-scope')).toContainText('3 of 3');
});

test('compare sessions', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-testid=session-select]');
  await importDoc(page, makeSessionDoc(Array.from({ length: 15 }, () => 10000), { sessionId: 'a', name: 'First' }));
  await importDoc(page, makeSessionDoc(Array.from({ length: 15 }, () => 20000), { sessionId: 'b', name: 'Second' }));
  await page.goto('/statistics');
  await expect(page.getByTestId('compare-table')).toContainText('Main 3×3');
  await page.getByTestId('compare-session').filter({ hasText: 'First' }).click();
  await page.getByTestId('compare-session').filter({ hasText: 'Second' }).click();
  await expect(page.getByTestId('compare-table')).toContainText('First');
  await expect(page.getByTestId('compare-table')).toContainText('10.00');
  await expect(page.getByTestId('compare-table')).toContainText('20.00');
  await expect(page.getByTestId('compare-chart').locator('svg')).toBeVisible();
});

test('all sessions of a puzzle can be viewed together', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-testid=session-select]');
  await importDoc(page, makeSessionDoc([10000, 10000], { sessionId: 'a', name: 'First' }));
  await importDoc(page, makeSessionDoc([20000], { sessionId: 'b', name: 'Second' }));
  await page.goto('/');
  await page.getByTestId('session-select').selectOption({ label: 'First' });
  await page.getByTestId('nav-statistics').click();
  await expect(page.getByTestId('total-count')).toHaveText('2');
  await page.getByTestId('stat-scope-select').selectOption('puzzle');
  await expect(page.getByTestId('total-count')).toHaveText('3');
  await expect(page.getByTestId('total-worst')).toHaveText('20.00');
  await expect(page.getByTestId('solve-table')).toHaveCount(0);
});

test('export a CSV, and back up and restore everything', async ({ page }) => {
  await loadSession(page, [10000, 11000]);
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
  expect(csv.suggestedFilename()).toBe('turnbase-test-session.csv');

  await page.getByTestId('nav-settings').click();
  const [backup] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-all').click()]);
  const path = await backup.path();

  await page.getByTestId('wipe-data').click();
  await page.getByTestId('confirm-action').click();
  await expect(page.getByTestId('toast').first()).toContainText('All data deleted');
  await page.goto('/');
  await expect(page.getByTestId('session-select').locator('option')).toHaveText(['Main 3×3']);

  await page.goto('/settings');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('import-backup').click()]);
  await chooser.setFiles(path);
  await expect(page.getByTestId('toast').first()).toContainText('Imported');
  await page.goto('/');
  await expect(page.getByTestId('session-select')).toContainText('Test session');
});

test('a bad backup is refused, with a reason', async ({ page }) => {
  await page.goto('/settings');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('import-backup').click()]);
  await chooser.setFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"other"}') });
  await expect(page.getByTestId('toast').first()).toContainText('not a turnbase backup');
});

test('session management: duplicate, archive, delete with confirmation', async ({ page }) => {
  await loadSession(page, [10000]);
  await page.goto('/');
  await page.getByTestId('session-manage').click();
  const row = page.locator('[data-session-name="Test session"]');
  await row.getByTestId('session-duplicate').click();
  await expect(page.locator('[data-session-name="Test session copy"]')).toBeVisible();
  await page.locator('[data-session-name="Test session copy"]').getByTestId('session-archive').click();
  await expect(page.locator('[data-session-name="Test session copy"]')).toHaveCount(0);
  await page.getByTestId('session-show-archived').click();
  await expect(page.locator('[data-session-name="Test session copy"]')).toBeVisible();
  await page.locator('[data-session-name="Test session copy"]').getByTestId('session-delete').click();
  await page.getByTestId('confirm-action').click();
  await expect(page.locator('[data-session-name="Test session copy"]')).toHaveCount(0);
});

test('every settings control has an effect that survives a reload', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('setting-theme-dark').click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await page.getByTestId('setting-highContrast').click();
  expect(await page.evaluate(() => document.documentElement.dataset.contrast)).toBe('high');
  await page.getByTestId('setting-largeText').click();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).not.toBe('16px');
  await page.getByTestId('setting-reducedMotion-on').click();
  expect(await page.evaluate(() => document.documentElement.dataset.motion)).toBe('reduce');
  await page.getByTestId('setting-holdMs').fill('0');
  await page.getByTestId('setting-timerFontScale').fill('0.8');
  await page.getByTestId('setting-showScrambleDiagram').click();
  await page.getByTestId('setting-decimals-3').click();
  await page.waitForTimeout(100);
  await page.reload();
  await page.waitForSelector('[data-testid=settings-page]');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  await page.getByTestId('nav-timer').click();
  await expect(page.getByTestId('timer-digits')).toBeVisible();
  await expect(page.getByTestId('cube-net')).toHaveCount(0);
  const scale = await page.evaluate(() => document.documentElement.style.getPropertyValue('--timer-scale'));
  expect(scale).toBe('0.8');
  // Hold time of 0 means the very first press is ready.
  await page.keyboard.down('Space');
  expect(await page.evaluate(() => document.documentElement.dataset.timer)).toBe('ready');
  await page.keyboard.up('Space');
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(40);
  // Three decimals on the result, and any key stops.
  expect(await page.getByTestId('timer-digits').textContent()).toMatch(/^\d+\.\d{3}$/);

  await page.getByTestId('nav-settings').click();
  await page.getByTestId('reset-settings').click();
  await page.getByTestId('confirm-action').click();
  await page.waitForTimeout(100);
  await page.getByTestId('setting-stopWithAnyKey').click();
  await page.getByTestId('setting-hideRunningTime').click();
  await page.getByTestId('nav-timer').click();
  await expect(page.getByTestId('timer-digits')).toBeVisible();
  await page.waitForTimeout(100);
  await page.keyboard.down('Space');
  await page.waitForTimeout(340);
  await page.keyboard.up('Space');
  await page.waitForTimeout(100);
  await expect(page.getByTestId('timer-digits')).toHaveText('solving');
  await page.keyboard.press('KeyQ');
  expect(await page.evaluate(() => document.documentElement.dataset.timer)).toBe('running');
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => document.documentElement.dataset.timer)).toBe('stopped');
});
