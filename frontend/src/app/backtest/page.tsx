'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styles from '../page.module.css';
import DistributionCharts from '@/components/DistributionCharts';
import MetaGrid, { DteSel } from '@/components/MetaGrid';
import { asOf, nearestDTE, DaySnapshots, fmtICT, todayICT, PRODUCTS, Product } from '@/lib/backtest';

const EMPTY: DaySnapshots = { intraday: [], oi: [] };

export default function Backtest() {
  const [product, setProduct] = useState<Product>('gold');
  const [date, setDate] = useState('');
  const [view, setView] = useState<'intraday' | 'oi'>('intraday');
  const [day, setDay] = useState<DaySnapshots>(EMPTY);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [dteSel, setDteSel] = useState<DteSel>(0.7);

  useEffect(() => {
    setMounted(true);
    setDate(todayICT());
  }, []);

  // Session open for the replayed day (Yahoo, cached per product/date).
  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setOpen(null);
    fetch(`/api/open?product=${product}&date=${date}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d && !d.error) setOpen(d.open); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [product, date]);

  // Fetch the day whenever product/date changes.
  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setLoading(true);
    setErr('');
    fetch(`/api/snapshots?product=${product}&date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) { setErr(d.error); setDay(EMPTY); }
        else setDay({ intraday: d.intraday || [], oi: d.oi || [] });
      })
      .catch((e) => !cancelled && setErr(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [product, date]);

  // Merged, de-duped, chronological timeline across both data types.
  const times = useMemo(() => {
    const set = new Set<string>();
    day.intraday.forEach((s) => set.add(s.ExtractedAt));
    day.oi.forEach((s) => set.add(s.ExtractedAt));
    return Array.from(set).sort();
  }, [day]);

  // Snap index to the newest frame when a new day loads.
  useEffect(() => { setIdx(times.length ? times.length - 1 : 0); setPlaying(false); }, [times]);

  // Play: advance one frame ~1.2s, stop at the end.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setIdx((i) => {
        if (i >= times.length - 1) { setPlaying(false); return i; }
        return i + 1;
      });
    }, 1200);
    return () => clearInterval(t);
  }, [playing, times.length]);

  const t = times[idx];
  const snap = t ? asOf(view === 'intraday' ? day.intraday : day.oi, t) : null;
  // SD reference = the day's snapshot nearest the selected DTE (a fixed daily
  // level, not scrub-dependent). Prefer Intraday, fall back to OI.
  const sdSnap = nearestDTE(day.intraday.length ? day.intraday : day.oi, dteSel);

  const btn = (active: boolean) => `${styles.toggleButton} ${active ? styles.active : ''}`;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className={styles.title}>Backtest Replay</h1>
            <p style={{ color: '#94a3b8', margin: '5px 0 0 0' }}>Scrub captured OI / Intraday snapshots (as-of time, ICT)</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
            <div className={styles.toggleContainer}>
              {PRODUCTS.map((p) => (
                <button key={p} className={btn(product === p)} onClick={() => setProduct(p)}>
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ background: 'var(--card-bg)', color: '#f1f5f9', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px' }}
              />
              <div className={styles.toggleContainer}>
                <button className={btn(view === 'intraday')} onClick={() => setView('intraday')}>Intraday</button>
                <button className={btn(view === 'oi')} onClick={() => setView('oi')}>OI</button>
              </div>
            </div>
          </div>
        </div>

        {/* Scrubber */}
        <div style={{ marginTop: '1.5rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button className={styles.toggleButton} onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }} disabled={!times.length}>◀</button>
            <button className={styles.toggleButton} onClick={() => setPlaying((p) => !p)} disabled={times.length < 2}>{playing ? '❚❚' : '▶'}</button>
            <button className={styles.toggleButton} onClick={() => { setPlaying(false); setIdx((i) => Math.min(times.length - 1, i + 1)); }} disabled={!times.length}>▶▶</button>
            <input
              type="range"
              min={0}
              max={Math.max(0, times.length - 1)}
              value={idx}
              onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
              disabled={!times.length}
              style={{ flex: 1, minWidth: '200px', accentColor: 'var(--accent)' }}
            />
            <span style={{ color: '#f1f5f9', fontVariantNumeric: 'tabular-nums', fontWeight: 700, minWidth: '160px', textAlign: 'right' }}>
              {t ? `${fmtICT(t)} ICT` : '—'} · {times.length ? `${idx + 1}/${times.length}` : '0'}
            </span>
          </div>
          {snap && (
            <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '8px' }}>
              Showing {view === 'intraday' ? 'Intraday' : 'OI'} captured {fmtICT(snap.ExtractedAt)} ICT
              {snap.expiration_date ? ` · exp ${snap.expiration_date}` : ''}
              {snap.ExtractedAt !== t ? ` (as-of ${fmtICT(t)})` : ''}
            </div>
          )}
        </div>
      </header>

      {loading && <p style={{ color: '#94a3b8' }}>Loading…</p>}
      {err && <p style={{ color: '#ef4444' }}>Error: {err}</p>}
      {!loading && !err && !times.length && (
        <p style={{ color: '#94a3b8' }}>No snapshots for {product.toUpperCase()} on {date || '—'}. Pick another day.</p>
      )}

      {snap && (
        <MetaGrid data={snap} open={open} sdSnap={sdSnap} dteSel={dteSel} onDteSel={setDteSel} />
      )}
      {snap && <DistributionCharts data={snap} viewMode={view} mounted={mounted} />}

      <footer className={styles.footer}>
        <p>CME QuikStrike Data Interceptor — Backtest Replay</p>
      </footer>
    </main>
  );
}
