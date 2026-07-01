# src/utils/data_handler.py
import json
import os
from datetime import datetime, timezone

STATE_FILE = ".interceptor_state.json"


def save_data(data, category, base_dir="."):
    """Saves intercepted data to a timestamped file in the category directory."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    folder = os.path.join(base_dir, category)
    if not os.path.exists(folder):
        os.makedirs(folder)

    product = data.get("product", "gold")
    filename = f"{product}_{category}_{timestamp}.json"
    filepath = os.path.join(folder, filename)
    with open(filepath, "w") as f:
        json.dump(data, f, indent=4)
    print(f"[+] Saved {category} data to {filepath}")


def write_frontend_json(data, product, data_type, base_dir="."):
    """Always-write local copy for the webapp visual verification loop."""
    folder = os.path.join(base_dir, "frontend", "src", "data")
    os.makedirs(folder, exist_ok=True)
    filepath = os.path.join(folder, f"{product}_{data_type}.json")
    with open(filepath, "w") as f:
        json.dump(data, f, indent=4)
    print(f"[+] Wrote {filepath}")


def upload_to_gcs(data, product, data_type, bucket_name):
    """Upload enriched payload to the GCS bronze path."""
    from google.cloud import storage

    now = datetime.now(timezone.utc)
    blob_path = (
        f"raw/{product}/{now.year:04d}/{now.month:02d}/{now.day:02d}/"
        f"{now.strftime('%H%M%S')}_{data_type}.json"
    )
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_path)
    blob.upload_from_string(
        json.dumps(data, ensure_ascii=False),
        content_type="application/json",
    )
    print(f"[+] Uploaded to gs://{bucket_name}/{blob_path}")


def load_state(base_dir="."):
    """Load the last-hash state map. Phase 1 file-based; Airflow Variables in Phase 2."""
    path = os.path.join(base_dir, STATE_FILE)
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


def save_state(state, base_dir="."):
    with open(os.path.join(base_dir, STATE_FILE), "w") as f:
        json.dump(state, f, indent=2)
