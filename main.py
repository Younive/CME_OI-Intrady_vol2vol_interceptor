import asyncio

import pendulum

from src.config import PRODUCTS
from src.interceptor import CMEInterceptor


def _market_closed(ct):
    """CME Globex weekend close: Fri 16:00 CT → Sun 17:00 CT. No session, nothing
    to scrape. ct is a pendulum time in America/Chicago (weekday: Mon=0 … Sun=6)."""
    wd = ct.weekday()
    if wd == 5:                      # Saturday — closed all day
        return True
    if wd == 6 and ct.hour < 17:     # Sunday — before Globex reopen (17:00 CT)
        return True
    if wd == 4 and ct.hour >= 16:    # Friday — after close (16:00 CT)
        return True
    return False


async def main():
    ct = pendulum.now("America/Chicago")

    # CME maintenance 17:00–18:00 CT — nothing to capture. DST-safe via tz.
    if ct.hour == 17:
        print("[skip] CME maintenance window 17:00–18:00 CT")
        return

    if _market_closed(ct):
        print("[skip] CME weekend close (Fri 16:00 → Sun 17:00 CT)")
        return

    for product_key, cfg in PRODUCTS.items():
        if cfg["pid"] is None:
            print(f"[!] Skipping {product_key} — pid not configured")
            continue
        await CMEInterceptor(product=product_key).run()


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "check":
        def mk(dow, hour):
            return pendulum.datetime(2026, 7, 6, hour, tz="America/Chicago").add(days=dow)
        # 2026-07-06 is a Monday (weekday 0).
        assert not _market_closed(mk(0, 12))   # Mon midday — open
        assert not _market_closed(mk(4, 12))   # Fri 12:00 — open
        assert _market_closed(mk(4, 16))       # Fri 16:00 — closed
        assert _market_closed(mk(5, 3))        # Sat — closed
        assert _market_closed(mk(6, 12))       # Sun 12:00 — closed (pre-reopen)
        assert not _market_closed(mk(6, 18))   # Sun 18:00 — reopened
        print("main self-check OK")
    else:
        asyncio.run(main())
