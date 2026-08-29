"""Defensive field-name lookup for FortyGuard's map_data/stats_data responses.

Confirmed against real pilot-call responses (29 Aug 2026, Downtown LA):
- /heatmap: map_data.features[].properties has average_temperature /
  min_temperature / max_temperature, in CELSIUS. Geometry is Polygon (tile
  outlines), not Point.
- /env_params: an entirely different shape from map_data -- see
  extract_env_params() below, confirmed real.
- /satellite: confirmed (Downtown LA, 45-day-old reference date -- "1 hour
  ago" fails, see date_times.satellite_reference_date()). Returns ONE
  aggregate segmentation for the whole `sat` point/area, NOT a per-cell grid:
  data.result.segmentation.segments = {"building": pct, "tree": pct,
  "road, route": pct, "sidewalk, pavement": pct, "others": pct}. Handled by
  extract_land_cover() below, not extract_cells()/first_present().
"""

from __future__ import annotations

from typing import Any

TEMPERATURE_KEYS = ["average_temperature", "temperature", "tcm", "temp", "surface_temperature", "value"]
IMPERVIOUS_KEYS = ["impervious_pct", "impervious", "impervious_percentage", "impervious_surface_pct"]
CANOPY_KEYS = ["canopy_pct", "tree_canopy_pct", "canopy", "vegetation_pct", "tree_cover_pct"]

# Real keys confirmed from a live /env_params response's locations[0].parameters:
HUMIDITY_KEYS = ["relative_humidity_percent"]
CLOUD_COVER_KEYS = ["cloud_cover_octas"]  # NOTE: observed value (58) is out of a 0-8 octas range -- may actually be percent despite the key name; passed through raw, unresolved.
HEAT_INDEX_KEYS = ["heat_index", "apparent_temperature"]  # post-extract_env_params() names (already °F)
# solar_irradiance.clear_sky is a separate nested block, not in `parameters` --
# handled specially in extract_env_params(), not via first_present().
SOLAR_KEYS = ["solar_ghi"]


def celsius_to_fahrenheit(celsius: float) -> float:
    return celsius * 9 / 5 + 32


# Real /satellite segmentation class names -> our feature names. "building"
# counts toward impervious (rooftops absorb/re-radiate heat same as
# pavement) alongside the paved classes; "others" (bare ground/shadow/water,
# unconfirmed which) is left out of both.
IMPERVIOUS_SEGMENT_CLASSES = ["building", "road, route", "sidewalk, pavement"]
CANOPY_SEGMENT_CLASSES = ["tree"]


def extract_land_cover(result: dict) -> dict:
    """Real confirmed shape: result["data"]["result"]["segmentation"]["segments"]
    is {class_name: percent}. Returns {"imperviousPct": .., "canopyPct": ..}."""
    payload = (result.get("data") or {}).get("result") or {}
    segments = ((payload.get("segmentation") or {}).get("segments")) or {}
    if not segments:
        return {}
    return {
        "imperviousPct": sum(segments.get(cls, 0.0) for cls in IMPERVIOUS_SEGMENT_CLASSES),
        "canopyPct": sum(segments.get(cls, 0.0) for cls in CANOPY_SEGMENT_CLASSES),
    }


def extract_env_params(result: dict) -> dict:
    """Flattens a real /env_params submit_and_wait() result's first location
    into {key: scalar}. Temperature-like fields (heat_index_celsius,
    apparent_temperature_celsius) are converted to Fahrenheit and re-keyed
    without the _celsius suffix, to match the app's °F convention and stay
    comparable to the temperature target."""
    payload = (result.get("data") or {}).get("result") or {}
    locations = payload.get("locations") or []
    if not locations:
        return {}
    location = locations[0]
    flat: dict[str, Any] = {}
    for key, values in (location.get("parameters") or {}).items():
        if isinstance(values, list) and values:
            value = values[0]
            if key.endswith("_celsius"):
                flat[key[: -len("_celsius")]] = celsius_to_fahrenheit(value)
            else:
                flat[key] = value
    clear_sky = ((location.get("solar_irradiance") or {}).get("clear_sky")) or {}
    for key, value in clear_sky.items():
        flat[f"solar_{key}"] = value
    return flat


def first_present(properties: dict[str, Any], keys: list[str]) -> float | None:
    for key in keys:
        if key in properties and properties[key] is not None:
            try:
                return float(properties[key])
            except (TypeError, ValueError):
                continue
    return None


def feature_centroid(feature: dict) -> tuple[float, float] | None:
    """Returns (lat, lng) for a GeoJSON Feature's Point or Polygon geometry."""
    geometry = feature.get("geometry") or {}
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if gtype == "Point" and coords:
        lng, lat = coords[0], coords[1]
        return lat, lng
    if gtype == "Polygon" and coords:
        ring = coords[0]
        lngs = [c[0] for c in ring]
        lats = [c[1] for c in ring]
        return sum(lats) / len(lats), sum(lngs) / len(lngs)
    return None


def extract_cells(result: dict) -> list[dict]:
    """Flattens a FortyGuard submit_and_wait() result's map_data into a list
    of {lat, lng, properties} dicts. Returns [] if map_data is absent/empty.

    Confirmed real nesting (pilot call): result["data"]["result"]["map_data"].
    """
    payload = (result.get("data") or {}).get("result") or result.get("result") or {}
    map_data = payload.get("map_data") or {}
    features = map_data.get("features") or []
    cells = []
    for feature in features:
        centroid = feature_centroid(feature)
        if centroid is None:
            continue
        lat, lng = centroid
        cells.append({"lat": lat, "lng": lng, "properties": feature.get("properties") or {}})
    return cells
