"""Tier 2: builds one row per (AOI, date_time, 100m cell) instead of Tier
1's one row per (AOI, date_time). Reuses Tier 1's AOI x date_time
env_params/wind/building-density (those are genuinely AOI-constant, not
per-cell -- FortyGuard's /env_params and Open-Meteo wind don't have
per-cell granularity) and joins in ENRICHMENT_PLAN.md's per-cell features
(NDVI-disaggregated canopy%, NLCD impervious%, elevation, distance-to-
coast, albedo) plus each cell's own real temperature from the cached
/heatmap response.

Target: cellAnomaly = this cell's temperature - its AOI's mean temperature
at that same date_time. Different from Tier 1's `anomaly` (AOI mean vs.
regional mean) -- Tier 1 answers "why is this neighborhood hotter than the
city," Tier 2 answers "why is this specific block hotter than its own
neighborhood." Both stay useful: Tier 1 feeds the existing city-level
view, Tier 2 is the new per-cell "why is this block hot" + the 400-500m
clustering/action-plan layer built on top of it.

Cell join key: rounded (lat, lng) to 6 decimals. Verified this session
(see conversation) that a given AOI's heatmap grid returns the identical
set of cell centroids across every date_time it has real data for --
enrichment.parquet's cell rows (computed once per AOI, from whichever
date_time was cached first) therefore match every other date_time's cells
by position, no separate per-date_time enrichment needed.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from ..collect import fetch_env_params, fetch_heatmap, fetch_osm_buildings, fetch_wind_openmeteo
from . import schema_adapter
from .build_dataset import ALL_AOIS, _candidate_date_times, _env_properties

OUTPUT_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "dataset_percell.parquet"
OUTPUT_CSV_PATH = OUTPUT_PATH.with_suffix(".csv")
ENRICHMENT_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "enrichment.parquet"


def _cell_key(lat: float, lng: float) -> tuple[float, float]:
    return round(lat, 6), round(lng, 6)


def build_rows() -> list[dict]:
    if not ENRICHMENT_PATH.exists():
        raise SystemExit(f"{ENRICHMENT_PATH} not found. Run `python -m src.enrich.run_enrichment` first.")
    enrichment = pd.read_parquet(ENRICHMENT_PATH)
    enrichment_by_aoi: dict[str, dict[tuple[float, float], dict]] = {}
    for aoi_name, group in enrichment.groupby("aoi"):
        enrichment_by_aoi[aoi_name] = {
            _cell_key(r["lat"], r["lng"]): r.to_dict() for _, r in group.iterrows()
        }

    date_time_candidates = _candidate_date_times()
    rows: list[dict] = []
    skipped_no_enrichment = 0
    for aoi in ALL_AOIS:
        cell_lookup = enrichment_by_aoi.get(aoi.name)
        if not cell_lookup:
            continue  # no enrichment yet for this AOI -- Tier 2 needs it, unlike Tier 1

        buildings_response = fetch_osm_buildings.load_cached(aoi)
        building_density = (
            fetch_osm_buildings.building_density(buildings_response, aoi) if buildings_response else None
        )

        for dt in date_time_candidates:
            heatmap_response = fetch_heatmap.load_cached(aoi, dt)
            if not heatmap_response:
                continue
            cells = schema_adapter.extract_cells(heatmap_response)
            if not cells:
                continue

            temps_f = []
            cell_temps: list[tuple[dict, float]] = []
            for cell in cells:
                temp_c = schema_adapter.first_present(cell["properties"], schema_adapter.TEMPERATURE_KEYS)
                if temp_c is None:
                    continue
                temp_f = schema_adapter.celsius_to_fahrenheit(temp_c)
                temps_f.append(temp_f)
                cell_temps.append((cell, temp_f))
            if not temps_f:
                continue
            aoi_mean_temp = sum(temps_f) / len(temps_f)

            env_props = _env_properties(fetch_env_params.load_cached(aoi, dt))
            wind_response = fetch_wind_openmeteo.load_cached(aoi, dt)
            wind_mph = fetch_wind_openmeteo.wind_mph_at_hour(wind_response, dt) if wind_response else None

            for cell, temp_f in cell_temps:
                key = _cell_key(cell["lat"], cell["lng"])
                enrich = cell_lookup.get(key)
                if enrich is None:
                    skipped_no_enrichment += 1
                    continue
                rows.append({
                    "aoi": aoi.name,
                    "category": aoi.category,
                    "date_time": dt.isoformat(),
                    "lat": cell["lat"],
                    "lng": cell["lng"],
                    "cellTemperature": temp_f,
                    "aoiMeanTemperature": aoi_mean_temp,
                    "cellAnomaly": temp_f - aoi_mean_temp,
                    "imperviousPct": enrich.get("imperviousPct_nlcd"),
                    "canopyPct": enrich.get("canopyPct_cell"),
                    "albedo": enrich.get("albedo"),
                    "elevationM": enrich.get("elevation_m"),
                    "distanceToCoastM": enrich.get("distanceToCoast_m"),
                    "buildingDensity": building_density,
                    "windMph": wind_mph,
                    "humidity": schema_adapter.first_present(env_props, schema_adapter.HUMIDITY_KEYS),
                    "cloudCoverPct": schema_adapter.first_present(env_props, schema_adapter.CLOUD_COVER_KEYS),
                    "solarIrradiance": schema_adapter.first_present(env_props, schema_adapter.SOLAR_KEYS),
                    "heatIndex": schema_adapter.first_present(env_props, schema_adapter.HEAT_INDEX_KEYS),
                    "hourOfDay": dt.hour,
                })

    if skipped_no_enrichment:
        print(f"  [note] {skipped_no_enrichment} heatmap cells had no matching enrichment row (lat/lng join miss).")
    return rows


def main() -> pd.DataFrame:
    rows = build_rows()
    df = pd.DataFrame(rows)
    if df.empty:
        print("\nNo rows produced -- run FortyGuard collection and src.enrich.run_enrichment first.")
        return df

    before = len(df)
    df = df.dropna(subset=["imperviousPct", "canopyPct", "albedo"])
    if len(df) < before:
        print(f"Dropped {before - len(df)} rows missing a core per-cell feature.")

    # AOI-relative versions of the per-cell land-cover/context features.
    # Verified empirically (this session): training on absolute values gives
    # NEGATIVE cross-AOI CV R2 (-0.051) -- worse than predicting the AOI
    # mean. Absolute imperviousPct/canopyPct/etc. ranges differ hugely
    # across AOIs (e.g. Downtown LA's impervious% only ever ranges 67-100%;
    # a leafy hillside AOI's range is completely different), so a tree
    # threshold learned on one AOI's absolute range doesn't transfer to
    # another's. Centering each feature on its own AOI's mean fixes this
    # (CV R2 -> +0.057): the model then learns "warmer/cooler than THIS
    # neighborhood's own norm," which is exactly the question cellAnomaly
    # is asking. Both absolute and relative columns are kept -- relative for
    # training/SHAP, absolute for display/debugging.
    for col in ["imperviousPct", "canopyPct", "albedo", "elevationM", "distanceToCoastM"]:
        df[col + "Rel"] = df[col] - df.groupby("aoi")[col].transform("mean")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUTPUT_PATH, index=False)
    df.to_csv(OUTPUT_CSV_PATH, index=False)
    print(f"\nWrote {len(df)} cell-rows across {df['aoi'].nunique()} AOIs to {OUTPUT_PATH}")
    print(df.describe(include="all").transpose())
    return df


if __name__ == "__main__":
    main()
