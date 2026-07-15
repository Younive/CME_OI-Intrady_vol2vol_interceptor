import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { dayPrefix, PRODUCTS, Snapshot } from '@/lib/backtest';

// Local dev: `gcloud auth application-default login`. Vercel: reader SA creds.
const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET || 'oi-intraday-bucket';

async function loadDir(product: string, date: string, dir: 'OI' | 'Intraday'): Promise<Snapshot[]> {
  const [files] = await storage.bucket(BUCKET).getFiles({ prefix: dayPrefix(product, date, dir) });
  const snaps = await Promise.all(
    files.map(async (f) => JSON.parse((await f.download())[0].toString()) as Snapshot)
  );
  // Chronological. ISO-8601 UTC strings sort lexically = by time.
  return snaps.sort((a, b) => a.ExtractedAt.localeCompare(b.ExtractedAt));
}

export async function GET(req: NextRequest) {
  const product = req.nextUrl.searchParams.get('product') || '';
  const date = req.nextUrl.searchParams.get('date') || '';

  if (!PRODUCTS.includes(product as never)) {
    return NextResponse.json({ error: 'bad product' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'bad date (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const [intraday, oi] = await Promise.all([
      loadDir(product, date, 'Intraday'),
      loadDir(product, date, 'OI'),
    ]);
    return NextResponse.json({ intraday, oi });
  } catch (e) {
    console.error('api/snapshots', e); // detail server-side only
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
