"""Collect 10pm, 1am and 4am local-time heatmaps for screened night regimes.

This intentionally requires a completed sentinel screen before paid execution.
It collects only heatmaps: weather context is already represented by the
same-night peer comparison and can be added from free historical weather data
later, without multiplying FortyGuard calls per AOI.
"""

from __future__ import annotations

import argparse
import json
from datetime import date, datetime

from .config import CACHE_VERSION, HEATMAP_COST, PANEL_AOIS, los_angeles_tz, night_pair
from .fortyguard import fetch_heatmap, slug
from .isolation import DATA_ROOT, atomic_write_json, exclusive_collection_lock
from .screen_nights import CANDIDATE_NIGHTS

# Reduced from 12 at the user's request.  These six retain the widest practical
# driver coverage while avoiding another long run: dense core, industrial,
# Southeast LA, park-adjacent, valley and coastal.  Commerce/El Segundo data
# already cached before the reduction is preserved but excluded from this run.
FULL_PANEL_NAMES = (
    "Downtown LA",
    "Vernon",
    "Huntington Park",
    "Elysian Park",
    "Sylmar",
    "Venice",
)


def full_panel():
    lookup = {aoi.name: aoi for aoi in PANEL_AOIS}
    return tuple(lookup[name] for name in FULL_PANEL_NAMES)


def overnight_triplet(night_date: date) -> dict[str, datetime]:
    pair = night_pair(night_date)
    next_date = date.fromordinal(night_date.toordinal() + 1)
    return {
        "evening": pair["evening"],
        "overnight": datetime(next_date.year, next_date.month, next_date.day, 1, tzinfo=los_angeles_tz()),
        "predawn": pair["predawn"],
    }


def screened_candidates() -> tuple[tuple[str, date], ...]:
    path = DATA_ROOT / f"screen_results_{CACHE_VERSION}.json"
    if not path.exists():
        return ()
    try:
        results = json.loads(path.read_text(encoding="utf-8")).get("results") or []
    except (OSError, json.JSONDecodeError):
        return ()
    complete_counts: dict[str, int] = {}
    for result in results:
        if result.get("status", "complete") == "complete":
            label = result.get("label")
            if label:
                complete_counts[label] = complete_counts.get(label, 0) + 1
    return tuple(candidate for candidate in CANDIDATE_NIGHTS if complete_counts.get(candidate[0]) == 3)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--daytime-pipeline-idle", action="store_true")
    args = parser.parse_args()
    screened = screened_candidates()
    panel = full_panel()
    requests = len(screened) * len(panel) * 3
    print(f"Full multi-night collection: {len(screened)} screened nights × {len(panel)} AOIs × 3 heatmaps")
    print(f"Maximum cost: {requests * HEATMAP_COST:,} credits")
    if not args.execute:
        print("Dry run only. No network calls and no credits spent.")
        return
    if not args.daytime_pipeline_idle:
        raise SystemExit("Pass --daytime-pipeline-idle only after confirming paid work is authorised.")
    if len(screened) < 3:
        raise SystemExit("Need at least three complete sentinel-screen nights before full collection.")

    completed: list[dict] = []
    manifest_path = DATA_ROOT / f"multi_night_manifest_{CACHE_VERSION}.json"
    with exclusive_collection_lock():
        for label, night_date in screened:
            for aoi in panel:
                print(f"[{label}] {aoi.name}", flush=True)
                for period, timestamp in overnight_triplet(night_date).items():
                    fetch_heatmap(aoi, f"multi-{slug(label)}-{period}", timestamp)
                completed.append({"label": label, "night_date": str(night_date), "aoi": aoi.name, "periods": ["evening", "overnight", "predawn"]})
                atomic_write_json(manifest_path, {"completed_aoi_nights": completed})
    print(f"Full collection complete: {len(completed)} AOI/night checkpoints written to {manifest_path}")


if __name__ == "__main__":
    main()
