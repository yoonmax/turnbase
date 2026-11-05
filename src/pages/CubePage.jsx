import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Keyboard, Redo2, RotateCcw, Shuffle, Undo2 } from 'lucide-react';
import { isSolved, applyMoves, solvedState } from '../cube/CubeEngine.js';
import { parseAlgorithm, parseMoves } from '../cube/CubeNotationParser.js';
import { ManualCube } from '../cube/ManualCube.js';
import { CameraViews, CubeScene } from '../cube/CubeScene.jsx';
import { AlgorithmEditor } from '../cube/AlgorithmEditor.jsx';
import { NotationReference } from '../cube/NotationReference.jsx';
import { VirtualSolvePanel } from '../cube/VirtualSolvePanel.jsx';
import { KeyboardOverlay } from '../cube/KeymapEditor.jsx';
import { useKeymaps } from '../cube/keymapStore.js';
import { useCubeKeyboard } from '../hooks/useCubeKeyboard.js';
import { useControllerState, useCubeController, useSequencePlayer } from '../hooks/useCube.js';
import { nextScramble } from '../scrambles/ScrambleService.js';
import { useApp } from '../app/store.js';

const TABS = [
  ['free', 'Free turn'],
  ['editor', 'Editor'],
  ['virtual', 'Virtual solve'],
  ['notation', 'Notation'],
];

function FreePanel({ manual, controller, state }) {
  const history = useSyncExternalStore(manual.subscribe, manual.getSnapshot);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const pushToast = useApp((s) => s.pushToast);
  const parsed = useMemo(() => parseAlgorithm(text), [text]);
  const solved = isSolved(state);
  const list = useRef(null);

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [history.version]);

  return (
    <div className="flex flex-col gap-4" data-testid="free-panel">
      <div className="flex items-center gap-1 flex-wrap">
        <button type="button" className="icon-btn" aria-label="Undo" title="Undo (Backspace)" disabled={!history.canUndo} data-testid="cube-undo" onClick={() => manual.undo()}>
          <Undo2 size={15} strokeWidth={1.6} />
        </button>
        <button type="button" className="icon-btn" aria-label="Redo" title="Redo" disabled={!history.canRedo} data-testid="cube-redo" onClick={() => manual.redo()}>
          <Redo2 size={15} strokeWidth={1.6} />
        </button>
        <button type="button" className="btn" data-testid="cube-reset" onClick={() => manual.reset(solvedState())}>
          <RotateCcw size={13} strokeWidth={1.6} />
          Reset
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          data-testid="cube-scramble"
          onClick={async () => {
            setBusy(true);
            try {
              const { text: scramble } = await nextScramble('333');
              manual.reset(applyMoves(solvedState(), parseMoves(scramble)));
              setText(scramble);
              pushToast({ message: 'Scramble applied', durationMs: 1800 });
            } catch {
              pushToast({ message: 'The scramble generator did not respond.' });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Shuffle size={13} strokeWidth={1.6} />
          Scramble
        </button>
        <span className={`ml-auto text-[0.8125rem] ${solved ? 'text-ready' : 'text-graphite'}`} data-testid="cube-solved" role="status">
          {solved ? 'Solved' : 'Not solved'}
        </span>
      </div>

      <form
        className="grid gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (parsed.ok && parsed.moves.length) {
            manual.turnAll(parsed.moves);
            setText('');
          }
        }}
      >
        <label htmlFor="free-alg" className="text-[0.8125rem] text-graphite">
          Apply moves
        </label>
        <div className="flex gap-2">
          <input
            id="free-alg"
            className="field notation flex-1"
            placeholder="R U R' U'"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={text}
            aria-invalid={!parsed.ok}
            data-testid="free-input"
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn" disabled={!parsed.ok || !parsed.moves.length} data-testid="free-apply">
            Apply
          </button>
        </div>
        {!parsed.ok ? <p className="m-0 text-[0.8125rem] text-danger">{parsed.error.message}</p> : null}
      </form>

      <section>
        <h3 className="m-0 mb-1 text-[0.8125rem] font-medium">
          Moves <span className="font-normal text-graphite" data-testid="history-count">{history.history.length}</span>
        </h3>
        <div ref={list} className="notation text-[0.8125rem] leading-relaxed max-h-44 overflow-y-auto scrollbar-quiet min-h-[1.5em]" data-testid="move-history">
          {history.history.length ? history.history.map((m) => m.text).join(' ') : <span className="font-[family-name:var(--font-ui)] text-faint">Turn a face with the keyboard, or drag a sticker.</span>}
        </div>
      </section>
    </div>
  );
}

