import { useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Repeat, RotateCcw, SkipBack, SkipForward, Undo2 } from 'lucide-react';
import { PLAYBACK_SPEEDS } from './SequencePlayer.js';
import { inkOn, moveFace, resolveScheme } from './CubeThemes.js';
import { useApp } from '../app/store.js';
import { libraryColors } from '../algorithms/libraryColors.js';

/** The sequence as discrete tokens. Click one to jump to the state just after it. */
export function MoveTimeline({ player, snapshot, moves, compact = false, library = false }) {
  const settings = useApp((s) => s.settings);
  const colors = useMemo(() => {
    const scheme = resolveScheme(settings);
    return library ? libraryColors(scheme) : scheme;
  }, [settings, library]);
  const box = useRef(null);
  const highlighted = snapshot.activeIndex >= 0 ? snapshot.activeIndex : snapshot.index - 1;

  useEffect(() => {
    const el = box.current?.querySelector('[data-current="true"]');
    if (el?.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [highlighted]);

  return (
    <div
      ref={box}
      className={`notation flex flex-wrap gap-x-0.5 gap-y-1 overflow-y-auto scrollbar-quiet ${compact ? 'text-[0.75rem] max-h-20' : 'text-[0.875rem] max-h-32'}`}
      data-testid="move-timeline"
    >
      {moves.map((move, i) => {
        const current = i === highlighted;
        const face = current ? colors[moveFace(move)] : null;
        return (
          <button
            key={i} // eslint-disable-line react/no-array-index-key
            type="button"
            className="move-token"
            data-testid="move-token"
            data-current={current}
            data-done={i < snapshot.index}
            aria-current={current ? 'step' : undefined}
            aria-label={`Go to move ${i + 1}, ${move.text}`}
            style={current ? { '--token-face': face, '--token-ink': inkOn(face) } : undefined}
            onClick={() => player.jumpTo(i + 1)}
          >
            {move.text}
          </button>
        );
      })}
    </div>
  );
}

/** Transport controls. The slider is the same discrete timeline, for scrubbing. */
export function PlayerControls({ player, snapshot, speeds = PLAYBACK_SPEEDS, keyboard = true }) {
  const { index, total, playing, speed, loop, reverse } = snapshot;

  useEffect(() => {
    if (!keyboard) return undefined;
    const onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (event.target.closest?.('button') && event.code === 'Space' && event.target.matches(':focus-visible')) return;
      const actions = {
        Space: () => player.toggle(),
        ArrowLeft: () => player.stepBackward(),
        ArrowRight: () => player.stepForward(),
        Home: () => player.jumpTo(0),
        End: () => player.jumpToEnd(),
      };
      const action = actions[event.code];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, keyboard]);

  return (
    <div className="flex flex-col gap-2" data-testid="player-controls">
      <input
        type="range"
        min={0}
        max={total}
        step={1}
        value={index}
        aria-label="Position in the sequence"
        aria-valuetext={`Move ${index} of ${total}`}
        className="w-full"
        data-testid="player-scrub"
        onChange={(e) => player.jumpTo(Number(e.target.value))}
      />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-0.5">
          <button type="button" className="icon-btn" aria-label="Jump to the start" title="Jump to the start (Home)" data-testid="player-start" onClick={() => player.jumpTo(0)}>
            <SkipBack size={15} strokeWidth={1.6} />
          </button>
          <button type="button" className="icon-btn" aria-label="Step backward" title="Step backward (Left arrow)" data-testid="player-back" onClick={() => player.stepBackward()}>
            <ChevronLeft size={17} strokeWidth={1.6} />
          </button>
          <button
            type="button"
            className="btn btn-primary w-20"
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
            data-testid="player-play"
            onClick={() => player.toggle()}
          >
            {playing ? <Pause size={14} strokeWidth={1.8} /> : <Play size={14} strokeWidth={1.8} />}
            {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" className="icon-btn" aria-label="Step forward" title="Step forward (Right arrow)" data-testid="player-forward" onClick={() => player.stepForward()}>
            <ChevronRight size={17} strokeWidth={1.6} />
          </button>
          <button type="button" className="icon-btn" aria-label="Jump to the end" title="Jump to the end (End)" data-testid="player-end" onClick={() => player.jumpToEnd()}>
            <SkipForward size={15} strokeWidth={1.6} />
          </button>
          <button type="button" className="icon-btn" aria-label="Restart" title="Restart" data-testid="player-restart" onClick={() => player.restart()}>
            <RotateCcw size={14} strokeWidth={1.6} />
          </button>
          <button type="button" className="icon-btn" aria-label="Play in reverse" aria-pressed={reverse} title="Play in reverse" data-testid="player-reverse" onClick={() => player.setReverse(!reverse)}>
            <Undo2 size={14} strokeWidth={1.6} />
          </button>
          <button type="button" className="icon-btn" aria-label="Loop" aria-pressed={loop} title="Loop" data-testid="player-loop" onClick={() => player.setLoop(!loop)}>
            <Repeat size={14} strokeWidth={1.6} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="notation text-[0.75rem] text-graphite tabular" data-testid="player-position">
            {index}/{total}
          </span>
          <div className="segmented" role="group" aria-label="Playback speed">
            {speeds.map((s) => (
              <button key={s} type="button" aria-pressed={speed === s} data-testid={`speed-${s}`} onClick={() => player.setSpeed(s)} style={{ padding: '0 0.4rem' }}>
                {s}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
