# src/config.py
"""Product definitions and GCS config for the interceptor."""
import os

PRODUCTS = {
    "gold": {
        "pid": 40,
        "quikstrike_name": "Gold (OG|GC)",
        "gcs_prefix": "gold",
    },
    "mnq": {
        "pid": 136,
        "quikstrike_name": "Micro E-mini Nasdaq-100",
        "gcs_prefix": "mnq",
    },
}

DATA_TYPES = ["intraday", "oi"]

GCS_BUCKET = os.getenv("GCS_BUCKET", "vol2vol-bronze-prod")  # update after Terraform apply
GCS_BASE_PATH = "raw"

# Local dev: off (visual-only). VPS/Airflow: set GCS_ENABLED=true in .env.
GCS_ENABLED = os.getenv("GCS_ENABLED", "false").lower() == "true"

# QuikStrike view URL — pid is substituted per product.
BASE_URL_TEMPLATE = (
    "https://cmegroup-tools.quikstrike.net//User/QuikStrikeView.aspx"
    "?pid={pid}&pf=6&viewitemid=IntegratedV2VExpectedRange"
)
