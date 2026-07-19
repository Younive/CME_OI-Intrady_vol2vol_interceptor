'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import IntradayOiPanel from '@/components/IntradayOiPanel';
import MetaGrid, { DteSel } from '@/components/MetaGrid';
import PriceChart from '@/components/PriceChart';
import { BacktestSkeleton } from '@/components/Skeleton';
import { asOf, ictDate, nearestDTE, rangeMoves, sdLevels, sessionDay, DaySnapshots, Snapshot, todayICT, PRODUCTS, Product } from '@/lib/backtest';
import { CandleDay } from '@/lib/candles';
import { ui } from '@/lib/ui';

const EMPTY: DaySnapshots = { intraday: [], oi: [] };

// Inline transport icons (no icon lib): filled shapes, 16×16, currentColor.
const ICON = {
  stepBack: ['M3 3h2v10H3z', 'M13 3v10L6 8z'], // step back (◀)
  play: ['M4 3l9 5-9 5V3z'], // play (▶)
  pause: ['M4 3h3v10H4z', 'M9 3h3v10H9z'], // pause (❚❚)
  stepFwd: ['M11 3h2v10h-2z', 'M3 3l7 5-7 5V3z'], // step forward (▶▶)
};
const Svg = ({ paths, big }: { paths: string[]; big?: boolean }) => (
  <svg viewBox="0 0 16 16" className={big ? 'h-5 w-5' : 'h-4 w-4'} fill="currentColor" aria-hidden="true">
    {paths.map((d, i) => (
      <path key={i} d={d} />
    ))}
  </svg>
);
const ghostBtn =
  'flex items-center justify-center rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400';

// Yahoo keeps ~60 days of 5m candles — older replay has no chart anyway.
const MAX_SPAN_DAYS = 60;

const byExtractedAt = (a: Snapshot, b: Snapshot) =>
  a.ExtractedAt < b.ExtractedAt ? -1 : a.ExtractedAt > b.ExtractedAt ? 1 : 0;

// Intraday-else-OI snapshots for one session day (optionally as-of `upTo`).
function sessionPool(day: DaySnapshots, sessionD: string, upTo?: string): Snapshot[] {
  const f = (s: Snapshot) => sessionDay(s.ExtractedAt) === sessionD && (!upTo || s.ExtractedAt <= upTo);
  const di = day.intraday.filter(f);
  return di.length ? di : day.oi.filter(f);
}

