"""Collect a same-night evening/predawn pair into an isolated cache.

Default mode is a zero-credit dry run.  ``--execute`` additionally requires an
explicit confirmation that the daytime collector is idle, preventing accidental
concurrent requests while another agent owns the shared training collection.

Run from ``ml`` after the daytime job is finished:
  python -m cooling_deficit.collect_overnight --night-date 2026-08-30 --dry-run
  python -m cooling_deficit.collect_overnight --night-date 2026-08-30 --execute --daytime-pipeline-idle
"""

from __future__ import annotations

import argparse
from datetime import date

from .config import ENV_PARAMS_COST, HEATMAP_COST, PANEL_AOIS, night_pair
from .fortyguard import fetch_env_params, fetch_heatmap
from .isolation import DATA_ROOT, atomic_write_json, exclusive_collection_lock


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--night-date", required=True, type=parse_date, help="LA evening date, YYYY-MM-DD")
    run_mode = parser.add_mutually_exclusive_group()
    run_mode.add_argument("--execute", action="store_true", help="Perform paid API requests")
    run_mode.add_argument("--dry-run", action="store_true", help="Print the plan without API requests (the default)")
    parser.add_argument("--daytime-pipeline-idle", action="store_true", help="Required acknowledgement before paid requests")
    args = parser.parse_args()

    pair = night_pair(args.night_date)
    paid_calls = len(PANEL_AOIS) * len(pair) * 2  # heatmap and env params per timestamp
    estimated_credits = len(PANEL_AOIS) * len(pair) * (HEATMAP_COST + ENV_PARAMS_COST)
    print("Cooling-deficit panel (isolated from ml/data/raw and shared ledger)")
    print(f"  AOIs: {len(PANEL_AOIS)} | API calls: {paid_calls} | estimated maximum: {estimated_credits:,} credits")
    for period, timestamp in pair.items():
        print(f"  {period}: {timestamp.isoformat()}")
    if not args.execute:
        print("\nDry run only. No network calls and no credits spent.")
        return
    if not args.daytime_pipeline_idle:
        raise SystemExit(
            "Refusing to run concurrently. Wait until Claude's daytime pipeline is finished, then rerun with "
            "--daytime-pipeline-idle."
        )

    manifest: list[dict] = []
    with exclusive_collection_lock():
        for aoi in PANEL_AOIS:
            print(f"\n[{aoi.name}] checkpoint")
            completed: list[str] = []
            for period, timestamp in pair.items():
                fetch_heatmap(aoi, period, timestamp)
                fetch_env_params(aoi, period, timestamp)
                completed.append(period)
            manifest.append({"aoi": aoi.name, "category": aoi.category, "periods": completed})
            atomic_write_json(DATA_ROOT / "collection_manifest.json", {"night_date": str(args.night_date), "aois": manifest})
    print("\nComplete. Each AOI was checkpointed under cooling_deficit/data/raw/.")


if __name__ == "__main__":
    main()
