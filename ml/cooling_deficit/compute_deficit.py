"""Compute leave-one-out, weather-matched overnight cooling deficit.

Input files are deliberately explicit exports into this package rather than
imports from the concurrently-owned enrichment pipeline:

* cooling_pairs.csv — output of ``extract_pairs.py``
* peer_features.csv — one row per (aoi, cell_id) with NLCD fractional
  impervious surface, distance to coast and elevation values
* daytime_anomalies.csv (optional) — 1pm cell anomaly keyed by (aoi, cell_id)

No cross-night averaging occurs here.  Every peer mean is confined to the
same night and excludes the focal cell, which prevents weather leakage and
self-influence.
"""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from pathlib import Path

from .config import MIN_PEER_GROUP_SIZE
from .isolation import DERIVED_ROOT

MILES_TO_METERS = 1609.344


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def as_float(row: dict, key: str) -> float:
    try:
        return float(row[key])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"{key} must be present and numeric; row key is {row.get('cell_id')}") from exc


def _quantile_cutoffs(values: list[float]) -> tuple[float, float]:
    ordered = sorted(values)
    if len(ordered) < 3:
        return ordered[0], ordered[-1]
    return ordered[len(ordered) // 3], ordered[(2 * len(ordered)) // 3]


def _coast_band(distance_m: float, coarse: bool) -> str:
    if coarse:
        return "coast-near" if distance_m < 10 * MILES_TO_METERS else "coast-far"
    if distance_m < 5 * MILES_TO_METERS:
        return "coast-0-5mi"
    if distance_m < 10 * MILES_TO_METERS:
        return "coast-5-10mi"
    return "coast-10mi-plus"


def _elevation_band(value: float, cuts: tuple[float, float], coarse: bool) -> str:
    low, high = cuts
    if coarse:
        return "elev-low" if value <= high else "elev-high"
    if value <= low:
        return "elev-low"
    if value <= high:
        return "elev-mid"
    return "elev-high"


def candidate_group_keys(row: dict, elevation_cuts: tuple[float, float]) -> list[tuple[str, str]]:
    """Fine-to-coarse peer keys; choose the first group with >=15 cells."""
    impervious = max(0.0, min(99.999999, as_float(row, "nlcd_fractional_impervious_pct")))
    coast = as_float(row, "distance_to_coast_m")
    elevation = as_float(row, "elevation_m")
    candidates = [
        (10, False, False),  # 10pp impervious, 3 coast bands, elevation tertiles
        (20, False, False),
        (20, True, True),
        (25, True, True),
    ]
    keys = []
    for width, coarse_coast, coarse_elevation in candidates:
        impervious_lower = int(impervious // width) * width
        label = (
            f"imp-{impervious_lower}-{impervious_lower + width}|"
            f"{_coast_band(coast, coarse_coast)}|"
            f"{_elevation_band(elevation, elevation_cuts, coarse_elevation)}"
        )
        keys.append((f"L{len(keys)}", label))
    return keys


def join_inputs(cooling_rows: list[dict], feature_rows: list[dict], daytime_rows: list[dict]) -> list[dict]:
    feature_by_cell = {(row["aoi"], row["cell_id"]): row for row in feature_rows}
    daytime_by_cell = {(row["aoi"], row["cell_id"]): row for row in daytime_rows}
    merged = []
    missing_features = 0
    for row in cooling_rows:
        feature = feature_by_cell.get((row["aoi"], row["cell_id"]))
        if feature is None:
            missing_features += 1
            continue
        combined = {**row, **feature}
        daytime = daytime_by_cell.get((row["aoi"], row["cell_id"]))
        if daytime:
            combined["day_peak_anomaly_c"] = daytime.get("day_peak_anomaly_c", "")
        merged.append(combined)
    if missing_features:
        print(f"Excluded {missing_features:,} cooling rows without the required peer features.")
    return merged


def compute(rows: list[dict], min_group_size: int = MIN_PEER_GROUP_SIZE) -> list[dict]:
    if not rows:
        return []
    elevation_cuts = _quantile_cutoffs([as_float(row, "elevation_m") for row in rows])
    groups: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    candidates_by_row: dict[int, list[tuple[str, str]]] = {}
    for index, row in enumerate(rows):
        candidates = candidate_group_keys(row, elevation_cuts)
        candidates_by_row[index] = candidates
        for level, key in candidates:
            groups[(row["night_id"], level, key)].append(row)

    output = []
    for index, row in enumerate(rows):
        selected: tuple[str, str, list[dict]] | None = None
        for level, key in candidates_by_row[index]:
            peers = groups[(row["night_id"], level, key)]
            if len(peers) >= min_group_size:
                selected = level, key, peers
                break
        result = dict(row)
        if selected is None:
            result.update({"peer_group_id": "", "peer_group_level": "", "peer_group_size": "0", "peer_mean_cooling_c": "", "cooling_deficit_c": "", "typology": "insufficient-peers"})
            output.append(result)
            continue
        level, key, peers = selected
        own_cooling = as_float(row, "cooling_raw_c")
        peer_mean = (sum(as_float(peer, "cooling_raw_c") for peer in peers) - own_cooling) / (len(peers) - 1)
        deficit = peer_mean - own_cooling
        result.update(
            {
                "peer_group_id": key,
                "peer_group_level": level,
                "peer_group_size": str(len(peers)),
                "peer_mean_cooling_c": peer_mean,
                "cooling_deficit_c": deficit,
                "typology": typology(result, deficit),
            }
        )
        output.append(result)
    return output


def typology(row: dict, cooling_deficit_c: float) -> str:
    raw_day = row.get("day_peak_anomaly_c", "")
    try:
        daytime = float(raw_day)
    except (TypeError, ValueError):
        return "daytime-not-joined"
    # Zero means locally above/below its AOI average; this preserves the
    # anomaly's existing interpretation without inventing a global threshold.
    if daytime > 0 and cooling_deficit_c > 0:
        return "hot-day-high-deficit"
    if daytime > 0:
        return "hot-day-low-deficit"
    if cooling_deficit_c > 0:
        return "moderate-day-high-deficit"
    return "moderate-day-low-deficit"


def write_csv(rows: list[dict], output: Path) -> None:
    if not rows:
        raise ValueError("No eligible rows were produced.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cooling-pairs", type=Path, default=DERIVED_ROOT / "cooling_pairs.csv")
    parser.add_argument("--peer-features", required=True, type=Path, help="Explicit export into this experiment")
    parser.add_argument("--daytime-anomalies", type=Path, help="Optional explicit 1pm anomaly export")
    parser.add_argument("--output", type=Path, default=DERIVED_ROOT / "cooling_deficit.csv")
    args = parser.parse_args()
    rows = join_inputs(read_csv(args.cooling_pairs), read_csv(args.peer_features), read_csv(args.daytime_anomalies) if args.daytime_anomalies else [])
    results = compute(rows)
    write_csv(results, args.output)
    eligible = sum(bool(row.get("cooling_deficit_c", "")) for row in results)
    print(f"Wrote {len(results):,} rows; {eligible:,} have leave-one-out cooling deficits: {args.output}")


if __name__ == "__main__":
    main()
