"""Content-addressed cache for raw API responses.

Every fetch is keyed by a hash of (kind, request params), so re-running the
collection script never re-issues -- and never re-spends credits on -- a
call that already succeeded.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"


def _key(kind: str, params: dict) -> str:
    blob = json.dumps({"kind": kind, "params": params}, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:24]


def cache_path(kind: str, params: dict) -> Path:
    return RAW_DIR / f"{kind}_{_key(kind, params)}.json"


def load(kind: str, params: dict) -> Any | None:
    path = cache_path(kind, params)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def save(kind: str, params: dict, response: Any) -> Path:
    path = cache_path(kind, params)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(response, indent=2, default=str), encoding="utf-8")
    return path
