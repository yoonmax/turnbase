import { Suspense, lazy, useEffect, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { useApp } from '../app/store.js';
import { ConfirmDialog, Modal } from '../components/Modal.jsx';
import { formatCs, formatDate, formatMs } from '../utils/format.js';
import { DNF } from '../statistics/AverageCalculator.js';
import { solveValue } from '../statistics/StatisticsEngine.js';
import { copyText } from '../utils/download.js';
import { describeSolve } from '../timer/SolveRecorder.js';
import { ScrambleViewerModal } from '../scrambles/ScramblePreview.jsx';
import { getPuzzle } from '../scrambles/PuzzleRegistry.js';

const ReplayPanel = lazy(() => import('../trainer/SolveReplay.jsx'));

const PENALTIES = [
  ['none', 'No penalty'],
  ['+2', '+2'],
  ['dnf', 'DNF'],
  ['dns', 'DNS'],
];

export function resultLabel(solve) {
  const value = solveValue(solve);
  if (solve.penalty === 'dns') return 'DNS';
  if (value === DNF) return 'DNF';
  return `${formatCs(value)}${solve.penalty === '+2' ? '+' : ''}`;
}

export function SolveDetail({ solve, number, onClose }) {
  const setPenalty = useApp((s) => s.setPenalty);
  const updateSolve = useApp((s) => s.updateSolve);
  const deleteSolves = useApp((s) => s.deleteSolves);
  const pushToast = useApp((s) => s.pushToast);
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState('');
  const [reconstruction, setReconstruction] = useState('');
  const [viewing, setViewing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setComment(solve?.comment ?? '');
    setTags((solve?.tags ?? []).join(', '));
    setReconstruction(solve?.reconstruction ?? '');
    setViewing(false);
  }, [solve?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!solve) return null;

  const saveTags = () => {
    const next = tags.split(',').map((t) => t.trim()).filter(Boolean);
    updateSolve(solve.id, { tags: [...new Set(next)] });
  };

  return (
    <Modal open={Boolean(solve)} onClose={onClose} title={`Solve ${number}`} width="36rem" testId="solve-detail">
      <div className="flex items-baseline gap-3">
        <div className="notation text-4xl tabular" data-testid="detail-result" style={{ letterSpacing: '-0.05em', fontWeight: 300 }}>
          {resultLabel(solve)}
        </div>
        <div className="text-[0.8125rem] text-graphite">{formatDate(solve.createdAt)}</div>
      </div>

      <dl className="grid grid-cols-[7rem_1fr] gap-y-1 mt-3 mb-0 text-[0.8125rem]">
        <dt className="text-graphite">Raw time</dt>
        <dd className="m-0 notation">{formatMs(solve.rawMs, 3)}</dd>
        {solve.inspectionMs !== null && solve.inspectionMs !== undefined ? (
          <>
            <dt className="text-graphite">Inspection</dt>
            <dd className="m-0 notation">
              {formatMs(solve.inspectionMs, 2)}
              {solve.inspectionPenalty !== 'none' ? <span className="font-[family-name:var(--font-ui)] text-graphite"> (earned {solve.inspectionPenalty === 'dnf' ? 'DNF' : '+2'})</span> : null}
            </dd>
          </>
        ) : null}
        <dt className="text-graphite">Puzzle</dt>
        <dd className="m-0">
          {getPuzzle(solve.puzzle).name}
          {solve.source === 'virtual' ? ', virtual cube' : ''}
        </dd>
        {solve.scrambleMeta ? (
          <>
            <dt className="text-graphite">Scramble source</dt>
            <dd className="m-0">
              {solve.scrambleMeta.method === 'user-entered' ? 'Entered by you' : `${solve.scrambleMeta.library} ${solve.scrambleMeta.version}, ${solve.scrambleMeta.method} practice scramble`}
            </dd>
          </>
        ) : null}
      </dl>

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <div className="segmented">
          {PENALTIES.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={solve.penalty === value} data-testid={`detail-penalty-${value}`} onClick={() => setPenalty(solve.id, value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {solve.scramble ? (
        <div className="mt-4">
          <p className="notation text-[0.8125rem] leading-relaxed m-0 whitespace-pre-line" data-testid="detail-scramble">
            {solve.scramble}
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn" data-testid="detail-view-cube" onClick={() => setViewing(true)}>
              View on cube
            </button>
          </div>
        </div>
      ) : null}

      {solve.moves?.length ? (
        <Suspense fallback={null}>
          <div className="mt-5 pt-4 border-t border-rule">
            <ReplayPanel solve={solve} />
          </div>
        </Suspense>
      ) : null}

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-[0.8125rem] text-graphite">
          Comment
          <textarea
            className="field text-ink"
            rows={2}
            value={comment}
            data-testid="detail-comment"
            onChange={(e) => setComment(e.target.value)}
            onBlur={() => updateSolve(solve.id, { comment })}
          />
        </label>
        <label className="grid gap-1 text-[0.8125rem] text-graphite">
          Tags, separated by commas
          <input className="field text-ink" value={tags} data-testid="detail-tags" onChange={(e) => setTags(e.target.value)} onBlur={saveTags} />
        </label>
        <label className="grid gap-1 text-[0.8125rem] text-graphite">
          Reconstruction, typed by you
          <textarea
            className="field text-ink notation"
            rows={2}
            value={reconstruction}
            placeholder="Cross, F2L, OLL, PLL as you remember them"
            data-testid="detail-reconstruction"
            onChange={(e) => setReconstruction(e.target.value)}
            onBlur={() => updateSolve(solve.id, { reconstruction })}
          />
        </label>
      </div>

      <div className="mt-4 pt-3 border-t border-rule flex justify-between">
        <button
          type="button"
          className="btn"
          data-testid="detail-copy"
          onClick={async () => {
            await copyText(describeSolve(solve, resultLabel(solve)));
            pushToast({ message: 'Solve copied', durationMs: 1800 });
          }}
        >
          <Copy size={13} strokeWidth={1.6} />
          Copy solve
        </button>
        <button type="button" className="btn btn-danger" data-testid="detail-delete" onClick={() => setConfirming(true)}>
          <Trash2 size={13} strokeWidth={1.6} />
          Delete
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Delete this solve?"
        body="You can undo this for a few seconds afterwards."
        confirmLabel="Delete solve"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          deleteSolves([solve.id]);
          onClose();
        }}
      />
      <ScrambleViewerModal open={viewing} onClose={() => setViewing(false)} puzzleId={solve.puzzle} text={solve.scramble} />
    </Modal>
  );
}
