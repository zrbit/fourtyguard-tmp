"""Per-cell elevation from Open-Elevation (free, no key, batch endpoint).

Per-cell, not per-AOI (the earlier per-AOI stub in COLLECTION_PLAN.md was
superseded by this). One batched POST per AOI (its whole cell grid at
once), cached to data/raw/ like every other fetcher in this project.
"""

from __future__ import annotations

import requests

from ..collect import raw_cache
from ..collect.aoi_sampling import Aoi
from .cell_geometry import aoi_cells

ELEVATION_URL = "https://api.open-elevation.com/api/v1/lookup"
_BATCH_SIZE = 150  # keep individual requests modest -- public instance, no SLA


def load_cached(aoi: Aoi) -> dict | None:
    return raw_cache.load("elevation", {"aoi": aoi.name})


def fetch_elevation(aoi: Aoi) -> dict:
    """Returns {cell_index: elevation_m} for every cell in aoi_cells(aoi)."""
    cached = load_cached(aoi)
    if cached is not None:
        return {int(k): v for k, v in cached.items()}

    cells = aoi_cells(aoi)
    if not cells:
        raise RuntimeError(f"No cached heatmap cells for {aoi.name} -- run FortyGuard collection first.")

    elevations: dict[int, float] = {}
    for start in range(0, len(cells), _BATCH_SIZE):
        batch = cells[start : start + _BATCH_SIZE]
        locations = [{"latitude": c["lat"], "longitude": c["lng"]} for c in batch]
        response = requests.post(ELEVATION_URL, json={"locations": locations}, timeout=60)
        response.raise_for_status()
        results = response.json()["results"]
        for offset, result in enumerate(results):
            elevations[start + offset] = result["elevation"]

    raw_cache.save("elevation", {"aoi": aoi.name}, elevations)
    return elevations
