import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, Trash2, Upload } from 'lucide-react';
import { applyMoves, isSolved, solvedState } from './CubeEngine.js';
import { invertMoves, moveCounts, movesToDisplay } from './CubeMoves.js';
import { parseAlgorithm } from './CubeNotationParser.js';
import { MoveTimeline, PlayerControls } from './PlayerControls.jsx';
import { CubeNet } from '../scrambles/CubeNet.jsx';
import { CATALOG, getCase } from '../algorithms/AlgorithmCatalog.js';
import { parseImportText } from '../algorithms/AlgorithmImporter.js';
import { useProgress } from '../trainer/TrainingProgress.js';
import { useApp } from '../app/store.js';
import { copyText, downloadText, pickFile } from '../utils/download.js';

const START_MODES = [
  ['solved', 'A solved cube'],
  ['inverse', 'The inverse of the algorithm'],
  ['current', 'The cube as it is now'],
  ['scramble', 'A scramble you choose'],
  ['case', 'A library case'],
];

/** Enter any sequence, choose where it starts, and step through it. */
export function AlgorithmEditor({ controller, player, snapshot }) {
  const [text, setText] = useState("R U R' U' R' F R F'");
  const [startMode, setStartMode] = useState('inverse');
  const [scrambleText, setScrambleText] = useState('');
  const [caseId, setCaseId] = useState('pll-t');
  const [name, setName] = useState('');
  const load = useProgress((s) => s.load);
  const customAlgs = useProgress((s) => s.customAlgs);
  const addCustomAlg = useProgress((s) => s.addCustomAlg);
  const removeCustomAlg = useProgress((s) => s.removeCustomAlg);
  const pushToast = useApp((s) => s.pushToast);

  useEffect(() => {
    load();
  }, [load]);

  const parsed = useMemo(() => parseAlgorithm(text), [text]);
  const moves = useMemo(() => (parsed.ok ? parsed.moves : []), [parsed]);

  const scrambleParsed = useMemo(() => parseAlgorithm(scrambleText), [scrambleText]);

  // "The cube as it is now" means now, when it was chosen.
  const [capturedState, setCapturedState] = useState(() => controller.state);

  const base = useMemo(() => {
    if (startMode === 'inverse') return applyMoves(solvedState(), invertMoves(moves));
    if (startMode === 'current') return capturedState;
    if (startMode === 'scramble' && scrambleParsed.ok) return applyMoves(solvedState(), scrambleParsed.moves);
    if (startMode === 'case') return getCase(caseId)?.caseState ?? solvedState();
    return solvedState();
  }, [startMode, moves, capturedState, scrambleParsed, caseId]);

  useEffect(() => {
    player.load({ baseState: base, moves });
  }, [player, base, moves]);

  const counts = moveCounts(moves);
  const inverse = movesToDisplay(invertMoves(moves));
  const endState = useMemo(() => player.stateAt(moves.length) ?? base, [player, moves, base, snapshot.total]); // eslint-disable-line react-hooks/exhaustive-deps
  const endsSolved = moves.length > 0 && isSolved(applyMoves(base, moves));

  const importFile = async () => {
    const file = await pickFile('.txt,.json,text/plain');
    if (!file) return;
    const { algorithms, problems } = parseImportText(await file.text());
    for (const alg of algorithms) await addCustomAlg(alg); // eslint-disable-line no-await-in-loop
    pushToast({
      message: problems.length ? `Imported ${algorithms.length}. ${problems[0]}` : `Imported ${algorithms.length} algorithm${algorithms.length === 1 ? '' : 's'}`,
      durationMs: 9000,
    });
  };

  return (
    <div className="flex flex-col gap-4" data-testid="algorithm-editor">
      <label className="grid gap-1 text-[0.8125rem] text-graphite">
        Algorithm
        <textarea
          className="field notation text-ink text-[0.875rem]"
          rows={2}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          value={text}
          aria-invalid={!parsed.ok}
          aria-describedby="editor-status"
          data-testid="editor-input"
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div id="editor-status" className="text-[0.8125rem] min-h-[1.25rem]" data-testid="editor-status" role="status">
        {parsed.ok ? (
          <span className="text-graphite">
            {counts.stm} moves, {counts.qtm} quarter turns, {counts.htm} half-turn metric
          </span>
        ) : (
          <span className="text-danger">
            At position {parsed.error.index + 1}: {parsed.error.message}
          </span>
        )}
      </div>

      <div className="grid gap-2">
        <label className="grid gap-1 text-[0.8125rem] text-graphite">
          Start from
          <select
            className="field text-ink"
            value={startMode}
            data-testid="editor-start"
            onChange={(e) => {
              if (e.target.value === 'current') setCapturedState(controller.state);
              setStartMode(e.target.value);
            }}
          >
            {START_MODES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {startMode === 'scramble' ? (
          <input
            className="field notation"
            placeholder="R U2 F' ..."
            aria-label="Starting scramble"
            aria-invalid={!scrambleParsed.ok}
            value={scrambleText}
            data-testid="editor-scramble"
            onChange={(e) => setScrambleText(e.target.value)}
          />
        ) : null}
        {startMode === 'scramble' && !scrambleParsed.ok ? <p className="m-0 text-[0.8125rem] text-danger">{scrambleParsed.error.message}</p> : null}
        {startMode === 'case' ? (
          <select className="field" aria-label="Library case" value={caseId} data-testid="editor-case" onChange={(e) => setCaseId(e.target.value)}>
            {CATALOG.map((c) => (
              <option key={c.id} value={c.id}>
                {c.setName}: {c.family === 'oll' ? `${c.number} ${c.name}` : c.title}
              </option>
            ))}
          </select>
        ) : null}
        {startMode === 'inverse' ? (
          <p className="m-0 text-[0.8125rem] text-graphite">
            The cube is set up with the inverse, so playing the algorithm returns it to solved.
          </p>
        ) : null}
      </div>

      {moves.length ? <MoveTimeline player={player} snapshot={snapshot} moves={moves} /> : null}
      <PlayerControls player={player} snapshot={snapshot} keyboard={false} />

      <div className="grid grid-cols-[1fr_auto] gap-4 items-start text-[0.8125rem]">
        <div className="min-w-0">
          <p className="m-0 text-graphite">Inverse</p>
          <p className="m-0 notation text-[0.75rem] leading-relaxed break-words" data-testid="editor-inverse">
            {inverse || 'None'}
          </p>
          <p className="m-0 mt-2 text-graphite">Result</p>
          <p className="m-0" data-testid="editor-result">
            {!moves.length ? 'Nothing to play yet.' : endsSolved ? 'Ends with a solved cube.' : 'Ends with the state shown here.'}
          </p>
        </div>
        <CubeNet state={endState} width={120} title="State after the algorithm" />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input className="field flex-1 min-w-[8rem]" placeholder="Name to save it under" aria-label="Algorithm name" value={name} data-testid="editor-name" onChange={(e) => setName(e.target.value)} />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!parsed.ok || !moves.length || !name.trim()}
          data-testid="editor-save"
          onClick={async () => {
            await addCustomAlg({ name: name.trim(), notation: text });
            setName('');
            pushToast({ message: 'Algorithm saved', durationMs: 1800 });
          }}
        >
          Save
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Copy notation"
          title="Copy notation"
          disabled={!moves.length}
          data-testid="editor-copy"
          onClick={async () => {
            await copyText(parsed.normalized);
            pushToast({ message: 'Notation copied', durationMs: 1800 });
          }}
        >
          <Copy size={14} strokeWidth={1.6} />
        </button>
        <button type="button" className="icon-btn" aria-label="Import algorithms from a file" title="Import from a text file, one per line" data-testid="editor-import" onClick={importFile}>
          <Upload size={14} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Export saved algorithms"
          title="Export saved algorithms"
          disabled={!customAlgs.length}
          data-testid="editor-export"
          onClick={() => downloadText('turnbase-algorithms.txt', customAlgs.map((a) => `${a.name}: ${a.notation}`).join('\n'), 'text/plain')}
        >
          <Download size={14} strokeWidth={1.6} />
        </button>
      </div>

      {customAlgs.length ? (
        <section>
          <h3 className="m-0 mb-1 text-[0.8125rem] font-medium">Saved</h3>
          <ul className="m-0 p-0 list-none" data-testid="saved-algs">
            {customAlgs.map((alg) => (
              <li key={alg.id} className="flex items-center gap-2 rounded row-hover pl-2">
                <button type="button" className="flex-1 min-w-0 text-left bg-transparent border-none py-1 px-0 truncate" onClick={() => setText(alg.notation)}>
                  <span className="text-[0.8125rem]">{alg.name}</span> <span className="notation text-[0.6875rem] text-graphite">{alg.notation}</span>
                </button>
                <button type="button" className="icon-btn" aria-label={`Delete ${alg.name}`} onClick={() => removeCustomAlg(alg.id)}>
                  <Trash2 size={13} strokeWidth={1.6} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
