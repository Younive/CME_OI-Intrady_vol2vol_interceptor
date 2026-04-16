import asyncio
import json
import re
import pandas as pd
from playwright.async_api import async_playwright, Response
from playwright_stealth import Stealth

# Target Configuration
BASE_URL = "https://cmegroup-tools.quikstrike.net//User/QuikStrikeView.aspx?pid=40&pf=6&viewitemid=IntegratedV2VExpectedRange"
OUTPUT_FILE = "gold_0dte_vol2vol.json"

class CMEInterceptor:
    def __init__(self):
        self.intercepted_json = None

    async def handle_response(self, response: Response):
        """Intercepts XHR responses and searches for JSONSettings."""
        if "QuikStrikeView.aspx" in response.url and response.request.resource_type in ["xhr", "fetch"]:
            try:
                text = await response.text()
                if "JSONSettings" in text:
                    print("\n[*] Intercepted response containing JSONSettings")
                    # Use Regex to extract the JSONSettings object
                    match = re.search(r'"JSONSettings":"({.*?})"', text)
                    if match:
                        json_str = match.group(1).replace('\\"', '"')
                        self.intercepted_json = json.loads(json_str)
                        print("[+] Successfully parsed JSONSettings")
            except Exception as e:
                pass 

    async def run(self):
        async with async_playwright() as p:
            print("[1/5] Launching browser...")
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            page = await context.new_page()
            
            # Use Stealth class directly
            await Stealth().apply_stealth_async(page)

            # Attach response listener
            page.on("response", self.handle_response)

            print(f"[2/5] Navigating to {BASE_URL}...")
            # Use cmegroup.com as referer to bypass null referrer check
            await page.goto(BASE_URL, wait_until="networkidle", referer="https://www.cmegroup.com/")

            # Phase 2: UI Configuration (Product & Expiration)
            print("[3/5] Verifying Product and selecting 0 DTE Expiration...")
            
            # 1. Product Verification (Gold)
            try:
                # Wait for the header to appear
                await page.wait_for_selector(".viewheader", timeout=20000)
                header_text = await page.inner_text(".viewheader")
                print(f"[*] Current Header: {header_text.strip()}")
            except Exception as e:
                print(f"[!] Warning during product verification: {e}")

            # 2. Expiration Selection (0 DTE)
            try:
                # Trigger dropdown
                expiration_trigger = page.locator("a:has-text('Expiration:')").first
                if await expiration_trigger.count() == 0:
                     expiration_trigger = page.locator("a[id*='hlExpiration']")
                
                await expiration_trigger.click()
                print("[*] Expiration dropdown clicked")

                # Wait for the popup
                popup_selector = "div[id*='pnlExpirations']"
                await page.wait_for_selector(popup_selector, state="visible", timeout=10000)

                # Find 0 DTE link using regex
                links = await page.locator(f"{popup_selector} a").all()
                target_link = None
                for link in links:
                    title = await link.get_attribute("title") or ""
                    text = await link.inner_text()
                    # Pattern: (0 DTE) or (0.12 DTE)
                    if re.search(r'\(0(\.\d+)?\s*DTE\)', title) or re.search(r'\(0(\.\d+)?\s*DTE\)', text):
                        target_link = link
                        print(f"[+] Found 0 DTE link: {text} / {title}")
                        break

                if target_link:
                    await target_link.click()
                    print("[*] 0 DTE link clicked, waiting for response...")
                else:
                    print("[!] 0 DTE link not found. Attempting to click Refresh if already on 0 DTE...")
                    refresh_button = page.locator("#refreshButton")
                    if await refresh_button.count() > 0:
                        await refresh_button.click()
            except Exception as e:
                print(f"[!] Error during expiration selection: {e}")

            # Wait for interception to complete
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
            # Save raw JSON
            with open(OUTPUT_FILE, "w") as f:
                json.dump(self.intercepted_json, f, indent=4)
            print(f"[+] Full JSON saved to {OUTPUT_FILE}")

            # Extract data from root
            calls = self.intercepted_json.get("Call", {}).get("data", [])
            puts = self.intercepted_json.get("Put", {}).get("data", [])
            vol_settle = self.intercepted_json.get("VolSettle", {}).get("data", [])
            future_price = self.intercepted_json.get("FuturePrice")

            print(f"[*] Future Price: {future_price}")

            # Helper to create clean DataFrame
            def to_df(data, col_name):
                if not data:
                    return pd.DataFrame(columns=['Strike', col_name])
                return pd.DataFrame(data).rename(columns={'y': col_name, 'x': 'Strike'})[['Strike', col_name]]

            df_calls = to_df(calls, 'Call_Vol')
            df_puts = to_df(puts, 'Put_Vol')
            df_vol = to_df(vol_settle, 'IV_Settle')
            
            # Merge all on Strike
            df_merged = pd.merge(df_calls, df_puts, on='Strike', how='outer')
            df_merged = pd.merge(df_merged, df_vol, on='Strike', how='outer')
            
            # Sort by Strike
            df_merged = df_merged.sort_values('Strike')

            # Display head
            print("\n--- Intercepted Data (Sample) ---")
            print(df_merged.head(20).to_string())

            # Save to CSV
            df_merged.to_csv("gold_0dte_vol2vol.csv", index=False)
            print("\n[+] Tabular data saved to gold_0dte_vol2vol.csv")

        except Exception as e:
            print(f"[!] Error processing data: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    interceptor = CMEInterceptor()
    asyncio.run(interceptor.run())
