import { describe, expect, it } from 'vitest';
import {
  Snapshot,
  asOf,
  dayPrefix,
  fmtICT,
  nearestDTE,
  rangeMoves,
  todayICT,
} from './backtest';

// Minimal valid Snapshot; override what a test cares about.
const mkSnap = (over: Partial<Snapshot> = {}): Snapshot => ({
  ValueName: 'test',
  Call: { data: [] },
  Put: { data: [] },
  VolSettle: { data: [] },
  FuturePrice: 100,
  ATMVol: 0.1,
  ExtractedAt: '2026-07-15T00:00:00Z',
  Title: 't',
  Subtitle: 's',
  ...over,
});

describe('dayPrefix', () => {
  it('builds the readable GCS prefix', () => {
    expect(dayPrefix('gold', '2026-07-15', 'OI')).toBe('raw/gold/2026/July/15/OI/');
  });
  it('maps single-digit months without off-by-one', () => {
    expect(dayPrefix('mnq', '2026-03-05', 'Intraday')).toBe('raw/mnq/2026/March/05/Intraday/');
  });
});

describe('fmtICT', () => {
  it('formats UTC ISO as HH:MM:SS in ICT (UTC+7), host-tz independent', () => {
    expect(fmtICT('2026-07-07T03:55:16.438264Z')).toBe('10:55:16');
  });
});

describe('todayICT', () => {
  it('returns YYYY-MM-DD', () => {
    expect(todayICT()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('nearestDTE', () => {
  it('picks the snapshot with DTE closest to target', () => {
    const snaps = [0.5, 0.65, 0.9].map((DTE) => mkSnap({ DTE }));
    expect(nearestDTE(snaps, 0.6)?.DTE).toBe(0.65);
  });
  it('returns null when no snapshot carries DTE', () => {
    expect(nearestDTE([mkSnap(), mkSnap()], 0.6)).toBeNull();
  });
  it('returns null for empty input', () => {
    expect(nearestDTE([], 0.6)).toBeNull();
  });
});

describe('rangeMoves', () => {
  it('accumulates per-SD rings into total moves per level, sorted by level', () => {
    // Level-1 rings straddle the future (100): down 90→100, up 100→112.
    // Level-2 rings sit outside: down 80→90, up 112→125.
    const snap = mkSnap({
      Ranges: {
        data: [
          { x: 112, x2: 125, Tag: { Range: 2 } }, // deliberately out of order
          { x: 90, x2: 100, Tag: { Range: 1 } },
          { x: 100, x2: 112, Tag: { Range: 1 } },
          { x: 80, x2: 90, Tag: { Range: 2 } },
        ],
      },
    });
    expect(rangeMoves(snap)).toEqual([
      { level: 1, down: 10, up: 12 },
      { level: 2, down: 20, up: 25 }, // cumulative: level-1 + level-2 ring
    ]);
  });
  it('returns [] when Ranges is absent', () => {
    expect(rangeMoves(mkSnap())).toEqual([]);
  });
});

describe('asOf', () => {
  const snaps = ['2026-07-15T01:00:00Z', '2026-07-15T02:00:00Z'].map((ExtractedAt) =>
    mkSnap({ ExtractedAt }),
  );
  it('returns the latest snapshot at or before t', () => {
    expect(asOf(snaps, '2026-07-15T01:30:00Z')?.ExtractedAt).toBe('2026-07-15T01:00:00Z');
  });
  it('returns null before the first snapshot', () => {
    expect(asOf(snaps, '2026-07-15T00:30:00Z')).toBeNull();
  });
});
