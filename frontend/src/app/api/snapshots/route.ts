import { NextRequest, NextResponse } from 'next/server';
import { dayPrefix, Snapshot } from '@/lib/backtest';
import { storage, BUCKET } from '@/lib/gcs';
import { downloadSnap } from '@/lib/snaps';
import { bad, guard, reqDate, reqProduct } from '@/lib/api';

async function loadDir(product: string, date: string, dir: 'OI' | 'Intraday'): Promise<Snapshot[]> {
  const [files] = await storage.bucket(BUCKET).getFiles({ prefix: dayPrefix(product, date, dir) });
  const snaps = await Promise.all(files.map(downloadSnap));
  // Chronological. ISO-8601 UTC strings sort lexically = by time.
  return snaps.sort((a, b) => a.ExtractedAt.localeCompare(b.ExtractedAt));
}

export async function GET(req: NextRequest) {
  const product = reqProduct(req);
  if (!product) return bad('bad product');
  const date = reqDate(req);
  if (!date) return bad('bad date (YYYY-MM-DD)');

  return guard('api/snapshots', async () => {
    const [intraday, oi] = await Promise.all([
      loadDir(product, date, 'Intraday'),
      loadDir(product, date, 'OI'),
    ]);
    return NextResponse.json({ intraday, oi });
  });
}
