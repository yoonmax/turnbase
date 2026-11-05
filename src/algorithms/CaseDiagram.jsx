import { useMemo } from 'react';
import { FACE_ORDER, getCubeModel } from '../cube/CubeEngine.js';
import { toCubies } from '../cube/CubeState.js';
import { libraryColors } from './libraryColors.js';
import { resolveScheme } from '../cube/CubeThemes.js';
import { useApp } from '../app/store.js';
import { CubeNet } from '../scrambles/CubeNet.jsx';

const OFF = 'var(--diagram-off, #c9c7c0)';
const faceOf = (id) => Math.floor(id / 9);
const at = (face, row, col) => face * 9 + row * 3 + col;
const [U, R, F, , L, B] = [0, 1, 2, 3, 4, 5];

// Positions in the top view. Slots 0..3 are UR UF UL UB for edges, and URF UFL ULB UBR
// for corners, matching the cubie order in CubeState.
const EDGE_CENTRES = [
  [2.5, 1.5],
  [1.5, 2.5],
  [0.5, 1.5],
  [1.5, 0.5],
];
const CORNER_CENTRES = [
  [2.5, 2.5],
  [0.5, 2.5],
  [0.5, 0.5],
  [2.5, 0.5],
];

function arrowsFor(state) {
  const cubies = toCubies(state);
  if (!cubies) return [];
  const out = [];
  for (let slot = 0; slot < 4; slot += 1) {
    const piece = cubies.ep[slot];
    if (piece !== slot && piece < 4) out.push({ from: EDGE_CENTRES[slot], to: EDGE_CENTRES[piece] });
  }
  for (let slot = 0; slot < 4; slot += 1) {
    const piece = cubies.cp[slot];
    if (piece !== slot && piece < 4) out.push({ from: CORNER_CENTRES[slot], to: CORNER_CENTRES[piece] });
  }
  return out;
}

/** Looking down on the last layer, with the top row of each side folded out. */
function TopDiagram({ state, colors, mode, size }) {
  const cell = 10;
  const strip = 3;
  const gap = 0.9;
  const origin = strip + gap;
  const span = origin * 2 + cell * 3;
  const homeFace = (id) => FACE_ORDER[faceOf(id)];
  const fill = (id) => {
    const home = homeFace(id);
    if (mode === 'oll') return home === 'U' ? colors.U : OFF;
    return colors[home];
  };
  const parts = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      parts.push(<rect key={`u${row}${col}`} x={origin + col * cell + 0.35} y={origin + row * cell + 0.35} width={cell - 0.7} height={cell - 0.7} rx={1.2} fill={fill(state[at(U, row, col)])} />);
    }
  }
  const side = (key, face, x, y, w, h) => <rect key={key} x={x} y={y} width={w} height={h} rx={0.8} fill={fill(state[face])} />;
  for (let i = 0; i < 3; i += 1) {
    const offset = origin + i * cell + 0.5;
    const length = cell - 1;
    // Back: its column 0 is on the right when seen from above.
    parts.push(side(`b${i}`, at(B, 0, 2 - i), offset, 0, length, strip));
    parts.push(side(`f${i}`, at(F, 0, i), offset, origin + 3 * cell + gap, length, strip));
    // Left: column 0 is at the back. Right: column 0 is at the front.
    parts.push(side(`l${i}`, at(L, 0, i), 0, offset, strip, length));
    parts.push(side(`r${i}`, at(R, 0, 2 - i), origin + 3 * cell + gap, offset, strip, length));
  }
  const arrows = mode === 'pll' ? arrowsFor(state) : [];
  return (
    <svg viewBox={`0 0 ${span} ${span}`} width={size} height={size} role="img" aria-label="Last layer from above" data-testid="case-diagram">
      {parts}
      {arrows.length ? (
        <g stroke="var(--diagram-arrow, #1c1d1f)" strokeWidth={0.8} fill="none" strokeLinecap="round">
          {arrows.map(({ from, to }, i) => {
            const x1 = origin + from[0] * cell;
            const y1 = origin + from[1] * cell;
            const x2 = origin + to[0] * cell;
            const y2 = origin + to[1] * cell;
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const inset = 2.6;
            const ex = x2 - Math.cos(angle) * inset;
            const ey = y2 - Math.sin(angle) * inset;
            const sx = x1 + Math.cos(angle) * inset;
            const sy = y1 + Math.sin(angle) * inset;
            const head = 2.3;
            return (
              // eslint-disable-next-line react/no-array-index-key
              <g key={i}>
                <line x1={sx} y1={sy} x2={ex} y2={ey} />
                <path d={`M${ex - Math.cos(angle - 0.5) * head} ${ey - Math.sin(angle - 0.5) * head} L${ex} ${ey} L${ex - Math.cos(angle + 0.5) * head} ${ey - Math.sin(angle + 0.5) * head}`} />
              </g>
            );
          })}
        </g>
      ) : null}
    </svg>
  );
}

const iso = (x, y, z) => [(x - z) * 0.866 * 10, (x + z) * 0.5 * 10 - y * 10];

/** Three visible faces, drawn from the state. Last-layer pieces are greyed out. */
export function IsoDiagram({ state, colors, size, mask = true }) {
  const model = getCubeModel(3);
  const quad = (points, fill, key) => (
    <polygon key={key} points={points.map((p) => p.join(',')).join(' ')} fill={fill} stroke="var(--raised)" strokeWidth={0.9} strokeLinejoin="round" />
  );
  const stickerFill = (position) => {
    const id = state[position];
    const home = model.stickers[id];
    // Pieces that belong in the top layer are not part of this case.
    if (mask && home.pos[1] === 2) return OFF;
    return colors[home.face];
  };
  const parts = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const x = col - 1.5;
      const z = row - 1.5;
      parts.push(quad([iso(x, 1.5, z), iso(x + 1, 1.5, z), iso(x + 1, 1.5, z + 1), iso(x, 1.5, z + 1)], stickerFill(at(U, row, col)), `u${row}${col}`));
      const y = 1.5 - row;
      parts.push(quad([iso(x, y, 1.5), iso(x + 1, y, 1.5), iso(x + 1, y - 1, 1.5), iso(x, y - 1, 1.5)], stickerFill(at(F, row, col)), `f${row}${col}`));
      const rz = 1.5 - col;
      parts.push(quad([iso(1.5, y, rz), iso(1.5, y, rz - 1), iso(1.5, y - 1, rz - 1), iso(1.5, y - 1, rz)], stickerFill(at(R, row, col)), `r${row}${col}`));
    }
  }
  return (
    <svg viewBox="-27 -31 54 62" width={size * 0.87} height={size} role="img" aria-label="Case on the cube" data-testid="case-diagram">
      {parts}
    </svg>
  );
}

/** The right recognition diagram for a case, always derived from its state. */
export function CaseDiagram({ entry, state = null, size = 76 }) {
  const settings = useApp((s) => s.settings);
  const colors = useMemo(() => libraryColors(resolveScheme(settings)), [settings]);
  const shown = state ?? entry.caseState;
  if (entry.family === 'oll' || entry.family === '2lo') return <TopDiagram state={shown} colors={colors} mode="oll" size={size} />;
  if (entry.family === 'pll' || entry.family === '2lp') return <TopDiagram state={shown} colors={colors} mode="pll" size={size} />;
  if (entry.family === 'f2l') return <IsoDiagram state={shown} colors={colors} size={size} />;
  return <CubeNet state={shown} width={size * 1.5} colorsOverride={colors} />;
}
