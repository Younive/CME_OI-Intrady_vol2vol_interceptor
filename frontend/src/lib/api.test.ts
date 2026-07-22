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

// EA gate is opt-in (open until EA_API_KEY set), header-only (x-api-key).
const eaReq = (header?: string) =>
  new NextRequest('http://x/api/ea?product=gold', {
    headers: header == null ? {} : { 'x-api-key': header },
  });

describe('eaAuthed', () => {
  it('stays open when EA_API_KEY is unset', () => {
    expect(eaAuthed(eaReq('anything'))).toBe(true);
  });

  it('rejects a wrong or missing header when set', () => {
    process.env.EA_API_KEY = 'secret';
    expect(eaAuthed(eaReq())).toBe(false);
    expect(eaAuthed(eaReq('wrong'))).toBe(false);
  });

  it('accepts the matching header when set', () => {
    process.env.EA_API_KEY = 'secret';
    expect(eaAuthed(eaReq('secret'))).toBe(true);
  });
});
