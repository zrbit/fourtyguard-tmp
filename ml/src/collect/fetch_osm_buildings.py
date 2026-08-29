"""Building footprint density from OpenStreetMap Overpass (free, no key) --
one input to buildingDensity. See fetch_osm_landcover.py for the broader
impervious/canopy estimator that supersedes satellite for AOIs beyond the
2-per-day quota (see project notes).
"""

from __future__ import annotations

import requests

from . import raw_cache
from .aoi_sampling import Aoi
from .geo_utils import shoelace_area_m2

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
# Overpass returns 406 Not Acceptable for requests.py's default User-Agent
# (confirmed against the real endpoint) -- needs an identifying one.
_HEADERS = {"User-Agent": "thermal-reasoning-agent-ml/0.1 (hackathon research use)"}


def load_cached(aoi: Aoi) -> dict | None:
    return raw_cache.load("osm_buildings", {"aoi": aoi.name})


def fetch_buildings(aoi: Aoi) -> dict:
    params = {"aoi": aoi.name}
    cached = raw_cache.load("osm_buildings", params)
    if cached is not None:
        return cached

    south, north = aoi.lat - aoi.lat_delta, aoi.lat + aoi.lat_delta
    west, east = aoi.lng - aoi.lng_delta, aoi.lng + aoi.lng_delta
    query = f"""
    [out:json][timeout:30];
    (
      way["building"]({south},{west},{north},{east});
    );
    out geom;
    """
    response = requests.post(OVERPASS_URL, data={"data": query}, headers=_HEADERS, timeout=60)
    response.raise_for_status()
    result = response.json()
    raw_cache.save("osm_buildings", params, result)
    return result


def building_density(osm_response: dict, aoi: Aoi) -> float:
    """Fraction (0-1) of the AOI's footprint covered by building outlines."""
    aoi_area_m2 = shoelace_area_m2(aoi.polygon()["features"][0]["geometry"]["coordinates"][0], aoi.lat)
    total_building_m2 = 0.0
    for element in osm_response.get("elements", []):
        geometry = element.get("geometry")
        if not geometry or len(geometry) < 3:
            continue
        coords = [[node["lon"], node["lat"]] for node in geometry]
        total_building_m2 += shoelace_area_m2(coords, aoi.lat)
    if aoi_area_m2 <= 0:
        return 0.0
    return min(total_building_m2 / aoi_area_m2, 1.0)
