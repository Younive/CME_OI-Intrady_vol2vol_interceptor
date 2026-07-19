'use client';

import React from 'react';

// RSI-style Implied-Vol sub-indicator: a monotone sparkline of IV across all
// loaded history up to the scrub position, with the current value + a coloured
// change chip. Hand-rolled SVG (no chart lib) — the pane is tiny and the line
// is the only mark. Stretched viewBox + non-scaling stroke keeps it crisp at
// any width; the last-point dot is a positioned div (immune to the x/y scale
// skew a <circle> would suffer).
export default function VolSparkline({
  series,
  value,
  chg,
}: {
  series: { t: number; v: number }[];
  value?: number;
  chg?: number;
}) {
  // Reduce (not Math.min(...spread)) — the series can span all loaded history.
  let min = Infinity;
  let max = -Infinity;
  for (const s of series) { if (s.v < min) min = s.v; if (s.v > max) max = s.v; }
  const flat = min === max; // flat / single-point → draw down the middle
  const yOf = (v: number) => (flat ? 50 : (1 - (v - min) / (max - min)) * 100);

  const points = series
    .map((s, i) => `${series.length > 1 ? (i / (series.length - 1)) * 100 : 100},${yOf(s.v)}`)
    .join(' ');
  const lastY = series.length ? yOf(series[series.length - 1].v) : 50;

  return (
    <div className="mt-1 flex h-full min-h-0 flex-col">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-lg font-bold text-slate-100">
          {value != null ? `${value}%` : '—'}
        </span>
        {chg != null && (
          <span className={`font-mono text-[0.8rem] font-bold ${chg >= 0 ? 'text-green-500' : 'text-rose-500'}`}>
            {chg >= 0 ? '+' : ''}{chg}
          </span>
        )}
      </div>

      <div className="relative mt-auto h-9 w-full text-indigo-400">
        {series.length > 1 && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {series.length > 0 && (
          <span
            className="absolute right-0 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-indigo-300 ring-2 ring-indigo-500/30"
            style={{ top: `${lastY}%` }}
          />
        )}
      </div>
    </div>
  );
}
