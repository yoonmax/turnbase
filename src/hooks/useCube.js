import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CubeController } from '../cube/CubeAnimationQueue.js';
import { SequencePlayer } from '../cube/SequencePlayer.js';
import { useApp } from '../app/store.js';
import { turnClick } from '../utils/sound.js';

/** A controller for this component's lifetime, following the user's turn settings. */
export function useCubeController({ n = 3, state = null } = {}) {
  const [controller] = useState(() => new CubeController({ n, state }));
  const turnSound = useApp((s) => s.settings.turnSound);
  useEffect(() => {
    controller.configure({ onTurnStart: turnSound ? () => turnClick() : null });
  }, [controller, turnSound]);
  return controller;
}

export function useControllerState(controller) {
  const version = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.version,
  );
  return useMemo(() => controller.state, [controller, version]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useSequencePlayer(controller, initial) {
  const [player] = useState(() => new SequencePlayer(controller, initial));
  useEffect(() => () => player.dispose(), [player]);
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot);
  return { player, snapshot };
}
