"""Action Feasibility Guard: classifies each priority action-plan tile into a
practical site type from OSM geometry, then maps that to which interventions
are physically plausible.

Deliberately a transparent rule engine, not a model -- these numbers need to
be defensible in a Q&A ("why did the agent reject tree planting here?"), and
a simple area-share threshold is easy to state and easy to check by eye
against a satellite view. No new FortyGuard credits, no new trained model;
pure geometry math on already-cached-or-cheap OSM data.

Framing matters (see module callers): this is INTERVENTION SUITABILITY
SCREENING, not a construction-ready feasibility study. It never certifies an
action is buildable -- only that it isn't obviously implausible given the
dominant land use in a ~450m tile. Real siting always needs the field checks
listed in REQUIRES_FIELD_VERIFICATION.
"""

from __future__ import annotations

from ..collect.geo_utils import line_length_m, shoelace_area_m2

# Road width table mirrors fetch_osm_landcover.py's _ROAD_WIDTH_M so the two
# impervious-surface estimates (AOI-level canopy/impervious vs. tile-level
# site type) stay consistent with each other.
_MAJOR_ROAD_CLASSES = {"motorway", "trunk", "primary"}
_MINOR_ROAD_CLASSES = {"secondary", "tertiary", "residential", "unclassified", "service", "living_street"}
_PEDESTRIAN_CLASSES = {"footway", "path", "cycleway", "pedestrian"}
_ROAD_WIDTH_M = {
    "motorway": 15, "trunk": 15,
    "primary": 10, "secondary": 10, "tertiary": 10,
    "residential": 6, "unclassified": 6, "service": 6, "living_street": 6,
    "footway": 2, "path": 2, "cycleway": 2, "pedestrian": 3,
}
_DEFAULT_ROAD_WIDTH_M = 6

TILE_AREA_M2 = 450.0 * 450.0

# Classification thresholds -- first-pass judgment calls, documented here so
# they're easy to revisit, same convention as export_clusters_for_app.py's
# HOT_ANOMALY_THRESHOLD_F / MEANINGFUL_ACTIONABLE_PCT.
MAJOR_ROAD_DOMINANT_SHARE = 0.22   # motorway/trunk/primary share of tile area
PARKING_DOMINANT_SHARE = 0.20
BUILDING_DOMINANT_SHARE = 0.30
GREEN_DOMINANT_SHARE = 0.25

REQUIRES_FIELD_VERIFICATION = [
    "Sidewalk / shoulder width",
    "Underground and overhead utilities",
    "Parcel ownership and right-of-way",
    "Traffic engineering sign-off (for anything near a live roadway)",
]

SUITABLE_ACTIONS = {
    "highway_dominated": ["Cool/reflective pavement coating", "Solar canopies over shoulders or medians", "Sound-wall greening (vines, not canopy trees)"],
    "surface_parking": ["Permeable paving", "Cool pavement coating", "Shade structures / solar canopies over stalls", "Perimeter street trees"],
    "building_dominated": ["Cool/reflective roofing", "Rooftop solar", "Green roofs where structurally feasible", "Facade shading"],
    "green_space": ["Canopy densification", "Irrigation efficiency improvements", "No major intervention needed -- already a cooling asset"],
    "residential_mixed": ["Street trees", "Permeable paving for driveways/sidewalks", "Cool pavement coating on local streets"],
    "mixed_unclassified": ["Cool pavement coating", "Spot street trees where right-of-way allows"],
}

EXCLUDED_ACTIONS = {
    "highway_dominated": [
        {"action": "Street tree planting", "reason": "Tile is dominated by limited-access roadway -- no planting strip, and canopy near live traffic lanes is a sightline/safety hazard."},
        {"action": "Ground-level permeable paving", "reason": "Live roadway surface; repaving requires a full traffic-engineering closure, not a screening-level recommendation."},
    ],
    "surface_parking": [
        {"action": "Green roof", "reason": "No roof structure present -- this tile is dominated by at-grade paved area, not buildings."},
    ],
    "building_dominated": [
        {"action": "Street tree planting", "reason": "Tile is dominated by building footprint, not open ground-level right-of-way -- canopy siting would need a parcel-by-parcel check, not a tile-level call."},
    ],
    "green_space": [
        {"action": "New impervious cooling infrastructure (cool pavement, solar canopies)", "reason": "Tile is already dominated by tree canopy or open green space -- the gap this tool looks for isn't present here."},
    ],
    "residential_mixed": [],
    "mixed_unclassified": [],
}

SITE_TYPE_LABEL = {
    "highway_dominated": "Highway / major-road dominated",
    "surface_parking": "Surface parking or paved open area",
    "building_dominated": "Building / roof dominated",
    "green_space": "Existing green / open space",
    "residential_mixed": "Residential or mixed street",
    "mixed_unclassified": "Mixed -- no single dominant land use",
}