export default function Backtest() {
  const [product, setProduct] = useState<Product>('gold');
  const [day, setDay] = useState<DaySnapshots>(EMPTY); // loaded days, merged + sorted
  const [daysList, setDaysList] = useState<string[]>([]); // all ICT days with captures
  const [loadingDay, setLoadingDay] = useState(''); // day currently being fetched
  const dayCache = useRef(new Map<string, boolean>()); // product:date already loaded
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState(0); // bump → PriceChart repositions its window
  const [scaleDay, setScaleDay] = useState(''); // session the vertical scale is locked to (set on focus)
  const [mounted, setMounted] = useState(false);
  const [dteSel, setDteSel] = useState<DteSel>(0.7);
  const [plotRt, setPlotRt] = useState(false); // plot Realtime range on the candle instead of DTE SD
  const [candleDay, setCandleDay] = useState<CandleDay | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Discover the capture history extent (cheap names-only GCS listing).
  // Full day snapshots load lazily as the replay enters each day.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr('');
    setDay(EMPTY);
    setDaysList([]);
    setCandleDay(null);
    dayCache.current.clear();
    fetch(`/api/days?product=${product}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setErr(d.error);
        else setDaysList(d.days ?? []);
      })
      .catch((e) => !cancelled && setErr(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [product]);

  // Candles spanning the discovered history (today back to the oldest
  // capture day), one request; server falls back 5m→1h→spot.
  useEffect(() => {
    if (!daysList.length) return;
    let cancelled = false;
    const today = todayICT();
    const span = Math.min(
      MAX_SPAN_DAYS,
      Math.max(6, Math.round((Date.parse(today) - Date.parse(daysList[0])) / 86400000) + 1),
    );
    fetch(`/api/candles?product=${product}&date=${today}&days=${span}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d && !d.error) setCandleDay(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [product, daysList]);

  // Bar-replay timeline: every loaded candle (5m steps across all history),
  // as UTC ISO so asOf()'s lexical compare against ExtractedAt keeps working.
  // Fallback: snapshot capture times, so history without price data replays.
  // Split memos keep the array identity stable while lazy day-loads mutate
  // `day` — otherwise the idx-snap effect below would reset the scrub position
  // on every day fetch.
  const candleTimes = useMemo(
    () => (candleDay?.candles ?? []).map((c) => new Date(c.t * 1000).toISOString()),
    [candleDay],
  );
  const snapTimes = useMemo(() => {
    const set = new Set<string>();
    day.intraday.forEach((s) => set.add(s.ExtractedAt));
    day.oi.forEach((s) => set.add(s.ExtractedAt));
    return Array.from(set).sort();
  }, [day]);
  const times = candleTimes.length ? candleTimes : snapTimes;

  // Snap index to the newest step when the timeline length changes (new
  // product/candles) — not on mere identity churn from lazy day merges.
  // Bump focus so the chart positions its window once on this fresh load.
  useEffect(() => { setIdx(times.length ? times.length - 1 : 0); setPlaying(false); setFocus((f) => f + 1); }, [times.length]);

  // Play: advance one step forward ~1.2s, stop at the end.
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

  // The Globex session day (05:00→05:00 ICT) the replay position is in — OPEN
  // and the SD reference are session-scoped anchors and follow it. The current
  // ICT calendar day the scrub sits in (may differ from scrubDay after
  // midnight; snapshots live in ICT-calendar GCS folders).
  const scrubDay = t ? sessionDay(t) : '';
  const calDay = t ? ictDate(t) : '';

  // Lazy day load: a session spans two ICT calendar days (05:00 scrubDay →
  // 05:00 next day), so load both the session day and the scrub's calendar day
  // (deduped) the first time the replay needs each — a day is ~350 blobs / tens
  // of MB, so per-day keeps first paint fast.
  useEffect(() => {
    const wanted = Array.from(new Set([scrubDay, calDay])).filter(
      (dd) => dd && daysList.includes(dd) && !dayCache.current.get(`${product}:${dd}`),
    );
    if (!wanted.length) return;
    let cancelled = false;
    setLoadingDay(wanted[0]);
    Promise.all(
      wanted.map((dd) =>
        fetch(`/api/snapshots?product=${product}&date=${dd}`)
          .then((r) => r.json())
          .then((d) => {
            if (cancelled || !d || d.error) return { intraday: [], oi: [] };
            dayCache.current.set(`${product}:${dd}`, true);
            return { intraday: d.intraday ?? [], oi: d.oi ?? [] };
          })
          .catch(() => ({ intraday: [], oi: [] })),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        setDay((prev) => ({
          intraday: [...prev.intraday, ...results.flatMap((r) => r.intraday)].sort(byExtractedAt),
          oi: [...prev.oi, ...results.flatMap((r) => r.oi)].sort(byExtractedAt),
        }));
      })
      .finally(() => { if (!cancelled) setLoadingDay(''); });
    return () => { cancelled = true; };
  }, [product, scrubDay, calDay, daysList]);

  // Market open of the replayed day = open of the first candle at/after
  // 05:00 ICT (Globex session start after the maintenance break; the rule
  // holds through CDT/CST). +3h guard → weekends/holidays yield null.
  const open = useMemo(() => {
    if (!scrubDay) return null;
    const sessionStart = new Date(`${scrubDay}T05:00:00+07:00`).getTime() / 1000;
    const c = (candleDay?.candles ?? []).find((x) => x.t >= sessionStart);
    return c && c.t <= sessionStart + 3 * 3600 ? c.o : null;
  }, [candleDay, scrubDay]);

  // The vertical scale locks to the session in view at the last focus (load /
  // date-jump). Playing across 05:00 changes scrubDay but not scaleDay, so the
  // scale doesn't rescale mid-playback; a date-jump re-locks it to the new day.
  useEffect(() => {
    if (scrubDay) setScaleDay(scrubDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps — read scrubDay at focus time only
  }, [focus]);

  // SD reference = the session's snapshot nearest the selected DTE, but only
  // as-of the scrub position and only once the session has actually reached
  // that DTE (≤ dteSel). Before then, no SD anchor exists yet → no lines / no
  // card values. Prefer Intraday, fall back to OI.
  const sdSnap = useMemo(() => {
    if (!scrubDay || !t) return null;
    const pool = sessionPool(day, scrubDay, t);
    if (!pool.some((s) => s.DTE != null && s.DTE <= dteSel)) return null;
    return nearestDTE(pool, dteSel);
  }, [day, scrubDay, t, dteSel]);

  // Realtime SD source = the latest snapshot IN the scrub session (≤ t), ungated.
  // In-session (not the global latest) so RT ranges anchor to the same session as
  // `open`; null before the session's first snapshot → no RT lines/rows.
  const rtSnap = useMemo(() => {
    if (!scrubDay || !t) return null;
    const pool = sessionPool(day, scrubDay, t);
    return pool.length ? pool[pool.length - 1] : null;
  }, [day, scrubDay, t]);

  // Chart overlays, memoized so PriceChart effects don't re-run per render.
  // Plot source = the gated DTE snapshot (0.7/0.6) or, when RT is selected, the
  // in-session realtime snapshot — the same source the merged SD card shows.
  const levels = useMemo(() => {
    const src = plotRt ? rtSnap : sdSnap;
    return open != null && src ? sdLevels(open, rangeMoves(src)) : {};
  }, [open, sdSnap, rtSnap, plotRt]);

  // Bar-replay cutoff: candles after the scrub position stay hidden.
  const replayUntil = t ? Date.parse(t) / 1000 : null;

  // Scale open = session open of the LOCKED scale day (not the live scrub day).
  const scaleOpen = useMemo(() => {
    if (!scaleDay) return null;
    const sessionStart = new Date(`${scaleDay}T05:00:00+07:00`).getTime() / 1000;
    const c = (candleDay?.candles ?? []).find((x) => x.t >= sessionStart);
    return c && c.t <= sessionStart + 3 * 3600 ? c.o : null;
  }, [candleDay, scaleDay]);

  // SD prices for the vertical scale ONLY (not plotting): SD levels from *both*
  // the 0.7- and 0.6-DTE snapshots of the LOCKED scale day (ungated), so the
  // range reserves room for either DTE and stays fixed across the 0.7↔0.6
  // toggle and while playing past 05:00 into the next session.
  const scaleVals = useMemo(() => {
    if (!scaleDay || scaleOpen == null) return [];
    const pool = sessionPool(day, scaleDay);
    const vals: number[] = [];
    for (const target of [0.7, 0.6] as const) {
      const snap = nearestDTE(pool, target);
      if (snap) vals.push(...Object.values(sdLevels(scaleOpen, rangeMoves(snap))));
    }
    return vals;
  }, [day, scaleDay, scaleOpen]);

  // Vertical range pinned to the LOCKED scale day: its candles (05:00→05:00 ICT)
  // ∪ both-DTE SD levels ∪ open, ±3% pad. Refits only when scaleDay changes
  // (load / date-jump) — not per step and not when crossing a session boundary.
  const priceRange = useMemo(() => {
    if (!scaleDay) return null;
    const dayStartSec = new Date(`${scaleDay}T05:00:00+07:00`).getTime() / 1000;
    const cs = (candleDay?.candles ?? []).filter((c) => c.t >= dayStartSec && c.t < dayStartSec + 86400);
    // Reduce (not Math.min(...spread)) — a full multi-day candle set can exceed
    // the JS argument-count limit.
    let lo = Infinity;
    let hi = -Infinity;
    const eat = (v: number) => { if (v < lo) lo = v; if (v > hi) hi = v; };
    for (const c of cs) { eat(c.l); eat(c.h); }
    for (const v of scaleVals) eat(v);
    if (scaleOpen != null) eat(scaleOpen);
    if (lo > hi) return null;
    const pad = (hi - lo) * 0.03 || 1;
    return { min: lo - pad, max: hi + pad };
  }, [candleDay, scaleDay, scaleVals, scaleOpen]);

  // OI grid span: the day's OI strike min/max (union of Call+Put strikes across
  // all of the session's OI snapshots). Fixed per session, so the $25 grid on
  // the candlestick covers the OI chart's price range and doesn't shift as
  // replay steps.
  const oiRange = useMemo(() => {
    if (!scrubDay) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of day.oi) {
      if (sessionDay(s.ExtractedAt) !== scrubDay) continue;
      for (const p of [...s.Call.data, ...s.Put.data]) {
        if (p.x < lo) lo = p.x;
        if (p.x > hi) hi = p.x;
      }
    }
    return lo <= hi ? { min: lo, max: hi } : null;
  }, [day, scrubDay]);

  // Implied-Vol path for the RSI-style sparkline: every loaded snapshot's
  // ExtractedVol up to the scrub position (all history, not session-scoped).
  // Prefer Intraday; fall back to OI when no Intraday captures exist.
  const volSeries = useMemo(() => {
    if (!t) return [];
    const pool = day.intraday.length ? day.intraday : day.oi;
    return pool
      .filter((s) => s.ExtractedVol != null && s.ExtractedAt <= t)
      .map((s) => ({ t: Date.parse(s.ExtractedAt) / 1000, v: s.ExtractedVol as number }));
  }, [day, t]);

  const hasSnaps = daysList.length > 0;

  return (
    <main className="flex h-[100dvh] flex-col gap-1 overflow-hidden px-4 py-4 font-sans text-white md:px-8">
      <header className="shrink-0 text-left">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className={ui.title}>Backtest Replay</h1>
            <p className="mt-[5px] text-slate-400">Bar replay across all captured OI / Intraday history (ICT)</p>
          </div>
          <div className="flex flex-col items-end gap-2.5">
            <div className={ui.toggleGroup}>
              {PRODUCTS.map((p) => (
                <button key={p} className={`${ui.toggleBtn} ${product === p ? ui.toggleActive : ''}`} onClick={() => setProduct(p)}>
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
            {/* Jump-to-day: shows the current session day; picking a date moves
                the replay head to that session's start (05:00 ICT) and
                repositions the chart window (timeline unchanged). */}
            <input
              type="date"
              value={scrubDay}
              min={daysList[0] || undefined}
              max={todayICT()}
              onChange={(e) => {
                const d = e.target.value;
                if (!d) return;
                setPlaying(false);
                const target = new Date(`${d}T05:00:00+07:00`).toISOString();
                const i = times.findIndex((x) => x >= target);
                setIdx(i === -1 ? Math.max(0, times.length - 1) : i);
                setFocus((f) => f + 1);
              }}
              disabled={!times.length}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 [color-scheme:dark] hover:border-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </header>

      {loading && !hasSnaps && <BacktestSkeleton />}
      {err && <p className="text-rose-500">Error: {err}</p>}
      {!loading && !err && !hasSnaps && (
        <p className="text-slate-400">No snapshots captured yet for {product.toUpperCase()}.</p>
      )}

      {/* Hero candle (framed, elevated) on the left ~60%; the OI/Intraday
          distributions demoted to a flat right rail (stacked). Stacks to one
          column ≤900px. */}
      {hasSnaps && (
        <div className="flex min-h-0 flex-1 gap-3 max-[900px]:flex-col">
          <div className="min-h-0 flex-[3] overflow-hidden">
            {candleDay && candleDay.candles.length ? (
              <PriceChart
                candles={candleDay.candles}
                source={candleDay.source}
                interval={candleDay.interval}
                replayUntil={replayUntil}
                levels={levels}
                open={open}
                priceRange={priceRange}
                oiRange={oiRange}
                gridStep={product === 'mnq' ? 100 : 25}
                focus={focus}
              />
            ) : (
              <p className="p-4 text-slate-400">No price data.</p>
            )}
          </div>
          <div className="min-h-0 flex-[2]">
            <IntradayOiPanel intraday={intradaySnap} oi={oiSnap} mounted={mounted} fill vertical loading={!!loadingDay} />
          </div>
        </div>
      )}

      {times.length > 0 && (
        <>
          {/* Replay controls (ghost transport buttons) + compact cards, one flat row.
              Step back · play/pause · step forward. */}
          <div className="mt-1 flex shrink-0 flex-wrap items-center gap-1">
            <button aria-label="Step back" className={ghostBtn} onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }} disabled={!times.length}><Svg paths={ICON.stepBack} /></button>
            <button aria-label={playing ? 'Pause' : 'Play'} className={`${ghostBtn} text-slate-200`} onClick={() => setPlaying((p) => !p)} disabled={times.length < 2}><Svg big paths={playing ? ICON.pause : ICON.play} /></button>
            <button aria-label="Step forward" className={ghostBtn} onClick={() => { setPlaying(false); setIdx((i) => Math.min(times.length - 1, i + 1)); }} disabled={!times.length}><Svg paths={ICON.stepFwd} /></button>
            {loadingDay && <span className="ml-1 text-[0.8rem] text-slate-500">loading {loadingDay}…</span>}
            {snap && (
              <div className="ml-2 min-w-[480px] flex-1 max-[900px]:ml-0 max-[900px]:min-w-full">
                <MetaGrid data={snap} open={open} sdSnap={sdSnap} rtSnap={rtSnap} dteSel={dteSel} onDteSel={setDteSel} showPrice={false} compact volSeries={volSeries} plotRt={plotRt} onPlotRt={setPlotRt} />
              </div>
            )}
          </div>
        </>
      )}

      <footer className="shrink-0 border-t border-slate-800 pt-1 text-center text-[0.7rem] text-slate-600">
        CME QuikStrike Data Interceptor — Backtest Replay
      </footer>
    </main>
  );
}
