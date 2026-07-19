// Intraday candles from Yahoo Finance v8 chart (no auth, no dependency).
// Server-side only (fetches an external host). Futures first, spot fallback
// (gold only); 5m first, 1h fallback for dates past Yahoo's ~60d 5m history.

import { todayICT } from './backtest';

export interface Candle {
  t: number; // epoch seconds, UTC
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface CandleDay {
  candles: Candle[];
  source: 'futures' | 'spot';
  interval: '5m' | '1h';
}

const FUTURES: Record<string, string> = { gold: 'GC=F', mnq: 'MNQ=F', mes: 'MES=F' };
// ponytail: spot fallback gold-only per spec; mnq/mes have no clean spot twin.
const SPOT: Record<string, string> = { gold: 'XAUUSD=X' };

// Minimal narrowing of the Yahoo v8 chart response (external boundary).
interface YahooChart {
  chart?: {
    result?: {
      timestamp?: number[];
      indicators?: {
        quote?: {
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
        }[];
      };
    }[];
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Per-leg fetch cap and the aggregate budget shared across all fallback legs
// (4 legs × 5s each could otherwise stall a route for 20s).
const PER_LEG_MS = 5000;
const OVERALL_BUDGET_MS = 8000;

async function fetchYahoo(symbol: string, interval: string, period1: number, period2: number, timeoutMs = PER_LEG_MS): Promise<Candle[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?interval=${interval}&period1=${period1}&period2=${period2}`;
  // Abort past the caller-supplied budget so a hung Yahoo doesn't stall the
  // route; abort throws → caller catch.
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  const j = (await r.json()) as YahooChart;
  const res = j.chart?.result?.[0];
  const ts = res?.timestamp ?? [];
  const q = res?.indicators?.quote?.[0] ?? {};
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue; // gap rows
    out.push({ t: ts[i], o: r2(o), h: r2(h), l: r2(l), c: r2(c) });
  }
  return out;
}

// product:date -> day. Only past ICT days are cached (immutable once the day
// closes); today's candles are still growing, so today is re-fetched each call.
const cache = new Map<string, CandleDay>();

// Multi-day candles ending at one ICT calendar day (bucket days are ICT, UTC+7,
// no DST). Fetch spans `days` days before the anchor day → day end; a leg is
// accepted when it returns any candle in the window (the anchor day itself may
// be a closed weekend — the anchor is "today" on the replay page). 5m history
// caps at ~60d, so the 1h leg still covers old dates.
// Legs tried in order: futures 5m → futures 1h → spot 5m → spot 1h.
// null = every leg empty or failed.
export async function fetchCandles(product: string, date: string, days = 6): Promise<CandleDay | null> {
  const key = `${product}:${date}:${days}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const dayStart = new Date(`${date}T00:00:00+07:00`).getTime() / 1000;
  const dayEnd = dayStart + 86400;
  const fetchStart = dayStart - days * 86400;

  const legs: { symbol: string; source: CandleDay['source']; interval: CandleDay['interval'] }[] = [];
  for (const [source, symbol] of [['futures', FUTURES[product]], ['spot', SPOT[product]]] as const) {
    if (!symbol) continue;
    legs.push({ symbol, source, interval: '5m' }, { symbol, source, interval: '1h' });
  }

  const deadline = Date.now() + OVERALL_BUDGET_MS;
  for (const leg of legs) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break; // aggregate budget spent → don't start more legs
    let candles: Candle[];
    try {
      candles = await fetchYahoo(leg.symbol, leg.interval, fetchStart, dayEnd, Math.min(PER_LEG_MS, remaining));
    } catch {
      continue; // dead leg (timeout/HTTP error) → try the next one
    }
    candles = candles.filter((c) => c.t >= fetchStart && c.t < dayEnd);
    if (!candles.length) continue;
    const day: CandleDay = { candles, source: leg.source, interval: leg.interval };
    if (date < todayICT()) cache.set(key, day);
    return day;
  }
  return null;
}
