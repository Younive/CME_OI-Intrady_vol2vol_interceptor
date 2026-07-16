// Server-side GCS snapshot lookups shared by API routes.
import { dayPrefix, todayICT, Snapshot } from '@/lib/backtest';
import { storage, BUCKET } from '@/lib/gcs';

// Blob basename "HH-MM-SS.json" -> seconds-of-day, for nearest-time matching.
export const secOf = (name: string): number | null => {
  const m = name.match(/(\d{2})-(\d{2})-(\d{2})\.json$/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
};

// Today's snapshot captured nearest `atSec` (the time DTE crossed 0.6/0.7).
// Prefers Intraday, falls back to OI. `have` short-circuits the download.
export async function nearestSnap(product: string, atSec: number, have: string) {
  for (const dir of ['Intraday', 'OI'] as const) {
    const [files] = await storage.bucket(BUCKET).getFiles({ prefix: dayPrefix(product, todayICT(), dir) });
    if (!files.length) continue;
    let best = files[0];
    let bestDiff = Infinity;
    for (const f of files) {
      const s = secOf(f.name);
      if (s == null) continue;
      const d = Math.abs(s - atSec);
      if (d < bestDiff) { bestDiff = d; best = f; }
    }
    if (bestDiff === Infinity) continue; // no valid snapshot-named blobs in this dir
    if (best.name === have) return null; // unchanged — no download
    const snap = JSON.parse((await best.download())[0].toString()) as Snapshot;
    return { snap, path: best.name };
  }
  return null;
}

// Today's newest snapshot, Intraday preferred, OI fallback. Blob names are
// zero-padded HH-MM-SS.json so lexical max = latest. One download.
export async function latestSnap(product: string): Promise<Snapshot | null> {
  for (const dir of ['Intraday', 'OI'] as const) {
    const [files] = await storage.bucket(BUCKET).getFiles({ prefix: dayPrefix(product, todayICT(), dir) });
    if (!files.length) continue;
    const newest = files.reduce((a, b) => (a.name > b.name ? a : b));
    return JSON.parse((await newest.download())[0].toString()) as Snapshot;
  }
  return null;
}
