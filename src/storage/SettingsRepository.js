import { kvGet, kvSet } from './Database.js';

export const DEFAULT_SETTINGS = {
  // Appearance
  theme: 'system', // 'light' | 'dark' | 'system'
  palette: 'glacier', // A name from app/themes.js, or 'custom'.
  accent: null, // A colour that overrides the palette's accent, or null.
  customTheme: null,
  glass: 0.7, // 0 is solid panels.
  bloom: 0.7, // Strength of the background glow.
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

export async function loadSettings() {
  const saved = await kvGet('settings', {});
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(settings) {
  await kvSet('settings', settings);
}
