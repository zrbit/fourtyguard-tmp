"""Tier 7 of COLLECTION_PLAN.md: apply 6 genuinely diverse weather regimes
(picked from real Open-Meteo historical archive data, 2021-2026 -- not
guessed dates) to the 12-AOI "one per category" backbone that's already
collected. Land cover (satellite + OSM) is cached per AOI and reused, so
this only spends on heatmap + env_params (7,120 credits/snapshot), not a
fresh AOI's full cost.

Run this AFTER run_plan_tiers.py (Tier 1-6) completes -- both scripts share
the same ledger file and shouldn't run concurrently.

Usage (from ml/, venv active):
    python -m src.collect.run_weather_diversity --execute
    python -m src.collect.run_weather_diversity --dry-run   (default)
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

from .aoi_sampling import AOIS, Aoi
from .credit_ledger import CreditLedger
from .run_collection import aoi_total_cost, run

_LA_TZ = ZoneInfo("America/Los_Angeles")
_USAGE_URL = "https://api.fortyguard.com/v1/system/fetch-api-key-usage"

# name -> (date, LA-local hour) -- real, distinct weather regimes identified
# from Open-Meteo's free historical archive. See COLLECTION_PLAN.md's
# "Generalization across weather conditions and years" section for the
# full readings (temp/humidity/cloud/wind/precip) that justify each pick.
DIVERSE_SNAPSHOTS: list[tuple[str, str, int]] = [
    ("extreme heat wave", "2024-09-06", 13),
    ("winter storm", "2026-02-16", 13),
    ("santa ana wind event", "2021-11-25", 13),
    ("june gloom / marine layer", "2021-06-07", 13),
    ("mild clear shoulder season", "2022-10-27", 13),
    ("cold windy winter", "2023-02-25", 13),
]

BACKBONE_NAMES: list[str] = [
    "Downtown LA", "Vernon", "Venice", "Los Feliz", "Griffith Park edge",
    "Sherman Oaks", "Chatsworth", "South LA / Watts", "Westwood / UCLA",
    "Silver Lake", "Koreatown", "San Pedro",
]


def diverse_date_times() -> list[datetime]:
    out = []
    for _label, date_str, hour in DIVERSE_SNAPSHOTS:
        y, m, d = (int(x) for x in date_str.split("-"))
        local = datetime(y, m, d, hour, 0, 0, tzinfo=_LA_TZ)
        out.append(local.astimezone(ZoneInfo("UTC")))
    return out


def backbone_aois() -> list[Aoi]:
    lookup = {a.name: a for a in AOIS}
    missing = [n for n in BACKBONE_NAMES if n not in lookup]
    if missing:
        raise SystemExit(f"Backbone names not found in AOIS: {missing}")
    return [lookup[n] for n in BACKBONE_NAMES]


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
    parser.add_argument("--safety-margin", type=int, default=2_000)
    args = parser.parse_args()

    aois = backbone_aois()
    date_times = diverse_date_times()
    per_aoi_worst_case = aoi_total_cost(len(date_times))

    print(f"Backbone AOIs: {len(aois)}  |  diverse snapshots: {len(date_times)}")
    for (label, date_str, hour), dt in zip(DIVERSE_SNAPSHOTS, date_times):
        print(f"  {label:<30} {date_str} {hour}:00 LA  ->  {dt.isoformat()}")
    print(f"\nWorst-case cost per AOI (assumes no cache hit, incl. phantom satellite): ~{per_aoi_worst_case}")
    print("Real cost should be far lower -- satellite/OSM already cached for all 12.\n")
    for a in aois:
        print(f"  {a.name}")

    if not args.execute:
        print("\nThis was a dry run. Re-run with --execute to collect for real.")
        return

    key1 = os.environ.get("FORTYGUARD_TRAINING_API_KEY", "")
    key2 = os.environ.get("FORTYGUARD_TRAINING_API_KEY_2", "")
    if not key1 or not key2:
        raise SystemExit("Both FORTYGUARD_TRAINING_API_KEY and FORTYGUARD_TRAINING_API_KEY_2 must be set.")

    starting_ledger_spent = CreditLedger.load(cap=0).spent
    key1_remaining = remaining_credits(key1)
    if key1_remaining is None:
        raise SystemExit("Couldn't confirm key 1's remaining balance; aborting rather than risk overspend.")

    print(f"\n=== Phase A: FORTYGUARD_TRAINING_API_KEY ({key1_remaining} credits remaining) ===")
    if key1_remaining <= args.safety_margin:
        print("  Key 1 already exhausted (below safety margin). Skipping straight to key 2.")
    else:
        cap_a = starting_ledger_spent + (key1_remaining - args.safety_margin)
        run(date_times=date_times, credit_cap=cap_a, aois=aois)

    os.environ["FORTYGUARD_TRAINING_API_KEY"] = key2
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

    print("\n=== Tier 7 (weather diversity) pass complete or both keys exhausted ===")


if __name__ == "__main__":
    main()
