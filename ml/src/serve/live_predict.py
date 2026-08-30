"""Ties together live_satellite.py + live_enrichment.py + Tier 2's trained
model into one function: an arbitrary lat/lng -> a real predicted anomaly
and SHAP percentage breakdown, computed live (not from the precomputed
80-AOI export).

The one paid step is the live satellite call (live_satellite.py,
FORTYGUARD_API_KEY, 14,400 credits for a genuinely new point, free for a
repeat click nearby) -- everything else is free.
"""

from __future__ import annotations

import json

import xgboost as xgb

from ..train.explain_shap import make_explainer
from ..train.percell_breakdown import percentage_breakdown
from ..train.train_xgboost_percell import FEATURE_COLUMNS, MODEL_PATH, SCHEMA_PATH
from . import live_enrichment, live_satellite
from .export_percell_for_app import FEATURE_LABEL

_model: xgb.XGBRegressor | None = None
_explainer = None
_schema: dict | None = None


def _load() -> None:
    global _model, _explainer, _schema
    if _model is not None:
        return
    _schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    _model = xgb.XGBRegressor()
    _model.load_model(str(MODEL_PATH))
    _explainer = make_explainer(_model)


def predict_live(lat: float, lng: float) -> dict:
    _load()
    assert _model is not None and _explainer is not None and _schema is not None

    land_cover = live_satellite.fetch_live_land_cover(lat, lng)
    aoi_canopy_pct = land_cover.get("canopyPct")
    if aoi_canopy_pct is None:
        raise RuntimeError("Live satellite call returned no canopy% -- can't compute a Tier 2 prediction.")

    features = live_enrichment.live_features(lat, lng, aoi_canopy_pct)
    missing = [col for col in FEATURE_COLUMNS if features.get(col) is None]
    if missing:
        raise RuntimeError(f"Missing live feature(s), can't run the model: {missing}")

    import pandas as pd
    X = pd.DataFrame([{col: features[col] for col in FEATURE_COLUMNS}])[FEATURE_COLUMNS]
    predicted_anomaly = float(_model.predict(X)[0])
    shap_row = _explainer.shap_values(X)[0]
    breakdown = percentage_breakdown(shap_row, features, FEATURE_COLUMNS, _schema["non_actionable_features"])
    for item in breakdown:
        item["label"] = FEATURE_LABEL.get(item["feature"], item["feature"])

    return {
        "predictedAnomaly": round(predicted_anomaly, 2),
        "breakdown": breakdown,
        "features": features,
        "liveSatellite": {
            "imperviousPct": land_cover.get("imperviousPct"),
            "canopyPct": aoi_canopy_pct,
            "cached": land_cover["cached"],
            "creditsSpent": land_cover["creditsSpent"],
        },
        "modelVersion": "thermal_xgb_percell_v1",
    }
