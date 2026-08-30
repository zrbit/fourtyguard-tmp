"""Turn isolated evening/predawn heatmaps into one per-cell, per-night table.

This module reads only ``cooling_deficit/data/raw``.  It deliberately does not
append to the daytime dataset: a merge is a later, reviewed operation after
both independent collections have finished.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path
from statistics import fmean
from typing import Iterable

from .config import PANEL_AOIS
from .isolation import DERIVED_ROOT, RAW_ROOT

TEMPERATURE_KEYS = ("average_temperature", "temperature", "tcm", "temp", "surface_temperature", "value")


def _feature_centroid(feature: dict) -> tuple[float, float] | None:
    geometry = feature.get("geometry") or {}
    coordinates = geometry.get("coordinates")
    if geometry.get("type") == "Point" and coordinates:
        return float(coordinates[1]), float(coordinates[0])
    if geometry.get("type") == "Polygon" and coordinates and coordinates[0]:
        ring = coordinates[0]
        return (
            sum(float(point[1]) for point in ring) / len(ring),
            sum(float(point[0]) for point in ring) / len(ring),
        )
    return None


def _temperature(properties: dict) -> float | None:
    for key in TEMPERATURE_KEYS:
        value = properties.get(key)
        try:
            return float(value) if value is not None else None
        except (TypeError, ValueError):
            continue
    return None


def read_heatmap(path: Path) -> list[dict]:
    """Read FortyGuard's confirmed data.result.map_data FeatureCollection."""
    document = json.loads(path.read_text(encoding="utf-8"))
    payload = (document.get("data") or {}).get("result") or document.get("result") or {}
    features = ((payload.get("map_data") or {}).get("features")) or []
    cells: list[dict] = []
    for feature in features:
        centroid = _feature_centroid(feature)
        value = _temperature(feature.get("properties") or {})
        if centroid is None or value is None:
            continue
        lat, lng = centroid
        # Coordinates are the stable identity.  Cell indexes/order are not.
        cells.append({"cell_id": f"{lat:.5f}:{lng:.5f}", "lat": lat, "lng": lng, "temperature_c": value})
    return cells


def _heatmap_paths(aoi_name: str, evening_stamp: str, predawn_stamp: str) -> tuple[Path, Path]:
    slug = "".join(character.lower() if character.isalnum() else "-" for character in aoi_name).strip("-")
    directory = RAW_ROOT / slug
    evening = list(directory.glob(f"{evening_stamp}_evening_heatmap.json"))
    predawn = list(directory.glob(f"{predawn_stamp}_predawn_heatmap.json"))
    if len(evening) != 1 or len(predawn) != 1:
        raise FileNotFoundError(
            f"Expected one evening and one predawn heatmap for {aoi_name} in {directory}; "
            f"found evening={len(evening)}, predawn={len(predawn)}."
        )
    return evening[0], predawn[0]


def match_cells(evening: Iterable[dict], predawn: Iterable[dict]) -> list[tuple[dict, dict]]:
    """Match by geometry-derived cell ID, never by response ordering."""
    evening_by_id = {row["cell_id"]: row for row in evening}
    predawn_by_id = {row["cell_id"]: row for row in predawn}
    return [(evening_by_id[cell_id], predawn_by_id[cell_id]) for cell_id in sorted(evening_by_id.keys() & predawn_by_id.keys())]


def build_pairs(evening_stamp: str, predawn_stamp: str) -> list[dict]:
    rows: list[dict] = []
    for aoi in PANEL_AOIS:
        evening_path, predawn_path = _heatmap_paths(aoi.name, evening_stamp, predawn_stamp)
        evening_cells = read_heatmap(evening_path)
        predawn_cells = read_heatmap(predawn_path)
        evening_mean = fmean(row["temperature_c"] for row in evening_cells)
        predawn_mean = fmean(row["temperature_c"] for row in predawn_cells)
        pairs = match_cells(evening_cells, predawn_cells)
        print(f"{aoi.name}: evening={len(evening_cells)}, predawn={len(predawn_cells)}, matched={len(pairs)}")
        for evening, predawn in pairs:
            cooling = evening["temperature_c"] - predawn["temperature_c"]
            rows.append(
                {
                    "night_id": f"{evening_stamp}__{predawn_stamp}",
                    "aoi": aoi.name,
                    "category": aoi.category,
                    "cell_id": evening["cell_id"],
                    "lat": evening["lat"],
                    "lng": evening["lng"],
                    "temperature_evening_c": evening["temperature_c"],
                    "temperature_predawn_c": predawn["temperature_c"],
                    "cooling_raw_c": cooling,
                    "evening_anomaly_c": evening["temperature_c"] - evening_mean,
                    "predawn_anomaly_c": predawn["temperature_c"] - predawn_mean,
                }
            )
    return rows


def write_csv(rows: list[dict], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        raise ValueError("No matched cells were found; no output written.")
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evening-stamp", required=True, help="Evening UTC timestamp, e.g. 20260830T0500")
    parser.add_argument("--predawn-stamp", required=True, help="Predawn UTC timestamp, e.g. 20260831T1100")
    parser.add_argument("--output", type=Path, default=DERIVED_ROOT / "cooling_pairs.csv")
    args = parser.parse_args()
    rows = build_pairs(args.evening_stamp, args.predawn_stamp)
    write_csv(rows, args.output)
    print(f"Wrote {len(rows):,} paired cell-night rows to {args.output}")


if __name__ == "__main__":
    main()
