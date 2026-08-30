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

    # --- Expansion batch: broader geographic/land-cover coverage across LA
    # County (San Fernando Valley, Westside, South Bay, San Gabriel Valley,
    # more Downtown-adjacent and hillside areas) -- the original 17 skew
    # toward central/east LA. Interleaved by area so a budget-driven cutoff
    # still spans the full county rather than exhausting one region first.
    Aoi("Van Nuys", "valley_dense_mixed", 34.1867, -118.4487),
    Aoi("Culver City", "westside_mixed", 34.0211, -118.3965),
    Aoi("Torrance", "south_bay_suburban", 33.8358, -118.3406),
    Aoi("Pasadena", "san_gabriel_valley_mixed", 34.1478, -118.1445),
    Aoi("Inglewood", "dense_urban_core", 33.9617, -118.3531),
    Aoi("Eagle Rock", "hillside_moderate_canopy", 34.1391, -118.2109),
    Aoi("Reseda", "valley_residential", 34.2011, -118.5353),
    Aoi("Brentwood", "leafy_affluent", 34.0525, -118.4738),
    Aoi("Manhattan Beach", "coastal_low_density", 33.8847, -118.4109),
    Aoi("Alhambra", "san_gabriel_valley_dense", 34.0953, -118.1270),
    Aoi("Crenshaw", "dense_low_canopy_residential", 34.0089, -118.3323),
    Aoi("Mount Washington", "hillside_leafy", 34.1080, -118.2225),
    Aoi("Encino", "valley_affluent", 34.1592, -118.5010),
    Aoi("Mar Vista", "westside_residential", 34.0009, -118.4292),
    Aoi("Redondo Beach", "coastal_suburban", 33.8492, -118.3884),
    Aoi("Monterey Park", "san_gabriel_valley_residential", 34.0625, -118.1228),
    Aoi("Baldwin Hills", "hillside_park_adjacent", 34.0089, -118.3573),
    Aoi("Northridge", "valley_open_suburban", 34.2381, -118.5301),
    Aoi("Pacific Palisades", "coastal_hillside_leafy", 34.0480, -118.5265),
    Aoi("North Hollywood", "valley_dense_mixed", 34.1870, -118.3800),
    Aoi("Gardena", "south_bay_industrial_mixed", 33.8883, -118.3090),
    Aoi("Chinatown", "dense_downtown_adjacent", 34.0616, -118.2378),
    Aoi("Woodland Hills", "valley_leafy_suburban", 34.1683, -118.6059),
    Aoi("Leimert Park", "moderate_canopy_residential_south", 34.0067, -118.3273),
    Aoi("El Monte", "san_gabriel_valley_industrial", 34.0686, -118.0276),
    Aoi("Exposition Park / USC", "dense_campus_urban", 34.0141, -118.2879),
    Aoi("Bel Air", "hillside_very_leafy", 34.1004, -118.4600),
    Aoi("Hawthorne", "south_bay_dense_mixed", 33.9164, -118.3526),
    Aoi("Tarzana", "valley_residential_leafy", 34.1808, -118.5490),
    Aoi("Marina del Rey", "coastal_marina", 33.9802, -118.4517),
    Aoi("South Pasadena", "san_gabriel_valley_leafy", 34.1162, -118.1499),
    Aoi("Palms", "westside_dense_residential", 34.0292, -118.4064),
    Aoi("Playa del Rey", "coastal_low_density_2", 33.9564, -118.4470),
    Aoi("Elysian Park", "park_adjacent_2", 34.0847, -118.2434),
    Aoi("Westchester / LAX-adjacent", "dense_low_canopy_2", 33.9520, -118.3980),
    Aoi("Commerce", "industrial_2", 34.0001, -118.1590),
    Aoi("Angelino Heights", "hillside_dense_historic", 34.0692, -118.2564),
    Aoi("Little Tokyo", "dense_downtown_adjacent_2", 34.0500, -118.2412),
    Aoi("Panorama City", "valley_dense_residential", 34.2270, -118.4494),
    Aoi("West LA", "westside_mixed_2", 34.0447, -118.4453),
]


# Second expansion batch: collected with BOTH daytime and nighttime date_times
# (see run_collection.py's --night-batch), unlike AOIS above (daytime only).
# Fills in areas AOIS still doesn't cover: Southeast LA / Long Beach-adjacent
# industrial and dense residential, Glendale/Burbank, further San Fernando
# Valley, and more central-LA neighborhoods.
NIGHT_AOIS: list[Aoi] = [
    Aoi("Glendale", "adjacent_city_mixed", 34.1425, -118.2551),
    Aoi("Burbank", "adjacent_city_mixed_2", 34.1808, -118.3090),
    Aoi("Long Beach (downtown)", "port_city_dense", 33.7701, -118.1937),
    Aoi("Compton", "southeast_dense_residential", 33.8958, -118.2201),
    Aoi("Downey", "southeast_suburban", 33.9401, -118.1332),
    Aoi("Lakewood", "southeast_suburban_2", 33.8536, -118.1339),
    Aoi("Bellflower", "southeast_dense_mixed", 33.8817, -118.1170),
    Aoi("Whittier", "san_gabriel_valley_suburban", 33.9792, -118.0328),
    Aoi("Sylmar", "valley_far_open", 34.3106, -118.4442),
    Aoi("Sun Valley", "valley_industrial", 34.2183, -118.3900),
    Aoi("Cypress Park", "dense_hillside_residential", 34.0928, -118.2264),
    Aoi("El Sereno", "hillside_dense_residential_2", 34.0781, -118.1721),
    Aoi("Atwater Village", "leafy_riverside", 34.1181, -118.2626),
    Aoi("Larchmont", "leafy_central", 34.0781, -118.3234),
    Aoi("Mid-City", "dense_central_mixed", 34.0464, -118.3376),
    Aoi("West Adams", "dense_central_residential", 34.0300, -118.3175),
    Aoi("Harbor City", "south_bay_industrial", 33.7897, -118.2967),
    Aoi("Wilmington", "port_industrial", 33.7742, -118.2625),
    Aoi("El Segundo", "coastal_industrial_2", 33.9192, -118.4165),
    Aoi("Lynwood", "southeast_dense_low_canopy", 33.9303, -118.2114),
    Aoi("South Gate", "southeast_industrial_mixed", 33.9548, -118.2115),
    Aoi("Huntington Park", "southeast_dense_urban", 33.9817, -118.2248),
    Aoi("Bell", "southeast_dense_residential_2", 33.9775, -118.1870),
]


def centroid(aoi: Aoi) -> tuple[float, float]:
    return aoi.lat, aoi.lng
