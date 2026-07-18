'use client';

import React from 'react';
import { Snapshot, rangeMoves, RangeMove } from '@/lib/backtest';
import { ui } from '@/lib/ui';

export type DteSel = 0.6 | 0.7;

const fmtChg = (val?: number) => {
  if (val === null || val === undefined) return '-';
  return `${val >= 0 ? '+' : ''}${val}`;
};

const px = (v: number) => v.toFixed(1);

const chgColor = (val?: number) => ((val || 0) >= 0 ? 'text-green-500' : 'text-rose-500');

// Per-SD-level rows: prices = open ± scraped move (asymmetric). When open is
// unknown, fall back to the raw ± move sizes so the card still says something.
function RangeRows({ open, moves }: { open: number | null; moves: RangeMove[] }) {
  if (!moves.length) return <span className={ui.metaValue}>—</span>;
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {moves.map((m) => (
        <div key={m.level} className="flex justify-between gap-2 tabular-nums">
          <span className="text-xs text-slate-400">±{m.level} SD</span>
          <span className="font-mono text-[0.85rem] font-bold text-slate-100">
            {open != null ? `${px(open - m.down)} – ${px(open + m.up)}` : `−${px(m.down)} / +${px(m.up)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

// Per-asset stat cards. Future/Open/Vol plus two SD-range cards: one anchored on
// the 0.6/0.7-DTE snapshot, one on the latest ("realtime"). Rendered once per
// asset, shared across the Intraday and OI charts.
export default function MetaGrid({
  data, open, sdSnap, dteSel, onDteSel,
}: {
  data: Snapshot;
  open: number | null;
  sdSnap: Snapshot | null;
  dteSel: DteSel;
  onDteSel: (v: DteSel) => void;
}) {
  const rtMoves = rangeMoves(data);
  const sdMoves = sdSnap ? rangeMoves(sdSnap) : [];

  return (
    <div className={ui.metaGrid}>
      <div className={ui.metaItem}>
        <span className={ui.metaLabel}>Future Price</span>
        <span className={ui.metaValue}>${data.FuturePrice}</span>
        <span className={`font-mono text-[0.8rem] font-bold ${chgColor(data.ExtractedFutureChg)}`}>
          ({fmtChg(data.ExtractedFutureChg)})
        </span>
      </div>

      <div className={ui.metaItem}>
        <span className={ui.metaLabel}>Open Price</span>
        <span className={ui.metaValue}>{open != null ? `$${open}` : '—'}</span>
      </div>

      <div className={ui.metaItem}>
        <span className={ui.metaLabel}>Implied Vol (Vol)</span>
        <span className={ui.metaValue}>{data.ExtractedVol}%</span>
        <span className={`font-mono text-[0.8rem] font-bold ${chgColor(data.ExtractedVolChg)}`}>
          ({fmtChg(data.ExtractedVolChg)})
        </span>
      </div>

      <div className={ui.metaItem}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className={ui.metaLabel}>SD Ranges</span>
          <div className="inline-flex gap-0.5 rounded bg-black/20 p-0.5">
            {([0.7, 0.6] as DteSel[]).map((v) => (
              <button
                key={v}
                className={`cursor-pointer rounded px-2 py-0.5 text-xs font-semibold ${dteSel === v ? 'bg-indigo-500 text-white' : 'text-slate-400'}`}
                onClick={() => onDteSel(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <span className="text-[0.7rem] text-slate-500">
          {sdSnap?.DTE != null ? `@ ${sdSnap.DTE.toFixed(2)} DTE` : 'not yet today'}
        </span>
        <RangeRows open={open} moves={sdMoves} />
      </div>

      <div className={ui.metaItem}>
        <span className={ui.metaLabel}>Realtime Ranges</span>
        <RangeRows open={open} moves={rtMoves} />
      </div>
    </div>
  );
}
