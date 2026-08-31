"""Per-cell distance to the Pacific coast: pure geometry, no network call,
no credits. A hand-picked simplified coastline polyline (real landmark
coordinates, ~1-3km point spacing) is enough for this -- it's logged as
non-actionable context (a city can't move a block's distance to the
ocean), not a precision GIS product.

Uses the same local-equirectangular approximation as geo_utils.py (good
enough at AOI/county scale, no GIS-projection dependency).
"""

from __future__ import annotations

import math

from ..collect.aoi_sampling import Aoi
from ..collect.geo_utils import meters_per_deg_lng
from .cell_geometry import aoi_cells

# LA County coastline, Point Dume to Huntington Beach, real landmark
# coordinates north to south. A straight simplification across the LA/Long
# Beach harbor breakwater is fine here -- harbor water still moderates
# temperature, and this is a coarse context feature, not a navigation aid.
_COASTLINE: list[tuple[float, float]] = [
    (34.0011, -118.8065),  # Point Dume
    (34.0367, -118.6786),  # Malibu Pier
    (34.0367, -118.5758),  # Topanga State Beach
    (34.0086, -118.4983),  # Santa Monica Pier
    (33.9850, -118.4695),  # Venice Beach
    (33.9584, -118.4514),  # Marina del Rey entrance
    (33.9192, -118.4370),  # Dockweiler / LAX
    (33.8847, -118.4109),  # Manhattan Beach Pier
    (33.8622, -118.3995),  # Hermosa Beach
    (33.8492, -118.3884),  # Redondo Beach
    (33.7444, -118.4128),  # Point Vicente, Palos Verdes
    (33.7075, -118.3128),  # Point Fermin, San Pedro
    (33.7361, -118.2922),  # LA/Long Beach Harbor
    (33.7590, -118.1420),  # Belmont Shore, Long Beach
    (33.7414, -118.1048),  # Seal Beach
    (33.6595, -117.9988),  # Huntington Beach
]


def _project(lat: float, lng: float, origin_lat: float) -> tuple[float, float]:
    m_lng = meters_per_deg_lng(origin_lat)
    return lng * m_lng, lat * 111_320.0


def _point_to_segment_m(p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    px, py = p
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.dist(p, a)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    proj = (ax + t * dx, ay + t * dy)
    return math.dist(p, proj)


def distance_to_coast_m(lat: float, lng: float) -> float:
    origin_lat = lat  # local projection origin, fine at this point's own scale
    p = _project(lat, lng, origin_lat)
    coast_pts = [_project(clat, clng, origin_lat) for clat, clng in _COASTLINE]
    return min(
        _point_to_segment_m(p, a, b)
        for a, b in zip(coast_pts, coast_pts[1:])
    )


def aoi_coast_distances(aoi: Aoi) -> dict[int, float]:
    """Returns {cell_index: distance_to_coast_m} for every cell in
    aoi_cells(aoi). No caching needed -- pure, cheap local computation."""
    cells = aoi_cells(aoi)
    return {i: distance_to_coast_m(c["lat"], c["lng"]) for i, c in enumerate(cells)}
