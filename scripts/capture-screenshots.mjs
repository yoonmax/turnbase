// Captures the README's screenshots from a running production build. These are real
// frames of the real app: run `npm run build && npm run preview` first.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const out = 'docs/screenshots/';
mkdirSync(out, { recursive: true });
const base = 'http://localhost:5211';
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();

// A believable-looking session, generated here and clearly just sample data.
const day = 86400000;
const start = Date.now() - 18 * day;
let seed = 7;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const solves = Array.from({ length: 320 }, (_, i) => {
  const trend = 21000 - i * 14;
  const rawMs = Math.round(trend + (rand() - 0.5) * 7000 + (rand() < 0.05 ? 9000 : 0));
  const penalty = rand() < 0.03 ? 'dnf' : rand() < 0.05 ? '+2' : 'none';
  return { id: `demo_${i}`, sessionId: 'demo', createdAt: start + (i / 320) * 18 * day, rawMs, penalty, puzzle: '333', scramble: "R2 U' F2 D B2 U2 L2 F' R U2 L B' D2 F U R' F2 L2", source: 'physical', tags: [], comment: '', inspectionMs: null, inspectionPenalty: 'none', penaltySource: null };
});
const doc = { format: 'turnbase-backup', version: 0, sessions: [{ id: 'demo', name: 'Sample session', puzzle: '333', kind: 'physical', archived: false, createdAt: start }], solves };

await page.goto(`${base}/settings`);
await page.waitForSelector('[data-testid=settings-page]');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('import-backup').click()]);
await chooser.setFiles({ name: 'sample.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
await page.waitForSelector('[data-testid=toast]');
await page.goto(`${base}/`);
await page.getByTestId('session-select').selectOption('demo');
await page.waitForSelector('[data-testid=cube-net]');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}timer.png` });

await page.keyboard.down('Space');
await page.waitForTimeout(360);
await page.screenshot({ path: `${out}timer-ready.png` });
await page.keyboard.up('Space');
await page.waitForTimeout(1234);
await page.screenshot({ path: `${out}timer-running.png` });
await page.keyboard.press('Escape');

await page.goto(`${base}/statistics`);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}statistics.png` });
await page.getByTestId('trend-chart').scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}statistics-charts.png` });

await page.goto(`${base}/algorithms/pll-t`);
await page.waitForTimeout(1200);
await page.getByTestId('player-scrub').fill('6');
await page.getByTestId('player-forward').click();
await page.waitForTimeout(70);
await page.screenshot({ path: `${out}algorithm.png` });

await page.goto(`${base}/algorithms`);
await page.getByTestId('set-oll').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}library.png` });

await page.goto(`${base}/cube`);
await page.waitForTimeout(1200);
for (const key of ['KeyR', 'KeyU', 'KeyF']) {
  await page.keyboard.press(key);
  await page.waitForTimeout(260);
}
await page.keyboard.press('KeyL');
await page.waitForTimeout(75);
await page.screenshot({ path: `${out}cube.png` });

await page.goto(`${base}/trainer`);
await page.getByTestId('trainset-oll').click();
await page.getByTestId('trainer-start').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}trainer.png` });

await page.goto(`${base}/settings`);
await page.getByTestId('setting-theme-light').click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}themes.png` });
await page.getByTestId('palette-aurora').click();
await page.getByTestId('setting-theme-dark').click();
await page.waitForTimeout(400);
await page.goto(`${base}/`);
await page.waitForSelector('[data-testid=cube-net]');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}timer-dark.png` });
await page.goto(`${base}/algorithms/oll-27`);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}algorithm-dark.png` });

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const mobile = await phone.newPage();
await mobile.goto(`${base}/`);
await mobile.waitForSelector('[data-testid=cube-net]');
await mobile.waitForTimeout(500);
await mobile.screenshot({ path: `${out}mobile-timer.png` });
await mobile.goto(`${base}/algorithms/pll-t`);
await mobile.waitForTimeout(1200);
await mobile.screenshot({ path: `${out}mobile-algorithm.png` });
await browser.close();
console.log('captured');
