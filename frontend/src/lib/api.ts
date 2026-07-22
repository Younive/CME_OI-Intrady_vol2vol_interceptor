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

// Static shared secret for the public v1 feed. Env name is deliberately NOT
// NEXT_PUBLIC_* — that prefix ships the value into the browser bundle. Unset
// env = endpoint disabled (fail closed), so a misconfigured deploy serves 401
// rather than open data.
export const hasKey = (req: NextRequest) =>
  !!process.env.API_KEY && req.headers.get('x-api-key') === process.env.API_KEY;

// EA feed gate. Opt-in: enforced only when EA_API_KEY is set, so the route stays
// open until the EA is configured with the token. Accepts header or query param
// because MQL5 WebRequest custom-header support is uncertain.
// ponytail: query-param key lands in access logs; prefer the header. TLS covers
// the wire either way. Tighten to header-only once EA capability is confirmed.
export function eaAuthed(req: NextRequest): boolean {
  const key = process.env.EA_API_KEY;
  if (!key) return true; // gate off until configured
  return req.headers.get('x-api-key') === key
    || req.nextUrl.searchParams.get('key') === key;
}

// CORS for the public feed. ponytail: single origin env, '*' default —
// allowlist / rate limit only if abuse shows up.
export function cors<T extends NextResponse>(r: T): T {
  r.headers.set('Access-Control-Allow-Origin', process.env.API_CORS_ORIGIN || '*');
  r.headers.set('Access-Control-Allow-Headers', 'x-api-key, if-none-match');
  return r;
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
