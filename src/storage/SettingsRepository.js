import { kvGet, kvSet } from './Database.js';

export const LOOK_VERSION = 2;

export const DEFAULT_SETTINGS = {
  lookVersion: LOOK_VERSION,
  // Appearance
  theme: 'light', // 'light' | 'dark' | 'system'
  palette: 'glacier', // A name from app/themes.js, or 'custom'.
  accent: null, // A colour that overrides the palette's accent, or null.
  customTheme: null,
  glass: 0.7, // 0 is solid panels.
  bloom: 0, // Strength of the optional background glow. Zero is one plain colour.
  // Timer
  holdMs: 300,
  trigger: 'space', // 'space' | 'enter' | 'twokey'
  hideRunningTime: false,
  timerFontScale: 1,
  decimals: 2,
  focusMode: true,
  timerColors: true,
  stopWithAnyKey: true,
  // Inspection
  inspection: false,
  inspectionAutoPenalties: true,
  inspectionAudio: true,
  inspectionVisual: true,
  // Scrambles
  scrambleFontScale: 1,
  showScrambleDiagram: true,
  // Cube controls
  keymapProfile: 'direct',
  // Cube appearance
  cubeStyle: 'stickered', // 'stickered' | 'stickerless'
  cubeScheme: 'western',
  customColors: null,
  cubeEnvironment: 'auto', // 'auto' | 'light' | 'dark'
  // Animation
  turnMs: 130,
  turnEasing: 'smooth', // 'smooth' | 'crisp' | 'linear'
  instantMoves: false,
  // Sound
  turnSound: false,
  timerSound: false,
  // Statistics
  extraWindows: [],
  // Accessibility
  reducedMotion: 'system', // 'system' | 'on' | 'off'
  highContrast: false,
  largeText: false,
  showHints: true,
};

/**
 * Version 2 made light with a plain background the default. Settings saved earlier hold
 * the old defaults, indistinguishable from a choice, so those two values move across.
 * Someone who picked dark, or set their own glow, keeps it.
 */
export function migrateSettings(saved) {
  if ((saved.lookVersion ?? 1) >= LOOK_VERSION) return saved;
  const next = { ...saved, lookVersion: LOOK_VERSION };
  if (next.theme === 'system') next.theme = 'light';
  if (next.bloom === undefined || next.bloom === 0.7) next.bloom = DEFAULT_SETTINGS.bloom;
  return next;
}

export async function loadSettings() {
  const saved = await kvGet('settings', {});
  return { ...DEFAULT_SETTINGS, ...migrateSettings(saved) };
}

export async function saveSettings(settings) {
  await kvSet('settings', settings);
}
