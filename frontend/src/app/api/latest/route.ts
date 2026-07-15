import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { dayPrefix, todayICT, PRODUCTS, Snapshot } from '@/lib/backtest';

// Local dev: `gcloud auth application-default login`. Vercel: reader SA creds.
const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET || 'oi-intraday-bucket';

// Newest snapshot for today's ICT dir. Blob names are zero-padded `HH-MM-SS.json`
// so lexical max = latest. `have` = path the client already holds; if unchanged
// we skip the download entirely (list-only call, near-zero cost).
async function latestDir(
  product: string,
  dir: 'OI' | 'Intraday',
  have: string,
): Promise<{ snap: Snapshot; path: string } | null> {
  const [files] = await storage.bucket(BUCKET).getFiles({ prefix: dayPrefix(product, todayICT(), dir) });
  if (!files.length) return null;
  const newest = files.reduce((a, b) => (a.name > b.name ? a : b));
  if (newest.name === have) return null; // unchanged — no download
  const snap = JSON.parse((await newest.download())[0].toString()) as Snapshot;
  return { snap, path: newest.name };
}

export async function GET(req: NextRequest) {
  const product = req.nextUrl.searchParams.get('product') || '';
  const intradayHave = req.nextUrl.searchParams.get('intradayHave') || '';
  const oiHave = req.nextUrl.searchParams.get('oiHave') || '';

  if (!PRODUCTS.includes(product as never)) {
    return NextResponse.json({ error: 'bad product' }, { status: 400 });
  }

  try {
    const [intraday, oi] = await Promise.all([
      latestDir(product, 'Intraday', intradayHave),
      latestDir(product, 'OI', oiHave),
    ]);
    return NextResponse.json({ intraday, oi });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
