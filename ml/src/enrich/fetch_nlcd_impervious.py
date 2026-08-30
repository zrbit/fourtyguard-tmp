"""Per-cell impervious surface % from Annual NLCD (2021, USGS/MRLC), via
MRLC's public WCS -- free, no key, 30m native resolution aggregated to each
100m temperature cell.

Only the Fractional Impervious Surface layer (continuous 0-100%) is
implemented here. The companion Impervious Descriptor product (meant to
split road vs. non-road impervious) returned unexpected class codes
(0, 21, 22, 24, 25, 26) when fetched from this same WCS instance under the
coverage ID that matches its name -- NOT the documented 0/No-Data,
1/Roads, 2/Urban legend (confirmed via MRLC's own data-type page). Rather
than guess at reconciling an unverified legend into roadPct/
urbanImperviousPct/roadShareOfImpervious, that split is deliberately NOT
implemented yet -- see ENRICHMENT_PLAN.md's "blocked" note. Only the
Fractional Impervious Surface (verified: WCS mean ~94.7% for a Downtown LA
test window vs. FortyGuard's real 92.46% AOI mean -- close, consistent
with a coarser/differently-clipped comparison window, not a data problem)
ships in this module.
"""

from __future__ import annotations

import rasterio
import requests
from rasterio.io import MemoryFile

from ..collect import raw_cache
from ..collect.aoi_sampling import Aoi
from .cell_geometry import aoi_cells

WCS_URL = "https://www.mrlc.gov/geoserver/mrlc_display/wcs"
COVERAGE_ID = "mrlc_display__NLCD_2021_Impervious_L48"
_PAD_DEG = 0.002  # small margin around the AOI's cell bbox so edge cells still sample cleanly


def load_cached(aoi: Aoi) -> bytes | None:
    return raw_cache.load("nlcd_impervious_tif", {"aoi": aoi.name, "coverage": COVERAGE_ID})


def _fetch_raster(aoi: Aoi) -> bytes:
    cached = load_cached(aoi)
    if cached is not None:
        # raw_cache round-trips through JSON, so bytes are stored/loaded as a
        # latin-1 string (lossless byte<->char round trip) -- see save below.
        return cached.encode("latin-1") if isinstance(cached, str) else cached

    lat_min, lat_max = aoi.lat - aoi.lat_delta - _PAD_DEG, aoi.lat + aoi.lat_delta + _PAD_DEG
    lng_min, lng_max = aoi.lng - aoi.lng_delta - _PAD_DEG, aoi.lng + aoi.lng_delta + _PAD_DEG
    params = {
        "service": "WCS", "version": "2.0.1", "request": "GetCoverage",
        "coverageId": COVERAGE_ID,
        "subset": [f"Long({lng_min},{lng_max})", f"Lat({lat_min},{lat_max})"],
        "subsettingCrs": "http://www.opengis.net/def/crs/EPSG/0/4326",
        "format": "image/tiff",
    }
    response = requests.get(WCS_URL, params=params, timeout=60)
    response.raise_for_status()
    raw_cache.save("nlcd_impervious_tif", {"aoi": aoi.name, "coverage": COVERAGE_ID}, response.content.decode("latin-1"))
    return response.content


def aoi_impervious_pct(aoi: Aoi) -> dict[int, float]:
    """Returns {cell_index: fractional_impervious_pct} for every cell in
    aoi_cells(aoi), sampled (nearest-pixel) from the 30m NLCD raster at each
    cell centroid."""
    raster_bytes = _fetch_raster(aoi)
    cells = aoi_cells(aoi)
    result: dict[int, float] = {}
    with MemoryFile(raster_bytes) as mf, mf.open() as ds:
        band = ds.read(1)
        nodata = ds.nodata
        for i, c in enumerate(cells):
            row, col = rasterio.transform.rowcol(ds.transform, c["lng"], c["lat"])
            if 0 <= row < band.shape[0] and 0 <= col < band.shape[1]:
                val = band[row, col]
                if nodata is None or val != nodata:
                    result[i] = float(val)
    return result
