"""Tier 3 (product-facing, not a new trained model): aggregates Tier 2's
per-cell SHAP output into fixed ~450m geographic tiles -- the "400-500m for
clustering, 100m for why it's hot" granularity decided earlier -- and
produces a ranked, prioritized action-plan list for city officials.

Pure aggregation on top of Tier 2's existing per-cell predictions. No new
model, no new FortyGuard credits, no new data collection.

Design decisions, made explicit:
- Tiles are a FIXED geographic grid (lat/lng snapped to ~450m steps from a
  shared origin), not an organic clustering algorithm (k-means etc). A
  fixed grid is deterministic and reproducible -- re-running this script
  always produces the same tile boundaries, which matters for a tool meant
  to inform real decisions (an official revisiting "tile R76_C-263" next
  month should see the same tile, not a different one from a re-clustered
  run). Grid cell size uses a single reference latitude (LA's ~34.0N) for
  the longitude-degree conversion; fine at hackathon precision, not
  survey-grade GIS.
- A tile aggregates across ALL of its member cells' rows, regardless of
  date_time. This is deliberate: actionable urban-form features (impervious,
  canopy, albedo, building density) don't change with weather, so pooling
  across date_times averages out weather noise and surfaces the persistent
  structural signal -- exactly what an action plan should be based on, not
  one afternoon's reading.
- SHAP aggregation averages the RAW SIGNED per-cell SHAP vectors first,
  then derives the percentage breakdown from that mean vector -- NOT an
  average of each cell's own percentage breakdown. This matters: if half a
  tile's cells show impervious pushing warmer and half show it pushing
  cooler, averaging the signed values correctly cancels toward ~0 (no
  consistent tile-level effect), whereas averaging percentages would
  wrongly treat that as a strong, consistent driver.
- Priority classification: "priority" (worth an official's attention --
  positive anomaly AND a real actionable share) vs "geographic" (hot, but
  driven by fixed context, not actionable) vs "typical" (not notably hot).
  Threshold values below are a first-pass judgment call, not derived from
  any statistical test -- documented here so they're easy to revisit.
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb

from ..collect.geo_utils import meters_per_deg_lng
from ..train.explain_shap import make_explainer
from ..train.percell_breakdown import percentage_breakdown
from ..train.train_xgboost_percell import DATASET_PATH, MODEL_PATH, SCHEMA_PATH
from .export_percell_for_app import FEATURE_LABEL

OUTPUT_PATH = Path(__file__).resolve().parents[3] / "src" / "lib" / "mock-data" / "cluster-action-plans.json"

TILE_SIZE_M = 450.0
_REFERENCE_LAT = 34.0  # LA-representative, for the longitude-degree conversion only
_LAT_STEP_DEG = TILE_SIZE_M / 111_320.0
_LNG_STEP_DEG = TILE_SIZE_M / meters_per_deg_lng(_REFERENCE_LAT)

MIN_CELLS_PER_TILE = 4  # below this, a tile is too noisy/sparse to report on

# Priority classification thresholds -- see module docstring.
HOT_ANOMALY_THRESHOLD_F = 0.3       # avg cellAnomaly above this counts as "notably hot"
MEANINGFUL_ACTIONABLE_PCT = 15.0    # actionable share of the aggregate breakdown above this counts as "a real lever exists"

_ACTIONABLE_FEATURES = {"imperviousPctRel", "canopyPctRel", "albedoRel", "buildingDensity"}

_RECOMMENDATION_TEXT = {
    ("imperviousPctRel", "warmer"): "Highest-impact lever: this tile has more paved/impervious surface than its surrounding norm — reducing impervious coverage (permeable paving, unpaving surplus lots) is the most direct intervention.",
    ("imperviousPctRel", "cooler"): "This tile already has less impervious surface than its surrounding norm — a relative strength, not a gap to close.",
    ("canopyPctRel", "warmer"): "Highest-impact lever: this tile has less tree canopy than its surrounding norm — targeted tree planting is the most direct intervention.",
    ("canopyPctRel", "cooler"): "This tile already has more tree canopy than its surrounding norm — a relative strength, not a gap to close.",
    ("albedoRel", "warmer"): "Highest-impact lever: surfaces here reflect less sunlight than the surrounding norm — reflective/cool-roof and cool-pavement treatments are the most direct intervention.",
    ("albedoRel", "cooler"): "This tile's surfaces already reflect more sunlight than the surrounding norm — a relative strength, not a gap to close.",
    ("buildingDensity", "warmer"): "Building density is a contributing factor here — harder to change directly, but worth pairing with canopy or surface-material interventions.",
    ("buildingDensity", "cooler"): "Lower building density here is a relative strength, not a gap to close.",
}


def _tile_id(lat: float, lng: float) -> str:
    lat_idx = math.floor(lat / _LAT_STEP_DEG)
    lng_idx = math.floor(lng / _LNG_STEP_DEG)
    return f"{lat_idx}_{lng_idx}"


def _tile_centroid(lat_idx_lng_idx: str) -> tuple[float, float]:
    lat_idx, lng_idx = (int(x) for x in lat_idx_lng_idx.split("_"))
    return (lat_idx + 0.5) * _LAT_STEP_DEG, (lng_idx + 0.5) * _LNG_STEP_DEG


def _recommendation_for(breakdown: list[dict]) -> str | None:
    """Recommends around the single most impactful actionable feature, as
    long as actionable factors COLLECTIVELY cross MEANINGFUL_ACTIONABLE_PCT
    -- the same bar the "priority" tier classification itself uses (see
    priority_tier below). Using a stricter per-feature-only threshold here
    left ~56% of "priority" tiles with no recommendation text at all
    (verified against a real run): plenty of tiles have two moderate
    actionable factors (e.g. 13.5% + 10.3%) that together clearly matter
    but neither alone crosses a strict per-item bar. Recommending around
    the top one is still honest -- it names the single biggest lever, it
    just doesn't require that lever to carry the whole story alone."""
    actionable_items = [b for b in breakdown if b["feature"] in _ACTIONABLE_FEATURES]
    if not actionable_items:
        return None
    actionable_pct_sum = sum(b["pct"] for b in actionable_items)
    if actionable_pct_sum < MEANINGFUL_ACTIONABLE_PCT:
        return None
    top = actionable_items[0]  # breakdown is already sorted by |contribution| descending
    return _RECOMMENDATION_TEXT.get((top["feature"], top["direction"]))


