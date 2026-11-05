import { useMemo } from 'react';
import { FACE_ORDER, faceletColors, getCubeModel } from '../cube/CubeEngine.js';
import { resolveScheme } from '../cube/CubeThemes.js';
import { useApp } from '../app/store.js';

// Unfolded net: U above, then L F R B in a row, then D below. Faces are read as
// seen from outside the cube, the same order the engine stores them in.
const LAYOUT = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };

/** A flat diagram computed from a real engine state. */
export function CubeNet({ state, n = 3, width = 160, className = '', title = 'Cube net', colorsOverride = null }) {
  const settings = useApp((s) => s.settings);
  const colors = useMemo(() => colorsOverride ?? resolveScheme(settings), [settings, colorsOverride]);

  const rects = useMemo(() => {
    if (!state) return [];
    const model = getCubeModel(n);
    const facelets = faceletColors(state, n);
    const out = [];
    const cell = 10;
    const gap = 3;
    const faceSize = cell * n;
    FACE_ORDER.forEach((face, f) => {
      const [fx, fy] = LAYOUT[face];
      for (let row = 0; row < n; row += 1) {
        for (let col = 0; col < n; col += 1) {
          const id = f * model.perFace + row * n + col;
          out.push({
            key: id,
            x: fx * (faceSize + gap) + col * cell,
            y: fy * (faceSize + gap) + row * cell,
            size: cell,
            fill: colors[FACE_ORDER[facelets[id]]],
          });
        }
      }
    });
    return out;
  }, [state, n, colors]);

  const face = 10 * n;
  const totalW = 4 * face + 9;
  const totalH = 3 * face + 6;

  return (
    <svg
      viewBox={`-0.5 -0.5 ${totalW + 1} ${totalH + 1}`}
      width={width}
      height={(width * (totalH + 1)) / (totalW + 1)}
      role="img"
      aria-label={title}
      className={className}
      data-testid="cube-net"
    >
      {rects.map((r) => (
        <rect
          key={r.key}
          x={r.x + 0.35}
          y={r.y + 0.35}
          width={r.size - 0.7}
          height={r.size - 0.7}
          rx={1.1}
          fill={r.fill}
          data-fill={r.fill}
          stroke="var(--rule-strong)"
          strokeWidth={0.35}
        />
      ))}
    </svg>
  );
}
