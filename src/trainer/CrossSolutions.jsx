import { useMemo, useState } from 'react';
import { useApp } from '../app/store.js';
import { resolveScheme } from '../cube/CubeThemes.js';
import { useCrossSolution } from '../cube/crossClient.js';

// Faces in scramble orientation (white on top, green in front for the Western scheme).
export const CROSS_FACES = ['U', 'D', 'F', 'B', 'R', 'L'];

const COLOR_NAMES = {
  western: { U: 'White', D: 'Yellow', F: 'Green', B: 'Blue', R: 'Red', L: 'Orange' },
  japanese: { U: 'White', D: 'Blue', F: 'Green', B: 'Yellow', R: 'Red', L: 'Orange' },
};
const FACE_WORDS = { U: 'Top face', D: 'Bottom face', F: 'Front face', B: 'Back face', R: 'Right face', L: 'Left face' };

export function crossColorName(settings, face) {
  if (settings.cubeScheme === 'custom') return FACE_WORDS[face];
  return (COLOR_NAMES[settings.cubeScheme] ?? COLOR_NAMES.western)[face];
}

function Swatch({ color }) {
  return <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-full align-[0px] ring-1 ring-black/50" style={{ background: color }} />;
}

/** Choice of cross color, shown as the six face colors. */
export function CrossColorPicker() {
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const scheme = resolveScheme(settings);
  return (
    <div className="segmented flex-wrap" role="group" aria-label="Cross color">
      {CROSS_FACES.map((face) => (
        <button key={face} type="button" aria-pressed={settings.crossColor === face} data-testid={`cross-color-${face}`} onClick={() => updateSettings({ crossColor: face })}>
          <Swatch color={scheme[face]} />
          <span className="ml-1.5">{crossColorName(settings, face)}</span>
        </button>
      ))}
    </div>
  );
}

function Line({ label, moves, length, testId }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr_auto] gap-x-3 items-baseline" data-testid={testId}>
      <span className="text-[0.8125rem] text-graphite">{label}</span>
      <span className="notation text-[0.9375rem] leading-relaxed">{moves.length ? moves[0] || 'Already solved' : 'None found'}</span>
      <span className="text-[0.75rem] text-graphite tabular">{length} {length === 1 ? 'move' : 'moves'}</span>
    </div>
  );
}

/**
 * Shortest cross and X-cross for a scramble, with the cross on the chosen color.
 * `compact` shows only the cross and the best X-cross.
 */
export function CrossSolutions({ scramble, compact = false, testId = 'cross-solutions' }) {
  const settings = useApp((s) => s.settings);
  const bottom = settings.crossColor ?? 'U';
  const { status, result } = useCrossSolution(scramble, bottom);
  const [showAll, setShowAll] = useState(false);
  const scheme = resolveScheme(settings);
  const name = crossColorName(settings, bottom);

  const alternatives = useMemo(() => (result ? result.cross.moves.slice(1) : []), [result]);

  if (status === 'working') {
    return (
      <p className="m-0 text-[0.8125rem] text-graphite" data-testid={testId} data-status="working" role="status">
        Finding the shortest cross…
      </p>
    );
  }
  if (status !== 'done' || !result) {
    return status === 'error' ? (
      <p className="m-0 text-[0.8125rem] text-graphite" data-testid={testId} data-status="error">
        This scramble cannot be solved for a cross.
      </p>
    ) : null;
  }

  const xcross = compact ? result.xcross.slice(0, 1) : result.xcross;
  return (
    <div className="flex flex-col gap-1.5" data-testid={testId} data-status="done">
      <p className="m-0 text-[0.8125rem]">
        <Swatch color={scheme[bottom]} /> <span className="font-medium">{name} cross</span>
        {result.rotation ? (
          <span className="text-graphite">
            , holding the cube with <span className="notation">{result.rotation}</span> first
          </span>
        ) : (
          <span className="text-graphite">, on the bottom as scrambled</span>
        )}
      </p>
      <Line label="Cross" moves={result.cross.moves} length={result.cross.length} testId="cross-best" />
      {xcross.map((x) => (
        <Line key={x.slot} label={`X-cross ${x.slot}`} moves={x.moves} length={x.length} testId={`xcross-${x.slot}`} />
      ))}
      {!compact && alternatives.length ? (
        <div>
          <button type="button" className="btn btn-quiet -ml-2" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Hide other crosses' : `Other ${result.cross.length}-move crosses`}
          </button>
          {showAll ? (
            <ul className="m-0 pl-0 list-none notation text-[0.875rem] leading-relaxed" data-testid="cross-alternatives">
              {alternatives.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
