import { NextRequest, NextResponse } from 'next/server';
import { rangeMoves, sdLevels, topOiStrikes, fmtICT, todayICT } from '@/lib/backtest';
import { fetchOpen } from '@/lib/open';
import { secOf, nearestSnap, latestSnap } from '@/lib/snaps';
import { bad, guard, reqProduct } from '@/lib/api';

const DAY_MS = 86_400_000;
// sdSnap's DTE must sit near the target: above = cross hasn't happened yet
// today; far below = nearest blob is the previous contract's dying tail
// (today's ICT day starts with the prior contract's last captures).
const DTE_TOL = 0.05;

// Flat, MQL5-friendly feed for the MT5 EA: today's 0.6/0.7-DTE SD levels
// anchored to the session open, plus the latest CME future price so the EA
// can offset levels onto broker (spot/CFD) prices.
export async function GET(req: NextRequest) {
  const product = reqProduct(req);
  if (!product) return bad('bad product');
  const dte = Number(req.nextUrl.searchParams.get('dte') || '0.6');
  if (!(dte > 0 && dte < 1)) return bad('bad dte (0..1)');

  return guard('api/ea', async () => {
    const latest = await latestSnap(product);
    if (!latest) return NextResponse.json({ ok: false, reason: 'no-data' });
    if (latest.DTE == null) return NextResponse.json({ ok: false, reason: 'no-sd' });

    // Expiry is fixed for the day (ExtractedAt + DTE·day is constant across
    // captures) — same math as the homepage SD card.
    const expiryMs = new Date(latest.ExtractedAt).getTime() + latest.DTE * DAY_MS;
    const atSec = secOf(`${fmtICT(new Date(expiryMs - dte * DAY_MS).toISOString()).replace(/:/g, '-')}.json`);
    const sdRes = atSec == null ? null : await nearestSnap(product, atSec, '');
    // Nearest-time matching degenerates to a wrong-DTE snapshot around the
    // edges — refuse to serve levels off it.
    if (!sdRes || sdRes.snap.DTE == null || Math.abs(sdRes.snap.DTE - dte) > DTE_TOL) {
      return NextResponse.json({ ok: false, reason: 'no-sd' });
    }

    const moves = rangeMoves(sdRes.snap);
    if (!moves.length) return NextResponse.json({ ok: false, reason: 'no-sd' });

    const [anchor, oiSnap] = await Promise.all([
      fetchOpen(product, todayICT()),
      latestSnap(product, ['OI']), // OI strikes act as S/R for the EA
    ]);
    if (anchor == null) return NextResponse.json({ ok: false, reason: 'no-open' });

    const oi = oiSnap ? topOiStrikes(oiSnap) : [];
    return NextResponse.json({
      ok: true,
      product,
      dteTarget: dte,
      dteActual: sdRes.snap.DTE,
      anchor,
      ...sdLevels(anchor, moves),
      atmVol: sdRes.snap.ATMVol,
      ...Object.fromEntries(oi.map((s, i) => [`oi${i + 1}`, s])),
      futurePrice: latest.FuturePrice,
      futureAt: latest.ExtractedAt,
      sdAt: sdRes.snap.ExtractedAt,
      day: todayICT(),
    });
  });
}
