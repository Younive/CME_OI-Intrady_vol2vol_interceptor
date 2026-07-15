'use client';

import React from 'react';
import styles from '../app/page.module.css';
import { Snapshot, rangeMoves, RangeMove } from '@/lib/backtest';

export type DteSel = 0.6 | 0.7;

const fmtChg = (val?: number) => {
  if (val === null || val === undefined) return '-';
  return `${val >= 0 ? '+' : ''}${val}`;
};

const px = (v: number) => v.toFixed(1);

// Per-SD-level rows: prices = open ± scraped move (asymmetric). When open is
// unknown, fall back to the raw ± move sizes so the card still says something.
function RangeRows({ open, moves }: { open: number | null; moves: RangeMove[] }) {
  if (!moves.length) return <span className={styles.metaValue}>—</span>;
  return (
    <div className={styles.rangeRows}>
      {moves.map((m) => (
        <div key={m.level} className={styles.rangeRow}>
          <span className={styles.rangeLevel}>±{m.level} SD</span>
          <span className={styles.rangeVal}>
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
    <div className={styles.metaGrid}>
      <div className={styles.metaItem}>
        <span className={styles.metaLabel}>Future Price</span>
        <span className={styles.metaValue}>${data.FuturePrice}</span>
        <span style={{ color: (data.ExtractedFutureChg || 0) >= 0 ? '#22c55e' : '#ef4444', fontSize: '0.8rem', fontWeight: 'bold' }}>
          ({fmtChg(data.ExtractedFutureChg)})
        </span>
      </div>

      <div className={styles.metaItem}>
        <span className={styles.metaLabel}>Open Price</span>
        <span className={styles.metaValue}>{open != null ? `$${open}` : '—'}</span>
      </div>

      <div className={styles.metaItem}>
        <span className={styles.metaLabel}>Implied Vol (Vol)</span>
        <span className={styles.metaValue}>{data.ExtractedVol}%</span>
        <span style={{ color: (data.ExtractedVolChg || 0) >= 0 ? '#22c55e' : '#ef4444', fontSize: '0.8rem', fontWeight: 'bold' }}>
          ({fmtChg(data.ExtractedVolChg)})
        </span>
      </div>

      <div className={styles.metaItem}>
        <div className={styles.rangeHead}>
          <span className={styles.metaLabel}>SD Ranges</span>
          <div className={styles.dteToggle}>
            {([0.7, 0.6] as DteSel[]).map((v) => (
              <button key={v} className={`${styles.dteBtn} ${dteSel === v ? styles.dteActive : ''}`} onClick={() => onDteSel(v)}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
          {sdSnap?.DTE != null ? `@ ${sdSnap.DTE.toFixed(2)} DTE` : 'not yet today'}
        </span>
        <RangeRows open={open} moves={sdMoves} />
      </div>

      <div className={styles.metaItem}>
        <span className={styles.metaLabel}>Realtime Ranges</span>
        <RangeRows open={open} moves={rtMoves} />
      </div>
    </div>
  );
}