def _is_closed(coords: list[list[float]]) -> bool:
    return len(coords) >= 3 and coords[0] == coords[-1]


def compute_coverage(osm_response: dict, origin_lat: float) -> dict[str, float]:
    """Raw m^2 (or m^2-equivalent, for line-derived road/parking area) per
    category, from one Overpass response covering a single tile's bbox."""
    major_road_m2 = 0.0
    minor_road_m2 = 0.0
    pedestrian_m2 = 0.0
    building_m2 = 0.0
    parking_m2 = 0.0
    canopy_m2 = 0.0

    for element in osm_response.get("elements", []):
        geometry = element.get("geometry")
        if not geometry:
            continue
        tags = element.get("tags") or {}
        coords = [[node["lon"], node["lat"]] for node in geometry]
        closed = _is_closed(coords)

        if "amenity" in tags and tags.get("amenity") == "parking" and closed:
            parking_m2 += shoelace_area_m2(coords, origin_lat)
        elif tags.get("landuse") == "parking" and closed:
            parking_m2 += shoelace_area_m2(coords, origin_lat)
        elif "building" in tags and closed:
            building_m2 += shoelace_area_m2(coords, origin_lat)
        elif "highway" in tags and len(coords) >= 2:
            highway_class = tags["highway"]
            width = _ROAD_WIDTH_M.get(highway_class, _DEFAULT_ROAD_WIDTH_M)
            area = line_length_m(coords, origin_lat) * width
            if highway_class in _MAJOR_ROAD_CLASSES:
                major_road_m2 += area
            elif highway_class in _PEDESTRIAN_CLASSES:
                pedestrian_m2 += area
            else:
                minor_road_m2 += area
        elif (tags.get("natural") == "wood" or tags.get("landuse") == "forest") and closed:
            canopy_m2 += shoelace_area_m2(coords, origin_lat)

    return {
        "majorRoadM2": major_road_m2,
        "minorRoadM2": minor_road_m2,
        "pedestrianM2": pedestrian_m2,
        "buildingM2": building_m2,
        "parkingM2": parking_m2,
        "canopyM2": canopy_m2,
    }


def classify_site_type(coverage: dict[str, float], tile_area_m2: float = TILE_AREA_M2) -> str:
    """Major-road coverage is checked FIRST and alone, as a safety-priority
    override, not a dominance comparison: even a tile that's mostly building
    or parking still gets flagged highway_dominated if it also carries
    meaningful limited-access-road frontage, because the exclusion this
    triggers (no street trees near live traffic lanes) is a hard constraint
    regardless of what else shares the tile.

    Everything else (parking / building / green) is then compared by WHICH
    SHARE IS ACTUALLY LARGEST among those that clear their own threshold --
    not fixed priority order -- so a tile that's 43% building and 21%
    parking is correctly called building_dominated, not surface_parking."""
    major_road_share = min(coverage["majorRoadM2"], tile_area_m2) / tile_area_m2
    if major_road_share >= MAJOR_ROAD_DOMINANT_SHARE:
        return "highway_dominated"

    candidates = {
        "surface_parking": (min(coverage["parkingM2"], tile_area_m2) / tile_area_m2, PARKING_DOMINANT_SHARE),
        "building_dominated": (min(coverage["buildingM2"], tile_area_m2) / tile_area_m2, BUILDING_DOMINANT_SHARE),
        "green_space": (min(coverage["canopyM2"], tile_area_m2) / tile_area_m2, GREEN_DOMINANT_SHARE),
    }
    qualifying = {site_type: share for site_type, (share, threshold) in candidates.items() if share >= threshold}
    if qualifying:
        return max(qualifying, key=qualifying.get)
    if coverage["minorRoadM2"] > 0:
        return "residential_mixed"
    return "mixed_unclassified"


def feasibility_screen(osm_response: dict, origin_lat: float) -> dict:
    """Full per-tile result: site type + suitable/excluded actions + the
    standing field-verification list. This is what gets attached to each
    priority tile in cluster-action-plans.json."""
    coverage = compute_coverage(osm_response, origin_lat)
    site_type = classify_site_type(coverage)
    return {
        "siteType": site_type,
        "siteTypeLabel": SITE_TYPE_LABEL[site_type],
        "suitableActions": SUITABLE_ACTIONS[site_type],
        "excludedActions": EXCLUDED_ACTIONS[site_type],
        "requiresFieldVerification": REQUIRES_FIELD_VERIFICATION,
        "coverage": {k: round(v, 1) for k, v in coverage.items()},
    }
