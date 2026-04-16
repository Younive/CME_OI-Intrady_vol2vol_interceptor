from src.interceptor import CMEInterceptor
import asyncio

if __name__ == "__main__":
    asyncio.run(CMEInterceptor().run())
