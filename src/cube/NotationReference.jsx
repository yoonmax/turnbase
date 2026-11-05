import { useMemo } from 'react';
import { applyAlg, solvedState } from './CubeEngine.js';
import { parseMoves } from './CubeNotationParser.js';
import { IsoDiagram } from '../algorithms/CaseDiagram.jsx';
import { describeMove } from '../algorithms/AlgorithmCatalog.js';
import { resolveScheme } from './CubeThemes.js';
import { useApp } from '../app/store.js';

const SECTIONS = [
  {
    title: 'Face turns',
    text: 'A letter turns that face a quarter turn clockwise, as you look at the face. A prime reverses it, and a 2 means a half turn.',
    moves: ['R', 'L', 'U', 'D', 'F', 'B'],
  },
  { title: 'Slices', text: 'M, E and S turn a middle layer. M follows L, E follows D, and S follows F.', moves: ['M', 'E', 'S'] },
  { title: 'Wide turns', text: 'Rw and r mean the same thing: the face and the slice next to it. Lowercase is only accepted on a 3×3, where it is unambiguous.', moves: ['Rw', 'Lw', 'Uw', 'Dw', 'Fw', 'Bw'] },
  { title: 'Whole cube', text: 'x, y and z rotate the whole cube without changing how its pieces relate. x follows R, y follows U, and z follows F.', moves: ['x', 'y', 'z'] },
];

const SYNTAX = [
  ['(R U R\' U\')3', 'A group, repeated three times'],
  ["(R U)'", 'A group, inverted: the moves reversed and each one inverted'],
  ["[R U R', D]", "A commutator [A, B]: A B A' B'"],
  ["[R: U R U']", "A conjugate [A: B]: A B A'"],
  ["[R: [U, D]]", 'Any of these can be nested'],
  ["R U // comment", 'Comments are ignored, as // to the line end or /* inside */'],
];

function MoveCard({ text, onTry }) {
  const settings = useApp((s) => s.settings);
  const colors = useMemo(() => resolveScheme(settings), [settings]);
  const state = useMemo(() => applyAlg(solvedState(), text), [text]);
  const move = useMemo(() => parseMoves(text)[0], [text]);
  return (
    <button
      type="button"
      className="flex items-center gap-2 p-1.5 rounded-md border-none bg-transparent text-left row-hover"
      data-testid="notation-card"
      data-move={text}
      onClick={() => onTry(move)}
      title={`Try ${text} on the cube`}
    >
      <span className="shrink-0">
        <IsoDiagram state={state} colors={colors} size={44} mask={false} />
      </span>
      <span className="min-w-0">
        <span className="notation text-[0.8125rem] block">{text}</span>
        <span className="text-[0.6875rem] leading-tight text-graphite block">{describeMove(move).replace('Turn the ', '').replace(' clockwise', '').split(' (')[0]}</span>
      </span>
    </button>
  );
}

/** Every move family, with diagrams from the engine. Selecting one plays it. */
export function NotationReference({ onTry }) {
  return (
    <div className="flex flex-col gap-5" data-testid="notation-reference">
      <p className="m-0 text-[0.8125rem] text-graphite">
        Each diagram shows a solved cube just after that move. Select one to try it on the cube. Colors follow the Western scheme: white on top, green in front, red on the right.
      </p>
      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h3 className="m-0 text-[0.8125rem] font-medium">{section.title}</h3>
          <p className="m-0 mt-0.5 mb-1.5 text-[0.8125rem] text-graphite">{section.text}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-0.5">
            {section.moves.map((m) => (
              <MoveCard key={m} text={m} onTry={onTry} />
            ))}
          </div>
        </section>
      ))}
      <section>
        <h3 className="m-0 mb-1 text-[0.8125rem] font-medium">Longer expressions</h3>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.8125rem]">
          {SYNTAX.map(([code, words]) => (
            <div key={code} className="contents">
              <dt className="notation text-[0.75rem]">{code}</dt>
              <dd className="m-0 text-graphite">{words}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
