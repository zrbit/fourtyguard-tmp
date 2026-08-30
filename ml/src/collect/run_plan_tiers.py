"""Execute COLLECTION_PLAN.md's Tier 1-6 + deprioritized fetch order,
daytime-only (1pm/4pm LA-local per the plan's hour policy), switching from
FORTYGUARD_TRAINING_API_KEY to FORTYGUARD_TRAINING_API_KEY_2 once the first
key's real remaining balance is exhausted.

The plan's named AOIs already exist as Aoi objects, but several of them
(the Southeast LA ones especially) were left sitting in aoi_sampling.NIGHT_AOIS
from the now-cancelled night-batch effort. This script pulls each plan AOI
by name from whichever list (AOIS or NIGHT_AOIS) actually has it, in the
plan's tier order, and collects with daytime_date_times only -- never uses
--night-batch's day+night combination.

Usage (from ml/, venv active):
    python -m src.collect.run_plan_tiers --execute
    python -m src.collect.run_plan_tiers --dry-run   (default; no network)
"""

from __future__ import annotations

import argparse
import os

import requests

from .aoi_sampling import AOIS, NIGHT_AOIS, Aoi
from .credit_ledger import LEDGER_PATH, CreditLedger
from .date_times import _persisted_local_hour_date_times
from .run_collection import aoi_total_cost, run

# Plan order, verbatim from COLLECTION_PLAN.md's "Fetch order" section.
PLAN_ORDER: list[str] = [
    # Tier 1
    "Huntington Park", "Bell", "South Gate", "Lynwood", "Compton",
    # Tier 2
    "Commerce", "Elysian Park",
    # Tier 3
    "Wilmington", "El Segundo",
    # Tier 4
    "Sun Valley", "Panorama City", "Sylmar",
    # Tier 5
    "Downey", "Bellflower", "Lakewood",
    # Tier 6
    "West Adams", "Mid-City", "Harbor City",
    # Deprioritized
    "Larchmont", "Atwater Village", "Angelino Heights", "Cypress Park",
    "El Sereno", "Glendale", "Burbank", "Little Tokyo", "South Pasadena",
    "West LA", "Playa del Rey", "Long Beach (downtown)",
    "Westchester / LAX-adjacent", "Whittier", "Palms",
]

_USAGE_URL = "https://api.fortyguard.com/v1/system/fetch-api-key-usage"


def _by_name() -> dict[str, Aoi]:
    lookup: dict[str, Aoi] = {}
    for aoi in [*AOIS, *NIGHT_AOIS]:
        lookup[aoi.name] = aoi
    return lookup


def plan_aois() -> list[Aoi]:
    lookup = _by_name()
    missing = [n for n in PLAN_ORDER if n not in lookup]
    if missing:
        raise SystemExit(f"PLAN_ORDER names not found in AOIS/NIGHT_AOIS: {missing}")
    return [lookup[n] for n in PLAN_ORDER]


def remaining_credits(key: str) -> int | None:
    if not key:
        return None
    try:
        resp = requests.post(_USAGE_URL, json={"api_key": key}, timeout=30)
        resp.raise_for_status()
        return resp.json()["credit_summary"]["cycle_remaining_credits"]
    except Exception as exc:  # noqa: BLE001
        print(f"  [warn] couldn't check remaining credits: {exc}")
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--safety-margin", type=int, default=2_000,
                         help="Credits held back below the live-reported balance per key, as a buffer "
                              "against estimate/reality drift before switching keys.")
    args = parser.parse_args()

    aois = plan_aois()
    date_times = _persisted_local_hour_date_times("day:plan_tiers:1pm_4pm", [13, 16], days_back=1)
    per_aoi_worst_case = aoi_total_cost(len(date_times))

    print(f"Plan AOIs: {len(aois)}  |  date_times: {[dt.isoformat() for dt in date_times]}")
    print(f"Worst-case cost per AOI (no cache hits): ~{per_aoi_worst_case} credits\n")
    for a in aois:
        print(f"  {a.name:<32} [{a.category}]")

    if not args.execute:
        print("\nThis was a dry run. Re-run with --execute to collect for real.")
        return

    key1 = os.environ.get("FORTYGUARD_TRAINING_API_KEY", "")
    key2 = os.environ.get("FORTYGUARD_TRAINING_API_KEY_2", "")
    if not key1 or not key2:
        raise SystemExit("Both FORTYGUARD_TRAINING_API_KEY and FORTYGUARD_TRAINING_API_KEY_2 must be set.")

    starting_ledger_spent = CreditLedger.load(cap=0).spent

    # --- Phase A: key 1 ---
    key1_remaining = remaining_credits(key1)
    if key1_remaining is None:
        raise SystemExit("Couldn't confirm key 1's remaining balance; aborting rather than risk overspend.")
    print(f"\n=== Phase A: FORTYGUARD_TRAINING_API_KEY ({key1_remaining} credits remaining) ===")
    if key1_remaining <= args.safety_margin:
        print("  Key 1 already exhausted (below safety margin). Skipping straight to key 2.")
    else:
        cap_a = starting_ledger_spent + (key1_remaining - args.safety_margin)
        run(date_times=date_times, credit_cap=cap_a, aois=aois)

    key1_remaining_after = remaining_credits(key1)
    print(f"\nKey 1 remaining after phase A: {key1_remaining_after}")

    # --- Phase B: key 2 ---
    os.environ["FORTYGUARD_TRAINING_API_KEY"] = key2  # fetch_*'s _api_key() re-reads this each call
    ledger_spent_before_b = CreditLedger.load(cap=0).spent
    key2_remaining = remaining_credits(key2)
    if key2_remaining is None:
        raise SystemExit("Couldn't confirm key 2's remaining balance; aborting rather than risk overspend.")
    print(f"\n=== Phase B: FORTYGUARD_TRAINING_API_KEY_2 ({key2_remaining} credits remaining) ===")
    if key2_remaining <= args.safety_margin:
        print("  Key 2 already exhausted (below safety margin). Nothing more to do.")
    else:
        cap_b = ledger_spent_before_b + (key2_remaining - args.safety_margin)
        run(date_times=date_times, credit_cap=cap_b, aois=aois)

    key2_remaining_after = remaining_credits(key2)
    print(f"\nKey 2 remaining after phase B: {key2_remaining_after}")
    print("\n=== BOTH TRAINING KEYS EXHAUSTED (or plan fully collected) ===")


if __name__ == "__main__":
    main()
