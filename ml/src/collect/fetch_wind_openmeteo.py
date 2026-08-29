"""Wind speed from Open-Meteo (free, no key) -- FortyGuard's /env_params has
no wind field (confirmed, project memory). Uses the forecast endpoint's
recent-past support (all our date_times are within the last few days, well
inside its supported window) rather than the archive endpoint, which lags
~5 days behind real time and would miss "1 hour ago" data.
"""

from __future__ import annotations

from datetime import datetime

import requests

from . import raw_cache
from .aoi_sampling import Aoi

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


def load_cached(aoi: Aoi, dt: datetime) -> dict | None:
    return raw_cache.load("wind_openmeteo", {"aoi": aoi.name, "date": dt.strftime("%Y-%m-%d")})


def fetch_wind(aoi: Aoi, dt: datetime) -> dict:
    date_str = dt.strftime("%Y-%m-%d")
    params = {"aoi": aoi.name, "date": date_str}
    cached = raw_cache.load("wind_openmeteo", params)
    if cached is not None:
        return cached

    response = requests.get(
        FORECAST_URL,
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