export default function CubePage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([id]) => id === params.get('tab')) ? params.get('tab') : 'free';
  const controller = useCubeController();
  const [manual] = useState(() => new ManualCube(controller));
  const { player, snapshot } = useSequencePlayer(controller, { baseState: solvedState(), moves: [] });
  const state = useControllerState(controller);
  const scene = useRef(null);
  const [showKeys, setShowKeys] = useState(false);
  const [virtualTurn, setVirtualTurn] = useState(null);
  const profileName = useKeymaps((s) => s.active().name);

  const turnManually = useCallback((move) => manual.turn(move), [manual]);
  const manualTab = tab === 'free';
  useCubeKeyboard({ enabled: manualTab, onMove: turnManually, onUndo: () => manual.undo(), onRedo: () => manual.redo() });

  // Dragging turns the cube on tabs where turning means something.
  const dragHandler = manualTab ? turnManually : tab === 'virtual' ? virtualTurn : tab === 'notation' ? turnManually : null;

  const selectTab = (id) => {
    const leavingEditor = tab === 'editor';
    if (leavingEditor) {
      player.pause();
      player.load({ baseState: controller.state, moves: [] });
    }
    if (tab === 'virtual' && id !== 'virtual') manual.reset(solvedState());
    setParams(id === 'free' ? {} : { tab: id }, { replace: true });
  };

  const onVirtualActive = useCallback((fn) => setVirtualTurn(() => fn), []);

  return (
    <div className="h-full flex flex-col lg:flex-row min-h-0" data-testid="cube-page">
      <div className="relative flex-1 min-h-[46dvh] lg:min-h-0 min-w-0">
        <CubeScene ref={scene} controller={controller} interactive={Boolean(dragHandler)} onMove={dragHandler} className="absolute inset-0" minHeight={0} />
        <div className="absolute left-3 bottom-3 flex flex-wrap items-center gap-2">
          <CameraViews sceneRef={scene} />
          <button type="button" className="btn" data-testid="keys-open" onClick={() => setShowKeys(true)}>
            <Keyboard size={14} strokeWidth={1.6} />
            Keys: {profileName}
          </button>
        </div>
      </div>
      <aside className="lg:w-[24rem] shrink-0 flex flex-col min-h-0 lg:glass lg:rounded-[24px] lg:m-3 lg:mt-[var(--page-top)]">
        <div className="px-4 pt-4 pb-3">
          <div className="segmented w-full flex" role="tablist" aria-label="Cube tools">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" role="tab" className="flex-1" aria-selected={tab === id} data-testid={`tab-${id}`} onClick={() => selectTab(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-4 overflow-y-auto scrollbar-quiet flex-1 pb-[var(--page-bottom)]">
          {tab === 'free' ? <FreePanel manual={manual} controller={controller} state={state} /> : null}
          {tab === 'editor' ? <AlgorithmEditor controller={controller} player={player} snapshot={snapshot} /> : null}
          {tab === 'virtual' ? <VirtualSolvePanel controller={controller} onSessionActive={onVirtualActive} /> : null}
          {tab === 'notation' ? <NotationReference onTry={turnManually} /> : null}
        </div>
      </aside>
      <KeyboardOverlay open={showKeys} onClose={() => setShowKeys(false)} />
    </div>
  );
}
