// Server-side GCS snapshot lookups shared by API routes.
import type { File } from '@google-cloud/storage';
import { dayPrefix, todayICT, MONTHS, Snapshot } from '@/lib/backtest';
import { storage, BUCKET } from '@/lib/gcs';

// Download + parse one snapshot blob.
export const downloadSnap = async (f: File): Promise<Snapshot> =>
  JSON.parse((await f.download())[0].toString()) as Snapshot;

// All ICT days with captured data for a product, ascending YYYY-MM-DD. One
// names-only bucket listing; day parsed from raw/<product>/<Y>/<Month>/<D>/….
export async function listCaptureDays(product: string): Promise<string[]> {
  const [files] = await storage.bucket(BUCKET).getFiles({ prefix: `raw/${product}/` });
  const days = new Set<string>();
  for (const f of files) {
    const m = f.name.match(/^raw\/[^/]+\/(\d{4})\/([A-Za-z]+)\/(\d{2})\//);
    if (!m) continue;
    const month = MONTHS.indexOf(m[2]) + 1;
    if (!month) continue;
    days.add(`${m[1]}-${String(month).padStart(2, '0')}-${m[3]}`);
  }
  return Array.from(days).sort();
}

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
    return { snap: await downloadSnap(best), path: best.name };
  }
  return null;
}

// Newest blob in today's ICT dir — list only, no download. Blob names are
// zero-padded HH-MM-SS.json so lexical max = latest. Callers that only need the
// identity (ETag, change check) avoid paying for the body.
export async function latestFile(product: string, dir: 'OI' | 'Intraday'): Promise<File | null> {
  const [files] = await storage.bucket(BUCKET).getFiles({ prefix: dayPrefix(product, todayICT(), dir) });
  return files.length ? files.reduce((a, b) => (a.name > b.name ? a : b)) : null;
}

// Today's newest snapshot from the first dir that has one (default: Intraday
// preferred, OI fallback). One download.
export async function latestSnap(
  product: string,
  dirs: readonly ('OI' | 'Intraday')[] = ['Intraday', 'OI'],
): Promise<Snapshot | null> {
  for (const dir of dirs) {
    const f = await latestFile(product, dir);
    if (f) return downloadSnap(f);
  }
  return null;
}
