import { NextRequest, NextResponse } from 'next/server';
import { todayICT } from '@/lib/backtest';
import { fetchOpen } from '@/lib/open';
import { bad, guard, reqDate, reqProduct } from '@/lib/api';

export async function GET(req: NextRequest) {
  const product = reqProduct(req);
  if (!product) return bad('bad product');
  const date = reqDate(req);
  if (!date) return bad('bad date (YYYY-MM-DD)');
  return guard('api/open', async () => {
    const open = await fetchOpen(product, date);
    // Past ICT day's open is fixed — cache it, but only a resolved value. `null`
    // is a transient Yahoo miss, not a closed-day fact; caching it would pin the
    // failure for the whole window.
    const init = date < todayICT() && open != null
      ? { headers: { 'Cache-Control': 'public, s-maxage=86400, max-age=3600' } }
      : undefined;
    return NextResponse.json({ open }, init);
  });
}
