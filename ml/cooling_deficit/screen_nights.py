"""Screen historically distinct nights before full-panel overnight collection.

The screen uses only three sentinel AOIs (Downtown LA, Venice and Sylmar) and
two local-time heatmaps (22:00 and 04:00).  Its purpose is not to find only
strong cooling: it identifies a portfolio containing strong, normal and weak
citywide cooling regimes for the later chronic-deficit analysis.

The run is resumable.  Every AOI/night pair is cached and checkpointed inside
``cooling_deficit/data``; shared daytime state is never read or written.
"""

from __future__ import annotations

import argparse
from datetime import date
from statistics import fmean

from .config import CACHE_VERSION, HEATMAP_COST, PANEL_AOIS, night_pair
from .extract_pairs import read_heatmap
from .fortyguard import cache_path, fetch_heatmap, slug
from .isolation import DATA_ROOT, atomic_write_json, exclusive_collection_lock

# These dates were already selected from Open-Meteo historical regimes for the
# daytime weather-diversity plan.  They span heatwave, storm, Santa Ana,
# marine-layer, clear shoulder-season and cold/windy winter conditions.
CANDIDATE_NIGHTS: tuple[tuple[str, date], ...] = (
    ("extreme-heat-wave", date(2024, 9, 5)),
    ("winter-storm", date(2026, 2, 15)),
    ("santa-ana-wind", date(2021, 11, 24)),
    ("june-gloom", date(2021, 6, 6)),
    ("mild-clear-shoulder", date(2022, 10, 26)),
    ("cold-windy-winter", date(2023, 2, 24)),
)
SENTINEL_NAMES = ("Downtown LA", "Venice", "Sylmar")


def sentinels():
    lookup = {aoi.name: aoi for aoi in PANEL_AOIS}
    return tuple(lookup[name] for name in SENTINEL_NAMES)


def mean_temperature(path) -> tuple[int, float]:
    values = [cell["temperature_c"] for cell in read_heatmap(path)]
    if not values:
        raise ValueError(f"No temperature cells in {path}")
    return len(values), fmean(values)


def result_for(label: str, night_date: date, aoi) -> dict:
    pair = night_pair(night_date)
    observations = {}
    for period, timestamp in pair.items():
        period_id = f"screen-{slug(label)}-{period}"
        path = cache_path(aoi, period_id, "heatmap", timestamp)
        cells, mean = mean_temperature(path)
        observations[period] = {"cells": cells, "mean_temperature_c": mean, "api_local_time": timestamp.isoformat()}
    delta = observations["evening"]["mean_temperature_c"] - observations["predawn"]["mean_temperature_c"]
    return {"label": label, "night_date": str(night_date), "aoi": aoi.name, "category": aoi.category, "evening": observations["evening"], "predawn": observations["predawn"], "city_cooling_c": delta}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--daytime-pipeline-idle", action="store_true")
    args = parser.parse_args()
    pair_count = len(CANDIDATE_NIGHTS) * len(SENTINEL_NAMES)
    print(f"Screen: {len(CANDIDATE_NIGHTS)} nights × {len(SENTINEL_NAMES)} sentinels × 2 heatmaps")
    print(f"Maximum cost: {pair_count * 2 * HEATMAP_COST:,} credits")
    if not args.execute:
        for label, night_date in CANDIDATE_NIGHTS:
            print(f"  {label}: {night_date}")
        print("Dry run only. No network calls and no credits spent.")
        return
    if not args.daytime_pipeline_idle:
        raise SystemExit("Pass --daytime-pipeline-idle only after confirming paid work is authorised.")

    results: list[dict] = []
    manifest_path = DATA_ROOT / f"screen_manifest_{CACHE_VERSION}.json"
    results_path = DATA_ROOT / f"screen_results_{CACHE_VERSION}.json"
    with exclusive_collection_lock():
        for label, night_date in CANDIDATE_NIGHTS:
            for aoi in sentinels():
                print(f"[{label}] {aoi.name}", flush=True)
                for period, timestamp in night_pair(night_date).items():
                    fetch_heatmap(aoi, f"screen-{slug(label)}-{period}", timestamp)
                try:
                    result = result_for(label, night_date, aoi)
                    result["status"] = "complete"
                except ValueError as exc:
                    # An accepted historical job can still contain no cells.
                    # Record it explicitly and skip the rest of that night:
                    # a zero-cell baseline must never enter peer selection.
                    result = {"label": label, "night_date": str(night_date), "aoi": aoi.name, "category": aoi.category, "status": "invalid-empty-heatmap", "error": str(exc)}
                    results.append(result)
                    atomic_write_json(manifest_path, {"completed_pairs": results})
                    atomic_write_json(results_path, {"results": results})
                    print(f"[{label}] skipped: empty heatmap", flush=True)
                    break
                results.append(result)
                atomic_write_json(manifest_path, {"completed_pairs": results})
                atomic_write_json(results_path, {"results": results})
    print(f"Screen complete: {len(results)} AOI/night observations written to {results_path}")


if __name__ == "__main__":
    main()
