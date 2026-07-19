import { NextRequest, NextResponse } from 'next/server';
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
    return NextResponse.json(day ?? { candles: [], source: 'futures', interval: '5m' });
  });
}
