"""OSM geometry fetch for the Action Feasibility Guard.

Same Overpass pattern as fetch_osm_landcover.py, but keyed by a fixed
~450m action-plan tile (see serve/export_clusters_for_app.py) instead of an
AOI, and pulling one more tag class: parking (amenity=parking /
landuse=parking), which fetch_osm_landcover.py doesn't need for its
canopy/impervious estimate but the site-type classifier does, to tell
"surface parking" apart from "building" or "road."

Free, no key, cached via raw_cache (content-hash of tileId -> disk), so
re-running this against the same 48 priority tiles never re-fetches.
"""

from __future__ import annotations

import time

import requests

from . import raw_cache
from .geo_utils import meters_per_deg_lng

# Public instance first, then a mirror -- the primary instance returns
# transient 504s under load (observed directly while building this), and
# these are free/no-key so falling back costs nothing.
OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
_HEADERS = {"User-Agent": "thermal-reasoning-agent-ml/0.1 (hackathon research use)"}

_METERS_PER_DEG_LAT = 111_320.0


def tile_bbox(centroid_lat: float, centroid_lng: float, half_size_m: float = 225.0) -> tuple[float, float, float, float]:
    """(south, west, north, east) for a tile centered on (centroid_lat, centroid_lng)."""
    lat_half_deg = half_size_m / _METERS_PER_DEG_LAT
    lng_half_deg = half_size_m / meters_per_deg_lng(centroid_lat)
    return (
        centroid_lat - lat_half_deg,
        centroid_lng - lng_half_deg,
        centroid_lat + lat_half_deg,
        centroid_lng + lng_half_deg,
    )


def fetch_tile_geometry(tile_id: str, centroid_lat: float, centroid_lng: float) -> dict:
    params = {"tileId": tile_id}
    cached = raw_cache.load("osm_sitetype", params)
    if cached is not None:
        return cached

    south, west, north, east = tile_bbox(centroid_lat, centroid_lng)
    bbox = f"{south},{west},{north},{east}"
    query = f"""
    [out:json][timeout:30];
    (
      way["building"]({bbox});
      way["highway"]({bbox});
      way["natural"="wood"]({bbox});
      way["landuse"="forest"]({bbox});
      way["amenity"="parking"]({bbox});
      way["landuse"="parking"]({bbox});
      relation["landuse"="parking"]({bbox});
    );
    out geom;
    """
    last_error: Exception | None = None
    for url in OVERPASS_URLS:
        for attempt in range(2):
            try:
                response = requests.post(url, data={"data": query}, headers=_HEADERS, timeout=60)
                response.raise_for_status()
                result = response.json()
                raw_cache.save("osm_sitetype", params, result)
                return result
            except (requests.exceptions.RequestException, ValueError) as exc:
                last_error = exc
                time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"Overpass fetch failed for tile {tile_id} after retries across all mirrors") from last_error
