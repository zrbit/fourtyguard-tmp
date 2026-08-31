"""Live per-click enrichment: free-source features for an arbitrary lat/lng,
matching Tier 2's *Rel (AOI-mean-centered) feature definitions without
needing a precomputed AOI.

Most of ml/src/enrich/'s low-level building blocks (fetch_sentinel2's
fetch_scene/sample_at, fetch_nlcd_impervious's raster fetch, coast_distance)
already only depend on an Aoi's lat/lng/deltas, not on a cached FortyGuard
heatmap -- only the top-level aoi_cells()-based wrappers (aoi_impervious_pct,
cell_ndvi, cell_albedo, fetch_elevation, aoi_coast_distances) need a cached
heatmap grid to enumerate cells. This module reuses the point/window-based
low-level functions directly against a synthetic sample grid, sidestepping
that dependency entirely -- no changes needed to the already-shipped,
tested offline enrichment pipeline.

*Rel centering: Tier 2 was trained on each cell's value minus its AOI's
MEAN value across that AOI's real ~100-380 heatmap cells. For an arbitrary
live point with no real cell grid, this samples a SAMPLE_GRID_N x
SAMPLE_GRID_N grid across the same-sized window (0.009/0.010 deg, matching
every training AOI's footprint) as an approximation of that mean -- coarser
than the real per-cell grid, but the same physical window and the same
centering logic.
"""

from __future__ import annotations

import time

import requests

from ..collect.aoi_sampling import Aoi
from ..collect import fetch_osm_buildings
from ..collect.geo_utils import meters_per_deg_lng
from ..enrich import coast_distance, fetch_nlcd_impervious
from ..enrich.fetch_sentinel2 import fetch_scene, sample_at

SAMPLE_GRID_N = 7  # 49 sample points across the window
_ELEVATION_URL = "https://api.open-elevation.com/api/v1/lookup"
_OPEN_METEO_CURRENT_URL = "https://api.open-meteo.com/v1/forecast"

# Overpass (OSM buildings) is free but flakier than the paid FortyGuard
# endpoints -- 504s/timeouts happened regularly even during offline
# collection (see COLLECTION_PLAN.md-adjacent logs). A hard failure there
# shouldn't fail an entire live prediction; retry briefly, then fall back
# to this dataset's real training-data MEDIAN buildingDensity (not 0 --
# 0 would wrongly mean "no buildings here," not "unknown/typical").
_BUILDING_DENSITY_FALLBACK = 0.255  # median across dataset_percell.parquet, verified this session
_OSM_RETRY_ATTEMPTS = 3
_OSM_RETRY_DELAY_S = 2.0

# Same reasoning as _BUILDING_DENSITY_FALLBACK: Open-Meteo is free but has
# shown real transient failures in practice (a live 503 during testing). A
# fallback median must NEVER be None here -- an already-paid-for live
# satellite result (14,400 credits) must not be thrown away over a free
# weather API hiccup. All medians verified against dataset_percell.parquet
# this session.
_WEATHER_FALLBACK = {"windMph": 7.3, "humidity": 64.9, "cloudCoverPct": 3.0, "solarIrradiance": 0.0, "heatIndex": 92.84}


def _synthetic_aoi(lat: float, lng: float) -> Aoi:
    # Rounded so repeated clicks near the same spot reuse the same cached
    # Sentinel-2 scene / NLCD raster (both cache by aoi.name) -- latency,
    # not cost, these sources are free either way.
    name = f"live_{round(lat, 3)}_{round(lng, 3)}"
    return Aoi(name=name, category="live", lat=lat, lng=lng)


def _sample_grid(aoi: Aoi, n: int = SAMPLE_GRID_N) -> list[dict]:
    points = []
    for i in range(n):
        for j in range(n):
            frac_lat = (i + 0.5) / n
            frac_lng = (j + 0.5) / n
            lat = (aoi.lat - aoi.lat_delta) + frac_lat * 2 * aoi.lat_delta
            lng = (aoi.lng - aoi.lng_delta) + frac_lng * 2 * aoi.lng_delta
            points.append({"lat": lat, "lng": lng})
    return points


