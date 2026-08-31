"""Action Feasibility Guard: augments the already-exported
cluster-action-plans.json with a per-priority-tile site type + suitable/
excluded actions, WITHOUT re-running the Tier-2 model export.

Deliberately standalone from export_clusters_for_app.py: that script needs
pandas/numpy/xgboost/shap to recompute SHAP-based tile aggregates from the
full per-cell dataset. This script only reads the already-computed JSON it
produced (plain json, no pandas) and OSM geometry (plain requests, no
numpy) -- so it works even when the ML stack in this venv doesn't. Re-run
export_clusters_for_app.py first if the underlying tiles/anomalies/
breakdown themselves need to change; run this after, to (re)attach site
types to whatever priority tiles exist at that point.

Only classifies "priority" tiles -- the other tiers don't carry a
recommendation today either, so there's nothing for a feasibility screen to
qualify or reject yet.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from ..collect.fetch_osm_sitetype import fetch_tile_geometry
from .site_type import feasibility_screen

CLUSTER_PLANS_PATH = Path(__file__).resolve().parents[3] / "src" / "lib" / "mock-data" / "cluster-action-plans.json"


def main() -> None:
    if not CLUSTER_PLANS_PATH.exists():
        raise SystemExit(f"{CLUSTER_PLANS_PATH} not found. Run export_clusters_for_app.py first.")

    data = json.loads(CLUSTER_PLANS_PATH.read_text(encoding="utf-8"))
    priority_tiles = [t for t in data["tiles"] if t["priorityTier"] == "priority"]
    print(f"Screening {len(priority_tiles)} priority tiles for site type / action suitability...")

    n_fetched = 0
    n_failed = 0
    for tile in priority_tiles:
        try:
            osm_response = fetch_tile_geometry(tile["tileId"], tile["centroidLat"], tile["centroidLng"])
            screen = feasibility_screen(osm_response, tile["centroidLat"])
            tile.update(screen)
            n_fetched += 1
            print(f"  {tile['tileId']} ({tile['primaryAoi']}): {screen['siteTypeLabel']}")
        except Exception as exc:  # one bad tile shouldn't sink the other 47
            n_failed += 1
            print(f"  {tile['tileId']} ({tile['primaryAoi']}): FAILED -- {exc}")
        time.sleep(0.2)  # be polite to the free Overpass instance even though results are cached after this

    data["hasFeasibilityScreen"] = True
    CLUSTER_PLANS_PATH.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    print(f"\nWrote site-type screening for {n_fetched} priority tiles ({n_failed} failed) to {CLUSTER_PLANS_PATH}")


if __name__ == "__main__":
    main()
