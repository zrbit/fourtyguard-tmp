"""Shared local-equirectangular-projection area/length helpers. Good enough
at AOI scale (~1-2km) without a GIS-projection dependency."""

from __future__ import annotations

import math

_METERS_PER_DEG_LAT = 111_320.0


def meters_per_deg_lng(lat_deg: float) -> float:
    return _METERS_PER_DEG_LAT * math.cos(math.radians(lat_deg))


def _project(coords: list[list[float]], origin_lat: float) -> list[tuple[float, float]]:
    m_lng = meters_per_deg_lng(origin_lat)
    return [(lng * m_lng, lat * _METERS_PER_DEG_LAT) for lng, lat in coords]


def shoelace_area_m2(coords: list[list[float]], origin_lat: float) -> float:
    pts = _project(coords, origin_lat)
    area = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def line_length_m(coords: list[list[float]], origin_lat: float) -> float:
    pts = _project(coords, origin_lat)
    return sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