def _fetch_elevations(points: list[dict]) -> list[float]:
    locations = [{"latitude": p["lat"], "longitude": p["lng"]} for p in points]
    response = requests.post(_ELEVATION_URL, json={"locations": locations}, timeout=60)
    response.raise_for_status()
    return [r["elevation"] for r in response.json()["results"]]


def _fetch_current_weather(lat: float, lng: float) -> dict:
    """Free substitute for FortyGuard's paid /v1/env_params, per the
    live-click cost decision (satellite is paid for canopy's trusted
    anchor; weather stays free). heatIndex isn't a native Open-Meteo
    field -- approximated via the standard NWS simplified formula when
    temperature/humidity are available, else omitted (the model schema
    tolerates NaN, and this feature carries near-zero SHAP importance
    anyway, per this session's Tier 2 analysis).

    Retries like the OSM buildings call: a transient failure here (seen in
    practice -- a real 503 from Open-Meteo) must not throw away an
    already-PAID-FOR live satellite result over a free dependency hiccup."""
    current = {}
    last_exc: Exception | None = None
    for attempt in range(_OSM_RETRY_ATTEMPTS):
        try:
            response = requests.get(
                _OPEN_METEO_CURRENT_URL,
                params={
                    "latitude": lat, "longitude": lng,
                    "current": "temperature_2m,relative_humidity_2m,cloud_cover,wind_speed_10m,shortwave_radiation",
                    "wind_speed_unit": "mph",
                    "temperature_unit": "fahrenheit",
                    "timezone": "auto",
                },
                timeout=30,
            )
            response.raise_for_status()
            current = response.json().get("current", {})
            break
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt < _OSM_RETRY_ATTEMPTS - 1:
                time.sleep(_OSM_RETRY_DELAY_S)
    else:
        print(f"  [warn] Open-Meteo current weather failed after {_OSM_RETRY_ATTEMPTS} attempts ({last_exc}); "
              "weather features will be null (model tolerates this, they carry near-zero importance).")
    temp_f = current.get("temperature_2m")
    humidity = current.get("relative_humidity_2m")
    heat_index = None
    if temp_f is not None and humidity is not None and temp_f >= 80:
        # NWS simplified heat index formula (Rothfusz), °F.
        heat_index = (
            -42.379 + 2.04901523 * temp_f + 10.14333127 * humidity
            - 0.22475541 * temp_f * humidity - 0.00683783 * temp_f ** 2
            - 0.05481717 * humidity ** 2 + 0.00122874 * temp_f ** 2 * humidity
            + 0.00085282 * temp_f * humidity ** 2 - 0.00000199 * temp_f ** 2 * humidity ** 2
        )
    return {
        "windMph": current.get("wind_speed_10m", _WEATHER_FALLBACK["windMph"]),
        "humidity": humidity if humidity is not None else _WEATHER_FALLBACK["humidity"],
        "cloudCoverPct": current.get("cloud_cover", _WEATHER_FALLBACK["cloudCoverPct"]),
        "solarIrradiance": current.get("shortwave_radiation", _WEATHER_FALLBACK["solarIrradiance"]),
        "heatIndex": heat_index if heat_index is not None else (temp_f if temp_f is not None else _WEATHER_FALLBACK["heatIndex"]),
    }


