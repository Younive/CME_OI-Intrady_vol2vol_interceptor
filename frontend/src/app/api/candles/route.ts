import { NextRequest, NextResponse } from 'next/server';
import { todayICT } from '@/lib/backtest';
import { fetchCandles } from '@/lib/candles';
import { bad, guard, reqDate, reqProduct } from '@/lib/api';

export async function GET(req: NextRequest) {
  const product = reqProduct(req);
  if (!product) return bad('bad product');
  const date = reqDate(req);
  if (!date) return bad('bad date (YYYY-MM-DD)');
  const daysRaw = req.nextUrl.searchParams.get('days');
  const days = daysRaw == null ? 6 : Number(daysRaw);
  if (!Number.isInteger(days) || days < 1 || days > 60) return bad('bad days (1-60)');

  return guard('api/candles', async () => {
    const day = await fetchCandles(product, date, days);
    // Cache a past ICT day at the edge, but only a real (non-empty) result — a
    // null/empty is a transient Yahoo miss, not a closed-day fact, so caching it
    // would pin the failure. Short window: Yahoo can revise historical bars.
    const init = date < todayICT() && day?.candles.length
      ? { headers: { 'Cache-Control': 'public, s-maxage=3600, max-age=600' } }
      : undefined;
    return NextResponse.json(day ?? { candles: [], source: 'futures', interval: '5m' }, init);
  });
}
