import { NextRequest, NextResponse } from 'next/server';
import { todayICT, Snapshot } from '@/lib/backtest';
import { downloadSnap, latestFile } from '@/lib/snaps';
import { bad, cors, guard, hasKey, reqProduct } from '@/lib/api';

// Public, key-guarded feed for external clients: today's newest full Intraday
// and OI snapshots for one product. Contract is versioned and stable — the
// webapp's /api/latest keeps its own polling-tuned shape ('empty'/'unchanged').
type Latest = { path: string; snap: Snapshot } | null;

export async function GET(req: NextRequest) {
  if (!hasKey(req)) return cors(bad('unauthorized', 401));
  const product = reqProduct(req);
  if (!product) return cors(bad('bad product'));

  // cors() wraps the guard too, so the 500 path carries the headers as well.
  return cors(await guard('api/v1/latest', async () => {
    const [iFile, oFile] = await Promise.all([
      latestFile(product, 'Intraday'),
      latestFile(product, 'OI'),
    ]);
    // Blob paths change only when a new capture lands, so they are the whole
    // cache identity — a matching If-None-Match skips both downloads.
    const etag = `"${iFile?.name ?? ''}|${oFile?.name ?? ''}"`;
    if (req.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }

    const load = async (f: typeof iFile): Promise<Latest> =>
      f ? { path: f.name, snap: await downloadSnap(f) } : null;
    const [intraday, oi] = await Promise.all([load(iFile), load(oFile)]);

    return NextResponse.json(
      { product, day: todayICT(), intraday, oi },
      { headers: { ETag: etag, 'Cache-Control': 'no-cache' } },
    );
  }));
}

export const OPTIONS = () => cors(new NextResponse(null, { status: 204 }));
