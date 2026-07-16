// Session open from Yahoo Finance v8 chart (no auth, no dependency).
// Server-side only (fetches an external host).

export const TICKER: Record<string, string> = { gold: 'GC=F', mnq: 'MNQ=F', mes: 'MES=F' };

// Minimal narrowing of the Yahoo v8 chart response (external boundary).
interface YahooChart {
  chart?: {
    result?: {
      timestamp?: number[];
      indicators?: { quote?: { open?: (number | null)[] }[] };
    }[];
  };
}

// product:date -> open. Only real opens are cached (immutable once the session
// opens). A null (candle not published yet, or Yahoo hiccup) is NOT cached, so
// today's open recovers on a later poll instead of sticking at "—" all session.
// ponytail: weekends/holidays re-hit Yahoo each call; cheap + rare, no TTL needed.
const cache = new Map<string, number>();

export async function fetchOpen(product: string, date: string): Promise<number | null> {
  const key = `${product}:${date}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  // Window a few days around `date` so we always capture its daily candle.
  // Times are UTC epoch seconds.
  const day = new Date(`${date}T00:00:00Z`).getTime() / 1000;
  const period1 = Math.floor(day - 4 * 86400);
  const period2 = Math.floor(day + 2 * 86400);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${TICKER[product]}`
    + `?interval=1d&period1=${period1}&period2=${period2}`;

  // 5s cap so a hung Yahoo doesn't stall the route; abort throws → GET catch.
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  const j = (await r.json()) as YahooChart;
  const res = j.chart?.result?.[0];
  const ts = res?.timestamp ?? [];
  const opens = res?.indicators?.quote?.[0]?.open ?? [];

  // Pick the candle whose UTC trade-date equals `date`.
  let open: number | null = null;
  for (let i = 0; i < ts.length; i++) {
    const o = opens[i];
    if (o != null && new Date(ts[i] * 1000).toISOString().slice(0, 10) === date) {
      open = Math.round(o * 100) / 100;
      break;
    }
  }
  if (open != null) cache.set(key, open);
  return open;
}
