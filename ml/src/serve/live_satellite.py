"""Live per-click satellite fetch for the click-anywhere Tier 2 feature.

Deliberately uses FORTYGUARD_API_KEY specifically -- NOT
FORTYGUARD_TRAINING_API_KEY/_2 (the bulk-collection keys, a separate
budget) -- per explicit product decision: this is the live app's own
feature, billed to the live app's own key. See fortyguard_client.py's
api_key override param, added for this.

Real cost: 14,400 credits per NEW point (satellite is the one Tier 2
feature that has no free substitute with a trusted absolute anchor -- see
the live-click cost/tradeoff discussion this was built from). Cached by
rounded lat/lng so re-clicking the same/nearby spot is always free after
the first real spend. A hard SAFETY_CAP_CREDITS bounds total live spend
per server process run, refusing further NEW satellite calls once hit
(cached lookups still work past the cap) -- this is a live, user-facing
feature with no per-call human review, unlike the offline collection
scripts' explicit --credit-cap flag, so this cap is a hardcoded safety
net, not a tunable.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from .. import fortyguard_client as fg
from ..collect.date_times import date_time_payload, satellite_reference_date
from ..features import schema_adapter

_CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "live-cache"
_LIVE_LEDGER_PATH = _CACHE_DIR / "_live_satellite_ledger.json"
SATELLITE_COST = 14_400
SAFETY_CAP_CREDITS = 500_000  # ~35 live clicks/process run -- see module docstring


class LiveCreditCapExceeded(RuntimeError):
    pass


def _cache_key(lat: float, lng: float) -> str:
    # ~0.001deg =~ 110m at LA's latitude -- clicks within roughly one
    # 100m cell of each other reuse the same satellite read, matching the
    # granularity satellite land cover is meaningful at (AOI-level, not
    # truly per-100m -- see fetch_satellite.py).
    return f"{round(lat, 3)}_{round(lng, 3)}"


def _cache_path(lat: float, lng: float) -> Path:
    return _CACHE_DIR / f"satellite_{_cache_key(lat, lng)}.json"


def _load_live_spent() -> int:
    if _LIVE_LEDGER_PATH.exists():
        try:
            return json.loads(_LIVE_LEDGER_PATH.read_text(encoding="utf-8")).get("spent", 0)
        except (json.JSONDecodeError, OSError):
            return 0
    return 0


def _save_live_spent(spent: int) -> None:
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _LIVE_LEDGER_PATH.write_text(json.dumps({"spent": spent}), encoding="utf-8")


def fetch_live_land_cover(lat: float, lng: float) -> dict:
    """Returns {"imperviousPct": .., "canopyPct": .., "cached": bool,
    "creditsSpent": int} for an arbitrary point -- live FortyGuard
    satellite call, FORTYGUARD_API_KEY, cached by location."""
    cache_path = _cache_path(lat, lng)
    if cache_path.exists():
        cached_response = json.loads(cache_path.read_text(encoding="utf-8"))
        land_cover = schema_adapter.extract_land_cover(cached_response)
        return {**land_cover, "cached": True, "creditsSpent": 0}

    spent = _load_live_spent()
    if spent + SATELLITE_COST > SAFETY_CAP_CREDITS:
        raise LiveCreditCapExceeded(
            f"Live satellite safety cap reached ({spent}/{SAFETY_CAP_CREDITS} credits spent this process run). "
            "Restart the live-predict server to reset, or raise SAFETY_CAP_CREDITS in live_satellite.py."
        )

    api_key = os.environ.get("FORTYGUARD_API_KEY")
    if not api_key:
        raise RuntimeError("FORTYGUARD_API_KEY not set in .env.local -- required for live per-click satellite calls.")

    payload = {
        "sat": {"latitude": lat, "longitude": lng},
        "date_time": date_time_payload(satellite_reference_date()),
        "granularity": 100,
    }
    result = fg.submit_and_wait("/satellite", payload, api_key=api_key, timeout_seconds=350.0)

    # Strip the base64 image blobs before caching, same as the offline
    # pipeline's fetch_satellite.py -- only segmentation.segments is used.
    stripped = json.loads(json.dumps(result))
    inner = ((stripped.get("data") or {}).get("result")) or {}
    inner.pop("original_image", None)
    inner.pop("orignal_image", None)
    (inner.get("segmentation") or {}).pop("image_content", None)

    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(stripped, default=str), encoding="utf-8")
    _save_live_spent(spent + SATELLITE_COST)

    land_cover = schema_adapter.extract_land_cover(stripped)
    return {**land_cover, "cached": False, "creditsSpent": SATELLITE_COST}
