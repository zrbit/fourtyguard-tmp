"""Minimal Phase 0 verification for nighttime and historical timestamps.

No request is made without BOTH ``--execute`` and ``--daytime-pipeline-idle``.
It tests one AOI and one chosen nighttime timestamp against both endpoints,
writing only to this package's isolated cache.  Run this before the panel
collector, once the daytime collection is finished.
"""

from __future__ import annotations

import argparse
from datetime import datetime

from .config import PANEL_AOIS, UTC
from .fortyguard import fetch_env_params, fetch_heatmap
from .isolation import exclusive_collection_lock


def parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise argparse.ArgumentTypeError("Use a timezone-aware timestamp such as 2024-09-06T05:00:00Z.")
    return parsed.astimezone(UTC)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timestamp", required=True, type=parse_timestamp, help="Historical LA-night timestamp in ISO 8601")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--daytime-pipeline-idle", action="store_true")
    args = parser.parse_args()
    aoi = PANEL_AOIS[0]
    print(f"Phase 0 test: {aoi.name} at {args.timestamp.isoformat()} (heatmap + env_params)")
    if not args.execute:
        print("Dry run only. No network calls and no credits spent.")
        return
    if not args.daytime_pipeline_idle:
        raise SystemExit("Refusing concurrent paid work. Wait for the daytime pipeline and pass --daytime-pipeline-idle.")
    with exclusive_collection_lock():
        fetch_heatmap(aoi, "capability-check", args.timestamp)
        fetch_env_params(aoi, "capability-check", args.timestamp)
    print("Success: both endpoints accepted this nighttime/historical timestamp. Review the isolated cache before panel collection.")


if __name__ == "__main__":
    main()
