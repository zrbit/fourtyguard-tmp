"""OSM-derived imperviousPct/canopyPct -- the fallback for AOIs beyond
/satellite's confirmed ~2-per-day quota (see project notes: after 2
successful calls, every subsequent satellite call failed regardless of
retry timing or AOI, ruling out a per-location or short-window rate-limit
explanation).

Free, no key, no quota. Approximate by construction -- OSM's road/building/
forest polygon coverage is incomplete in many areas, and scattered street
trees or residential canopy that aren't mapped as `natural=wood` polygons
are undercounted. Calibrate against the 2 confirmed-real satellite readings
(Downtown LA, Vernon) before trusting the absolute scale; treat this as
good for relative ranking across AOIs, which is what the monotone-
constrained model actually needs.

Definition matches schema_adapter.IMPERVIOUS_SEGMENT_CLASSES for
comparability with real /satellite rows: impervious = buildings + paved
roads (by typical lane width) + no separate sidewalk estimate (OSM sidewalk
tagging is too sparse to rely on). Canopy = natural=wood + landuse=forest
polygon coverage.
"""

from __future__ import annotations

import requests

from . import raw_cache
from .aoi_sampling import Aoi
from .geo_utils import line_length_m, shoelace_area_m2

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
_HEADERS = {"User-Agent": "thermal-reasoning-agent-ml/0.1 (hackathon research use)"}

# Typical paved width (m) by OSM highway class, for road-length -> road-area.
_ROAD_WIDTH_M = {
    "motorway": 15, "trunk": 15,
    "primary": 10, "secondary": 10, "tertiary": 10,
    "residential": 6, "unclassified": 6, "service": 6, "living_street": 6,
    "footway": 2, "path": 2, "cycleway": 2, "pedestrian": 3,
}
_DEFAULT_ROAD_WIDTH_M = 6


def load_cached(aoi: Aoi) -> dict | None:
    return raw_cache.load("osm_landcover", {"aoi": aoi.name})


def fetch_landcover(aoi: Aoi) -> dict:
    params = {"aoi": aoi.name}
    cached = raw_cache.load("osm_landcover", params)
    if cached is not None:
        return cached

    south, north = aoi.lat - aoi.lat_delta, aoi.lat + aoi.lat_delta
    west, east = aoi.lng - aoi.lng_delta, aoi.lng + aoi.lng_delta
    bbox = f"{south},{west},{north},{east}"
    query = f"""
    [out:json][timeout:30];
    (
      way["building"]({bbox});
      way["highway"]({bbox});
      way["natural"="wood"]({bbox});
      way["landuse"="forest"]({bbox});
    );
    out geom;
    """
    response = requests.post(OVERPASS_URL, data={"data": query}, headers=_HEADERS, timeout=60)
    response.raise_for_status()
    result = response.json()
    raw_cache.save("osm_landcover", params, result)
    return result


def estimate_land_cover(osm_response: dict, aoi: Aoi) -> dict:
    aoi_area_m2 = shoelace_area_m2(aoi.polygon()["features"][0]["geometry"]["coordinates"][0], aoi.lat)
    if aoi_area_m2 <= 0:
        return {"imperviousPct": None, "canopyPct": None}

    building_m2 = 0.0
    road_m2 = 0.0
    canopy_m2 = 0.0
    for element in osm_response.get("elements", []):
        geometry = element.get("geometry")
        if not geometry:
            continue
        tags = element.get("tags") or {}
        coords = [[node["lon"], node["lat"]] for node in geometry]
        is_closed = len(coords) >= 3 and coords[0] == coords[-1]

        if "building" in tags and is_closed:
            building_m2 += shoelace_area_m2(coords, aoi.lat)
        elif "highway" in tags and len(coords) >= 2:
            width = _ROAD_WIDTH_M.get(tags["highway"], _DEFAULT_ROAD_WIDTH_M)
            road_m2 += line_length_m(coords, aoi.lat) * width
        elif (tags.get("natural") == "wood" or tags.get("landuse") == "forest") and is_closed:
            canopy_m2 += shoelace_area_m2(coords, aoi.lat)

    impervious_m2 = min(building_m2 + road_m2, aoi_area_m2)  # roads can double-count at intersections; cap at 100%
    return {
        "imperviousPct": round(100 * impervious_m2 / aoi_area_m2, 2),
        "canopyPct": round(100 * min(canopy_m2, aoi_area_m2) / aoi_area_m2, 2),
    }
