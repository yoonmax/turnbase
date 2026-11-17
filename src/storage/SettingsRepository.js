import { kvGet, kvSet } from './Database.js';

export const LOOK_VERSION = 3;

export const DEFAULT_SETTINGS = {
  lookVersion: LOOK_VERSION,
  // Appearance
  theme: 'light', // 'light' | 'dark' | 'system'
  palette: 'glacier', // A name from app/themes.js, or 'custom'.
  accent: null, // A color that overrides the palette's accent, or null.
  customTheme: null,
  glass: 0.7, // 0 is solid panels.
  bloom: 0, // Strength of the optional background glow. Zero is one plain color.
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
  // Cross planning
  showCrossSolutions: true, // After each 3×3 solve, the shortest cross and X-cross.
  crossColor: 'U', // The face, in scramble orientation, whose cross is solved.
  // Cube controls
  keymapProfile: 'qwerty',
  // Cube appearance
  cubeStyle: 'seethrough', // 'seethrough' | 'stickered' | 'stickerless'
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
  haptics: true, // Vibration on phones for ready, start and stop.
  // Camera
  recordSolves: false, // Film each solve on the timer page, for slow-motion playback.
  cameraDeviceId: null, // null is the default front camera.
  mirrorCamera: true,
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
  if ((saved.lookVersion ?? 1) < 2) {
    if (next.theme === 'system') next.theme = 'light';
    if (next.bloom === undefined || next.bloom === 0.7) next.bloom = DEFAULT_SETTINGS.bloom;
  }
  // Version 3 made the see-through cube the default, replacing the old stickered default.
  if (next.cubeStyle === undefined || next.cubeStyle === 'stickered') next.cubeStyle = 'seethrough';
  return next;
}

export async function loadSettings() {
  const saved = await kvGet('settings', {});
  return { ...DEFAULT_SETTINGS, ...migrateSettings(saved) };
}

export async function saveSettings(settings) {
  await kvSet('settings', settings);
}
