"""Per-cell broadband albedo via the Liang (2001) formula on Sentinel-2
surface reflectance:

  albedo = 0.356*blue + 0.130*red + 0.373*nir + 0.085*swir1 + 0.072*swir2 - 0.0018

Bands: B02=blue, B04=red, B08=nir, B11=swir1, B12=swir2. Sentinel-2 L2A DNs
are scaled reflectance (divide by 10000 to get 0-1 reflectance) -- same
scene as compute_ndvi.py (fetch_sentinel2.fetch_scene caches it once per
AOI, shared by both).

Validated this session (Downtown LA, mean ~0.311) as a physically
well-defined computation; didn't precisely reconcile with a rough
hand-estimate from the Heat Intelligence report's per-material albedo
ranges, logged as an open, unresolved discrepancy in ENRICHMENT_PLAN.md,
not a validation failure -- ships as a usable feature.
"""

from __future__ import annotations

from ..collect.aoi_sampling import Aoi
from .cell_geometry import aoi_cells
from .fetch_sentinel2 import fetch_scene, sample_at

_SCALE = 10_000.0


def cell_albedo(aoi: Aoi) -> dict[int, float]:
    scene = fetch_scene(aoi)
    cells = aoi_cells(aoi)
    result: dict[int, float] = {}
    for i, c in enumerate(cells):
        dns = {}
        for band in ("B02", "B04", "B08", "B11", "B12"):
            v = sample_at(scene, band, c["lat"], c["lng"])
            if v is None:
                break
            dns[band] = v / _SCALE
        else:
            albedo = (
                0.356 * dns["B02"] + 0.130 * dns["B04"] + 0.373 * dns["B08"]
                + 0.085 * dns["B11"] + 0.072 * dns["B12"] - 0.0018
            )
            result[i] = albedo
    return result
