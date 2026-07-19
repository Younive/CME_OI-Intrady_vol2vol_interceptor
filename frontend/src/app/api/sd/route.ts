import { NextRequest, NextResponse } from 'next/server';
import { secOf, nearestSnap } from '@/lib/snaps';
import { bad, guard, reqProduct } from '@/lib/api';

export async function GET(req: NextRequest) {
  const product = reqProduct(req);
  if (!product) return bad('bad product');
  const at = req.nextUrl.searchParams.get('at') || '';
  const have = req.nextUrl.searchParams.get('have') || '';
  const atSec = secOf(`${at}.json`);
  if (atSec == null) return bad('bad at (HH-MM-SS)');
  return guard('api/sd', async () => NextResponse.json(await nearestSnap(product, atSec, have)));
}
