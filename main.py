import asyncio

from src.config import PRODUCTS
from src.interceptor import CMEInterceptor


async def main():
    for product_key, cfg in PRODUCTS.items():
        if cfg["pid"] is None:
            print(f"[!] Skipping {product_key} — pid not configured")
            continue
        await CMEInterceptor(product=product_key).run()


if __name__ == "__main__":
    asyncio.run(main())
