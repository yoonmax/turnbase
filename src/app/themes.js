// Themes are data. A palette names a few colours for light and dark, and everything else
// the interface uses is derived from them here, with contrast enforced by calculation,
// so a preset or a user's custom colours cannot produce unreadable text.

export const PALETTES = {
  glacier: {
    name: 'Glacier',
    light: { paper: '#f3f5f8', ink: '#14171b', accent: '#14171b', blooms: ['#a9cdfb', '#cfc4fb', '#b5ecec'] },
    dark: { paper: '#0e1115', ink: '#eef1f5', accent: '#eef1f5', blooms: ['#1d4f91', '#4a3a99', '#116068'] },
  },
  paper: {
    name: 'Paper',
    light: { paper: '#f7f6f2', ink: '#1c1d1f', accent: '#1c1d1f', blooms: ['#ecdcc4', '#e6e0d2', '#d9e2d4'] },
    dark: { paper: '#141412', ink: '#efece6', accent: '#efece6', blooms: ['#4f3f27', '#3a3a2e', '#2c3d31'] },
  },
  graphite: {
    name: 'Graphite',
    light: { paper: '#f2f2f3', ink: '#17171a', accent: '#17171a', blooms: ['#d9d9de', '#e4e4e8', '#cfd0d6'] },
    dark: { paper: '#0f0f11', ink: '#ededf0', accent: '#ededf0', blooms: ['#2c2c33', '#232329', '#34343c'] },
  },
  aurora: {
    name: 'Aurora',
    light: { paper: '#f2f7f6', ink: '#10201e', accent: '#0d7f73', blooms: ['#9be8d3', '#b9c8fb', '#d6f2a8'] },
    dark: { paper: '#091212', ink: '#e8f5f2', accent: '#46d6bd', blooms: ['#0d6a5f', '#343f9e', '#3d6b18'] },
  },
  ember: {
    name: 'Ember',
    light: { paper: '#faf5f1', ink: '#231712', accent: '#c2410c', blooms: ['#fdc9a0', '#f9b7c0', '#fde3a7'] },
    dark: { paper: '#140e0b', ink: '#f6ece6', accent: '#fb8b4f', blooms: ['#8a3a12', '#7d1f47', '#7a5a10'] },
  },
  orchid: {
    name: 'Orchid',
    light: { paper: '#f8f4fa', ink: '#1f1524', accent: '#8b2fc9', blooms: ['#e3bcf9', '#f9bfd9', '#c1c8fb'] },
    dark: { paper: '#110c15', ink: '#f3ecf7', accent: '#cf8bfa', blooms: ['#5f2591', '#8a1f5e', '#2e3a9b'] },
  },
};

export const DEFAULT_CUSTOM_THEME = { paper: '#101418', accent: '#6ea8ff', bloomA: '#2563eb', bloomB: '#a855f7' };

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (value) => typeof value === 'string' && HEX.test(value);

function toRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb) {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

export function mix(a, b, amount) {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * amount));
}

export function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Moves a colour towards `toward` in small steps until it reaches the wanted contrast. */
export function ensureContrast(color, background, ratio, toward) {
  let current = color;
  for (let i = 1; i <= 20 && contrast(current, background) < ratio; i += 1) {
    current = mix(color, toward, i / 20);
  }
  return current;
}

const STATUS = {
  light: { hold: '#a86a06', ready: '#0f7a48', danger: '#b5301c' },
  dark: { hold: '#e8ad45', ready: '#43cf8a', danger: '#f0806a' },
};

const SERIES = {
  light: ['#2a6fbb', '#c2571a', '#2b8a57', '#8a4fbf'],
  dark: ['#4f8fd8', '#d9742f', '#36a06f', '#a173d6'],
};

function resolveBase(settings, mode) {
  if (settings.palette === 'custom') {
    const custom = { ...DEFAULT_CUSTOM_THEME, ...(settings.customTheme ?? {}) };
    const paper = isHex(custom.paper) ? custom.paper : DEFAULT_CUSTOM_THEME.paper;
    const dark = contrast('#ffffff', paper) >= contrast('#000000', paper);
    // White or black always reaches at least 4.58:1, whatever the background is.
    const ink = dark ? ensureContrast('#f3f4f6', paper, 4.5, '#ffffff') : ensureContrast('#14161a', paper, 4.5, '#000000');
    return {
      dark,
      paper,
      ink,
      accent: isHex(custom.accent) ? custom.accent : ink,
      blooms: [custom.bloomA, custom.bloomB, mix(custom.bloomA, custom.bloomB, 0.5)],
    };
  }
  const palette = PALETTES[settings.palette] ?? PALETTES.glacier;
  return { dark: mode === 'dark', ...palette[mode] };
}

