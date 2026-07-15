import { NextRequest, NextResponse } from 'next/server';
import { dayPrefix, todayICT, PRODUCTS, Snapshot } from '@/lib/backtest';
import { storage, BUCKET } from '@/lib/gcs';

// Newest snapshot for today's ICT dir. Blob names are zero-padded `HH-MM-SS.json`
// so lexical max = latest. `have` = path the client already holds; if unchanged
// we skip the download entirely (list-only call, near-zero cost).
// 'empty' = no snapshot for today (client should clear); 'unchanged' = newest
// matches `have`, skip download (client keeps what it has). Distinct so the
// client can drop stale data at ICT-midnight rollover instead of holding
// yesterday's snapshot.
type DirLatest = { snap: Snapshot; path: string } | 'empty' | 'unchanged';

async function latestDir(
  product: string,
  dir: 'OI' | 'Intraday',
  have: string,
): Promise<DirLatest> {
  const [files] = await storage.bucket(BUCKET).getFiles({ prefix: dayPrefix(product, todayICT(), dir) });
  if (!files.length) return 'empty';
  const newest = files.reduce((a, b) => (a.name > b.name ? a : b));
  if (newest.name === have) return 'unchanged'; // no download
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
    console.error('api/latest', e); // detail server-side only
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