def live_features(lat: float, lng: float, aoi_canopy_pct: float) -> dict:
    """aoi_canopy_pct: the REAL, live-fetched FortyGuard satellite canopy%
    for this point's window (see live_satellite.py) -- the trusted anchor
    NDVI disaggregation redistributes, exactly as in the offline pipeline."""
    aoi = _synthetic_aoi(lat, lng)
    samples = _sample_grid(aoi)
    all_points = samples + [{"lat": lat, "lng": lng}]

    elevations = _fetch_elevations(all_points)
    point_elevation, sample_elevations = elevations[-1], elevations[:-1]
    local_mean_elevation = sum(sample_elevations) / len(sample_elevations)

    coast_distances = [coast_distance.distance_to_coast_m(p["lat"], p["lng"]) for p in all_points]
    point_coast, sample_coasts = coast_distances[-1], coast_distances[:-1]
    local_mean_coast = sum(sample_coasts) / len(sample_coasts)

    scene = fetch_scene(aoi)
    ndvis, albedos = [], []
    for p in all_points:
        red = sample_at(scene, "B04", p["lat"], p["lng"])
        nir = sample_at(scene, "B08", p["lat"], p["lng"])
        ndvi = (nir - red) / (nir + red) if red is not None and nir is not None and (nir + red) else None
        ndvis.append(ndvi)
        dns = {}
        for band in ("B02", "B04", "B08", "B11", "B12"):
            v = sample_at(scene, band, p["lat"], p["lng"])
            dns[band] = (v / 10_000.0) if v is not None else None
        if all(v is not None for v in dns.values()):
            albedo = (
                0.356 * dns["B02"] + 0.130 * dns["B04"] + 0.373 * dns["B08"]
                + 0.085 * dns["B11"] + 0.072 * dns["B12"] - 0.0018
            )
        else:
            albedo = None
        albedos.append(albedo)
    point_ndvi, sample_ndvis = ndvis[-1], [v for v in ndvis[:-1] if v is not None]
    point_albedo, sample_albedos = albedos[-1], [v for v in albedos[:-1] if v is not None]
    local_mean_albedo = sum(sample_albedos) / len(sample_albedos) if sample_albedos else point_albedo

    nlcd_raster_bytes = fetch_nlcd_impervious._fetch_raster(aoi)
    import rasterio
    from rasterio.io import MemoryFile
    impervious_values = []
    with MemoryFile(nlcd_raster_bytes) as mf, mf.open() as ds:
        band = ds.read(1)
        nodata = ds.nodata
        for p in all_points:
            row, col = rasterio.transform.rowcol(ds.transform, p["lng"], p["lat"])
            if 0 <= row < band.shape[0] and 0 <= col < band.shape[1]:
                val = band[row, col]
                impervious_values.append(float(val) if (nodata is None or val != nodata) else None)
            else:
                impervious_values.append(None)
    point_impervious, sample_impervious = impervious_values[-1], [v for v in impervious_values[:-1] if v is not None]
    local_mean_impervious = sum(sample_impervious) / len(sample_impervious) if sample_impervious else point_impervious

    # Canopy: disaggregate the REAL satellite AOI canopy% by relative NDVI
    # weight, same formula as enrich/compute_ndvi.py's
    # disaggregate_canopy_pct(), generalized to a synthetic sample grid.
    weights = [max(v, 0.0) for v in sample_ndvis] if sample_ndvis else []
    mean_weight = sum(weights) / len(weights) if weights else 0.0
    point_weight = max(point_ndvi, 0.0) if point_ndvi is not None else 0.0
    if mean_weight > 0:
        point_canopy_pct = max(0.0, min(100.0, aoi_canopy_pct * (point_weight / mean_weight)))
    else:
        point_canopy_pct = aoi_canopy_pct

    building_density = None
    for attempt in range(_OSM_RETRY_ATTEMPTS):
        try:
            buildings_response = fetch_osm_buildings.fetch_buildings(aoi)
            building_density = fetch_osm_buildings.building_density(buildings_response, aoi)
            break
        except Exception as exc:  # noqa: BLE001 -- Overpass is flaky, see module docstring
            if attempt == _OSM_RETRY_ATTEMPTS - 1:
                print(f"  [warn] OSM buildings failed after {_OSM_RETRY_ATTEMPTS} attempts ({exc}); "
                      f"using training-median fallback ({_BUILDING_DENSITY_FALLBACK}).")
                building_density = _BUILDING_DENSITY_FALLBACK
            else:
                time.sleep(_OSM_RETRY_DELAY_S)

    weather = _fetch_current_weather(lat, lng)
    import datetime as _dt
    hour_of_day = _dt.datetime.now(_dt.timezone.utc).hour

    return {
        "imperviousPctRel": (point_impervious - local_mean_impervious) if point_impervious is not None else None,
        "canopyPctRel": point_canopy_pct - aoi_canopy_pct,
        "albedoRel": (point_albedo - local_mean_albedo) if point_albedo is not None else None,
        "elevationMRel": point_elevation - local_mean_elevation,
        "distanceToCoastMRel": point_coast - local_mean_coast,
        "buildingDensity": building_density,
        **weather,
        "hourOfDay": hour_of_day,
    }
