"""Prove FortyGuard's nighttime time semantics with two heatmaps only.

This is a deliberately cheap gate before re-collecting the panel.  It sends
22:00 and 04:00 as LA-local API values, while retaining UTC cache IDs for
unambiguous filenames.  It makes exactly two heatmap calls (8,440 credits)
and no env-params calls.
"""

from __future__ import annotations

import argparse
from datetime import date
from statistics import fmean

from .config import PANEL_AOIS, night_pair
from .extract_pairs import read_heatmap
from .fortyguard import cache_path, fetch_heatmap
from .isolation import exclusive_collection_lock


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--night-date", required=True, type=parse_date)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--daytime-pipeline-idle", action="store_true")
    args = parser.parse_args()
    aoi = PANEL_AOIS[0]
    pair = night_pair(args.night_date)
    print(f"Local-time semantic check: {aoi.name}; 2 heatmaps; estimated 8,440 credits")
    for period, timestamp in pair.items():
        print(f"  {period}: API local {timestamp.isoformat()}")
    if not args.execute:
        print("Dry run only. No network calls and no credits spent.")
        return
    if not args.daytime_pipeline_idle:
        raise SystemExit("Refusing concurrent paid work. Pass --daytime-pipeline-idle only when authorised.")
    with exclusive_collection_lock():
        for period, timestamp in pair.items():
            fetch_heatmap(aoi, f"local-time-check-{period}", timestamp)
            cells = read_heatmap(cache_path(aoi, f"local-time-check-{period}", "heatmap", timestamp))
            values = [cell["temperature_c"] for cell in cells]
            print(f"{period}: cells={len(values)} mean_c={fmean(values):.2f} min_c={min(values):.2f} max_c={max(values):.2f}")


if __name__ == "__main__":
    main()
