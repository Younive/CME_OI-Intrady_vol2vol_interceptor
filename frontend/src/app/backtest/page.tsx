'use client';

import React, { useEffect, useMemo, useState } from 'react';
import DistributionCharts from '@/components/DistributionCharts';
import MetaGrid, { DteSel } from '@/components/MetaGrid';
import { asOf, nearestDTE, DaySnapshots, fmtICT, todayICT, PRODUCTS, Product } from '@/lib/backtest';
import { ui } from '@/lib/ui';

const EMPTY: DaySnapshots = { intraday: [], oi: [] };

export default function Backtest() {
  const [product, setProduct] = useState<Product>('gold');
  const [date, setDate] = useState('');
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
  const intradaySnap = t ? asOf(day.intraday, t) : null;
  const oiSnap = t ? asOf(day.oi, t) : null;
  const snap = intradaySnap ?? oiSnap;
  // SD reference = the day's snapshot nearest the selected DTE (a fixed daily
  // level, not scrub-dependent). Prefer Intraday, fall back to OI.
  const sdSnap = nearestDTE(day.intraday.length ? day.intraday : day.oi, dteSel);

  return (
    <main className={ui.main}>
      <header className="mb-8 border-b border-slate-700 pb-4 text-left">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className={ui.title}>Backtest Replay</h1>
            <p className="mt-[5px] text-slate-400">Scrub captured OI / Intraday snapshots (as-of time, ICT)</p>
          </div>
          <div className="flex flex-col items-end gap-2.5">
            <div className={ui.toggleGroup}>
              {PRODUCTS.map((p) => (
                <button key={p} className={`${ui.toggleBtn} ${product === p ? ui.toggleActive : ''}`} onClick={() => setProduct(p)}>
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2.5">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-100"
              />
            </div>
          </div>
        </div>

        {/* Scrubber */}
        <div className="mt-6 rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* ︎ = text presentation; the emoji fonts in the sans stack colorize ◀/▶. */}
            <button className={ui.toggleBtn} onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }} disabled={!times.length}>{'◀︎'}</button>
            <button className={ui.toggleBtn} onClick={() => setPlaying((p) => !p)} disabled={times.length < 2}>{playing ? '❚❚' : '▶︎'}</button>
            <button className={ui.toggleBtn} onClick={() => { setPlaying(false); setIdx((i) => Math.min(times.length - 1, i + 1)); }} disabled={!times.length}>{'▶︎▶︎'}</button>
            <input
              type="range"
              min={0}
              max={Math.max(0, times.length - 1)}
              value={idx}
              onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
              disabled={!times.length}
              className="min-w-[200px] flex-1 accent-indigo-500"
            />
            <span className="min-w-[160px] text-right font-mono font-bold tabular-nums text-slate-100">
              {t ? `${fmtICT(t)} ICT` : '—'} · {times.length ? `${idx + 1}/${times.length}` : '0'}
            </span>
          </div>
          {snap && (
            <div className="mt-2 text-[0.8rem] text-slate-500">
              {intradaySnap ? `Intraday captured ${fmtICT(intradaySnap.ExtractedAt)} ICT` : 'No Intraday yet'}
              {' · '}
              {oiSnap ? `OI captured ${fmtICT(oiSnap.ExtractedAt)} ICT` : 'No OI yet'}
              {snap.expiration_date ? ` · exp ${snap.expiration_date}` : ''}
              {` (as-of ${fmtICT(t)})`}
            </div>
          )}
        </div>
      </header>

      {loading && <p className="text-slate-400">Loading…</p>}
      {err && <p className="text-rose-500">Error: {err}</p>}
      {!loading && !err && !times.length && (
        <p className="text-slate-400">No snapshots for {product.toUpperCase()} on {date || '—'}. Pick another day.</p>
      )}

      {snap && (
        <MetaGrid data={snap} open={open} sdSnap={sdSnap} dteSel={dteSel} onDteSel={setDteSel} />
      )}
      {snap && (
        <div className={ui.chartRow}>
          <div>
            <h2 className={ui.sectionTitle}>Intraday Volume</h2>
            {intradaySnap
              ? <DistributionCharts data={intradaySnap} viewMode="intraday" mounted={mounted} />
              : <p className="text-slate-400">No intraday snapshot as of this time.</p>}
          </div>
          <div>
            <h2 className={ui.sectionTitle}>Open Interest</h2>
            {oiSnap
              ? <DistributionCharts data={oiSnap} viewMode="oi" mounted={mounted} />
              : <p className="text-slate-400">No OI snapshot as of this time.</p>}
          </div>
        </div>
      )}

      <footer className={ui.footer}>
        <p>CME QuikStrike Data Interceptor — Backtest Replay</p>
      </footer>
    </main>
  );
}
