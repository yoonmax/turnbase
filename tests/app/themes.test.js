import { describe, expect, it } from 'vitest';
import { DEFAULT_CUSTOM_THEME, PALETTES, buildTheme, contrast, ensureContrast, isHex, luminance, mix } from '../../src/app/themes.js';

const text = (t) => ['--ink', '--graphite', '--faint', '--hold', '--ready', '--danger'].map((name) => [name, t.vars[name]]);

describe('colour maths', () => {
  it('computes WCAG contrast', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1);
    expect(luminance('#ffffff')).toBeCloseTo(1);
  });

  it('mixes', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#123456', '#123456', 0.7)).toBe('#123456');
  });

  it('raises contrast until it is enough', () => {
    const fixed = ensureContrast('#bbbbbb', '#ffffff', 4.5, '#000000');
    expect(contrast(fixed, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast('#000000', '#ffffff', 4.5, '#000000')).toBe('#000000');
  });

  it('recognises hex colours', () => {
    expect(isHex('#a1B2c3')).toBe(true);
    expect(isHex('moss')).toBe(false);
    expect(isHex(null)).toBe(false);
  });
});

describe('every preset in both modes', () => {
  for (const id of Object.keys(PALETTES)) {
    for (const mode of ['light', 'dark']) {
      it(`${id} ${mode}: text is readable on its background`, () => {
        const theme = buildTheme({ palette: id }, mode);
        expect(theme.dark).toBe(mode === 'dark');
        for (const [name, color] of text(theme)) {
          expect(contrast(color, theme.vars['--paper']), name).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrast(theme.vars['--accent-ink'], theme.vars['--accent'])).toBeGreaterThanOrEqual(4.5);
      });

      it(`${id} ${mode}: higher contrast really is higher`, () => {
        const normal = buildTheme({ palette: id }, mode);
        const high = buildTheme({ palette: id, highContrast: true }, mode);
        expect(contrast(high.vars['--graphite'], high.vars['--paper'])).toBeGreaterThan(contrast(normal.vars['--graphite'], normal.vars['--paper']));
        expect(contrast(high.vars['--graphite'], high.vars['--paper'])).toBeGreaterThanOrEqual(7);
      });
    }
  }
});

describe('custom themes', () => {
  const custom = (customTheme) => buildTheme({ palette: 'custom', customTheme }, 'light');

  it('decides light or dark from the background', () => {
    expect(custom({ paper: '#101418' }).dark).toBe(true);
    expect(custom({ paper: '#fafafa' }).dark).toBe(false);
  });

  it('stays readable on any background, even awkward ones', () => {
    for (const paper of ['#ff0000', '#00ff00', '#0000ff', '#808080', '#ffff00', '#ff00ff', '#000000', '#ffffff', '#777777', '#3a7d44']) {
      const theme = custom({ paper, accent: paper });
      expect(contrast(theme.vars['--ink'], paper), `ink on ${paper}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.vars['--graphite'], paper), `graphite on ${paper}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.vars['--faint'], paper), `faint on ${paper}`).toBeGreaterThanOrEqual(4.5);
      // An accent the same as the background is still pulled far enough to see.
      expect(contrast(theme.vars['--accent'], paper), `accent on ${paper}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('falls back on bad stored values', () => {
    expect(custom({ paper: 'nope' }).vars['--paper']).toBe(DEFAULT_CUSTOM_THEME.paper);
    expect(buildTheme({ palette: 'removed' }, 'light').vars['--paper']).toBe(PALETTES.glacier.light.paper);
  });
});

describe('options', () => {
  it('an accent overrides the palette, and ignores old non-colour values', () => {
    expect(buildTheme({ palette: 'glacier', accent: '#2563eb' }, 'light').vars['--accent']).toBe('#2563eb');
    expect(buildTheme({ palette: 'glacier', accent: 'moss' }, 'light').vars['--accent']).toBe(PALETTES.glacier.light.accent);
  });

  it('glass at zero is solid, with no filter to pay for', () => {
    const solid = buildTheme({ glass: 0 }, 'light');
    expect(solid.vars['--glass-filter']).toBe('none');
    expect(solid.vars['--glass-bg']).toMatch(/\/ 1\.000\)$/);
    expect(buildTheme({ glass: 1 }, 'light').vars['--glass-filter']).toContain('blur(28px)');
  });

  it('background glow scales', () => {
    expect(buildTheme({ bloom: 0 }, 'light').vars['--bloom-strength']).toBe('0');
    expect(Number(buildTheme({ bloom: 1 }, 'light').vars['--bloom-strength'])).toBeGreaterThan(0.5);
  });
});
