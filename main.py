import asyncio

import pendulum

from src.config import PRODUCTS
from src.interceptor import CMEInterceptor


async def main():
    # CME maintenance 17:00–18:00 CT — nothing to capture. DST-safe via tz.
    if pendulum.now("America/Chicago").hour == 17:
        print("[skip] CME maintenance window 17:00–18:00 CT")
        return

    for product_key, cfg in PRODUCTS.items():
        if cfg["pid"] is None:
            print(f"[!] Skipping {product_key} — pid not configured")
            continue
        await CMEInterceptor(product=product_key).run()


if __name__ == "__main__":
    asyncio.run(main())
