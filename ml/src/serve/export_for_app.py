"""Runs inference + SHAP for (a) the 14 DEMO_BLOCKS and (b) every collected
live LA grid cell, and writes ONE static JSON the Next.js app reads directly
-- no Python, no network, at app runtime for this first (precomputed) pass.

Output: src/lib/mock-data/ml-explanations.json, shaped so a thin TS reader
(src/lib/reasoning/mlExplain.ts) can turn each entry straight into the
existing Evidence[]/predicted-anomaly shape from src/types/thermal.ts.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from ..train.explain_shap import load_model_and_schema, make_explainer, ranked_contributions
from .demo_blocks_parser import parse_demo_blocks

DATASET_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "dataset.parquet"
OUTPUT_PATH = Path(__file__).resolve().parents[3] / "src" / "lib" / "mock-data" / "ml-explanations.json"

# Evidence category per feature, matching src/types/thermal.ts's EvidenceCategory.
FEATURE_CATEGORY = {
    "imperviousPct": "surface",
    "canopyPct": "vegetation",
    "buildingDensity": "urban_form",
    "windMph": "weather",
    "humidity": "weather",
    "cloudCoverPct": "weather",
    "solarIrradiance": "weather",
    "heatIndex": "weather",
    "hourOfDay": "history",
}
FEATURE_LABEL = {
    "imperviousPct": "Impervious surface",
    "canopyPct": "Tree canopy",
    "buildingDensity": "Building density",
    "windMph": "Wind speed",
    "humidity": "Relative humidity",
    "cloudCoverPct": "Cloud cover",
    "solarIrradiance": "Solar irradiance",
    "heatIndex": "Heat index",
    "hourOfDay": "Hour of day",
}
# Excluded from user-facing evidence: context, not a physical driver a user
# would recognize as "why this block is hot."
EVIDENCE_EXCLUDED_FEATURES = {"hourOfDay"}


def _strength_from_rank(rank: int) -> str:
    return "high" if rank == 0 else "medium" if rank <= 2 else "low"


def _evidence_items(contributions: list[dict]) -> list[dict]:
    items = []
    visible = [c for c in contributions if c["feature"] not in EVIDENCE_EXCLUDED_FEATURES]
    for rank, contribution in enumerate(visible):
        feature = contribution["feature"]
        items.append(
            {
                "id": f"ml-{feature}",
                "category": FEATURE_CATEGORY.get(feature, "surface"),
                "metric": FEATURE_LABEL.get(feature, feature),
                "targetValue": contribution["value"],
                "warmingEffect": contribution["direction"],
                "source": "XGBoost + SHAP (trained on FortyGuard data)",
                "provenance": "modelled",
                "strength": _strength_from_rank(rank),
                "shapValue": round(contribution["shapValue"], 4),
                "explanation": (
                    f"The model attributes {abs(contribution['shapValue']):.2f}°F of the predicted "
                    f"anomaly to {FEATURE_LABEL.get(feature, feature).lower()} "
                    f"({'warming' if contribution['direction'] == 'warmer' else 'cooling' if contribution['direction'] == 'cooler' else 'negligible'} effect)."
                ),
            }
        )
    return items


def _feature_medians(df: pd.DataFrame, feature_columns: list[str]) -> dict[str, float]:
    return {col: float(df[col].median()) for col in feature_columns if col in df.columns}


def _demo_block_features(block: dict, feature_columns: list[str], medians: dict[str, float]) -> dict[str, float]:
    # Map BlockMetrics field names (src/types/thermal.ts) onto our model's
    # feature names; anything the demo blocks don't carry (env_params /
    # OSM-derived fields) falls back to the training data's median.
    mapped = {
        "imperviousPct": block.get("imperviousSurfacePct"),
        "canopyPct": block.get("treeCanopyPct"),
        "buildingDensity": block.get("buildingDensity"),
        "windMph": block.get("windMph"),
    }
    return {col: (mapped.get(col) if mapped.get(col) is not None else medians.get(col, 0.0)) for col in feature_columns}


def main() -> None:
    model, schema = load_model_and_schema()
    feature_columns = schema["feature_columns"]
    explainer = make_explainer(model)

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "modelVersion": "thermal_xgb_v1",
        "cvMae": schema.get("cv_mae"),
        "cvR2": schema.get("cv_r2"),
        "featureColumns": feature_columns,
        "demoBlocks": {},
        "liveGrid": [],
    }

    # --- Demo blocks -------------------------------------------------------
    demo_blocks = parse_demo_blocks()
    if DATASET_PATH.exists():
        training_df = pd.read_parquet(DATASET_PATH).dropna(subset=feature_columns)
        medians = _feature_medians(training_df, feature_columns)
    else:
        medians = {col: 0.0 for col in feature_columns}
        print("WARNING: no training dataset found -- demo block features falling back to 0 for unmapped fields.")

    for block in demo_blocks:
        features = _demo_block_features(block, feature_columns, medians)
        X = pd.DataFrame([features])[feature_columns]
        predicted_anomaly = float(model.predict(X)[0])
        shap_row = explainer.shap_values(X)[0]
        contributions = ranked_contributions(shap_row, features, feature_columns)
        result["demoBlocks"][block["id"]] = {
            "predictedAnomaly": round(predicted_anomaly, 2),
            "features": features,
            "evidence": _evidence_items(contributions),
        }

    # --- Live LA areas (from whatever's been collected so far) -------------
    # Despite the "liveGrid" key name (kept for mlExplain.ts stability), each
    # entry is one AOI x date_time, not a fine spatial grid -- see
    # build_dataset.py's docstring for why (satellite land cover is
    # AOI-level, not per-cell).
    if DATASET_PATH.exists():
        for _, row in training_df.iterrows():
            features = {col: float(row[col]) for col in feature_columns}
            X = pd.DataFrame([features])[feature_columns]
            predicted_anomaly = float(model.predict(X)[0])
            shap_row = explainer.shap_values(X)[0]
            contributions = ranked_contributions(shap_row, features, feature_columns)
            result["liveGrid"].append(
                {
                    "aoi": row["aoi"],
                    "category": row["category"],
                    "lat": float(row["lat"]),
                    "lng": float(row["lng"]),
                    "dateTime": row["date_time"],
                    # "live" = real FortyGuard Satellite Segmentation; "modelled" =
                    # OSM-derived estimate (satellite's ~2/day quota didn't reach
                    # this AOI) -- see build_dataset.py / fetch_osm_landcover.py.
                    "landCoverProvenance": row.get("landCoverProvenance", "unknown"),
                    "actualAnomaly": round(float(row["anomaly"]), 2),
                    "predictedAnomaly": round(predicted_anomaly, 2),
                    "evidence": _evidence_items(contributions),
                }
            )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    print(f"Wrote {len(result['demoBlocks'])} demo block explanations and {len(result['liveGrid'])} live grid "
          f"cell explanations to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
