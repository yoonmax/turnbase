import { useEffect, useRef } from 'react';
import { moveForEvent } from '../cube/CubeControls.js';
import { useKeymaps } from '../cube/keymapStore.js';

/**
 * Keyboard turning, for the lifetime of a component that asks for it. The timer's
 * listeners are only attached on the timer page, and this hook only on cube views, so
 * the two can never see the same key press. Typing in a field and open dialogs are
 * ignored as well.
 */
export function useCubeKeyboard({ enabled = true, onMove, onUndo = null, onRedo = null }) {
  const load = useKeymaps((s) => s.load);
  const handlers = useRef({ onMove, onUndo, onRedo });
  handlers.current = { onMove, onUndo, onRedo };

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event) => {
      if (document.body.dataset.modalOpen === 'true') return;
      if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const { onMove: move, onUndo: undo, onRedo: redo } = handlers.current;
      if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') {
        event.preventDefault();
        if (event.shiftKey) redo?.();
        else undo?.();
        return;
      }
      if (event.code === 'Backspace') {
        event.preventDefault();
        undo?.();
        return;
      }
      const found = moveForEvent(useKeymaps.getState().active(), event);
      if (!found) return;
      // Consume it even on repeat, so Alt and letter shortcuts do nothing else.
      event.preventDefault();
      if (event.repeat) return;
      move?.(found, event.timeStamp);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
