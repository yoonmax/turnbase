import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Copy, Download, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../app/store.js';
import { ConfirmDialog, Modal } from '../components/Modal.jsx';
import { PUZZLES, getPuzzle } from '../scrambles/PuzzleRegistry.js';
import { listSolves } from '../storage/SolveRepository.js';
import { exportSessionDocument } from '../storage/Backup.js';
import { downloadText, pickFile, slug } from '../utils/download.js';

function SessionRow({ session, current, onSwitch }) {
  const rename = useApp((s) => s.renameSession);
  const archive = useApp((s) => s.setSessionArchived);
  const duplicate = useApp((s) => s.duplicateSession);
  const remove = useApp((s) => s.deleteSession);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(session.name);
  const [confirming, setConfirming] = useState(false);

  const commit = () => {
    const trimmed = name.trim();
    if (trimmed) rename(session.id, trimmed);
    else setName(session.name);
    setEditing(false);
  };

  const exportSession = async () => {
    const solves = await listSolves(session.id);
    downloadText(`turnbase-${slug(session.name)}.json`, JSON.stringify(exportSessionDocument(session, solves), null, 2));
  };

  return (
    <li className="flex items-center gap-1 pl-2 pr-1 h-9 rounded-md row-hover" data-testid="session-row" data-session-name={session.name}>
      {editing ? (
        <input
          autoFocus
          className="field flex-1 h-7"
          value={name}
          aria-label="Session name"
          data-testid="session-rename-input"
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              e.stopPropagation();
              e.preventDefault();
              setName(session.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={`flex-1 min-w-0 text-left bg-transparent border-none p-0 truncate ${current ? 'font-medium' : ''}`}
          onClick={() => onSwitch(session.id)}
          data-testid="session-switch"
        >
          {session.name}
          {current ? <span className="ml-2 text-faint font-normal text-[0.75rem]">current</span> : null}
          {session.kind === 'virtual' ? <span className="ml-2 text-faint font-normal text-[0.75rem]">virtual</span> : null}
        </button>
      )}
      <button type="button" className="icon-btn" aria-label={`Rename ${session.name}`} title="Rename" data-testid="session-rename" onClick={() => setEditing(true)}>
        <Pencil size={13} strokeWidth={1.6} />
      </button>
      <button type="button" className="icon-btn" aria-label={`Duplicate ${session.name}`} title="Duplicate" data-testid="session-duplicate" onClick={() => duplicate(session.id)}>
        <Copy size={13} strokeWidth={1.6} />
      </button>
      <button type="button" className="icon-btn" aria-label={`Export ${session.name}`} title="Export" data-testid="session-export" onClick={exportSession}>
        <Download size={13} strokeWidth={1.6} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={session.archived ? `Restore ${session.name}` : `Archive ${session.name}`}
        title={session.archived ? 'Restore' : 'Archive'}
        data-testid="session-archive"
        onClick={() => archive(session.id, !session.archived)}
      >
        {session.archived ? <ArchiveRestore size={13} strokeWidth={1.6} /> : <Archive size={13} strokeWidth={1.6} />}
      </button>
      <button type="button" className="icon-btn" aria-label={`Delete ${session.name}`} title="Delete" data-testid="session-delete" onClick={() => setConfirming(true)}>
        <Trash2 size={13} strokeWidth={1.6} />
      </button>
      <ConfirmDialog
        open={confirming}
        title="Delete this session?"
        body={`"${session.name}" and all of its solves will be removed from this device. Export it first if you may want them back.`}
        confirmLabel="Delete session"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          remove(session.id);
        }}
      />
    </li>
  );
}

export function SessionManager({ open, onClose }) {
  const sessions = useApp((s) => s.sessions);
  const currentSessionId = useApp((s) => s.currentSessionId);
  const switchSession = useApp((s) => s.switchSession);
  const createSession = useApp((s) => s.createSession);
  const importBackup = useApp((s) => s.importBackup);
  const pushToast = useApp((s) => s.pushToast);
  const [name, setName] = useState('');
  const [puzzle, setPuzzle] = useState('333');
  const [showArchived, setShowArchived] = useState(false);

  const groups = useMemo(() => {
    const visible = sessions.filter((s) => (showArchived ? s.archived : !s.archived));
    return PUZZLES.map((p) => ({ puzzle: p, sessions: visible.filter((s) => s.puzzle === p.id) })).filter((g) => g.sessions.length);
  }, [sessions, showArchived]);

  const archivedCount = sessions.filter((s) => s.archived).length;

  const create = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await createSession({ name: trimmed, puzzle });
    setName('');
    onClose();
  };

  const importFile = async () => {
    const file = await pickFile();
    if (!file) return;
    try {
      const doc = JSON.parse(await file.text());
      const { sessions: s, solves } = await importBackup(doc);
      pushToast({ message: `Imported ${s} session${s === 1 ? '' : 's'} and ${solves} solve${solves === 1 ? '' : 's'}` });
    } catch (error) {
      pushToast({ message: `Import failed: ${error.message}`, durationMs: 9000 });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Sessions" width="36rem" testId="session-manager">
      <form className="flex gap-2 mb-4" onSubmit={create}>
        <input
          className="field flex-1"
          placeholder="New session name"
          aria-label="New session name"
          value={name}
          data-testid="session-new-name"
          onChange={(e) => setName(e.target.value)}
        />
        <select className="field" aria-label="Puzzle" value={puzzle} data-testid="session-new-puzzle" onChange={(e) => setPuzzle(e.target.value)}>
          {PUZZLES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary" disabled={!name.trim()} data-testid="session-create">
          Create
        </button>
      </form>

      {groups.length === 0 ? <p className="text-graphite text-[0.8125rem]">No archived sessions.</p> : null}
      {groups.map((group) => (
        <section key={group.puzzle.id} className="mb-3">
          <h3 className="m-0 mb-0.5 pl-2 text-[0.75rem] font-normal text-graphite">{getPuzzle(group.puzzle.id).name}</h3>
          <ul className="list-none m-0 p-0">
            {group.sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                current={session.id === currentSessionId}
                onSwitch={(id) => {
                  switchSession(id);
                  onClose();
                }}
              />
            ))}
          </ul>
        </section>
      ))}

      <div className="mt-4 pt-3 border-t border-rule flex items-center justify-between">
        <button type="button" className="btn btn-quiet" data-testid="session-show-archived" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Show active sessions' : `Show archived (${archivedCount})`}
        </button>
        <button type="button" className="btn" data-testid="session-import" onClick={importFile}>
          Import a session or backup
        </button>
      </div>
    </Modal>
  );
}
