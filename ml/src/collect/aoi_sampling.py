"""The hand-picked LA areas-of-interest (AOIs) for training-data collection.

Diversity of land cover matters more than count for a monotone-constrained
model with a handful of features, so these were chosen to span extremes:
dense downtown, leafy hillside residential, industrial, coastal, valley
suburban, and park-adjacent — all within the City of Los Angeles, matching
the app's current live-mode scope (NYC/Chicago are not implemented).

Each AOI is sized like src/lib/fortyguard/client.ts's `localAoi()` helper
but larger, so a single /heatmap or /satellite call returns a useful grid of
cells instead of one point: ~0.018deg lat x ~0.020deg lng, which at LA's
latitude (~34N) is roughly 2km x 1.85km (~1.4mi2) — comfortably under the
10mi2 Basic /heatmap limit.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Aoi:
    name: str
    category: str
    lat: float
    lng: float
    lat_delta: float = 0.009
    lng_delta: float = 0.010

    def polygon(self) -> dict:
        """GeoJSON Polygon ring, same construction as client.ts's localAoi()."""
        ring = [
            [self.lng - self.lng_delta, self.lat - self.lat_delta],
            [self.lng + self.lng_delta, self.lat - self.lat_delta],
            [self.lng + self.lng_delta, self.lat + self.lat_delta],
            [self.lng - self.lng_delta, self.lat + self.lat_delta],
            [self.lng - self.lng_delta, self.lat - self.lat_delta],
        ]
        return {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [ring]}}
        ]}


# Ordered so that whatever budget-driven prefix run_collection.py can afford
# (see aoi_total_cost()) still spans the widest possible spread of land-cover
# categories: one AOI per distinct category first, near-duplicate categories
# (a second dense_downtown, a second coastal, etc.) pushed to the tail so
# they're the first to be skipped if the credit cap cuts the list short.
AOIS: list[Aoi] = [
    Aoi("Downtown LA", "dense_downtown", 34.0407, -118.2468),
    Aoi("Vernon", "industrial", 34.0039, -118.2290),
    Aoi("Venice", "coastal", 33.9850, -118.4695),
    Aoi("Los Feliz", "leafy_hillside_residential", 34.1073, -118.2884),
    Aoi("Griffith Park edge", "park_adjacent", 34.1361, -118.2942),
    Aoi("Sherman Oaks", "valley_suburban", 34.1508, -118.4489),
    Aoi("Chatsworth", "valley_open_industrial", 34.2569, -118.5750),
    Aoi("South LA / Watts", "dense_low_canopy_residential", 33.9425, -118.2468),
    Aoi("Westwood / UCLA", "leafy_campus", 34.0689, -118.4452),
    Aoi("Silver Lake", "moderate_canopy_hillside", 34.0869, -118.2702),
    Aoi("Koreatown", "dense_mixed", 34.0577, -118.3005),
    Aoi("San Pedro", "coastal_industrial", 33.7361, -118.2922),
    # Near-duplicate categories -- only collected if budget allows extras.
    Aoi("Arts District", "dense_downtown", 34.0403, -118.2332),
    Aoi("Boyle Heights", "dense_residential", 34.0333, -118.2019),
    Aoi("Santa Monica adjacent (Ocean Park)", "coastal", 34.0195, -118.4849),
    Aoi("Hancock Park", "leafy_residential", 34.0764, -118.3151),
    Aoi("Highland Park", "moderate_canopy_residential", 34.1141, -118.1898),
]


def centroid(aoi: Aoi) -> tuple[float, float]:
    return aoi.lat, aoi.lng
