import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Trash2, Upload, X } from 'lucide-react';
import { useKeymaps } from './keymapStore.js';
import { bindingsByMove, comboFromEvent, comboLabel } from './CubeControls.js';
import { Modal } from '../components/Modal.jsx';
import { useApp } from '../app/store.js';
import { downloadText, pickFile, slug } from '../utils/download.js';

const MOVE_GROUPS = [
  { name: 'Faces', moves: ['R', 'U', 'F', 'L', 'D', 'B'] },
  { name: 'Slices', moves: ['M', 'E', 'S'] },
  { name: 'Wide', moves: ['r', 'u', 'f', 'l', 'd', 'b'] },
  { name: 'Whole cube', moves: ['x', 'y', 'z'] },
];

const withVariants = (move) => [move, `${move}'`, `${move}2`];

/** Choosing, editing, importing and exporting key profiles. */
export function KeymapEditor() {
  const load = useKeymaps((s) => s.load);
  const activeId = useKeymaps((s) => s.activeId);
  const custom = useKeymaps((s) => s.custom);
  const store = useKeymaps();
  const pushToast = useApp((s) => s.pushToast);
  const [capturing, setCapturing] = useState(null);
  const [message, setMessage] = useState(null);
  const [pending, setPending] = useState(null);

  useEffect(() => {
    load();
  }, [load]);

  const profiles = useMemo(() => store.profiles(), [custom]); // eslint-disable-line react-hooks/exhaustive-deps
  const profile = profiles[activeId] ?? profiles.direct;
  const byMove = useMemo(() => bindingsByMove(profile), [profile]);

  useEffect(() => {
    if (!capturing) return undefined;
    const onKey = async (event) => {
      if (['Shift', 'Alt', 'Meta', 'Control'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setCapturing(null);
        return;
      }
      const combo = comboFromEvent(event);
      const result = await store.bind(profile.id, combo, capturing);
      if (result.ok) {
        setMessage(null);
        setCapturing(null);
      } else if (result.conflict) {
        setPending({ combo, move: capturing });
        setMessage(result.message);
        setCapturing(null);
      } else {
        setMessage(result.message);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, profile.id, store]);

  const editable = !profile.builtIn;

  return (
    <div className="flex flex-col gap-3" data-testid="keymap-editor">
      <div className="flex flex-wrap items-center gap-2">
        <select className="field" aria-label="Key profile" value={profile.id} data-testid="keymap-profile" onChange={(e) => store.setActive(e.target.value)}>
          {Object.values(profiles).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn" data-testid="keymap-copy" onClick={() => store.duplicate(profile.id, `${profile.name} copy`)}>
          <Plus size={13} strokeWidth={1.6} />
          Make an editable copy
        </button>
        <button type="button" className="btn" data-testid="keymap-export" onClick={() => downloadText(`turnbase-keys-${slug(profile.name)}.json`, JSON.stringify({ name: profile.name, bindings: profile.bindings }, null, 2))}>
          <Download size={13} strokeWidth={1.6} />
          Export
        </button>
        <button
          type="button"
          className="btn"
          data-testid="keymap-import"
          onClick={async () => {
            const file = await pickFile();
            if (!file) return;
            try {
              const created = await store.importProfile(JSON.parse(await file.text()));
              pushToast({ message: `Imported ${created.name}` });
            } catch (error) {
              setMessage(error.message);
            }
          }}
        >
          <Upload size={13} strokeWidth={1.6} />
          Import
        </button>
        {editable ? (
          <button type="button" className="btn btn-danger" data-testid="keymap-delete" onClick={() => store.remove(profile.id)}>
            <Trash2 size={13} strokeWidth={1.6} />
            Delete profile
          </button>
        ) : null}
        {Object.keys(custom).length ? (
          <button type="button" className="btn btn-quiet" data-testid="keymap-reset" onClick={() => store.resetAll()}>
            Reset to defaults
          </button>
        ) : null}
      </div>
      <p className="m-0 text-[0.8125rem] text-graphite">
        {profile.description}
        {editable ? ' Select a move, then press the key you want for it.' : ''}
      </p>
      {message ? (
        <div className="text-[0.8125rem] flex items-center gap-2 flex-wrap" role="alert" data-testid="keymap-message">
          <span className="text-danger">{message}</span>
          {pending ? (
            <>
              <button
                type="button"
                className="btn"
                data-testid="keymap-replace"
                onClick={async () => {
                  await store.bind(profile.id, pending.combo, pending.move, { replace: true });
                  setPending(null);
                  setMessage(null);
                }}
              >
                Use it for {pending.move} instead
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => { setPending(null); setMessage(null); }}>
                Keep it as it was
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3">
        {MOVE_GROUPS.map((group) => (
          <section key={group.name}>
            <h3 className="m-0 mb-1 text-[0.75rem] font-normal text-graphite">{group.name}</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-x-3">
              {group.moves.flatMap(withVariants).map((move) => {
                const keys = byMove.get(move) ?? [];
                const active = capturing === move;
                return (
                  <div key={move} className="flex items-center gap-1.5 h-7 text-[0.75rem]" data-testid="key-row" data-move={move}>
                    <button
                      type="button"
                      className={`notation w-9 text-left bg-transparent border-none p-0 ${editable ? 'underline decoration-rule-strong underline-offset-2' : ''}`}
                      disabled={!editable}
                      data-testid="key-move"
                      aria-label={`Set the key for ${move}`}
                      onClick={() => setCapturing(move)}
                    >
                      {move}
                    </button>
                    {active ? (
                      <span className="text-hold">Press a key, or Escape</span>
                    ) : keys.length ? (
                      keys.map((combo) => (
                        <span key={combo} className="inline-flex items-center gap-0.5 px-1.5 rounded border border-rule bg-raised whitespace-nowrap">
                          {comboLabel(combo)}
                          {editable ? (
                            <button type="button" className="bg-transparent border-none p-0 text-faint" aria-label={`Remove ${comboLabel(combo)}`} onClick={() => store.unbind(profile.id, combo)}>
                              <X size={10} />
                            </button>
                          ) : null}
                        </span>
                      ))
                    ) : (
                      <span className="text-faint">not set</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function KeyboardOverlay({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard controls" width="50rem" testId="keyboard-overlay">
      <KeymapEditor />
      <p className="mt-4 mb-0 pt-3 border-t border-rule text-[0.75rem] text-graphite">
        Space, arrow keys, Home, End, Enter, Tab, Escape and Backspace are kept for playback and navigation. On a cube view, Backspace or Cmd/Ctrl+Z undoes a move, and adding Shift redoes it. These keys never reach the timer, which only listens on its own page.
      </p>
    </Modal>
  );
}
