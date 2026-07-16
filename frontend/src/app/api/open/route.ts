import { NextRequest, NextResponse } from 'next/server';
import { PRODUCTS } from '@/lib/backtest';
import { fetchOpen } from '@/lib/open';

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
    return NextResponse.json({ open: await fetchOpen(product, date) });
  } catch (e) {
    console.error('api/open', e); // detail server-side only
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
