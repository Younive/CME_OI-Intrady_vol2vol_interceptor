// Shared API-route guards. Every route validates the same params and wraps the
// same try/catch, so this is the one place that shape lives.
import { NextRequest, NextResponse } from 'next/server';
import { PRODUCTS } from '@/lib/backtest';

export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Validated `product` query param, or null (caller → `bad('bad product')`).
export function reqProduct(req: NextRequest): string | null {
  const p = req.nextUrl.searchParams.get('product') || '';
  return PRODUCTS.includes(p as never) ? p : null;
}

// Validated `date` query param (YYYY-MM-DD), or null.
export function reqDate(req: NextRequest): string | null {
  const d = req.nextUrl.searchParams.get('date') || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

// Run a route body; log + 500 on throw (detail stays server-side).
export async function guard(tag: string, fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    console.error(tag, e);
    return bad('internal error', 500);
  }
}
