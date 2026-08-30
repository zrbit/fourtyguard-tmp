"""Tier 2 export: per-AOI "why is this block hot" summary + a small number
of representative real cells (hottest and coolest per AOI), written as one
static JSON the Next.js app reads directly -- no Python, no network, at app
runtime, same precomputed-first pattern as export_for_app.py (Tier 1).

Deliberately NOT exporting all 100K+ cells: at that granularity a full
per-cell export would be tens of MB of static JSON, unreasonable to bundle
or commit. Instead, per AOI:
  - a summary: how many of its cells are actionable-dominated vs
    geography-dominated vs weather-dominated (the SHAP top driver's
    category), so the UI can say "most of this neighborhood's variation is
    geography, but here's an example where it wasn't."
  - 2 representative real cells (hottest, coolest anomaly) with their full
    percentage breakdown, via percell_breakdown.py.

This keeps the export small (~80 AOIs x 2 examples = manageable) while
still surfacing real computed numbers, not placeholders. A true "click any
point, get its real cell's breakdown" experience needs a live nearest-cell
lookup (analogous to mlExplain.ts's nearest-AOI match, but against a real
spatial index of 100K+ cells) -- that's a separate, larger step, not done
here; see ENRICHMENT_PLAN.md / conversation for the "next steps" framing.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import xgboost as xgb

from ..train.explain_shap import make_explainer
from ..train.percell_breakdown import percentage_breakdown
from ..train.train_xgboost_percell import DATASET_PATH, MODEL_PATH, SCHEMA_PATH

OUTPUT_PATH = Path(__file__).resolve().parents[3] / "src" / "lib" / "mock-data" / "cell-attribution.json"

FEATURE_LABEL = {
    "imperviousPctRel": "Impervious surface, relative to this neighborhood",
    "canopyPctRel": "Tree canopy, relative to this neighborhood",
    "albedoRel": "Surface reflectivity (albedo), relative to this neighborhood",
    "elevationMRel": "Elevation, relative to this neighborhood",
    "distanceToCoastMRel": "Distance to coast, relative to this neighborhood",
    "buildingDensity": "Building density",
    "windMph": "Wind speed at reading time",
    "humidity": "Relative humidity at reading time",
    "cloudCoverPct": "Cloud cover at reading time",
    "solarIrradiance": "Solar irradiance at reading time",
    "heatIndex": "Heat index at reading time",
    "hourOfDay": "Hour of day",
}


def _breakdown_for_row(shap_row, row: pd.Series, feature_columns: list[str], non_actionable: list[str]) -> list[dict]:
    items = percentage_breakdown(shap_row, row[feature_columns].to_dict(), feature_columns, non_actionable)
    for item in items:
        item["label"] = FEATURE_LABEL.get(item["feature"], item["feature"])
    return items


def main() -> None:
    if not DATASET_PATH.exists():
        raise SystemExit(f"{DATASET_PATH} not found. Run `python -m src.features.build_dataset_percell` first.")
    if not MODEL_PATH.exists():
        raise SystemExit(f"{MODEL_PATH} not found. Run `python -m src.train.train_xgboost_percell` first.")

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    feature_columns = schema["feature_columns"]
    non_actionable = schema["non_actionable_features"]
    model = xgb.XGBRegressor()
    model.load_model(str(MODEL_PATH))
    explainer = make_explainer(model)

    df = pd.read_parquet(DATASET_PATH).dropna(subset=feature_columns + [schema["target"]])

    print(f"Computing SHAP values for {len(df)} cells (one batched call, not per-row)...")
    all_shap_values = explainer.shap_values(df[feature_columns])
    breakdowns = [
        _breakdown_for_row(all_shap_values[i], df.iloc[i], feature_columns, non_actionable)
        for i in range(len(df))
    ]
    df = df.assign(_breakdown=breakdowns)
    df["_topCategory"] = df["_breakdown"].map(lambda b: b[0]["category"] if b else "other")

    per_aoi: dict[str, dict] = {}
    examples: dict[str, list[dict]] = {}
    for aoi_name, group in df.groupby("aoi"):
        n = len(group)
        top_counts = group["_topCategory"].value_counts(normalize=True) * 100
        per_aoi[aoi_name] = {
            "category": group["category"].iloc[0],
            "nCells": int(n),
            "topDriverPct": {
                "actionable": round(float(top_counts.get("actionable", 0.0)), 1),
                "geographic_context": round(float(top_counts.get("geographic_context", 0.0)), 1),
                "weather_context": round(float(top_counts.get("weather_context", 0.0)), 1),
            },
        }

        hottest = group.loc[group["cellAnomaly"].idxmax()]
        coolest = group.loc[group["cellAnomaly"].idxmin()]
        examples[aoi_name] = [
            {
                "label": "hottest",
                "lat": float(hottest["lat"]),
                "lng": float(hottest["lng"]),
                "dateTime": hottest["date_time"],
                "cellAnomaly": round(float(hottest["cellAnomaly"]), 2),
                "breakdown": hottest["_breakdown"],
            },
            {
                "label": "coolest",
                "lat": float(coolest["lat"]),
                "lng": float(coolest["lng"]),
                "dateTime": coolest["date_time"],
                "cellAnomaly": round(float(coolest["cellAnomaly"]), 2),
                "breakdown": coolest["_breakdown"],
            },
        ]

    # Overall stat for the headline callout (see the artifact preview this mirrors).
    overall_top_counts = df["_topCategory"].value_counts(normalize=True) * 100

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "modelVersion": "thermal_xgb_percell_v1",
        "cvMae": schema.get("cv_mae"),
        "cvR2": schema.get("cv_r2"),
        "nCellsTotal": int(len(df)),
        "overallTopDriverPct": {
            "actionable": round(float(overall_top_counts.get("actionable", 0.0)), 1),
            "geographic_context": round(float(overall_top_counts.get("geographic_context", 0.0)), 1),
            "weather_context": round(float(overall_top_counts.get("weather_context", 0.0)), 1),
        },
        "perAoi": per_aoi,
        "examples": examples,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"Wrote per-AOI Tier 2 summaries + examples for {len(per_aoi)} AOIs to {OUTPUT_PATH} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
