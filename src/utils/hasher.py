# src/utils/hasher.py
import hashlib
import json

EXCLUDE_FIELDS = {"ExtractedAt"}


def payload_hash(data: dict) -> str:
    """MD5 hash of payload with excluded fields removed. Deterministic."""
    clean = {k: v for k, v in data.items() if k not in EXCLUDE_FIELDS}
    serialized = json.dumps(clean, sort_keys=True, ensure_ascii=False)
    return hashlib.md5(serialized.encode()).hexdigest()


if __name__ == "__main__":
    # ponytail: self-check — ExtractedAt must not affect hash, real data must.
    a = {"x": 1, "ExtractedAt": "2026-07-01 10:00:00"}
    b = {"x": 1, "ExtractedAt": "2026-07-01 11:00:00"}
    c = {"x": 2, "ExtractedAt": "2026-07-01 10:00:00"}
    assert payload_hash(a) == payload_hash(b), "ExtractedAt leaked into hash"
    assert payload_hash(a) != payload_hash(c), "payload change not detected"
    print("hasher OK")
