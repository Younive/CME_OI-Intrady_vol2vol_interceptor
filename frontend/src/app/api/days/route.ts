import { NextRequest, NextResponse } from 'next/server';
import { listCaptureDays } from '@/lib/snaps';
import { bad, guard, reqProduct } from '@/lib/api';

export async function GET(req: NextRequest) {
  const product = reqProduct(req);
  if (!product) return bad('bad product');
  return guard('api/days', async () => NextResponse.json({ days: await listCaptureDays(product) }));
}
