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
    // Not edge-cached: snapshots are built from incrementally-published GCS blobs
    // with no day-complete manifest, so a past-date response can't be proven whole
    // (a rollover-straggler upload lands after the day flips to "past"; a mid-day
    // scraper crash leaves a partial day). Cache only once the publisher emits a
    // completeness signal. candles/open cache instead — Yahoo serves a whole past
    // day or nothing, which is that signal.
    return NextResponse.json({ intraday, oi });
  });
}
