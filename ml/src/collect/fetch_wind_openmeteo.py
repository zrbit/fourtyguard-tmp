"""Wind speed from Open-Meteo (free, no key) -- FortyGuard's /env_params has
no wind field (confirmed, project memory). Two endpoints, picked by age of
the requested date_time:

- forecast endpoint: recent-past support, but the archive endpoint lags
  ~5 days behind real time and would miss "1 hour ago" data -- used for
  anything within the last _ARCHIVE_LAG_DAYS.
- archive endpoint: required for COLLECTION_PLAN.md's Tier 7 weather-
  diversity dates (2021-2024), which are far outside the forecast
  endpoint's window and returned a 400 there (discovered when Tier 7 was
  first run against all-forecast -- every wind fetch failed silently,
  since fetch_wind is a best-effort try/except in collect_one_aoi).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import requests

from . import raw_cache
from .aoi_sampling import Aoi

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
_ARCHIVE_LAG_DAYS = 5


def load_cached(aoi: Aoi, dt: datetime) -> dict | None:
    return raw_cache.load("wind_openmeteo", {"aoi": aoi.name, "date": dt.strftime("%Y-%m-%d")})


def _endpoint_for(dt: datetime) -> str:
    now = datetime.now(timezone.utc)
    age = now - (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc))
    return FORECAST_URL if age <= timedelta(days=_ARCHIVE_LAG_DAYS) else ARCHIVE_URL


def fetch_wind(aoi: Aoi, dt: datetime) -> dict:
    date_str = dt.strftime("%Y-%m-%d")
    params = {"aoi": aoi.name, "date": date_str}
    cached = raw_cache.load("wind_openmeteo", params)
    if cached is not None:
        return cached

    response = requests.get(
        _endpoint_for(dt),
        params={
            "latitude": aoi.lat,
            "longitude": aoi.lng,
            "start_date": date_str,
            "end_date": date_str,
            "hourly": "wind_speed_10m",
            "wind_speed_unit": "mph",
            "timezone": "UTC",
        },
        timeout=30,
    )
    response.raise_for_status()
    result = response.json()
    raw_cache.save("wind_openmeteo", params, result)
    return result


def wind_mph_at_hour(wind_response: dict, dt: datetime) -> float | None:
    hourly = wind_response.get("hourly", {})
    times = hourly.get("time", [])
    speeds = hourly.get("wind_speed_10m", [])
    target = dt.strftime("%Y-%m-%dT%H:00")
    for t, s in zip(times, speeds):
        if t == target:
            return s
    return None
