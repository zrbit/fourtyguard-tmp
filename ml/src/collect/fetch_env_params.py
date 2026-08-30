"""POST /v1/env_params for one AOI/date_time -> atmospheric context.

Payload shape mirrors src/app/api/fortyguard/investigate/route.ts exactly.
Confirmed (project memory): no wind field in the response -- wind comes from
Open-Meteo instead, see fetch_wind_openmeteo.py.
"""

from __future__ import annotations

from datetime import datetime

from .. import fortyguard_client as fg
from . import raw_cache
from .aoi_sampling import Aoi
from .credit_ledger import CreditLedger
from .date_times import date_time_payload

# A reasonable placeholder temperature (C) to submit alongside the request --
# the live app passes the block's own measured temperature here; for bulk
# collection we don't have that yet (it's what we're trying to predict), so
# submit a mid-range LA August value. If env_params' response turns out to
# depend meaningfully on this input, revisit after the pilot call.
_PLACEHOLDER_TEMPERATURE_C = 30.0


def _params(aoi: Aoi, dt: datetime) -> dict:
    return {"aoi": aoi.name, "date_time": date_time_payload(dt)}


def load_cached(aoi: Aoi, dt: datetime) -> dict | None:
    return raw_cache.load("env_params", _params(aoi, dt))


def fetch_env_params(aoi: Aoi, dt: datetime, ledger: CreditLedger) -> dict:
    params = _params(aoi, dt)
    cached = raw_cache.load("env_params", params)
    if cached is not None:
        print(f"  [cache] env_params {aoi.name} @ {dt.isoformat()} (no credits spent)")
        return cached

    ledger.reserve("env_params", aoi.name, note=dt.isoformat())
    payload = {
        "latitude": aoi.lat,
        "longitude": aoi.lng,
        "temperature": _PLACEHOLDER_TEMPERATURE_C,
        "date_time": date_time_payload(dt),
    }
    try:
        result = fg.submit_and_wait("/env_params", payload)
    except Exception:
        ledger.release("env_params", aoi.name)
        raise
    raw_cache.save("env_params", params, result)
    return result