/**
 * Everything the stylesheet reads, for one mode. Returns { dark, vars }, where vars maps
 * CSS custom property names to values.
 */
export function buildTheme(settings, mode = 'light') {
  const base = resolveBase(settings, mode);
  const { paper, ink, dark } = base;
  const high = Boolean(settings.highContrast);
  const glass = Math.max(0, Math.min(1, settings.glass ?? 0.7));
  const bloom = Math.max(0, Math.min(1, settings.bloom ?? 0.7));
  const status = STATUS[dark ? 'dark' : 'light'];
  const series = SERIES[dark ? 'dark' : 'light'];

  // Measured against the tinted fill, the hardest surface they appear on.
  const fill = mix(paper, ink, 0.06);
  const graphite = ensureContrast(mix(ink, paper, 0.36), fill, high ? 8 : 5.2, ink);
  const faint = ensureContrast(mix(ink, paper, 0.5), fill, high ? 7 : 4.6, ink);
  const accent = ensureContrast(isHex(settings.accent) ? settings.accent : base.accent, paper, 3.2, ink);
  const accentInk = contrast('#ffffff', accent) >= contrast('#101114', accent) ? '#ffffff' : '#101114';
  const raised = mix(paper, dark ? '#ffffff' : '#ffffff', dark ? 0.05 : 0.65);
  const tintAlpha = glass === 0 ? 1 : (dark ? 0.72 : 0.78) - glass * 0.42;
  const tint = toRgb(raised).join(' ');

  return {
    dark,
    vars: {
      '--paper': paper,
      '--raised': raised,
      '--sunken': mix(paper, ink, 0.05),
      '--ink': ink,
      '--graphite': graphite,
      '--faint': faint,
      '--rule': mix(paper, ink, high ? 0.32 : 0.1),
      '--rule-strong': mix(paper, ink, high ? 0.5 : 0.22),
      '--fill': fill,
      '--fill-strong': mix(paper, ink, 0.11),
      '--accent': accent,
      '--accent-ink': accentInk,
      '--hold': ensureContrast(status.hold, paper, 4.5, ink),
      '--ready': ensureContrast(status.ready, paper, 4.5, ink),
      '--danger': ensureContrast(status.danger, paper, 4.5, ink),
      '--bloom-a': base.blooms[0],
      '--bloom-b': base.blooms[1],
      '--bloom-c': base.blooms[2],
      '--bloom-strength': String(bloom * (dark ? 0.6 : 0.85)),
      '--series-1': ensureContrast(series[0], paper, 3, ink),
      '--series-2': ensureContrast(series[1], paper, 3, ink),
      '--series-3': ensureContrast(series[2], paper, 3, ink),
      '--series-4': ensureContrast(series[3], paper, 3, ink),
      '--diagram-off': mix(paper, ink, dark ? 0.2 : 0.16),
      '--diagram-arrow': dark ? '#0b0c0e' : '#14161a',
      '--glass-bg': `rgb(${tint} / ${tintAlpha.toFixed(3)})`,
      '--glass-filter': glass === 0 ? 'none' : `blur(${Math.round(8 + glass * 20)}px) saturate(${Math.round(110 + glass * 70)}%)`,
      '--glass-hi': dark ? 'rgb(255 255 255 / 0.2)' : 'rgb(255 255 255 / 0.95)',
      '--glass-edge': dark ? 'rgb(255 255 255 / 0.09)' : 'rgb(255 255 255 / 0.5)',
      '--glass-line': dark ? 'rgb(0 0 0 / 0.5)' : 'rgb(20 24 32 / 0.07)',
      '--glass-drop': dark ? '0 18px 50px -20px rgb(0 0 0 / 0.75)' : '0 18px 50px -24px rgb(30 40 60 / 0.3)',
      '--thumb-bg': dark ? 'rgb(255 255 255 / 0.14)' : 'rgb(255 255 255 / 0.85)',
      '--thumb-line': dark ? 'rgb(255 255 255 / 0.12)' : 'rgb(20 24 32 / 0.06)',
      '--shadow-overlay': dark ? '0 28px 70px -24px rgb(0 0 0 / 0.8)' : '0 28px 70px -28px rgb(30 40 60 / 0.35)',
    },
  };
}
