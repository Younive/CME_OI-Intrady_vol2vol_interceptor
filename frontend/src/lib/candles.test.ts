import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCandles } from './candles';
import { todayICT } from './backtest';

// Yahoo v8 response for the given rows; null OHLC entries model gap rows.
const yahoo = (rows: { t: number; o: number | null; h?: number | null; l?: number | null; c?: number | null }[]) => ({
  ok: true,
  json: async () => ({
    chart: {
      result: [{
        timestamp: rows.map((r) => r.t),
        indicators: {
          quote: [{
            open: rows.map((r) => r.o),
            high: rows.map((r) => r.h ?? r.o),
            low: rows.map((r) => r.l ?? r.o),
            close: rows.map((r) => r.c ?? r.o),
          }],
        },
      }],
    },
  }),
});

// Epoch seconds at ICT midnight of the given date (ICT day starts 17:00Z prior day).
const dayStart = (date: string) => new Date(`${date}T00:00:00+07:00`).getTime() / 1000;
const DAY = dayStart('2026-07-15');

afterEach(() => vi.unstubAllGlobals());

describe('fetchCandles', () => {
  it('retains prior-day context candles, drops null/gap and out-of-window rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue(yahoo([
      { t: DAY - 7 * 86400, o: 1 },  // before the 6-day window → filtered
      { t: DAY - 2 * 86400, o: 3390 }, // prior day, in window → kept
      { t: DAY + 300, o: 3401.123 },   // replay day → kept
      { t: DAY + 600, o: null },       // gap row → dropped
      { t: DAY + 900, o: 3402 },
      { t: DAY + 86400, o: 9 },        // next day → filtered
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const day = await fetchCandles('gold', '2026-07-15');
    expect(day).toEqual({
      source: 'futures',
      interval: '5m',
      candles: [
        { t: DAY - 2 * 86400, o: 3390, h: 3390, l: 3390, c: 3390 },
        { t: DAY + 300, o: 3401.12, h: 3401.12, l: 3401.12, c: 3401.12 },
        { t: DAY + 900, o: 3402, h: 3402, l: 3402, c: 3402 },
      ],
    });
    expect(fetchMock.mock.calls[0][0]).toContain('GC%3DF');
    expect(fetchMock.mock.calls[0][0]).toContain('interval=5m');
  });

  it('accepts a leg with only context candles (weekend anchor day)', async () => {
    // Anchor day (e.g. Sunday) has no candles, but the window does → first leg wins.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(yahoo([{ t: dayStart('2026-07-05') - 86400, o: 3300 }])); // GC=F 5m, prior-day only
    vi.stubGlobal('fetch', fetchMock);

    const day = await fetchCandles('gold', '2026-07-05');
    expect(day?.source).toBe('futures');
    expect(day?.interval).toBe('5m');
    expect(day?.candles).toHaveLength(1);
  });

  it('falls through futures 5m → 1h → spot when earlier legs are empty', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(yahoo([]))                          // GC=F 5m empty
      .mockResolvedValueOnce({ ok: false, status: 422 })         // GC=F 1h HTTP error
      .mockResolvedValueOnce(yahoo([{ t: dayStart('2026-07-02') + 60, o: 3400 }])); // XAUUSD=X 5m hit
    vi.stubGlobal('fetch', fetchMock);

    const day = await fetchCandles('gold', '2026-07-02');
    expect(day?.source).toBe('spot');
    expect(day?.interval).toBe('5m');
    expect(fetchMock.mock.calls[2][0]).toContain('XAUUSD%3DX');
  });

  it('returns null when every leg is empty (no spot leg for nq)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(yahoo([]));
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchCandles('nq', '2026-07-04')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2); // NQ=F 5m + 1h only, no spot
  });

  it('caches past dates, never today', async () => {
    const fetchMock = vi.fn().mockResolvedValue(yahoo([{ t: dayStart('2026-07-10') + 60, o: 3400 }]));
    vi.stubGlobal('fetch', fetchMock);

    await fetchCandles('gold', '2026-07-10');
    await fetchCandles('gold', '2026-07-10');
    expect(fetchMock).toHaveBeenCalledTimes(1); // second call served from cache

    const today = todayICT();
    const todayMock = vi.fn().mockResolvedValue(yahoo([{ t: Math.floor(Date.now() / 1000) - 60, o: 3400 }]));
    vi.stubGlobal('fetch', todayMock);
    await fetchCandles('gold', today);
    await fetchCandles('gold', today);
    expect(todayMock).toHaveBeenCalledTimes(2); // today re-fetched each call
  });
});
