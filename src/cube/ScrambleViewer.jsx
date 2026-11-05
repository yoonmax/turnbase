import { useEffect, useMemo, useRef } from 'react';
import { Copy } from 'lucide-react';
import { solvedState } from './CubeEngine.js';
import { parseAlgorithm } from './CubeNotationParser.js';
import { CameraViews, CubeScene } from './CubeScene.jsx';
import { MoveTimeline, PlayerControls } from './PlayerControls.jsx';
import { useCubeController, useControllerState, useSequencePlayer } from '../hooks/useCube.js';
import { CubeNet } from '../scrambles/CubeNet.jsx';
import { copyText } from '../utils/download.js';
import { useApp } from '../app/store.js';

/** A scramble on the 3D cube, from solved to scrambled, one exact state at a time. */
export default function ScrambleViewer({ text, n = 3 }) {
  const moves = useMemo(() => {
    const parsed = parseAlgorithm(text, { n });
    return parsed.ok ? parsed.moves : [];
  }, [text, n]);
  const controller = useCubeController({ n });
  const { player, snapshot } = useSequencePlayer(controller, { baseState: solvedState(n), moves });
  const scene = useRef(null);
  const state = useControllerState(controller);
  const pushToast = useApp((s) => s.pushToast);

  // Opens showing the finished scramble, ready to step back through or replay.
  useEffect(() => {
    player.jumpToEnd();
  }, [player]);

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_15rem]">
      <div className="min-w-0 flex flex-col gap-3">
        <CubeScene ref={scene} controller={controller} className="h-[min(50dvh,24rem)] rounded-md" minHeight={260} />
        <PlayerControls player={player} snapshot={snapshot} />
      </div>
      <div className="flex flex-col gap-3 min-w-0">
        <MoveTimeline player={player} snapshot={snapshot} moves={moves} />
        <CubeNet state={state} n={n} width={210} title="Current state" />
        <CameraViews sceneRef={scene} />
        <button
          type="button"
          className="btn self-start"
          onClick={async () => {
            await copyText(text);
            pushToast({ message: 'Scramble copied', durationMs: 1800 });
          }}
        >
          <Copy size={13} strokeWidth={1.6} />
          Copy scramble
        </button>
      </div>
    </div>
  );
}
