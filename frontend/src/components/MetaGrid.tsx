'use client';

import React from 'react';
import { Snapshot, rangeMoves, RangeMove } from '@/lib/backtest';
import { ui } from '@/lib/ui';
import VolSparkline from '@/components/VolSparkline';

export type DteSel = 0.6 | 0.7;

const fmtChg = (val?: number) => {
  if (val === null || val === undefined) return '-';
  return `${val >= 0 ? '+' : ''}${val}`;
};

const px = (v: number) => v.toFixed(1);

const chgColor = (val?: number) => ((val || 0) >= 0 ? 'text-green-500' : 'text-rose-500');

// Level intensity: ±1 (nearest) faintest → ±3 (widest) strongest. The tag chip
// and the connecting track share the tint so the ladder reads as one gauge.
const LEVEL_TINT: Record<number, { tag: string; track: string }> = {
  1: { tag: 'bg-indigo-500/20 text-indigo-200', track: 'bg-indigo-500/25' },
  2: { tag: 'bg-indigo-500/35 text-indigo-100', track: 'bg-indigo-500/45' },
  3: { tag: 'bg-indigo-500/55 text-white', track: 'bg-indigo-500/70' },
};

// SD ladder: one rung per level — [±N] chip, the down price (below open, rose)
// and the up price (above open, emerald) pinned to the ends of a tinted track.
// When open is unknown, the rung shows the raw ∓ move sizes instead of prices.
function RangeRows({ open, moves, compact }: { open: number | null; moves: RangeMove[]; compact?: boolean }) {
  if (!moves.length) return null;
  const priceCls = `font-mono font-bold tabular-nums ${compact ? 'text-xs' : 'text-[0.85rem]'}`;
  return (
    <div className={compact ? 'mt-1.5 flex flex-col gap-1' : 'mt-2 flex flex-col gap-1.5'}>
      {moves.map((m) => {
        const tint = LEVEL_TINT[m.level] ?? LEVEL_TINT[3];
        const down = open != null ? px(open - m.down) : `−${px(m.down)}`;
        const up = open != null ? px(open + m.up) : `+${px(m.up)}`;
        return (
          <div key={m.level} className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-px text-[0.65rem] font-bold ${tint.tag}`}>±{m.level}</span>
            <span className={`${priceCls} text-rose-300`}>{down}</span>
            <span className={`h-0.5 flex-1 rounded-full ${tint.track}`} />
            <span className={`${priceCls} text-emerald-300`}>{up}</span>
          </div>
        );
      })}
    </div>
  );
}

// Per-asset stat cards. Future/Open/Vol plus two SD-range cards: one anchored on
// the 0.6/0.7-DTE snapshot, one on the latest ("realtime"). Rendered once per
// asset, shared across the Intraday and OI charts.
export default function MetaGrid({
  data, open, sdSnap, rtSnap, dteSel, onDteSel, showPrice = true, compact = false, volSeries,
  plotRt = false, onPlotRt,
}: {
  data: Snapshot;
  open: number | null;
  sdSnap: Snapshot | null;
  rtSnap?: Snapshot | null; // in-session realtime snapshot (backtest); live falls back to `data`
  dteSel: DteSel;
  onDteSel: (v: DteSel) => void;
  showPrice?: boolean;
  compact?: boolean; // thin strip: tighter grid/padding/fonts (backtest)
  volSeries?: { t: number; v: number }[]; // IV path (all loaded history ≤ scrub) → sparkline
  plotRt?: boolean; // candle plots the Realtime range instead of the DTE SD range
  onPlotRt?: (v: boolean) => void; // together with onDteSel drives the 0.7/0.6/RT switch
}) {
  // Realtime source: the in-session `rtSnap` when provided (backtest, matches the
  // plotted RT lines), else the current snapshot (live page).
  const rtSource = rtSnap !== undefined ? rtSnap : data;
  const rtMoves = rtSource ? rangeMoves(rtSource) : [];
  const sdMoves = sdSnap ? rangeMoves(sdSnap) : [];
  // Plot mode (backtest): the SD card is the single range instrument — its
  // toggle picks 0.7/0.6/RT for both the readout and what plots. In that mode
  // the separate Realtime card is dropped (it would duplicate RT).
  const plotMode = !!onPlotRt;
  const showRt = plotMode && plotRt;
  const gridCls = compact ? 'grid grid-cols-2 gap-2 max-[700px]:grid-cols-1' : ui.metaGrid;
  const itemCls = compact ? 'rounded-md border-l-2 border-indigo-500 bg-slate-900 px-2.5 py-1.5' : ui.metaItem;
  const valueCls = compact ? 'font-mono text-sm font-bold text-slate-100' : ui.metaValue;

  return (
    <div className={gridCls}>
      {showPrice && (
        <div className={ui.metaItem}>
          <span className={ui.metaLabel}>Future Price</span>
          <span className={ui.metaValue}>${data.FuturePrice}</span>
          <span className={`font-mono text-[0.8rem] font-bold ${chgColor(data.ExtractedFutureChg)}`}>
            ({fmtChg(data.ExtractedFutureChg)})
          </span>
        </div>
      )}

      {showPrice && (
        <div className={ui.metaItem}>
          <span className={ui.metaLabel}>Open Price</span>
          <span className={ui.metaValue}>{open != null ? `$${open}` : '—'}</span>
        </div>
      )}

      <div className={`${itemCls} flex flex-col`}>
        <span className={ui.metaLabel}>Implied Vol (Vol)</span>
        {volSeries ? (
          <VolSparkline series={volSeries} value={data.ExtractedVol} chg={data.ExtractedVolChg} />
        ) : (
          <>
            <span className={valueCls}>{data.ExtractedVol}%</span>
            <span className={`font-mono text-[0.8rem] font-bold ${chgColor(data.ExtractedVolChg)}`}>
              ({fmtChg(data.ExtractedVolChg)})
            </span>
          </>
        )}
      </div>

      <div className={itemCls}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className={ui.metaLabel}>SD Ranges</span>
          {/* One range instrument: 0.7 / 0.6 pick the DTE SD range; RT (plot mode
              only) picks the realtime range. Drives both the readout and what
              draws on the candle. */}
          <div className="inline-flex gap-0.5 rounded bg-black/20 p-0.5">
            {([0.7, 0.6] as DteSel[]).map((v) => (
              <button
                key={v}
                className={`cursor-pointer rounded px-2 py-0.5 text-xs font-semibold ${!showRt && dteSel === v ? 'bg-indigo-500 text-white' : 'text-slate-400'}`}
                onClick={() => { onDteSel(v); onPlotRt?.(false); }}
              >
                {v}
              </button>
            ))}
            {plotMode && (
              <button
                className={`cursor-pointer rounded px-2 py-0.5 text-xs font-semibold ${showRt ? 'bg-indigo-500 text-white' : 'text-slate-400'}`}
                onClick={() => onPlotRt?.(true)}
              >
                RT
              </button>
            )}
          </div>
        </div>
        <span className="text-[0.7rem] text-slate-500">
          {showRt ? 'realtime' : sdSnap?.DTE != null ? `@ ${sdSnap.DTE.toFixed(2)} DTE` : 'no SD data update yet.'}
        </span>
        <RangeRows open={open} moves={showRt ? rtMoves : sdMoves} compact={compact} />
      </div>

      {!plotMode && (
        <div className={itemCls}>
          <span className={ui.metaLabel}>Realtime Ranges</span>
          <RangeRows open={open} moves={rtMoves} compact={compact} />
        </div>
      )}
    </div>
  );
}
