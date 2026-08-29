"""Orchestrates data collection across all AOIs and date_times.

Defaults to --dry-run (prints the full call plan and estimated credit cost,
touches no network). Pass --execute to actually spend credits, bounded by
--credit-cap (default 250,000, per the confirmed "moderate" budget tier).

Budget discipline: each AOI's *entire* cost (satellite once + heatmap and
env_params per date_time) is checked as a single unit before any call for
that AOI is made. An AOI that wouldn't fully fit in the remaining budget is
skipped outright rather than partially collected -- spending 14,400 credits
on satellite land-cover for an AOI that then can't afford a single heatmap
call would leave that AOI with features but no temperature label, wasting
the spend entirely.

Usage (from ml/, with the venv active):
    python -m src.collect.run_collection --dry-run
    python -m src.collect.run_collection --execute --credit-cap 250000
"""

from __future__ import annotations

import argparse

from .aoi_sampling import AOIS, Aoi
from .credit_ledger import COST_ESTIMATES, CreditLedger
from .date_times import sample_date_times
from . import fetch_satellite as fetch_satellite_module
from .fetch_env_params import fetch_env_params
from .fetch_heatmap import fetch_heatmap
from .fetch_osm_buildings import fetch_buildings
from .fetch_osm_landcover import fetch_landcover
from .fetch_wind_openmeteo import fetch_wind

def aoi_total_cost(date_time_count: int) -> int:
    satellite_cost, _ = COST_ESTIMATES["satellite"]
    heatmap_cost, _ = COST_ESTIMATES["heatmap"]
    env_cost, _ = COST_ESTIMATES["env_params"]
    return satellite_cost + date_time_count * (heatmap_cost + env_cost)


def print_dry_run(date_time_count: int, credit_cap: int) -> None:
    per_aoi = aoi_total_cost(date_time_count)
    affordable = credit_cap // per_aoi if per_aoi else 0
    planned = AOIS[: min(affordable, len(AOIS))]

    print(f"Candidate AOIs: {len(AOIS)}  |  date_times per AOI: {date_time_count}  |  cost per AOI: ~{per_aoi} credits")
    print(f"At the {credit_cap} cap, ~{affordable} AOIs are affordable in full; {len(planned)} will be attempted:\n")
    for aoi in planned:
        print(f"  {aoi.name:<32} [{aoi.category}]")
    if len(planned) < len(AOIS):
        skipped = AOIS[len(planned):]
        print(f"\n  Skipped (would exceed the cap): {', '.join(a.name for a in skipped)}")
    print(f"\nEstimated total: ~{len(planned) * per_aoi} / {credit_cap} credits (all three unit costs confirmed")
    print("  via /v1/system/fetch-api-key-usage -- see credit_ledger.py.)")
    print("\nThis was a dry run. No network calls were made. Re-run with --execute to collect for real.")


def collect_one_aoi(aoi: Aoi, date_times: list, ledger: CreditLedger) -> None:
    print(f"\n=== {aoi.name} ({aoi.category}) ===")
    # No quota (confirmed) -- always attempt real satellite. fetch_satellite()
    # already skips the network call for free if this AOI is cached.
    try:
        fetch_satellite_module.fetch_satellite(aoi, ledger)
    except Exception as exc:  # noqa: BLE001 - fall back to the OSM estimate rather than lose the AOI entirely
        print(f"  [warn] satellite failed for {aoi.name}, falling back to OSM land-cover estimate: {exc}")
    try:
        fetch_buildings(aoi)  # free
    except Exception as exc:  # noqa: BLE001 - best-effort supplementary source
        print(f"  [warn] OSM buildings failed for {aoi.name}: {exc}")
    try:
        fetch_landcover(aoi)  # free
    except Exception as exc:  # noqa: BLE001 - best-effort supplementary source
        print(f"  [warn] OSM landcover failed for {aoi.name}: {exc}")

    for dt in date_times:
        fetch_heatmap(aoi, dt, ledger)
        fetch_env_params(aoi, dt, ledger)
        try:
            fetch_wind(aoi, dt)  # free
        except Exception as exc:  # noqa: BLE001 - best-effort supplementary source
            print(f"  [warn] wind fetch failed for {aoi.name} @ {dt.isoformat()}: {exc}")


def run(date_time_count: int, credit_cap: int, aois: list[Aoi] = AOIS) -> None:
    ledger = CreditLedger.load(cap=credit_cap)
    per_aoi = aoi_total_cost(date_time_count)
    date_times = sample_date_times(date_time_count)

    print(f"Starting collection. Cap: {credit_cap}. Already spent (prior runs): {ledger.spent}.")
    processed, skipped, failed = 0, 0, []
    for aoi in aois:
        if not ledger.can_afford(per_aoi):
            print(f"\nSkipping {aoi.name}: remaining budget ({credit_cap - ledger.spent}) can't cover this AOI's full cost (~{per_aoi}).")
            skipped += 1
            continue
        try:
            collect_one_aoi(aoi, date_times, ledger)
            processed += 1
        except Exception as exc:  # noqa: BLE001 - one AOI's failure (timeout, transient API error) must not
            # abort the whole batch and lose progress on every AOI after it;
            # whatever this AOI already paid for is cached and safe either way.
            print(f"\n  [FAILED] {aoi.name}: {exc}. Continuing with the next AOI.")
            failed.append(aoi.name)

    print(f"\nCollection complete. AOIs processed: {processed}, skipped for budget: {skipped}, failed: {len(failed)}.")
    if failed:
        print(f"  Failed AOIs (re-run the script to retry -- already-cached calls won't be re-charged): {', '.join(failed)}")
    print(ledger.summary())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="Actually make network calls / spend credits.")
    parser.add_argument("--dry-run", action="store_true", help="Print the plan and estimated cost only (default).")
    parser.add_argument("--credit-cap", type=int, default=250_000, help="Hard cap on estimated credits spent.")
    parser.add_argument("--date-times", type=int, default=2, help="Distinct date_times sampled per AOI (max 4).")
    parser.add_argument(
        "--pilot",
        action="store_true",
        help="Collect only the first AOI (with --execute). Use this FIRST to confirm real response "
        "shapes and actual credit costs before running the full batch -- see ml/README.md step 2.",
    )
    args = parser.parse_args()

    if args.execute:
        aois = AOIS[:1] if args.pilot else AOIS
        run(date_time_count=args.date_times, credit_cap=args.credit_cap, aois=aois)
    else:
        print_dry_run(date_time_count=args.date_times, credit_cap=args.credit_cap)


if __name__ == "__main__":
    main()
