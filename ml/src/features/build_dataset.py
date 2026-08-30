"""Joins all cached raw sources into one row-per-(AOI, date_time) table.

Reads ONLY from ml/data/raw/ (never touches the network or spends credits --
that's run_collection.py's job).

Row granularity is AOI x date_time, NOT cell x date_time. Originally this
targeted per-cell anomaly (cell temp - that AOI's own mean), matching
src/lib/reasoning/analyze.ts's anomaly framing directly -- but the pilot call
confirmed /satellite returns ONE aggregate land-cover reading for the whole
AOI, not a per-cell grid. Under a per-AOI-centered target, an AOI-constant
feature has nothing to explain (its within-group variance is zero by
construction) -- which would have made imperviousPct/canopyPct, the two
features this whole project is about, come back with ~zero SHAP importance.
So the target is redefined to match the resolution the data actually
supports: each AOI's mean temperature vs. the REGIONAL mean across all AOIs
sampled at that same date_time ("how much hotter/cooler is this
neighborhood than the city-wide average right now, and why"). Every feature
(land cover, wind, atmospheric) is consistently AOI x date_time granularity
under this framing -- no more mixed-resolution features.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from ..collect import (
    fetch_env_params,
    fetch_heatmap,
    fetch_osm_buildings,
    fetch_osm_landcover,
    fetch_satellite,
    fetch_wind_openmeteo,
)
from ..collect.aoi_sampling import AOIS, Aoi
from ..collect.date_times import daytime_date_times, sample_date_times
from . import schema_adapter

OUTPUT_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "dataset.parquet"
OUTPUT_CSV_PATH = OUTPUT_PATH.with_suffix(".csv")  # human-readable copy, easier to eyeball

def _candidate_date_times() -> list:
    """Every date_time this cache could plausibly hold, deduplicated: the
    current daytime sampler (run_collection.py's default) over the last few
    days, plus the older generic sampler used earlier in the project (the
    original 34 rows' 2 date_times were fetched with that one, before the
    "daytime only" decision) -- so rebuilding never loses AOIs collected
    under either scheme."""
    candidates = daytime_date_times(3, days_back=4) + sample_date_times(4)
    seen: dict[str, None] = {}
    for dt in candidates:
        seen.setdefault(dt.isoformat(), None)
    from datetime import datetime as _dt  # local import to avoid a top-level rename

    return [_dt.fromisoformat(iso) for iso in seen]


def _env_properties(env_response: dict | None) -> dict:
    if not env_response:
        return {}
    return schema_adapter.extract_env_params(env_response)


def _aoi_mean_temperature_f(heatmap_response: dict) -> float | None:
    cells = schema_adapter.extract_cells(heatmap_response)
    temps_c = [schema_adapter.first_present(c["properties"], schema_adapter.TEMPERATURE_KEYS) for c in cells]
    temps_f = [schema_adapter.celsius_to_fahrenheit(t) for t in temps_c if t is not None]
    return sum(temps_f) / len(temps_f) if temps_f else None


def build_rows() -> list[dict]:
    date_time_candidates = _candidate_date_times()
    # Pass 1: gather each (aoi, date_time)'s mean temperature, so we can
    # compute the regional (all-AOIs-at-that-hour) baseline for pass 2.
    partial_rows: list[dict] = []
    for aoi in AOIS:
        # Real /satellite land cover where the (~2/day) quota reached this
        # AOI; the free OSM-derived estimate otherwise -- see
        # fetch_osm_landcover.py for the estimate's known limitations and its
        # calibration check against the 2 real readings.
        satellite_response = fetch_satellite.load_cached(aoi)
        if satellite_response:
            land_cover = schema_adapter.extract_land_cover(satellite_response)
            land_cover_provenance = "live"
        else:
            osm_landcover_response = fetch_osm_landcover.load_cached(aoi)
            if not osm_landcover_response:
                print(f"  [skip] {aoi.name}: no satellite or OSM land-cover data cached.")
                continue
            land_cover = fetch_osm_landcover.estimate_land_cover(osm_landcover_response, aoi)
            land_cover_provenance = "modelled"

        buildings_response = fetch_osm_buildings.load_cached(aoi)
        building_density = (
            fetch_osm_buildings.building_density(buildings_response, aoi) if buildings_response else None
        )

        for dt in date_time_candidates:
            heatmap_response = fetch_heatmap.load_cached(aoi, dt)
            if not heatmap_response:
                continue
            aoi_mean_temp = _aoi_mean_temperature_f(heatmap_response)
            if aoi_mean_temp is None:
                print(f"  [skip] {aoi.name} @ {dt.isoformat()}: heatmap cached but 0 usable temperature cells.")
                continue

            env_props = _env_properties(fetch_env_params.load_cached(aoi, dt))
            wind_response = fetch_wind_openmeteo.load_cached(aoi, dt)
            wind_mph = fetch_wind_openmeteo.wind_mph_at_hour(wind_response, dt) if wind_response else None

            partial_rows.append(
                {
                    "aoi": aoi.name,
                    "category": aoi.category,
                    "date_time": dt.isoformat(),
                    "lat": aoi.lat,
                    "lng": aoi.lng,
                    "meanTemperature": aoi_mean_temp,
                    "imperviousPct": land_cover.get("imperviousPct"),
                    "canopyPct": land_cover.get("canopyPct"),
                    "landCoverProvenance": land_cover_provenance,
                    "buildingDensity": building_density,
                    "windMph": wind_mph,
                    "humidity": schema_adapter.first_present(env_props, schema_adapter.HUMIDITY_KEYS),
                    "cloudCoverPct": schema_adapter.first_present(env_props, schema_adapter.CLOUD_COVER_KEYS),
                    "solarIrradiance": schema_adapter.first_present(env_props, schema_adapter.SOLAR_KEYS),
                    "heatIndex": schema_adapter.first_present(env_props, schema_adapter.HEAT_INDEX_KEYS),
                    "hourOfDay": dt.hour,
                }
            )

    # Pass 2: regional baseline per date_time, then anomaly = AOI mean - baseline.
    by_date_time: dict[str, list[float]] = {}
    for row in partial_rows:
        by_date_time.setdefault(row["date_time"], []).append(row["meanTemperature"])
    regional_mean = {dt: sum(temps) / len(temps) for dt, temps in by_date_time.items()}

    rows = []
    for row in partial_rows:
        row = dict(row)
        row["regionalMeanTemperature"] = regional_mean[row["date_time"]]
        row["anomaly"] = row["meanTemperature"] - row["regionalMeanTemperature"]
        rows.append(row)
    return rows


def main() -> pd.DataFrame:
    rows = build_rows()
    df = pd.DataFrame(rows)
    if df.empty:
        print("\nNo rows produced -- nothing cached yet. Run the collection pipeline first (see ml/README.md).")
        return df
    if df["date_time"].nunique() < 2 and df["aoi"].nunique() < 2:
        print("\nWARNING: only one (AOI, date_time) so far -- a regional baseline needs multiple AOIs (and "
              "ideally multiple date_times) before 'anomaly' means anything. Keep collecting.")

    before = len(df)
    df = df.dropna(subset=["imperviousPct", "canopyPct"])
    if len(df) < before:
        print(f"Dropped {before - len(df)} rows missing land-cover features (check schema_adapter.py's key aliases).")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUTPUT_PATH, index=False)
    df.to_csv(OUTPUT_CSV_PATH, index=False)
    print(f"\nWrote {len(df)} rows across {df['aoi'].nunique()} AOIs to {OUTPUT_PATH}")
    print(df.describe(include="all").transpose())
    return df


if __name__ == "__main__":
    main()
