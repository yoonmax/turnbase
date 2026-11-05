import { useEffect, useMemo, useRef, useState } from 'react';
import { isDnf } from './AverageCalculator.js';
import { formatCs, formatDay } from '../utils/format.js';

// One restrained chart vocabulary: a single y axis, a recessive grid, 2px lines, one
// tooltip per x position. Colours come from --series-1..4, in fixed order, and were
// checked for colour-vision separation against both page backgrounds.

export const SERIES_COLOR = (i) => `var(--series-${(i % 4) + 1})`;

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// A tidy axis: 1, 2 or 5 × a power of ten in centiseconds.
function niceTicks(min, max, count = 4) {
  if (min === max) {
    min -= 100;
    max += 100;
  }
  const rough = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v));
  return ticks;
}

function Tooltip({ x, width, children }) {
  const ref = useRef(null);
  const [own, setOwn] = useState(0);
  useEffect(() => {
    if (ref.current) setOwn(ref.current.offsetWidth);
  });
  const left = Math.max(0, Math.min(width - own, x + 12 + own > width ? x - own - 12 : x + 12));
  return (
    <div
      ref={ref}
      data-testid="chart-tooltip"
      className="absolute top-1 pointer-events-none z-10 px-2.5 py-1.5 rounded-md bg-raised border border-rule text-[0.75rem] whitespace-nowrap"
      style={{ left, boxShadow: 'var(--shadow-overlay)' }}
    >
      {children}
    </div>
  );
}

export function Legend({ series }) {
  if (series.length < 2) return null;
  return (
    <ul className="m-0 p-0 list-none flex flex-wrap gap-x-4 gap-y-0.5 text-[0.75rem] text-graphite" data-testid="chart-legend">
      {series.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          {s.dots ? (
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
          ) : (
            <span className="inline-block w-3.5 h-0.5 rounded" style={{ background: s.color }} />
          )}
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Time-series chart, indexed by solve. `series` entries have `values` in centiseconds,
 * where null is no data. Very slow outliers are clipped, and noted, so one interrupted
 * solve does not flatten everything else. `onSelect(index)` receives clicks.
 */
export function LineChart({ series, height = 240, xLabel, onSelect, testId = 'line-chart', clipOutliers = true, formatY = formatCs, title }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const length = Math.max(0, ...series.map((s) => s.values.length));
  const margin = { top: 8, right: 8, bottom: 22, left: 46 };

  const { yMin, yMax, clipped } = useMemo(() => {
    const all = [];
    for (const s of series) for (const v of s.values) if (v !== null && !isDnf(v)) all.push(v);
    if (!all.length) return { yMin: 0, yMax: 100, clipped: 0 };
    all.sort((a, b) => a - b);
    const low = all[0];
    let high = all[all.length - 1];
    let over = 0;
    if (clipOutliers && all.length > 12) {
      const p95 = all[Math.floor(all.length * 0.95)];
      const limit = p95 + (p95 - all[Math.floor(all.length * 0.5)]) * 2.5;
      if (high > limit) {
        high = limit;
        over = series[0].values.filter((v) => v !== null && !isDnf(v) && v > limit).length;
      }
    }
    const pad = Math.max((high - low) * 0.06, 5);
    return { yMin: Math.max(0, low - pad), yMax: high + pad, clipped: over };
  }, [series, clipOutliers]);

  const innerW = Math.max(10, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const toX = (i) => margin.left + (length <= 1 ? innerW / 2 : (i / (length - 1)) * innerW);
  const toY = (v) => margin.top + innerH - ((Math.min(v, yMax) - yMin) / (yMax - yMin)) * innerH;

  const ticks = useMemo(() => niceTicks(yMin, yMax), [yMin, yMax]);

  const paths = useMemo(() => {
    if (!width) return [];
    return series.map((s) => {
      let d = '';
      let open = false;
      s.values.forEach((v, i) => {
        if (v === null || isDnf(v)) {
          open = false;
          return;
        }
        if (s.dots) {
          // A zero-length round-capped segment draws one dot, so thousands stay one path.
          d += `M${toX(i).toFixed(1)} ${toY(v).toFixed(1)}h0`;
        } else {
          d += `${open ? 'L' : 'M'}${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`;
          open = true;
        }
      });
      return { ...s, d };
    });
  }, [series, width, length, yMin, yMax]); // eslint-disable-line react-hooks/exhaustive-deps

  const xTicks = useMemo(() => {
    if (length < 2) return [];
    const step = niceTicks(0, length - 1, Math.max(2, Math.floor(innerW / 90)))[1] || 1;
    const out = [];
    for (let i = 0; i < length; i += step) out.push(i);
    return out;
  }, [length, innerW]);

  const onMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - margin.left;
    const i = Math.max(0, Math.min(length - 1, Math.round((x / innerW) * (length - 1))));
    setHover(i);
  };

  const onKey = (event) => {
    if (event.key === 'ArrowRight') setHover((h) => Math.min(length - 1, (h ?? -1) + 1));
    else if (event.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? length) - 1));
    else if (event.key === 'Enter' && hover !== null) onSelect?.(hover);
    else return;
    event.preventDefault();
  };

  return (
    <div ref={ref} className="relative w-full" style={{ height }} data-testid={testId}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={title}
          tabIndex={0}
          className="block touch-pan-y"
          style={{ cursor: onSelect ? 'pointer' : 'default' }}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
          onClick={() => hover !== null && onSelect?.(hover)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={margin.left} x2={width - margin.right} y1={toY(t)} y2={toY(t)} stroke="var(--rule)" strokeWidth={1} />
              <text x={margin.left - 7} y={toY(t) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--faint)" className="tabular">
                {formatY(t)}
              </text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={toX(i)} y={height - 6} textAnchor="middle" fontSize={10.5} fill="var(--faint)" className="tabular">
              {xLabel ? xLabel(i) : i + 1}
            </text>
          ))}
          {paths.map((s) => (
            <path
              key={s.label}
              d={s.d}
              fill="none"
              stroke={s.color}
              strokeWidth={s.dots ? (length > 600 ? 3 : 6) : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={s.dots ? 0.5 : 1}
            />
          ))}
          {hover !== null ? <line x1={toX(hover)} x2={toX(hover)} y1={margin.top} y2={margin.top + innerH} stroke="var(--rule-strong)" strokeWidth={1} /> : null}
          {hover !== null
            ? series.map((s) => {
                const v = s.values[hover];
                if (v === null || v === undefined || isDnf(v)) return null;
                return <circle key={s.label} cx={toX(hover)} cy={toY(v)} r={3.5} fill={s.color} stroke="var(--paper)" strokeWidth={2} />;
              })
            : null}
        </svg>
      ) : null}
      {hover !== null ? (
        <Tooltip x={toX(hover)} width={width}>
          <div className="text-faint mb-0.5">{xLabel ? xLabel(hover) : `Solve ${hover + 1}`}</div>
          {series.map((s) => {
            const v = s.values[hover];
            if (v === null || v === undefined) return null;
            return (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-0.5 rounded" style={{ background: s.color }} />
                <span className="notation text-ink">{formatY(v)}</span>
                <span className="text-graphite">{s.label}</span>
              </div>
            );
          })}
          {onSelect ? <div className="text-faint mt-0.5">Select to see this solve</div> : null}
        </Tooltip>
      ) : null}
      {clipped ? (
        <p className="absolute right-2 top-0 m-0 text-[0.6875rem] text-faint" data-testid="chart-clipped">
          {clipped} slow {clipped === 1 ? 'solve' : 'solves'} above the top of the chart
        </p>
      ) : null}
    </div>
  );
}

