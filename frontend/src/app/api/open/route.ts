import { NextRequest, NextResponse } from 'next/server';
import { fetchOpen } from '@/lib/open';
import { bad, guard, reqDate, reqProduct } from '@/lib/api';

export async function GET(req: NextRequest) {
  const product = reqProduct(req);
  if (!product) return bad('bad product');
  const date = reqDate(req);
  if (!date) return bad('bad date (YYYY-MM-DD)');
  return guard('api/open', async () => NextResponse.json({ open: await fetchOpen(product, date) }));
}
