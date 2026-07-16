import { NextRequest, NextResponse } from 'next/server';
import { PRODUCTS } from '@/lib/backtest';
import { secOf, nearestSnap } from '@/lib/snaps';

export async function GET(req: NextRequest) {
  const product = req.nextUrl.searchParams.get('product') || '';
  const at = req.nextUrl.searchParams.get('at') || '';
  const have = req.nextUrl.searchParams.get('have') || '';

  if (!PRODUCTS.includes(product as never)) {
    return NextResponse.json({ error: 'bad product' }, { status: 400 });
  }
  const atSec = secOf(`${at}.json`);
  if (atSec == null) {
    return NextResponse.json({ error: 'bad at (HH-MM-SS)' }, { status: 400 });
  }

  try {
    return NextResponse.json(await nearestSnap(product, atSec, have));
  } catch (e) {
    console.error('api/sd', e); // detail server-side only
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
