import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { importDoc, makeSessionDoc } from './helpers.js';

const PAGES = [
  ['timer', '/'],
  ['algorithms', '/algorithms'],
  ['algorithm detail', '/algorithms/pll-t'],
  ['trainer', '/trainer'],
  ['cube', '/cube'],
  ['cube editor', '/cube?tab=editor'],
  ['cube notation', '/cube?tab=notation'],
  ['statistics', '/statistics'],
  ['settings', '/settings'],
];

for (const theme of ['light', 'dark']) {
  for (const [name, path] of PAGES) {
    test(`${name} (${theme}) has no serious accessibility violations`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('turnbase-theme', t), theme);
      await page.goto('/');
      await page.waitForSelector('[data-testid=session-select]');
      await importDoc(page, makeSessionDoc(Array.from({ length: 14 }, (_, i) => 10000 + i * 90), { name: 'Main 3×3 practice' }));
      await page.getByTestId(`setting-theme-${theme}`).click();
      await page.goto(path);
      await page.waitForTimeout(900);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = results.violations
        .filter((v) => ['serious', 'critical'].includes(v.impact))
        .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')} :: ${v.nodes[0].failureSummary?.slice(0, 160)}`);
      expect(serious).toEqual([]);
    });
  }
}
