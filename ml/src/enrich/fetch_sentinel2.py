"""Per-AOI Sentinel-2 L2A scene (free, Microsoft Planetary Computer STAC,
no auth needed): picks the least-cloudy scene from the last 90 days over
the AOI, reads just the 5 bands NDVI and albedo need (B02, B04, B08, B11,
B12) as small windowed clips over the AOI's bbox via vsicurl (no full-scene
download), and caches the clipped arrays + per-band transform/CRS locally.

Shared by compute_ndvi.py and compute_albedo.py so both spend exactly one
scene search + one set of band reads per AOI, not two.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import planetary_computer
import pystac_client
import rasterio
from datetime import datetime, timedelta, timezone
from rasterio.warp import transform, transform_bounds
from rasterio.windows import from_bounds

from ..collect.aoi_sampling import Aoi

_CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "raw" / "sentinel2"
_CATALOG_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
_BANDS = ["B02", "B04", "B08", "B11", "B12"]
_SEARCH_DAYS_BACK = 90
_BBOX_PAD_DEG = 0.005


def _cache_paths(aoi: Aoi) -> tuple[Path, Path]:
    safe = aoi.name.replace(" ", "_").replace("/", "-")
    return _CACHE_DIR / f"{safe}.npz", _CACHE_DIR / f"{safe}.json"


def _select_scene(aoi: Aoi):
    catalog = pystac_client.Client.open(_CATALOG_URL, modifier=planetary_computer.sign_inplace)
    bbox = [
        aoi.lng - aoi.lng_delta - _BBOX_PAD_DEG, aoi.lat - aoi.lat_delta - _BBOX_PAD_DEG,
        aoi.lng + aoi.lng_delta + _BBOX_PAD_DEG, aoi.lat + aoi.lat_delta + _BBOX_PAD_DEG,
    ]
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=_SEARCH_DAYS_BACK)
    search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=bbox,
        datetime=f"{start.date()}/{end.date()}",
        query={"eo:cloud_cover": {"lt": 20}},
    )
    items = sorted(search.items(), key=lambda it: it.properties["eo:cloud_cover"])
    if not items:
        raise RuntimeError(f"No low-cloud Sentinel-2 scene found for {aoi.name} in the last {_SEARCH_DAYS_BACK} days.")
    return items[0], bbox


def load_cached(aoi: Aoi) -> dict | None:
    npz_path, meta_path = _cache_paths(aoi)
    if not (npz_path.exists() and meta_path.exists()):
        return None
    arrays = np.load(npz_path)
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    return {
        "bands": {b: arrays[b] for b in _BANDS},
        "transforms": {b: meta["transforms"][b] for b in _BANDS},
        "crs": meta["crs"],
        "scene_id": meta["scene_id"],
        "cloud_cover": meta["cloud_cover"],
    }


def fetch_scene(aoi: Aoi) -> dict:
    """Returns {bands: {B02:arr, ...}, transforms: {B02:6-tuple, ...}, crs, scene_id, cloud_cover}."""
    cached = load_cached(aoi)
    if cached is not None:
        return cached

    item, bbox = _select_scene(aoi)
    bands: dict[str, np.ndarray] = {}
    transforms: dict[str, list[float]] = {}
    crs_str = None
    for band in _BANDS:
        href = item.assets[band].href
        with rasterio.open(href) as ds:
            crs_str = ds.crs.to_string()
            b = transform_bounds("EPSG:4326", ds.crs, *bbox)
            win = from_bounds(*b, ds.transform)
            arr = ds.read(1, window=win)
            win_transform = ds.window_transform(win)
            bands[band] = arr
            transforms[band] = list(win_transform)[:6]

    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    npz_path, meta_path = _cache_paths(aoi)
    np.savez_compressed(npz_path, **bands)
    meta_path.write_text(json.dumps({
        "transforms": transforms,
        "crs": crs_str,
        "scene_id": item.id,
        "cloud_cover": item.properties["eo:cloud_cover"],
    }), encoding="utf-8")

    return {"bands": bands, "transforms": transforms, "crs": crs_str, "scene_id": item.id, "cloud_cover": item.properties["eo:cloud_cover"]}


def sample_at(scene: dict, band: str, lat: float, lng: float) -> float | None:
    """Sample one band's DN value at a lat/lng, via the band's own
    transform (B11/B12 are natively 20m, others 10m -- no resampling, each
    band is sampled independently at its own native resolution)."""
    arr = scene["bands"][band]
    t = rasterio.Affine(*scene["transforms"][band])
    xs, ys = transform("EPSG:4326", scene["crs"], [lng], [lat])
    row, col = rasterio.transform.rowcol(t, xs[0], ys[0])
    if 0 <= row < arr.shape[0] and 0 <= col < arr.shape[1]:
        return float(arr[row, col])
    return None
