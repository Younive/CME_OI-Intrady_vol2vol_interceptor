import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { hasKey, eaAuthed } from './api';

// Only the auth branch is covered — it must never silently open up.
const req = (key?: string) =>
  new NextRequest('http://x/api/v1/latest?product=gold', {
    headers: key == null ? {} : { 'x-api-key': key },
  });

afterEach(() => { delete process.env.API_KEY; delete process.env.EA_API_KEY; });

describe('hasKey', () => {
  it('fails closed when API_KEY is unset', () => {
    expect(hasKey(req('anything'))).toBe(false);
  });

  it('rejects a wrong or missing header', () => {
    process.env.API_KEY = 'secret';
    expect(hasKey(req('wrong'))).toBe(false);
    expect(hasKey(req())).toBe(false);
  });

  it('accepts the matching header', () => {
    process.env.API_KEY = 'secret';
    expect(hasKey(req('secret'))).toBe(true);
  });
});

// EA gate is opt-in (open until EA_API_KEY set) and accepts header OR ?key=.
const eaReq = (opts: { header?: string; query?: string }) =>
  new NextRequest(
    `http://x/api/ea?product=gold${opts.query == null ? '' : `&key=${opts.query}`}`,
    { headers: opts.header == null ? {} : { 'x-api-key': opts.header } },
  );

describe('eaAuthed', () => {
  it('stays open when EA_API_KEY is unset', () => {
    expect(eaAuthed(eaReq({}))).toBe(true);
  });

  it('rejects wrong header and wrong query when set', () => {
    process.env.EA_API_KEY = 'secret';
    expect(eaAuthed(eaReq({}))).toBe(false);
    expect(eaAuthed(eaReq({ header: 'wrong' }))).toBe(false);
    expect(eaAuthed(eaReq({ query: 'wrong' }))).toBe(false);
  });

  it('accepts matching header or query when set', () => {
    process.env.EA_API_KEY = 'secret';
    expect(eaAuthed(eaReq({ header: 'secret' }))).toBe(true);
    expect(eaAuthed(eaReq({ query: 'secret' }))).toBe(true);
  });
});
