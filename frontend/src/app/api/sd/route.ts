import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { dayPrefix, todayICT, PRODUCTS, Snapshot } from '@/lib/backtest';

// Local dev: `gcloud auth application-default login`. Vercel: reader SA creds.
const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET || 'oi-intraday-bucket';

// Blob basename "HH-MM-SS.json" -> seconds-of-day, for nearest-time matching.
const secOf = (name: string): number | null => {
  const m = name.match(/(\d{2})-(\d{2})-(\d{2})\.json$/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
};

// Today's snapshot captured nearest `atSec` (the time DTE crossed 0.6/0.7).
// Prefers Intraday, falls back to OI. `have` short-circuits the download.
async function nearestSnap(product: string, atSec: number, have: string) {
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
    if (best.name === have) return null; // unchanged — no download
    const snap = JSON.parse((await best.download())[0].toString()) as Snapshot;
    return { snap, path: best.name };
  }
  return null;
}

export async function GET(req: NextRequest) {
  const product = req.nextUrl.searchParams.get('product') || '';
  const at = req.nextUrl.searchParams.get('at') || '';
  const have = req.nextUrl.searchParams.get('have') || '';

  if (!PRODUCTS.includes(product as never)) {
    return NextResponse.json({ error: 'bad product' }, { status: 400 });
  }
  const atSec = secOf(`${at}.json`);
  if (atSec == null) {
    return NextResponse.json({ error: 'bad at (HH-MM-SS)' }, { status: 400 });
  }

  try {
    return NextResponse.json(await nearestSnap(product, atSec, have));
  } catch (e) {
    console.error('api/sd', e); // detail server-side only
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
