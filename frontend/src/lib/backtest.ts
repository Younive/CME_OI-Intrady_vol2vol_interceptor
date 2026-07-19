// Shared types + helpers for the backtest replay view.

export interface DataPoint {
  x: number;
  y: number;
}

// Vertical dashed line from the scraped chart (e.g. "25ΔP", "Future: 4830.2").
export interface PlotLine {
  value: number;
  color?: string;
  dashStyle?: string;
  label?: { text?: string };
}

// Shaded x-band (±1/2/3 SD region). Nested from widest to narrowest.
export interface PlotBand {
  from: number;
  to: number;
  color?: string;
}

// One xrange segment: a single SD move (up or down) at level Tag.Range (1/2/3).
export interface RangeEntry {
  x: number;
  x2: number;
  Tag?: { Range?: number };
}

export interface Snapshot {
  ValueName: string;
  Call: { data: DataPoint[] };
  Put: { data: DataPoint[] };
  VolSettle: { data: DataPoint[] };
  FuturePrice: number;
  ExtractedFutureChg?: number;
  ExtractedVol?: number;
  ExtractedVolChg?: number;
  ATMVol: number;
  DTE?: number; // fraction of a day until expiry; decays through the session
  PlotLines?: PlotLine[];
  PlotBands?: PlotBand[];
  Ranges?: { data: RangeEntry[] };
  ExtractedAt: string; // ISO-8601 UTC, e.g. "2026-07-07T03:55:16.438264Z"
  expiration_date?: string;
  Title: string;
  Subtitle: string;
}

// One SD level's move sizes, both sides (asymmetric). down/up are point moves,
// not prices — anchor them to a chosen price (open) per feature spec.
export interface RangeMove {
  level: number;
  down: number;
  up: number;
}

// Scraped SD moves per level (±1/2/3 SD), from the Ranges xrange series. Each
// Ranges entry is one SD *ring* (the band between adjacent levels), so down/up
// are accumulated into total move from center to level N. Side = segment
// midpoint vs future; size = |x2 − x|. Callers anchor with a price ± move.
export function rangeMoves(snap: Snapshot): RangeMove[] {
  const r = snap.Ranges?.data;
  if (!r || !snap.FuturePrice) return [];
  const byLevel = new Map<number, { down: number; up: number }>();
  for (const e of r) {
    const lvl = e.Tag?.Range;
    if (!lvl) continue;
    const size = Math.abs(e.x2 - e.x);
    const cur = byLevel.get(lvl) ?? { down: 0, up: 0 };
    if ((e.x + e.x2) / 2 < snap.FuturePrice) cur.down += size;
    else cur.up += size;
    byLevel.set(lvl, cur);
  }
  let down = 0;
  let up = 0;
  return [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, m]) => {
      down += m.down;
      up += m.up;
      return { level, down, up };
    });
}

// Anchor ± cumulative SD moves -> flat price levels ("sd1dn"/"sd1up"/…),
// the shape the MT5 EA feed (/api/ea) serves.
export function sdLevels(anchor: number, moves: RangeMove[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of moves) {
    out[`sd${m.level}dn`] = Math.round((anchor - m.down) * 100) / 100;
    out[`sd${m.level}up`] = Math.round((anchor + m.up) * 100) / 100;
  }
  return out;
}

// Top-n strikes by summed call+put OI, sorted by strike — the S/R levels the
// MT5 EA feed serves as flat oi1..oiN keys.
export function topOiStrikes(snap: Snapshot, n = 8): number[] {
  const sum = new Map<number, number>();
  for (const d of [...snap.Call.data, ...snap.Put.data]) {
    sum.set(d.x, (sum.get(d.x) ?? 0) + d.y);
  }
  return [...sum.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([x]) => x)
    .sort((a, b) => a - b);
}


// Snapshot whose DTE is closest to target (0.6 / 0.7). null if none carry DTE.
export function nearestDTE(snaps: Snapshot[], target: number): Snapshot | null {
  let best: Snapshot | null = null;
  let bestDiff = Infinity;
  for (const s of snaps) {
    if (s.DTE == null) continue;
    const d = Math.abs(s.DTE - target);
    if (d < bestDiff) { bestDiff = d; best = s; }
  }
  return best;
}

export interface DaySnapshots {
  intraday: Snapshot[];
  oi: Snapshot[];
}

export const PRODUCTS = ['gold', 'mnq', 'mes'] as const;
export type Product = (typeof PRODUCTS)[number];

// UTC ISO -> "HH:MM:SS" in ICT (Asia/Bangkok), matching bucket path tz.
// Isomorphic (plain Intl) — works server- and client-side.
export const fmtICT = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(iso));

// Today's calendar date in ICT as YYYY-MM-DD (bucket paths are ICT days).
export const todayICT = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

// UTC ISO -> its ICT calendar date as YYYY-MM-DD (the day a replay position
// belongs to; bucket paths are ICT days).
export const ictDate = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(iso));

// The Globex *session* day a UTC ISO belongs to: the session runs 05:00 → 05:00
// ICT, so 00:00–05:00 ICT belongs to the previous calendar day. Shift −5h then
// take the ICT date.
export const sessionDay = (iso: string) =>
  ictDate(new Date(Date.parse(iso) - 5 * 3600 * 1000).toISOString());

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// date = "YYYY-MM-DD" (ICT calendar day — bucket paths are ICT).
// Returns the readable GCS prefix for one product+date+data_type dir.
export function dayPrefix(product: string, date: string, dir: 'OI' | 'Intraday'): string {
  const [y, m, d] = date.split('-');
  return `raw/${product}/${y}/${MONTHS[Number(m) - 1]}/${d}/${dir}/`;
}

// Latest snapshot captured at or before tISO. snaps MUST be sorted ascending by
// ExtractedAt. ISO-8601 UTC ('...Z') strings sort lexically = chronologically.
export function asOf(snaps: Snapshot[], tISO: string): Snapshot | null {
  let r: Snapshot | null = null;
  for (const s of snaps) {
    if (s.ExtractedAt <= tISO) r = s;
    else break;
  }
  return r;
}
