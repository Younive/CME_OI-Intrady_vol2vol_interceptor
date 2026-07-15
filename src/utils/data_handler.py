# src/utils/data_handler.py
import json
import os
from datetime import datetime, timezone

import pendulum

from src.config import GCS_ENABLED, GCS_BUCKET

STATE_FILE = ".interceptor_state.json"
STATE_BLOB = "state/interceptor_state.json"


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


def _blob_path(product, data_type, now):
    """Human-readable bronze path: raw/gold/2026/July/10/Intraday/14-30-05.json
    All times ICT (Asia/Bangkok, UTC+7). ponytail: month name kills BQ partition
    pruning — switch the %B back to %m when Phase 3 wires hive partitioning."""
    label = "OI" if data_type == "oi" else "Intraday"
    return f"raw/{product}/{now:%Y}/{now:%B}/{now:%d}/{label}/{now:%H-%M-%S}.json"


def upload_to_gcs(data, product, data_type, bucket_name):
    """Upload enriched payload to the GCS bronze path."""
    from google.cloud import storage

    blob_path = _blob_path(product, data_type, pendulum.now("Asia/Bangkok"))
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_path)
    blob.upload_from_string(
        json.dumps(data, ensure_ascii=False),
        content_type="application/json",
    )
    print(f"[+] Uploaded to gs://{bucket_name}/{blob_path}")


def _state_blob():
    from google.cloud import storage

    return storage.Client().bucket(GCS_BUCKET).blob(STATE_BLOB)


def load_state(base_dir="."):
    """Load the last-hash state map. GCS object when enabled, else local file."""
    if GCS_ENABLED:
        blob = _state_blob()
        return json.loads(blob.download_as_text()) if blob.exists() else {}
    path = os.path.join(base_dir, STATE_FILE)
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


def save_state(state, base_dir="."):
    if GCS_ENABLED:
        _state_blob().upload_from_string(
            json.dumps(state, indent=2), content_type="application/json"
        )
        return
    with open(os.path.join(base_dir, STATE_FILE), "w") as f:
        json.dump(state, f, indent=2)


def get_stored_hash(product, data_type):
    """Last uploaded hash for this product+data_type."""
    return load_state().get(f"{product}_{data_type}", "")


def set_stored_hash(product, data_type, value, base_dir="."):
    key = f"{product}_{data_type}"
    if GCS_ENABLED:
        _cas_set_state(key, value)
        return
    # Local (single machine): plain read-modify-write is safe.
    state = load_state(base_dir)
    state[key] = value
    save_state(state, base_dir)


def _cas_set_state(key, value, attempts=5):
    """Atomic per-key update of the shared GCS state blob. Overlapping Cloud Run
    invocations (e.g. the 22:00 UTC double-fire) each read-modify-write the whole
    object, so a plain write loses the other's key. Pin read+write to one blob
    generation with if_generation_match; on a concurrent write (412) reload and
    retry. gen 0 = "only if absent" for first-write creation."""
    from google.api_core.exceptions import NotFound, PreconditionFailed

    for _ in range(attempts):
        blob = _state_blob()
        try:
            blob.reload()
            gen = blob.generation
            state = json.loads(blob.download_as_text(if_generation_match=gen))
        except NotFound:
            gen, state = 0, {}
        state[key] = value
        try:
            blob.upload_from_string(
                json.dumps(state, indent=2),
                content_type="application/json",
                if_generation_match=gen,
            )
            return
        except PreconditionFailed:
            continue  # someone else wrote between our read and write — retry
    raise RuntimeError(f"state CAS for {key} lost after {attempts} attempts")


if __name__ == "__main__":
    # File-backend state round-trip (GCS_ENABLED must be off). Runs in a temp cwd.
    import tempfile

    assert not GCS_ENABLED, "run self-check with GCS_ENABLED unset"

    t = datetime(2026, 7, 10, 14, 30, 5, tzinfo=timezone.utc)
    assert _blob_path("gold", "intraday", t) == "raw/gold/2026/July/10/Intraday/14-30-05.json"
    assert _blob_path("mnq", "oi", t) == "raw/mnq/2026/July/10/OI/14-30-05.json"

    origin = os.getcwd()
    with tempfile.TemporaryDirectory() as d:
        os.chdir(d)
        try:
            assert get_stored_hash("gold", "oi") == ""      # missing file → empty
            set_stored_hash("gold", "oi", "abc")
            assert get_stored_hash("gold", "oi") == "abc"   # persisted
            set_stored_hash("mnq", "intraday", "xyz")
            assert get_stored_hash("gold", "oi") == "abc"   # unrelated key intact
        finally:
            os.chdir(origin)  # release temp dir so Windows can remove it
    print("data_handler self-check OK")
