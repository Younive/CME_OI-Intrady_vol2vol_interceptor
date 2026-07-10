# src/interceptor.py
import asyncio
import os
import re
import json

import pendulum
from playwright.async_api import async_playwright, Response
from playwright_stealth import Stealth

from src.config import PRODUCTS, GCS_BUCKET, GCS_ENABLED, BASE_URL_TEMPLATE
from src.utils.hasher import payload_hash
from src.utils.data_handler import (
    save_data,
    write_frontend_json,
    upload_to_gcs,
    get_stored_hash,
    set_stored_hash,
)


def _in_cloud() -> bool:
    """Cloud Run sets K_SERVICE. Used to skip dev-only local writes
    (timestamped archive + frontend copy) in the cloud, where GCS is the archive
    and the container filesystem is ephemeral."""
    return bool(os.getenv("K_SERVICE"))


class CMEInterceptor:
    def __init__(self, product: str):
        self.product = product
        self.config = PRODUCTS[product]
        self.base_url = BASE_URL_TEMPLATE.format(pid=self.config["pid"])
        self.raw_json = None
        self.current_target = None
        # Set True only once a real 0DTE series is selected. Guards against
        # capturing a far-dated series on off-days and labelling it as 0DTE.
        self.has_0dte = False
        self.expiration_date = None  # ISO date of the selected series (panel truth)

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
            except Exception:
                pass

    def parse_subtitle(self, subtitle):
        """Extracts Vol, Vol Chg, and Future Chg using unique keys."""
        data = {
            "ExtractedVol": None,
            "ExtractedVolChg": None,
            "ExtractedFutureChg": None,
        }
        try:
            vol_match = re.search(r'Vol:</span>\s*([\d.]+)', subtitle)
            if vol_match:
                data["ExtractedVol"] = float(vol_match.group(1))

            vol_chg_match = re.search(r'Vol Chg:</span>\s*<span[^>]*>([\d.+-]+)</span>', subtitle)
            if vol_chg_match:
                data["ExtractedVolChg"] = float(vol_chg_match.group(1))

            future_chg_match = re.search(r'Future Chg:</span>\s*<span[^>]*>([\d.+-]+)</span>', subtitle)
            if future_chg_match:
                data["ExtractedFutureChg"] = float(future_chg_match.group(1))
        except Exception:
            pass
        return data

    def _expiration_date(self):
        """Date parsed from the selected series' panel label — ground truth.
        Only set once a genuine 0DTE series is selected (has_0dte gate)."""
        return self.expiration_date

    def enrich_data(self, data):
        """Adds product/data_type/expiration_date + extracted subtitle fields."""
        data["ExtractedAt"] = pendulum.now("UTC").to_iso8601_string()
        data["product"] = self.product
        data["data_type"] = self.current_target
        data["expiration_date"] = self._expiration_date()
        subtitle = data.get("Subtitle", "")
        data.update(self.parse_subtitle(subtitle))
        return data

    def _persist(self, data):
        """Always write local frontend copy; upload to GCS only when payload changed."""
        data_type = self.current_target
        if not _in_cloud():
            # Dev-only artifacts: timestamped archive + frontend visual copy.
            # On Cloud Run, GCS is the archive — skip (filesystem is ephemeral).
            save_data(data, data_type)
            write_frontend_json(data, self.product, data_type)

        key = f"{self.product}_{data_type}"
        new_hash = payload_hash(data)

        if get_stored_hash(self.product, data_type) == new_hash:
            print(f"[=] No change for {key} — skipping GCS upload")
            return

        if not GCS_ENABLED:
            # Don't record the hash — state means "last uploaded". Recording it
            # here would make the first real upload get skipped as "no change"
            # once GCS is enabled, leaving a gap in bronze.
            print(f"[~] GCS disabled — would upload {key} (state unchanged)")
            return

        upload_to_gcs(data, self.product, data_type, GCS_BUCKET)
        set_stored_hash(self.product, data_type, new_hash)

    async def run(self):
        # use_async() hooks every context/page with full stealth: evasion
        # scripts + CLI-arg patches (blink features) + UA/sec-ch-ua overrides.
        async with Stealth().use_async(async_playwright()) as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            page.on("response", self.handle_response)

            print(f"[1/3] Loading CME QuikStrike ({self.product}, pid={self.config['pid']})...")
            await page.goto(self.base_url, wait_until="domcontentloaded", referer="https://www.cmegroup.com/")
            await asyncio.sleep(10)

            # 1. Ensure 0 DTE
            try:
                await page.mouse.click(0, 0)
                exp_link = page.locator("a[id*='hlExpiration']").first
                await exp_link.click()
                container = page.locator("div[id*='pnlExpirations']")
                await container.wait_for(state="visible")
                links = await container.locator("a").all()
                # Panel labels are "CODE\nDD Mon YYYY" (older layout used
                # "(<1 DTE)" — kept as fallback). 0DTE = expiry equals the
                # current TRADING date: CT date, rolled to the next day from
                # 17:00 CT (Globex reopens 18:00 for the next session).
                ct = pendulum.now("America/Chicago")
                trading_date = ct.date().add(days=1) if ct.hour >= 17 else ct.date()
                candidates = []
                for link in links:
                    text = await link.inner_text()
                    m = re.search(r'\(\s*(<?\s*[\d.]+)\s*DTE\)', text)
                    d = re.search(r'(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})', text)
                    if m:
                        raw = m.group(1).replace(" ", "")
                        dte = 0.0 if raw.startswith("<") else float(raw)
                        exp = trading_date.add(days=int(dte))
                    elif d:
                        exp = pendulum.from_format(d.group(1), "DD MMM YYYY").date()
                        dte = float((exp - trading_date).days)
                    else:
                        continue
                    candidates.append((dte, link, " ".join(text.split()), exp))
                # Only capture a genuine 0DTE (dte == 0). On off-days/holidays the
                # nearest series is days out; capturing it would be mislabelled as
                # today's expiration. No 0DTE → skip capture entirely.
                zero_dte = [c for c in candidates if 0.0 <= c[0] < 1.0]
                if zero_dte:
                    dte, link, text, exp = min(zero_dte, key=lambda c: c[0])
                    await link.click(force=True)
                    self.has_0dte = True
                    self.expiration_date = exp.isoformat()
                    print(f"[*] Selected 0DTE expiry: {text} ({dte} DTE)")
                elif candidates:
                    nearest = min(candidates, key=lambda c: abs(c[0]))
                    print(f"[!] No 0DTE series today (nearest {nearest[2]} = "
                          f"{nearest[0]} DTE) — skipping capture")
                else:
                    print("[!] No DTE expirations found in panel")
                await asyncio.sleep(5)
            except Exception as e:
                print(f"[!] 0 DTE Error: {e}")

            # Can't confirm a 0DTE series → don't capture. Safe default: never
            # persist a wrong-expiration payload to bronze.
            if not self.has_0dte:
                await browser.close()
                print(f"[*] Done ({self.product}) — no 0DTE to capture.")
                return

            # 2. Capture Intraday
            print("[2/3] Capturing Intraday Volume...")
            self.current_target = "intraday"
            self.raw_json = None
            try:
                tab = page.locator(".qs-vtabs a:has-text('Intraday')").first
                if await tab.count() > 0:
                    await tab.click(force=True)
                else:
                    await page.locator(".qs-vtabs a:has-text('Volume')").first.click(force=True)
                    await page.locator(".qs-vtabs a:has-text('Intraday')").first.click(force=True)

                for _ in range(25):
                    if self.raw_json:
                        break
                    await asyncio.sleep(1)
                if self.raw_json:
                    self._persist(self.enrich_data(self.raw_json))
                else:
                    print("[!] Intraday not captured — no XHR intercepted")
            except Exception as e:
                print(f"[!] Intraday Error: {e}")

            # 3. Capture OI
            print("[3/3] Capturing Open Interest...")
            self.current_target = "oi"
            self.raw_json = None
            try:
                tab = page.locator(".qs-vtabs a:has-text('Open Interest')").first
                if await tab.count() > 0:
                    await tab.click(force=True)
                oi_sub = page.locator(".qs-vtabs a:has-text('OI')").first
                if await oi_sub.is_visible():
                    await oi_sub.click(force=True)

                for _ in range(25):
                    if self.raw_json:
                        break
                    await asyncio.sleep(1)

                if self.raw_json:
                    self._persist(self.enrich_data(self.raw_json))
                else:
                    print("[!] OI not captured — no XHR intercepted")
            except Exception as e:
                print(f"[!] OI Error: {e}")

            await browser.close()
            print(f"[*] Done ({self.product}).")
