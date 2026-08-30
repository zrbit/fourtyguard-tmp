"""Per-AOI 100m-cell centroids, sourced from whatever /heatmap response is
already cached for that AOI (any date_time -- the cell grid itself is
date_time-invariant, only the temperature values inside it change).

This is the shared geometry every enrichment module (NDVI, albedo,
elevation, distance-to-coast, NLCD) samples against, so every enrichment
feature lines up with the exact same cells build_dataset.py already has
temperatures for.
"""

from __future__ import annotations

from ..collect import fetch_heatmap
from ..collect.aoi_sampling import Aoi
from ..features import schema_adapter
from ..features.build_dataset import _candidate_date_times


def aoi_cells(aoi: Aoi) -> list[dict]:
    """Returns [{lat, lng}, ...] for every 100m cell in this AOI's cached
    heatmap grid. Tries every plausible date_time (see
    build_dataset._candidate_date_times) until one is cached; [] if none
    are cached yet for this AOI."""
    for dt in _candidate_date_times():
        response = fetch_heatmap.load_cached(aoi, dt)
        if response is None:
            continue
        cells = schema_adapter.extract_cells(response)
        if cells:
            return [{"lat": c["lat"], "lng": c["lng"]} for c in cells]
    return []
