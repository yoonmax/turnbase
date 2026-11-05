// Color schemes map each face to a color. The documented default is the Western
// scheme: white on U, yellow on D, green on F, blue on B, red on R, orange on L.
// Faces are listed in engine order: U R F D L B.

export const CUBE_SCHEMES = {
  western: {
    name: 'Western',
    colors: { U: '#f4f3ee', R: '#c8102e', F: '#009b48', D: '#ffd500', L: '#ff6a13', B: '#0046ad' },
  },
  japanese: {
    name: 'Japanese',
    colors: { U: '#f4f3ee', R: '#c8102e', F: '#009b48', D: '#0046ad', L: '#ff6a13', B: '#ffd500' },
  },
  soft: {
    name: 'Soft',
    colors: { U: '#efece3', R: '#c4574f', F: '#5d9c76', D: '#e5c15a', L: '#dc8b53', B: '#5479a8' },
  },
  vivid: {
    name: 'Vivid',
    colors: { U: '#ffffff', R: '#ff1f3d', F: '#1fd655', D: '#fff200', L: '#ff8a00', B: '#1a73ff' },
  },
};

export function resolveScheme(settings) {
  if (settings?.cubeScheme === 'custom' && settings.customColors) return settings.customColors;
  return (CUBE_SCHEMES[settings?.cubeScheme] ?? CUBE_SCHEMES.western).colors;
}

export const FACE_NAMES = { U: 'Up', R: 'Right', F: 'Front', D: 'Down', L: 'Left', B: 'Back' };

/** Dark or light text, whichever reads better on a face color. */
export function inkOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.55 ? '#1c1d1f' : '#ffffff';
}

/** Which face color represents a move, for highlighting notation. */
export function moveFace(move) {
  if (!move) return null;
  if (move.kind === 'slice') return { M: 'L', E: 'D', S: 'F' }[move.family];
  if (move.kind === 'rotation') return { x: 'R', y: 'U', z: 'F' }[move.family];
  return move.family;
}