def main() -> None:
    if not DATASET_PATH.exists():
        raise SystemExit(f"{DATASET_PATH} not found. Run `python -m src.features.build_dataset_percell` first.")
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    feature_columns = schema["feature_columns"]
    non_actionable = schema["non_actionable_features"]
    model = xgb.XGBRegressor()
    model.load_model(str(MODEL_PATH))
    explainer = make_explainer(model)

    df = pd.read_parquet(DATASET_PATH).dropna(subset=feature_columns + [schema["target"]])
    print(f"Computing SHAP values for {len(df)} cells (one batched call)...")
    shap_values = explainer.shap_values(df[feature_columns])

    df = df.reset_index(drop=True)
    df["_tileId"] = [_tile_id(lat, lng) for lat, lng in zip(df["lat"], df["lng"])]

    tiles_by_id: dict[str, list[int]] = defaultdict(list)
    for i, tile_id in enumerate(df["_tileId"]):
        tiles_by_id[tile_id].append(i)

    tiles = []
    for tile_id, row_indices in tiles_by_id.items():
        n_rows = len(row_indices)
        member_cell_keys = {(round(df.loc[i, "lat"], 6), round(df.loc[i, "lng"], 6)) for i in row_indices}
        if len(member_cell_keys) < MIN_CELLS_PER_TILE:
            continue

        mean_shap = shap_values[row_indices].mean(axis=0)
        mean_feature_values = {col: float(df.loc[row_indices, col].mean()) for col in feature_columns}
        breakdown = percentage_breakdown(mean_shap, mean_feature_values, feature_columns, non_actionable, min_pct=1.0)
        for item in breakdown:
            item["label"] = FEATURE_LABEL.get(item["feature"], item["feature"])

        avg_anomaly = float(df.loc[row_indices, "cellAnomaly"].mean())
        top_category = breakdown[0]["category"] if breakdown else "other"
        actionable_pct = sum(b["pct"] for b in breakdown if b["category"] == "actionable")

        if avg_anomaly >= HOT_ANOMALY_THRESHOLD_F and actionable_pct >= MEANINGFUL_ACTIONABLE_PCT:
            priority_tier = "priority"
        elif avg_anomaly >= HOT_ANOMALY_THRESHOLD_F:
            priority_tier = "geographic"
        else:
            priority_tier = "typical"

        primary_aoi = df.loc[row_indices, "aoi"].mode().iloc[0]
        centroid_lat, centroid_lng = _tile_centroid(tile_id)

        tiles.append({
            "tileId": tile_id,
            "centroidLat": round(centroid_lat, 5),
            "centroidLng": round(centroid_lng, 5),
            "primaryAoi": primary_aoi,
            "nCells": len(member_cell_keys),
            "nRows": n_rows,
            "avgCellAnomaly": round(avg_anomaly, 2),
            "topDriverCategory": top_category,
            "priorityTier": priority_tier,
            "breakdown": breakdown,
            "recommendation": _recommendation_for(breakdown),
        })

    tiles.sort(key=lambda t: t["avgCellAnomaly"], reverse=True)

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "modelVersion": "thermal_xgb_percell_v1",
        "tileSizeM": TILE_SIZE_M,
        "minCellsPerTile": MIN_CELLS_PER_TILE,
        "nTiles": len(tiles),
        "nPriorityTiles": sum(1 for t in tiles if t["priorityTier"] == "priority"),
        "nGeographicTiles": sum(1 for t in tiles if t["priorityTier"] == "geographic"),
        "nTypicalTiles": sum(1 for t in tiles if t["priorityTier"] == "typical"),
        "tiles": tiles,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"Wrote {len(tiles)} tiles ({result['nPriorityTiles']} priority, {result['nGeographicTiles']} geographic, "
          f"{result['nTypicalTiles']} typical) to {OUTPUT_PATH} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
