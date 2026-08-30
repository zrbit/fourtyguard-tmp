"""Exports every candidate AOI (aoi_sampling.AOIS + NIGHT_AOIS) with its real
collection status, for the app's /training-data view -- lets anyone looking
at the running app see exactly which real neighborhoods the model was
trained on, not just take it on faith. Same static-export pattern as
export_for_app.py: writes one JSON file, no live Python at app runtime.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..collect.aoi_sampling import AOIS, NIGHT_AOIS, Aoi
from ..collect.fetch_satellite import load_cached
from ..collect.geo_utils import shoelace_area_m2

OUTPUT_PATH = Path(__file__).resolve().parents[3] / "src" / "lib" / "mock-data" / "training-coverage.json"


def _export(aois: list[Aoi], source: str) -> list[dict]:
    rows = []
    for aoi in aois:
        collected = load_cached(aoi) is not None
        ring = aoi.polygon()["features"][0]["geometry"]["coordinates"][0]
        area_km2 = shoelace_area_m2(ring, aoi.lat) / 1_000_000
        rows.append(
            {
                "name": aoi.name,
                "category": aoi.category,
                "lat": aoi.lat,
                "lng": aoi.lng,
                "latDelta": aoi.lat_delta,
                "lngDelta": aoi.lng_delta,
                "source": source,
                "collected": collected,
                "areaKm2": round(area_km2, 3),
            }
        )
    return rows


def main() -> None:
    rows = _export(AOIS, "main") + _export(NIGHT_AOIS, "night_batch")
    collected = sum(1 for r in rows if r["collected"])
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"Wrote {len(rows)} candidate AOIs ({collected} collected) to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
