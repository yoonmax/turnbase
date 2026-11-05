// Mirrors appearance settings onto <html>, where the stylesheet reads them.

import { buildTheme } from './themes.js';

let mediaListener = null;

export const prefersReducedMotion = () => {
  const setting = document.documentElement.dataset.motion;
  if (setting === 'reduce') return true;
  if (setting === 'on') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
};

function applyVars(root, theme) {
  for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(name, value);
  root.dataset.theme = theme.dark ? 'dark' : 'light';
}

export function applyAppearance(settings) {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const light = buildTheme(settings, 'light');
  const dark = buildTheme(settings, 'dark');
  const resolve = () => (settings.theme === 'dark' || (settings.theme === 'system' && media.matches) ? dark : light);

  const next = resolve();
  const changing = root.dataset.theme !== (next.dark ? 'dark' : 'light') || root.dataset.palette !== settings.palette;
  if (changing && root.dataset.palette) {
    root.classList.add('theme-transition');
    setTimeout(() => root.classList.remove('theme-transition'), 300);
  }
  applyVars(root, next);
  root.dataset.palette = settings.palette;

  try {
    // Read by the boot script in index.html, so a saved theme never flashes on load.
    localStorage.setItem('turnbase-theme', settings.theme);
    localStorage.setItem('turnbase-vars', JSON.stringify({ light, dark }));
  } catch {
    // Private windows may refuse. The boot script then falls back to the stylesheet.
  }

  if (mediaListener) media.removeEventListener('change', mediaListener);
  mediaListener = () => applyVars(root, resolve());
  media.addEventListener('change', mediaListener);

  root.dataset.motion = settings.reducedMotion === 'on' ? 'reduce' : settings.reducedMotion === 'off' ? 'on' : 'system';
  root.dataset.contrast = settings.highContrast ? 'high' : 'normal';
  root.dataset.large = settings.largeText ? 'true' : 'false';
  root.dataset.timerColors = settings.timerColors ? 'true' : 'false';
  root.dataset.focus = settings.focusMode ? 'true' : 'false';
  root.style.setProperty('--timer-scale', String(settings.timerFontScale));
  root.style.setProperty('--scramble-scale', String(settings.scrambleFontScale));
}
