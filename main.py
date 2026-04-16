import asyncio
import json
import re
import os
import pandas as pd
from datetime import datetime
from playwright.async_api import async_playwright, Response
from playwright_stealth import Stealth

# Target Configuration
BASE_URL = "https://cmegroup-tools.quikstrike.net//User/QuikStrikeView.aspx?pid=40&pf=6&viewitemid=IntegratedV2VExpectedRange"
OUTPUT_FILE = "gold_0dte_vol2vol.json"
INTRADAY_DIR = "intraday"

if not os.path.exists(INTRADAY_DIR):
    os.makedirs(INTRADAY_DIR)

class CMEInterceptor:
    def __init__(self):
        self.intercepted_json = None
        self.timestamp = None

    async def handle_response(self, response: Response):
        """Intercepts XHR responses and searches for JSONSettings."""
        if "QuikStrikeView.aspx" in response.url and response.request.resource_type in ["xhr", "fetch"]:
            try:
                text = await response.text()
                if "JSONSettings" in text:
                    print("\n[*] Intercepted response containing JSONSettings")
                    match = re.search(r'"JSONSettings":"({.*?})"', text)
                    if match:
                        json_str = match.group(1).replace('\\"', '"')
                        self.intercepted_json = json.loads(json_str)
                        self.timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        print(f"[+] Successfully parsed JSONSettings at {self.timestamp}")
            except Exception as e:
                pass 

    def parse_subtitle(self, subtitle):
        """Extracts Vol, Vol Chg, and Future Chg from the HTML subtitle string."""
        # Example: ...Vol:</span> 28.72&nbsp;&nbsp;<span style='color:#8C8C8C'>Vol Chg:</span> <span style='color:#008000'>1.44</span>...
        data = {
            "Vol": None,
            "VolChg": None,
            "FutureChg": None
        }
        
        try:
            # Extract Vol
            vol_match = re.search(r'Vol:</span>\s*([\d.]+)', subtitle)
            if vol_match: data["Vol"] = float(vol_match.group(1))
            
            # Extract Vol Chg
            vol_chg_match = re.search(r'Vol Chg:</span>\s*<span[^>]*>([\d.+-]+)</span>', subtitle)
            if vol_chg_match: data["VolChg"] = float(vol_chg_match.group(1))
            
            # Extract Future Chg
            future_chg_match = re.search(r'Future Chg:</span>\s*<span[^>]*>([\d.+-]+)</span>', subtitle)
            if future_chg_match: data["FutureChg"] = float(future_chg_match.group(1))
        except Exception as e:
            print(f"[!] Warning parsing subtitle: {e}")
            
        return data

    async def run(self):
        async with async_playwright() as p:
            print("[1/5] Launching browser...")
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            page = await context.new_page()
            await Stealth().apply_stealth_async(page)
            page.on("response", self.handle_response)

            print(f"[2/5] Navigating to {BASE_URL}...")
            await page.goto(BASE_URL, wait_until="networkidle", referer="https://www.cmegroup.com/")

            print("[3/5] Verifying Product and selecting 0 DTE Expiration...")
            try:
                await page.wait_for_selector(".viewheader", timeout=20000)
                
                expiration_trigger = page.locator("a:has-text('Expiration:')").first
                if await expiration_trigger.count() == 0:
                     expiration_trigger = page.locator("a[id*='hlExpiration']")
                
                await expiration_trigger.click()
                popup_selector = "div[id*='pnlExpirations']"
                await page.wait_for_selector(popup_selector, state="visible", timeout=10000)

                links = await page.locator(f"{popup_selector} a").all()
                target_link = None
                for link in links:
                    title = await link.get_attribute("title") or ""
                    text = await link.inner_text()
                    if re.search(r'\(0(\.\d+)?\s*DTE\)', title) or re.search(r'\(0(\.\d+)?\s*DTE\)', text):
                        target_link = link
                        break

                if target_link:
                    await target_link.click()
                else:
                    refresh_button = page.locator("#refreshButton")
                    if await refresh_button.count() > 0:
                        await refresh_button.click()
            except Exception as e:
                print(f"[!] Error during navigation: {e}")

            print("[*] Waiting for network interception (timeout 45s)...")
            timeout = 45
            while self.intercepted_json is None and timeout > 0:
                await asyncio.sleep(1)
                timeout -= 1

            if self.intercepted_json:
                print("[4/5] Processing intercepted data...")
                self.process_data()
            else:
                print("[!] Failed to intercept JSONSettings within timeout.")

            await browser.close()
            print("[5/5] Script execution finished.")

    def process_data(self):
        try:
            # Add metadata
            self.intercepted_json["ExtractedAt"] = self.timestamp
            
            subtitle = self.intercepted_json.get("Subtitle", "")
            subtitle_data = self.parse_subtitle(subtitle)
            self.intercepted_json.update(subtitle_data)
            
            # Save timestamped file in intraday folder
            file_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"gold_0dte_{file_timestamp}.json"
            filepath = os.path.join(INTRADAY_DIR, filename)
            
            with open(filepath, "w") as f:
                json.dump(self.intercepted_json, f, indent=4)
            print(f"[+] Timestamped data saved to {filepath}")
            
            # Also save to shared frontend location
            shared_path = os.path.join("frontend", "src", "data", "data.json")
            if os.path.exists(os.path.dirname(shared_path)):
                with open(shared_path, "w") as f:
                    json.dump(self.intercepted_json, f, indent=4)
                print(f"[+] Shared frontend data updated: {shared_path}")

            # Basic stats summary
            print(f"\n--- Data Details ---")
            print(f"Date-Time:  {self.timestamp}")
            print(f"FuturePrice: {self.intercepted_json.get('FuturePrice')}")
            print(f"Future Chg:  {self.intercepted_json.get('FutureChg')}")
            print(f"Vol:         {self.intercepted_json.get('Vol')}")
            print(f"Vol Chg:     {self.intercepted_json.get('VolChg')}")
            print(f"ATM Vol:     {self.intercepted_json.get('ATMVol')}")

        except Exception as e:
            print(f"[!] Error processing data: {e}")

if __name__ == "__main__":
    interceptor = CMEInterceptor()
    asyncio.run(interceptor.run())
