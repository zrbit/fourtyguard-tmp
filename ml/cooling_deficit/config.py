"""Frozen configuration for the overnight cooling-deficit panel.

This intentionally duplicates the small AOI subset rather than importing the
active collection package.  It prevents an edit to the daytime collector from
silently changing this experiment's spatial panel.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

UTC = timezone.utc
HEATMAP_COST = 4_220
ENV_PARAMS_COST = 2_900
MIN_PEER_GROUP_SIZE = 15
CACHE_VERSION = "local-time-v2"


@dataclass(frozen=True)
class Aoi:
    name: str
    category: str
    lat: float
    lng: float
    lat_delta: float = 0.009
    lng_delta: float = 0.010

    def polygon(self) -> dict:
        ring = [
            [self.lng - self.lng_delta, self.lat - self.lat_delta],
            [self.lng + self.lng_delta, self.lat - self.lat_delta],
            [self.lng + self.lng_delta, self.lat + self.lat_delta],
            [self.lng - self.lng_delta, self.lat + self.lat_delta],
            [self.lng - self.lng_delta, self.lat - self.lat_delta],
        ]
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {},
                    "geometry": {"type": "Polygon", "coordinates": [ring]},
                }
            ],
        }


# Twelve complementary land-cover settings: dense Southeast LA, industrial,
# park-adjacent, valley, coastal, hillside, downtown and mixed residential.
PANEL_AOIS: tuple[Aoi, ...] = (
    Aoi("Downtown LA", "dense_downtown", 34.0407, -118.2468),
    Aoi("Vernon", "industrial", 34.0039, -118.2290),
    Aoi("Huntington Park", "southeast_dense_urban", 33.9817, -118.2248),
    Aoi("Commerce", "industrial", 34.0001, -118.1590),
    Aoi("Elysian Park", "park_adjacent", 34.0847, -118.2434),
    Aoi("Sylmar", "valley_open", 34.3106, -118.4442),
    Aoi("El Segundo", "coastal_industrial", 33.9192, -118.4165),
    Aoi("Venice", "coastal", 33.9850, -118.4695),
    Aoi("Los Feliz", "leafy_hillside", 34.1073, -118.2884),
    Aoi("South LA / Watts", "dense_low_canopy_residential", 33.9425, -118.2468),
    Aoi("Sherman Oaks", "valley_suburban", 34.1508, -118.4489),
    Aoi("Silver Lake", "moderate_canopy_hillside", 34.0869, -118.2702),
)


def los_angeles_tz() -> ZoneInfo:
    """Load an IANA timezone only when a paid-collection date is constructed.

    Windows Python installations need the small ``tzdata`` wheel because they
    do not ship the IANA timezone database.  Analysis-only commands therefore
    remain usable even before that optional runtime dependency is installed.
    """
    try:
        return ZoneInfo("America/Los_Angeles")
    except ZoneInfoNotFoundError as exc:
        raise RuntimeError(
            "Missing IANA timezone data. Install the cooling-deficit extras: "
            "pip install -r cooling_deficit/requirements.txt"
        ) from exc


def night_pair(night_date: date, evening_hour: int = 22, predawn_hour: int = 4) -> dict[str, datetime]:
    """Return same-night LA-local evening and next-day predawn timestamps.

    ``night_date=2026-08-30`` means 22:00 on Aug 30 and 04:00 on Aug 31,
    which avoids accidentally pairing a predawn reading with the previous
    evening when a command is resumed after midnight.
    """
    evening = datetime(night_date.year, night_date.month, night_date.day, evening_hour, tzinfo=los_angeles_tz())
    predawn_local_date = date.fromordinal(night_date.toordinal() + 1)
    predawn = datetime(
        predawn_local_date.year,
        predawn_local_date.month,
        predawn_local_date.day,
        predawn_hour,
        tzinfo=los_angeles_tz(),
    )
    return {"evening": evening, "predawn": predawn}


def date_time_payload(value: datetime) -> dict[str, int | str]:
    """FortyGuard heatmap/env ``start_time`` is location-local, not UTC.

    The initial batch proved this empirically: sending 05:00Z produced
    overnight values while 11:00Z produced daytime values in Los Angeles.
    Keep timestamps aware for cache identity, but send their LA wall-clock
    date/time to the API.
    """
    if value.tzinfo is None:
        raise ValueError("timestamp must be timezone-aware")
    local_value = value.astimezone(los_angeles_tz())
    return {
        "start_date": local_value.strftime("%Y-%m-%d"),
        "start_time": local_value.strftime("%H:%M"),
        "filter_type": 1,
    }
