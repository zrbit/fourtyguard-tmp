"""Per-cell canopy% via NDVI-based disaggregation of FortyGuard's trusted
AOI-level canopy% -- validated this session for WITHIN-AOI relative
redistribution only (real, sensible spatial variance), never used to
independently estimate an absolute number. FortyGuard's AOI canopy% stays
ground truth; NDVI only redistributes it across the AOI's cells based on
each cell's relative vegetation signal.

NDVI = (NIR - Red) / (NIR + Red) = (B08 - B04) / (B08 + B04)
"""

from __future__ import annotations

from ..collect.aoi_sampling import Aoi
from ..features import schema_adapter
from .cell_geometry import aoi_cells
from .fetch_sentinel2 import fetch_scene, sample_at


def cell_ndvi(aoi: Aoi) -> dict[int, float]:
    scene = fetch_scene(aoi)
    cells = aoi_cells(aoi)
    result: dict[int, float] = {}
    for i, c in enumerate(cells):
        red = sample_at(scene, "B04", c["lat"], c["lng"])
        nir = sample_at(scene, "B08", c["lat"], c["lng"])
        if red is None or nir is None or (nir + red) == 0:
            continue
        result[i] = (nir - red) / (nir + red)
    return result


def disaggregate_canopy_pct(aoi: Aoi, aoi_canopy_pct: float) -> dict[int, float]:
    """Redistributes aoi_canopy_pct (FortyGuard's real AOI-level number)
    across cells by relative NDVI weight. Weight = max(ndvi, 0) (only
    positive NDVI meaningfully indicates vegetation), normalized so the
    AOI-wide weighted mean stays aoi_canopy_pct; clipped to [0, 100]."""
    ndvi = cell_ndvi(aoi)
    if not ndvi:
        return {}
    weights = {i: max(v, 0.0) for i, v in ndvi.items()}
    mean_weight = sum(weights.values()) / len(weights)
    if mean_weight == 0:
        return {i: aoi_canopy_pct for i in ndvi}
    return {
        i: max(0.0, min(100.0, aoi_canopy_pct * (w / mean_weight)))
        for i, w in weights.items()
    }


def aoi_canopy_pct_from_satellite(satellite_response: dict) -> float | None:
    land_cover = schema_adapter.extract_land_cover(satellite_response)
    return land_cover.get("canopyPct")
