# src/interceptor.py
import asyncio
import re
import json
import os
from playwright.async_api import async_playwright, Response
from playwright_stealth import Stealth
from src.utils.data_handler import save_data

BASE_URL = "https://cmegroup-tools.quikstrike.net//User/QuikStrikeView.aspx?pid=40&pf=6&viewitemid=IntegratedV2VExpectedRange"

class CMEInterceptor:
    def __init__(self):
        self.raw_json = None
        self.current_target = None

    async def handle_response(self, response: Response):
        if "QuikStrikeView.aspx" in response.url and response.request.resource_type in ["xhr", "fetch"]:
            try:
                text = await response.text()
                if "JSONSettings" in text:
                    match = re.search(r'"JSONSettings":"({.*?})"', text)
                    if match:
                        json_str = match.group(1).replace('\\"', '"')
                        data = json.loads(json_str)
                        value_name = data.get("ValueName", "")
                        
                        is_oi = "Open Interest" in value_name or value_name == "OI"
                        is_intraday = "Intraday" in value_name
                        
                        if (self.current_target == "oi" and is_oi) or (self.current_target == "intraday" and is_intraday):
                            self.raw_json = data
                            print(f"[+] Intercepted valid {self.current_target} data ({value_name})")
            except Exception: pass

    async def run(self):
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await Stealth().apply_stealth_async(page)
            page.on("response", self.handle_response)

            print("[1/3] Loading CME QuikStrike...")
            await page.goto(BASE_URL, wait_until="domcontentloaded", referer="https://www.cmegroup.com/")
            await asyncio.sleep(10) # Long wait for initial render

            # 1. Ensure 0 DTE
            try:
                # Close any popups if they exist
                await page.mouse.click(0, 0) 
                
                exp_link = page.locator("a[id*='hlExpiration']").first
                await exp_link.click()
                container = page.locator("div[id*='pnlExpirations']")
                await container.wait_for(state="visible")
                
                links = await container.locator("a").all()
                for link in links:
                    if re.search(r'\(0(\.\d+)?\s*DTE\)', await link.inner_text()):
                        await link.click(force=True)
                        print("[*] 0 DTE Selected")
                        break
                await asyncio.sleep(5)
            except Exception as e: print(f"[!] 0 DTE Error: {e}")

            # 2. Capture Intraday
            print("[2/3] Capturing Intraday Volume...")
            self.current_target = "intraday"
            self.raw_json = None
            try:
                # Look for 'Intraday' tab specifically in the vertical tabs
                # The qs-vtabs container holds the chart toggles
                tab = page.locator(".qs-vtabs a:has-text('Intraday')").first
                if await tab.count() > 0:
                    await tab.click(force=True)
                else:
                    # Fallback to general Volume category first
                    await page.locator(".qs-vtabs a:has-text('Volume')").first.click(force=True)
                    await page.locator(".qs-vtabs a:has-text('Intraday')").first.click(force=True)
                
                for _ in range(25):
                    if self.raw_json: break
                    await asyncio.sleep(1)
                if self.raw_json: save_data(self.raw_json, "intraday")
            except Exception as e: print(f"[!] Intraday Error: {e}")

            # 3. Capture OI
            print("[3/3] Capturing Open Interest...")
            self.current_target = "oi"
            self.raw_json = None
            try:
                # Open Interest tab in qs-vtabs
                tab = page.locator(".qs-vtabs a:has-text('Open Interest')").first
                if await tab.count() > 0:
                    await tab.click(force=True)
                
                # Check for sub-tab 'OI' if 'Open Interest' only selected category
                oi_sub = page.locator(".qs-vtabs a:has-text('OI')").first
                if await oi_sub.is_visible():
                    await oi_sub.click(force=True)

                for _ in range(25):
                    if self.raw_json: break
                    await asyncio.sleep(1)
                
                if self.raw_json:
                    save_data(self.raw_json, "oi")
                    shared_path = os.path.join("frontend", "src", "data", "data.json")
                    with open(shared_path, "w") as f: json.dump(self.raw_json, f, indent=4)
            except Exception as e: print(f"[!] OI Error: {e}")

            await browser.close()
            print("[*] Done.")
