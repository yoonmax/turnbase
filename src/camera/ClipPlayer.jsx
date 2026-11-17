import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Pause, Pin, Play, SkipBack, Trash2 } from 'lucide-react';
import { getClip, updateClip } from '../storage/ClipRepository.js';
import { removeClip } from './CameraRecorder.js';
import { useApp } from '../app/store.js';
import { formatMs } from '../utils/format.js';
import { MARKS, STAGES, addSplit } from '../statistics/Splits.js';

export const SPEEDS = [0.1, 0.25, 0.5, 1];
const speedLabel = (s) => `${s}×`;

/** The clip of a solve, or null while loading or if there is none. */
export function useClip(solveId) {
  const [clip, setClip] = useState(undefined);
  useEffect(() => {
    let live = true;
    setClip(undefined);
    if (!solveId) return undefined;
    getClip(solveId).then(
      (c) => live && setClip(c),
      () => live && setClip(null),
    );
    return () => {
      live = false;
    };
  }, [solveId]);
  return [clip, setClip];
}

/**
 * Plays a solve's camera clip at full or slow speed, a frame at a time if wanted, with
 * the solve time drawn over the picture. Keys: Space plays or pauses, the arrow keys
 * step one frame, and 1 to 4 pick a speed.
 */
export function ClipPlayer({ solveId, solve = null, onDeleted = null }) {
  const [clip, setClip] = useClip(solveId);
  const mirror = useApp((s) => s.settings.mirrorCamera);
  const pushToast = useApp((s) => s.pushToast);
  const updateSolve = useApp((s) => s.updateSolve);
  const video = useRef(null);
  const keys = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.5);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const url = useMemo(() => (clip?.blob ? URL.createObjectURL(clip.blob) : null), [clip]);

  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  // Recorded WebM often has no duration until the end has been read once, which breaks
  // seeking, so read to the end and come back before showing it.
  const onMetadata = () => {
    const v = video.current;
    if (!v) return;
    v.playbackRate = speed;
    if (Number.isFinite(v.duration)) {
      setDuration(v.duration);
      v.currentTime = Math.max(0, clip.startMs / 1000 - 0.4);
      return;
    }
    const fix = () => {
      if (!Number.isFinite(v.duration)) return;
      v.removeEventListener('durationchange', fix);
      setDuration(v.duration);
      v.currentTime = Math.max(0, clip.startMs / 1000 - 0.4);
    };
    v.addEventListener('durationchange', fix);
    v.currentTime = 1e7;
  };

  // A smooth clock for the overlay while playing, not just timeupdate's few per second.
  useEffect(() => {
    if (!playing) return undefined;
    let frame = 0;
    const tick = () => {
      if (video.current) setTime(video.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  // Keys work anywhere in the dialog, except while typing in a field.
  useEffect(() => {
    const onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target.closest?.('input:not([type="range"]), textarea, select, [contenteditable="true"]')) return;
      if (event.target.closest?.('input[type="range"]') && event.key.startsWith('Arrow')) return;
      keys.current?.(event);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (clip === undefined) return null;
  if (clip === null) return null;

  const frame = 1 / (clip.frameRate || 30);
  const solveMs = clip.endMs - clip.startMs;
  const atMs = time * 1000 - clip.startMs;
  const shownMs = Math.min(Math.max(atMs, 0), solveMs);
  const phase = atMs < 0 ? 'before' : atMs >= solveMs ? 'after' : 'during';

  const v = () => video.current;
  const toggle = () => {
    const el = v();
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };
  const step = (direction) => {
    const el = v();
    if (!el) return;
    el.pause();
    el.currentTime = Math.min(Math.max(el.currentTime + direction * frame, 0), duration || el.currentTime + frame);
  };
  const pickSpeed = (s) => {
    setSpeed(s);
    if (v()) v().playbackRate = s;
  };
  const restart = () => {
    const el = v();
    if (!el) return;
    el.currentTime = Math.max(0, clip.startMs / 1000 - 0.4);
    setTime(el.currentTime);
  };

  // ─── Splits: marks at the end of the cross, F2L and OLL ───
  const canSplit = Boolean(solve) && (solve.puzzle ?? '333') === '333';
  const splits = solve?.splits ?? [];
  const markSplit = () => {
    const el = v();
    if (!canSplit || !el) return;
    const next = addSplit(splits, el.currentTime * 1000 - clip.startMs, solve.rawMs);
    if (next !== splits) updateSolve(solve.id, { splits: next });
  };
  const removeLastSplit = () => {
    if (!splits.length) return;
    const latest = Math.max(...splits);
    updateSolve(solve.id, { splits: splits.filter((t) => t !== latest) });
  };
  const seekTo = (solveMs) => {
    const el = v();
    if (!el) return;
    el.pause();
    el.currentTime = Math.max(0, (clip.startMs + solveMs) / 1000);
    setTime(el.currentTime);
  };
  const edges = [0, ...splits, ...(splits.length === MARKS ? [solve.rawMs] : [])];

  keys.current = (event) => {
    if (event.key === ' ' || event.key === 'k') toggle();
    else if (event.key === 'ArrowLeft' || event.key === ',') step(-1);
    else if (event.key === 'ArrowRight' || event.key === '.') step(1);
    else if (/^[1-4]$/.test(event.key)) pickSpeed(SPEEDS[Number(event.key) - 1]);
    else if ((event.key === 's' || event.key === 'S') && canSplit) markSplit();
    else return;
    event.preventDefault();
  };

  const extension = clip.mimeType.includes('mp4') ? 'mp4' : 'webm';

  return (
    <div className="flex flex-col gap-2" data-testid="clip-player">
      <div className="relative rounded-[14px] overflow-hidden bg-black aspect-video">
        <video
          ref={video}
          src={url}
          className="absolute inset-0 w-full h-full object-contain"
          style={mirror ? { transform: 'scaleX(-1)' } : undefined}
          playsInline
          muted
          preload="auto"
          data-testid="clip-video"
          onLoadedMetadata={onMetadata}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onSeeked={() => video.current && setTime(video.current.currentTime)}
          onTimeUpdate={() => !playing && video.current && setTime(video.current.currentTime)}
          onClick={toggle}
        />
        <div
          className={`absolute right-3 top-2 font-extrabold tabular text-[1.75rem] pointer-events-none ${phase === 'after' ? 'text-[#7ee2a0]' : 'text-white'}`}
          style={{ letterSpacing: '-0.03em', textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}
          data-testid="clip-time"
        >
          {formatMs(shownMs, 2)}
        </div>
        {speed !== 1 ? (
          <div className="absolute left-3 top-3 text-[0.75rem] font-semibold text-white bg-black/50 rounded-full px-2 py-0.5 pointer-events-none" data-testid="clip-speed-badge">
            {speedLabel(speed)}
          </div>
        ) : null}
      </div>

      <div className="relative">
      {canSplit && duration
        ? splits.map((t, i) => (
            <span
              key={t}
              aria-hidden="true"
              className="absolute top-[-2px] w-[3px] h-[calc(100%+4px)] rounded-full bg-[var(--accent)] pointer-events-none"
              style={{ left: `calc(8px + (100% - 16px) * ${(clip.startMs + t) / 1000 / duration})` }}
              data-testid={`split-marker-${STAGES[i].id}`}
            />
          ))
        : null}
      <input
        type="range"
        className="w-full"
        min={0}
        max={duration || 0}
        step={frame}
        value={Math.min(time, duration || 0)}
        aria-label="Position in the clip"
        data-testid="clip-scrub"
        onChange={(e) => {
          const el = v();
          if (!el) return;
          el.pause();
          el.currentTime = Number(e.target.value);
          setTime(el.currentTime);
        }}
      />
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <button type="button" className="icon-btn" aria-label="Back to the start of the solve" title="Back to the start" data-testid="clip-restart" onClick={restart}>
          <SkipBack size={15} strokeWidth={1.7} />
        </button>
        <button type="button" className="icon-btn" aria-label="One frame back" title="One frame back (←)" data-testid="clip-frame-back" onClick={() => step(-1)}>
          <ChevronLeft size={16} strokeWidth={1.8} />
        </button>
        <button type="button" className="btn btn-primary" aria-label={playing ? 'Pause' : 'Play'} data-testid="clip-play" onClick={toggle}>
          {playing ? <Pause size={14} strokeWidth={1.8} /> : <Play size={14} strokeWidth={1.8} />}
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="icon-btn" aria-label="One frame forward" title="One frame forward (→)" data-testid="clip-frame-forward" onClick={() => step(1)}>
          <ChevronRight size={16} strokeWidth={1.8} />
        </button>
        <div className="segmented ml-1" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" aria-pressed={speed === s} data-testid={`clip-speed-${s}`} onClick={() => pickSpeed(s)}>
              {speedLabel(s)}
            </button>
          ))}
        </div>
      </div>

      {canSplit ? (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-rule" data-testid="split-panel">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[0.8125rem] font-medium mr-1">Splits</span>
            <button type="button" className="btn" disabled={splits.length >= MARKS} data-testid="split-mark" onClick={markSplit}>
              {splits.length >= MARKS ? 'All marked' : `End of ${STAGES[splits.length].label} (S)`}
            </button>
            <button type="button" className="btn btn-quiet" disabled={!splits.length} data-testid="split-undo" onClick={removeLastSplit}>
              Remove last
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1" data-testid="split-stages">
            {STAGES.map((stage, i) => {
              const known = edges[i + 1] !== undefined;
              return (
                <button
                  key={stage.id}
                  type="button"
                  className="btn flex-col !items-start !gap-0 !h-auto py-1.5"
                  disabled={edges[i] === undefined}
                  title={`Go to the start of ${stage.label}`}
                  data-testid={`split-${stage.id}`}
                  onClick={() => seekTo(edges[i])}
                >
                  <span className="text-[0.6875rem] text-graphite">{stage.label}</span>
                  <span className="font-extrabold tabular">{known ? formatMs(edges[i + 1] - edges[i], 2) : '–'}</span>
                </button>
              );
            })}
          </div>
          <p className="m-0 text-[0.75rem] text-graphite">
            Pause where each stage ends and press S: the cross, then F2L, then OLL. PLL runs to the stop.
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-1 flex-wrap text-[0.8125rem]">
        <button
          type="button"
          className="btn btn-quiet"
          aria-pressed={Boolean(clip.kept)}
          data-testid="clip-keep"
          title="Kept clips are never removed automatically"
          onClick={async () => {
            const next = await updateClip(solveId, { kept: !clip.kept });
            if (next) setClip(next);
          }}
        >
          <Pin size={13} strokeWidth={1.7} fill={clip.kept ? 'currentColor' : 'none'} />
          {clip.kept ? 'Kept' : 'Keep this clip'}
        </button>
        <a className="btn btn-quiet no-underline" href={url} download={`turnbase-solve-${formatMs(solveMs, 2)}.${extension}`} data-testid="clip-download">
          <Download size={13} strokeWidth={1.7} />
          Download
        </a>
        <button
          type="button"
          className="btn btn-quiet ml-auto"
          data-testid="clip-delete"
          onClick={async () => {
            await removeClip(solveId);
            setClip(null);
            pushToast({ message: 'Clip deleted', durationMs: 1800 });
            onDeleted?.();
          }}
        >
          <Trash2 size={13} strokeWidth={1.7} />
          Delete clip
        </button>
      </div>
      <p className="m-0 text-[0.75rem] text-graphite">
        Space plays and pauses, the arrow keys step one frame, 1 to 4 pick a speed{canSplit ? ', S marks a split' : ''}. Recorded at about {Math.round(clip.frameRate || 30)} frames a second.
      </p>
    </div>
  );
}