/** Vertical bars on a shared scale. `bars` have { key, value, label, detail }. */
export function BarChart({ bars, height = 180, testId = 'bar-chart', title, tickEvery = 1, formatValue = (v) => String(v) }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const margin = { top: 8, right: 4, bottom: 22, left: 30 };
  const innerW = Math.max(10, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const ticks = niceTicks(0, max, 3).filter((t) => Number.isInteger(t));
  const slot = innerW / Math.max(1, bars.length);
  const gap = slot > 6 ? 2 : 0.5;
  const toY = (v) => margin.top + innerH - (v / max) * innerH;

  return (
    <div ref={ref} className="relative w-full" style={{ height }} data-testid={testId}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={title} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={margin.left} x2={width - margin.right} y1={toY(t)} y2={toY(t)} stroke="var(--rule)" />
              <text x={margin.left - 6} y={toY(t) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--faint)" className="tabular">
                {t}
              </text>
            </g>
          ))}
          {bars.map((bar, i) => {
            const x = margin.left + i * slot + gap / 2;
            const w = Math.max(1, slot - gap);
            const y = toY(bar.value);
            const h = margin.top + innerH - y;
            const r = Math.min(3, w / 2, h);
            return (
              <g key={bar.key} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                {/* The whole column is the target, not just the painted bar. */}
                <rect x={margin.left + i * slot} y={margin.top} width={slot} height={innerH} fill="transparent" />
                {bar.value > 0 ? (
                  <path
                    d={`M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`}
                    fill={hover === i ? 'var(--ink)' : 'var(--graphite)'}
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                ) : null}
                {i % tickEvery === 0 ? (
                  <text x={x + w / 2} y={height - 6} textAnchor="middle" fontSize={10.5} fill="var(--faint)" className="tabular">
                    {bar.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
      {hover !== null ? (
        <Tooltip x={margin.left + hover * slot} width={width}>
          <span className="notation text-ink">{formatValue(bars[hover].value)}</span> <span className="text-graphite">{bars[hover].detail}</span>
        </Tooltip>
      ) : null}
    </div>
  );
}

export function dayLabel(day) {
  const [y, m, d] = day.split('-').map(Number);
  return formatDay(new Date(y, m - 1, d).getTime());
}
