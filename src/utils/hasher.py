# src/utils/hasher.py
import hashlib
import json

# Non-market noise that changes every capture and would defeat dedup:
# DTE decays continuously (fraction of a day), InstanceParm carries
# per-pageload session ids (insid/qsid).
EXCLUDE_FIELDS = {"ExtractedAt", "DTE", "InstanceParm"}


def payload_hash(data: dict) -> str:
    """MD5 hash of payload with excluded fields removed. Deterministic."""
    clean = {k: v for k, v in data.items() if k not in EXCLUDE_FIELDS}
    serialized = json.dumps(clean, sort_keys=True, ensure_ascii=False)
    return hashlib.md5(serialized.encode()).hexdigest()


if __name__ == "__main__":
    # ponytail: self-check — ExtractedAt must not affect hash, real data must.
    a = {"x": 1, "ExtractedAt": "2026-07-01 10:00:00", "DTE": 0.5671, "InstanceParm": "?insid=1"}
    b = {"x": 1, "ExtractedAt": "2026-07-01 11:00:00", "DTE": 0.5659, "InstanceParm": "?insid=2"}
    c = {"x": 2, "ExtractedAt": "2026-07-01 10:00:00", "DTE": 0.5671, "InstanceParm": "?insid=1"}
    assert payload_hash(a) == payload_hash(b), "noise field leaked into hash"
    assert payload_hash(a) != payload_hash(c), "payload change not detected"
    print("hasher OK")
