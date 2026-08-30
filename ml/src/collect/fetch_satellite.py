"""POST /v1/satellite for one AOI -> land-cover segmentation.

Confirmed shape (Downtown LA pilot): payload needs `sat: {latitude,
longitude}` (a `polygon_aoi` shape, tried first by analogy to /heatmap, was
rejected outright with "Field 'sat' is required."). date_time must be well
in the past -- "1 hour ago" (matching /heatmap's convention) failed with no
detail; 30 days back succeeded. See date_times.satellite_reference_date().

Response is ONE aggregate segmentation for the whole area, not a per-cell
grid -- see schema_adapter.extract_land_cover(). Land cover is roughly
time-invariant, so this is called once per AOI, not once per date_time.
"""

from __future__ import annotations

import json

from .. import fortyguard_client as fg
from . import raw_cache
from .aoi_sampling import Aoi
from .credit_ledger import CreditLedger
from .date_times import date_time_payload, satellite_reference_date


def _params(aoi: Aoi, granularity: int) -> dict:
    return {"aoi": aoi.name, "granularity": granularity}


def _strip_images(result: dict) -> dict:
    """Drops the base64-encoded original/segmentation images before caching --
    schema_adapter.extract_land_cover() only reads segmentation.segments, and
    these images alone were ~85% of the raw cache's disk footprint (measured:
    242MB total raw/, most of it images never used downstream). Keeps the
    cache small enough to safely commit to git as a durability backup for
    this genuinely paid-for data (see ml/README.md)."""
    result = json.loads(json.dumps(result))  # cheap deep copy
    inner = ((result.get("data") or {}).get("result")) or {}
    inner.pop("original_image", None)
    inner.pop("orignal_image", None)  # API's own typo, both keys have appeared
    (inner.get("segmentation") or {}).pop("image_content", None)
    return result


def load_cached(aoi: Aoi, granularity: int = 100) -> dict | None:
    return raw_cache.load("satellite", _params(aoi, granularity))


def fetch_satellite(aoi: Aoi, ledger: CreditLedger, granularity: int = 100) -> dict:
    params = _params(aoi, granularity)
    cached = raw_cache.load("satellite", params)
    if cached is not None:
        print(f"  [cache] satellite {aoi.name} (no credits spent)")
        return cached

    ledger.reserve("satellite", aoi.name)
    payload = {
        "sat": {"latitude": aoi.lat, "longitude": aoi.lng},
        "date_time": date_time_payload(satellite_reference_date()),
        "granularity": granularity,
    }
    try:
        # Satellite segmentation is the heaviest of the three paid calls
        # (image analysis) -- confirmed to sometimes exceed the client's
        # default 180s poll timeout, so give it more headroom.
        result = fg.submit_and_wait("/satellite", payload, timeout_seconds=350.0)
    except Exception:
        ledger.release("satellite", aoi.name)
        raise
    raw_cache.save("satellite", params, _strip_images(result))
    return result
