"""Orchestrates ENRICHMENT_PLAN.md's per-cell enrichment across every AOI
that already has a cached FortyGuard heatmap grid: NDVI-disaggregated
canopy%, elevation, distance-to-coast, albedo, and NLCD fractional
impervious%, all free (no FortyGuard credits touched), all per 100m cell.

Checkpointed per AOI (writes data/processed/enrichment/<aoi>.parquet as it
goes) so a transient failure on one AOI (Sentinel-2 cloud cover, Open-
Elevation flakiness, MRLC WCS timeout) doesn't lose progress on the rest --
same pattern as run_collection.py. Safe to re-run: already-written AOI
files are skipped.

Usage (from ml/, venv active):
    python -m src.enrich.run_enrichment
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from ..collect import fetch_osm_landcover, fetch_satellite
from ..features import schema_adapter
from ..features.build_dataset import ALL_AOIS
from . import coast_distance, compute_albedo, compute_ndvi, fetch_elevation, fetch_nlcd_impervious
from .cell_geometry import aoi_cells

OUTPUT_DIR = Path(__file__).resolve().parents[2] / "data" / "processed" / "enrichment"
COMBINED_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "enrichment.parquet"


def _resolve_aoi_land_cover(aoi) -> tuple[dict, str]:
    """Same real-satellite-else-OSM-fallback pattern as build_dataset.py."""
    satellite_response = fetch_satellite.load_cached(aoi)
    if satellite_response:
        return schema_adapter.extract_land_cover(satellite_response), "live"
    osm_response = fetch_osm_landcover.load_cached(aoi)
    if not osm_response:
        return {}, "none"
    return fetch_osm_landcover.estimate_land_cover(osm_response, aoi), "modelled"


def enrich_one_aoi(aoi) -> pd.DataFrame | None:
    cells = aoi_cells(aoi)
    if not cells:
        print(f"  [skip] {aoi.name}: no cached heatmap grid yet.")
        return None

    land_cover, provenance = _resolve_aoi_land_cover(aoi)
    aoi_canopy_pct = land_cover.get("canopyPct")

    rows = [{"aoi": aoi.name, "cell_index": i, "lat": c["lat"], "lng": c["lng"]} for i, c in enumerate(cells)]
    df = pd.DataFrame(rows).set_index("cell_index")

    if aoi_canopy_pct is not None:
        try:
            df["canopyPct_cell"] = pd.Series(compute_ndvi.disaggregate_canopy_pct(aoi, aoi_canopy_pct))
        except Exception as exc:  # noqa: BLE001
            print(f"  [warn] NDVI disaggregation failed for {aoi.name}: {exc}")
    df["landCoverProvenance"] = provenance

    try:
        df["elevation_m"] = pd.Series(fetch_elevation.fetch_elevation(aoi))
    except Exception as exc:  # noqa: BLE001
        print(f"  [warn] elevation fetch failed for {aoi.name}: {exc}")

    try:
        df["distanceToCoast_m"] = pd.Series(coast_distance.aoi_coast_distances(aoi))
    except Exception as exc:  # noqa: BLE001
        print(f"  [warn] coast-distance failed for {aoi.name}: {exc}")

    try:
        df["albedo"] = pd.Series(compute_albedo.cell_albedo(aoi))
    except Exception as exc:  # noqa: BLE001
        print(f"  [warn] albedo failed for {aoi.name}: {exc}")

    try:
        df["imperviousPct_nlcd"] = pd.Series(fetch_nlcd_impervious.aoi_impervious_pct(aoi))
    except Exception as exc:  # noqa: BLE001
        print(f"  [warn] NLCD impervious fetch failed for {aoi.name}: {exc}")

    return df.reset_index()


def run() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    processed, skipped, failed = 0, 0, []
    for aoi in ALL_AOIS:
        safe_name = aoi.name.replace(" ", "_").replace("/", "-")
        out_path = OUTPUT_DIR / f"{safe_name}.parquet"
        if out_path.exists():
            processed += 1
            continue
        print(f"=== {aoi.name} ===")
        try:
            df = enrich_one_aoi(aoi)
        except Exception as exc:  # noqa: BLE001 - one AOI's failure must not lose progress on the rest
            print(f"  [FAILED] {aoi.name}: {exc}")
            failed.append(aoi.name)
            continue
        if df is None:
            skipped += 1
            continue
        df.to_parquet(out_path)
        print(f"  wrote {len(df)} cells -> {out_path.name}")
        processed += 1

    print(f"\nEnrichment pass complete. AOIs with output: {processed}, skipped (no heatmap yet): {skipped}, failed: {len(failed)}.")
    if failed:
        print(f"  Failed (re-run to retry -- already-written AOIs are skipped): {', '.join(failed)}")

    # Combine whatever AOI files exist into one parquet for build_dataset.py.
    parts = [pd.read_parquet(p) for p in OUTPUT_DIR.glob("*.parquet")]
    if parts:
        combined = pd.concat(parts, ignore_index=True)
        combined.to_parquet(COMBINED_PATH)
        print(f"Combined {len(combined)} rows across {combined['aoi'].nunique()} AOIs -> {COMBINED_PATH}")


if __name__ == "__main__":
    run()
