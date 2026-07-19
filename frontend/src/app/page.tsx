'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import IntradayOiPanel from '@/components/IntradayOiPanel';
import MetaGrid, { DteSel } from '@/components/MetaGrid';
import { fmtICT, todayICT, PRODUCTS, Product, Snapshot } from '@/lib/backtest';
import { ui } from '@/lib/ui';

interface DirLatest {
  snap: Snapshot;
  path: string;
}

const POLL_MS = 60_000;
const DAY_MS = 86_400_000;

// Epoch ms -> "HH-MM-SS" ICT, matching zero-padded blob basenames.
const toICTHMS = (ms: number) => fmtICT(new Date(ms).toISOString()).replace(/:/g, '-');

// "3m ago" style relative label from an ISO timestamp.
const ago = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
};

export default function Home() {
  const [product, setProduct] = useState<Product>('gold');
  const [intraday, setIntraday] = useState<DirLatest | null>(null);
  const [oi, setOi] = useState<DirLatest | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [dteSel, setDteSel] = useState<DteSel>(0.7);
  const [sd, setSd] = useState<DirLatest | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => setMounted(true), []);

  // Ticking clock drives the relative "ago" badge.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // ICT day string; flips at rollover (recomputed as `now` ticks). Primitive
  // dep so the session-open effect re-runs once per new day, not per render.
  const today = todayICT();

  // Latest paths held, in refs so the poll loop reads fresh values without
  // re-subscribing every fetch.
  const intradayPath = useRef('');
  const oiPath = useRef('');
  useEffect(() => {
    intradayPath.current = intraday?.path ?? '';
    oiPath.current = oi?.path ?? '';
  }, [intraday, oi]);

  useEffect(() => {
    let cancelled = false;

    const pull = async (initial: boolean) => {
      // Skip background polls while tab is hidden.
      if (!initial && document.visibilityState !== 'visible') return;
      const q = new URLSearchParams({ product });
      if (!initial) {
        if (intradayPath.current) q.set('intradayHave', intradayPath.current);
        if (oiPath.current) q.set('oiHave', oiPath.current);
      }
      try {
        const r = await fetch(`/api/latest?${q}`);
        const d = await r.json();
        if (cancelled) return;
        if (d.error) { setErr(d.error); return; }
        setErr('');
        // 'empty' = no snapshot today → clear; 'unchanged' = keep; object = set.
        if (d.intraday === 'empty') setIntraday(null);
        else if (d.intraday && d.intraday !== 'unchanged') setIntraday(d.intraday);
        if (d.oi === 'empty') setOi(null);
        else if (d.oi && d.oi !== 'unchanged') setOi(d.oi);
      } catch (e) {
        if (!cancelled) setErr(String(e));
      } finally {
        if (initial && !cancelled) setLoading(false);
      }
    };

    // Reset on product change, then load fresh.
    setIntraday(null);
    setOi(null);
    setSd(null);
    setLoading(true);
    intradayPath.current = '';
    oiPath.current = '';
    pull(true);

    const t = setInterval(() => pull(false), POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [product]);

  // Session open (Yahoo, once per product/day).
  useEffect(() => {
    let cancelled = false;
    setOpen(null);
    fetch(`/api/open?product=${product}&date=${today}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d && !d.error) setOpen(d.open); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [product, today]);

  // Freshest capture across both data types, for the header badge.
  const snaps = [intraday?.snap, oi?.snap].filter((s): s is Snapshot => !!s);
  const freshest = snaps.length
    ? snaps.reduce((a, b) => (a.ExtractedAt > b.ExtractedAt ? a : b))
    : null;
  const hasData = !!(intraday || oi);

  // SD-range snapshot: the one captured when DTE crossed the selected 0.6/0.7.
  // Expiry is fixed for the day (ExtractedAt + DTE·day is constant across
  // captures), so the target time is stable; `have` keeps refetches cheap.
  const sdPath = useRef('');
  useEffect(() => { sdPath.current = sd?.path ?? ''; }, [sd]);
  const freshISO = freshest?.ExtractedAt;
  const freshDTE = freshest?.DTE;
  useEffect(() => {
    if (!freshISO || freshDTE == null) return;
    let cancelled = false;
    const expiry = new Date(freshISO).getTime() + freshDTE * DAY_MS;
    const at = toICTHMS(expiry - dteSel * DAY_MS);
    const q = new URLSearchParams({ product, at });
    if (sdPath.current) q.set('have', sdPath.current);
    fetch(`/api/sd?${q}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d && !d.error) setSd(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [product, dteSel, freshISO, freshDTE]);

  return (
    <main className={ui.main}>
      <header className="mb-8 border-b border-slate-700 pb-4 text-left">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className={ui.title}>{freshest?.Title || 'CME Vol2Vol Dashboard'}</h1>
            <p className="mt-[5px] text-slate-400">Live — newest scraped snapshot</p>
          </div>
          <div className="text-right">
            <div className={`${ui.toggleGroup} mb-[10px]`}>
              {PRODUCTS.map((p) => (
                <button key={p} className={`${ui.toggleBtn} ${product === p ? ui.toggleActive : ''}`} onClick={() => setProduct(p)}>
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
            <span className="mt-[10px] block text-[0.8rem] text-slate-500">
              {freshest
                ? <>🟢 Last capture {fmtICT(freshest.ExtractedAt)} ICT · {ago(freshest.ExtractedAt, now)}</>
                : 'No live snapshot'}
            </span>
          </div>
        </div>
      </header>

      {loading && <p className="text-slate-400">Loading…</p>}
      {err && <p className="text-rose-500">Error: {err}</p>}
      {!loading && !err && !hasData && (
        <p className="text-slate-400">
          No data yet today (ICT) for {product.toUpperCase()} — market may be closed.
          {' '}Browse past days in <Link href="/backtest" className="text-indigo-500">Backtest Replay</Link>.
        </p>
      )}

      {hasData && freshest && (
        <MetaGrid data={freshest} open={open} sdSnap={sd?.snap ?? null} dteSel={dteSel} onDteSel={setDteSel} />
      )}

      {hasData && (
        <IntradayOiPanel intraday={intraday?.snap ?? null} oi={oi?.snap ?? null} mounted={mounted} />
      )}

      <footer className={ui.footer}>
        <p>CME QuikStrike Data Interceptor — Live</p>
      </footer>
    </main>
  );
}
