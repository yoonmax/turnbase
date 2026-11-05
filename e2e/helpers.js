import { expect } from '@playwright/test';

export async function openTimer(page) {
  await page.goto('/?debug');
  await expect(page.getByTestId('timer-digits')).toBeVisible();
  await expect(page.getByTestId('scramble-text')).not.toContainText('Generating', { timeout: 30000 });
}

/** A real solve through the keyboard: hold Space, release, wait, press to stop. */
export async function runSolve(page, { holdMs = 340, solveMs = 250 } = {}) {
  await page.keyboard.down('Space');
  await page.waitForTimeout(holdMs);
  await page.keyboard.up('Space');
  await page.waitForTimeout(solveMs);
  await page.keyboard.press('Space');
  await page.waitForTimeout(40);
}

export const timerState = (page) => page.evaluate(() => document.documentElement.dataset.timer);

/** Reads every sticker of a net as its fill colour. */
export const netColors = (page, scope) =>
  (scope ?? page).getByTestId('cube-net').first().locator('rect').evaluateAll((rects) => rects.map((r) => r.getAttribute('data-fill')));

export const noPageErrors = (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
};

export const cubeReady = async (page) => {
  await page.waitForFunction(() => window.__turnbaseCube, null, { timeout: 20000 });
  await page.waitForTimeout(300);
};

export const facelets = (page) => page.evaluate(() => window.__turnbaseCube.facelets());
export const cubeIdle = (page) => page.waitForFunction(() => !window.__turnbaseCube.controller.animating);

/** Presses keys in the Direct profile for a notation string, such as "R U' F2". */
export async function typeMoves(page, notation) {
  for (const token of notation.trim().split(/\s+/)) {
    const key = `Key${token[0].toUpperCase()}`;
    if (token.endsWith("'")) await page.keyboard.press(`Shift+${key}`);
    else if (token.endsWith('2')) await page.keyboard.press(`Alt+${key}`);
    else await page.keyboard.press(key);
  }
}

// Named by hue, because lighting changes brightness but not which colour it is.
function classify([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 45) return 'white';
  let hue;
  if (max === r) hue = ((g - b) / (max - min) + 6) % 6;
  else if (max === g) hue = (b - r) / (max - min) + 2;
  else hue = (r - g) / (max - min) + 4;
  hue *= 60;
  if (hue < 14 || hue > 330) return 'red';
  if (hue < 38) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 170) return 'green';
  return 'blue';
}

/**
 * Screenshots the page and reads the colour under every sticker the camera can see.
 * Returns [{ id, seen }], to compare against what the engine says is there.
 */
export async function renderedStickers(page) {
  const points = await page.evaluate(() => window.__turnbaseCube.visible());
  const box = await page.getByTestId('cube-canvas').first().boundingBox();
  const shot = (await page.screenshot()).toString('base64');
  const colors = await page.evaluate(
    async ({ shot: data, spots }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      return spots.map(({ x, y }) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data).slice(0, 3));
    },
    { shot, spots: points.map((p) => ({ x: p.x + box.x, y: p.y + box.y })) },
  );
  return points.map((p, i) => ({ id: p.id, seen: classify(colors[i]), rgb: colors[i] }));
}

export const WESTERN_NAMES = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' };
export const LIBRARY_NAMES = { U: 'yellow', R: 'orange', F: 'green', D: 'white', L: 'red', B: 'blue' };

export async function expectPictureMatchesLogic(page, names = WESTERN_NAMES) {
  const string = await facelets(page);
  const rendered = await renderedStickers(page);
  expect(rendered.length).toBeGreaterThanOrEqual(9);
  const wrong = rendered.filter((s) => s.seen !== names[string[s.id]]);
  expect(wrong.map((w) => `${w.id}: saw ${w.seen} ${w.rgb}, engine has ${names[string[w.id]]}`)).toEqual([]);
}

/** Replaces all data through the real import UI, from a document built in the test. */
export async function importDoc(page, doc) {
  await page.goto('/settings');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('import-backup').click()]);
  await chooser.setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.getByTestId('toast').first()).toContainText('Imported');
}

export function makeSessionDoc(times, { sessionId = 'session_test', name = 'Test session', start = Date.now() - 86400000 * 3, extra = () => ({}) } = {}) {
  return {
    format: 'turnbase-backup',
    version: 0,
    sessions: [{ id: sessionId, name, puzzle: '333', kind: 'physical', archived: false, createdAt: start }],
    solves: times.map((t, i) => {
      const [rawMs, penalty] = Array.isArray(t) ? t : [t, 'none'];
      return { id: `${sessionId}_${i}`, sessionId, createdAt: start + i * 3600000, rawMs, penalty, puzzle: '333', scramble: `R U F${i}`.replace(/\d+/, ''), source: 'physical', tags: [], comment: '', inspectionMs: null, inspectionPenalty: 'none', penaltySource: null, ...extra(i) };
    }),
  };
}
