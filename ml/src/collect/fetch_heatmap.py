"""POST /v1/heatmap for one AOI/date_time -> a grid of temperature cells.

Payload shape mirrors src/app/api/fortyguard/heatmap/route.ts exactly (the
proven live-app shape), just parameterized over an arbitrary AOI instead of
the app's fixed STUDY_AREAS.
"""

from __future__ import annotations

from datetime import datetime

from .. import fortyguard_client as fg
from . import raw_cache
from .aoi_sampling import Aoi
from .credit_ledger import CreditLedger
from .date_times import date_time_payload


def _params(aoi: Aoi, dt: datetime, granularity: int) -> dict:
    return {"aoi": aoi.name, "date_time": date_time_payload(dt), "granularity": granularity}


def load_cached(aoi: Aoi, dt: datetime, granularity: int = 100) -> dict | None:
    """For downstream stages (build_dataset.py) that only ever read the cache."""
    return raw_cache.load("heatmap", _params(aoi, dt, granularity))


def fetch_heatmap(aoi: Aoi, dt: datetime, ledger: CreditLedger, granularity: int = 100) -> dict:
    params = _params(aoi, dt, granularity)
    cached = raw_cache.load("heatmap", params)
    if cached is not None:
        print(f"  [cache] heatmap {aoi.name} @ {dt.isoformat()} (no credits spent)")
        return cached

    ledger.reserve("heatmap", aoi.name, note=dt.isoformat())
    payload = {
        "polygon_aoi": aoi.polygon(),
        "date_time": date_time_payload(dt),
        "granularity": granularity,
        "analytic_type": "tcm",
    }
    try:
        result = fg.submit_and_wait("/heatmap", payload)
    except Exception:
        ledger.release("heatmap", aoi.name)
        raise
    raw_cache.save("heatmap", params, result)
    return result
