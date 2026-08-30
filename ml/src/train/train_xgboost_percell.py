"""Tier 2: trains the per-cell "why is this specific block hot" XGBoost
regressor. Same CPU-only, GroupKFold-by-AOI approach as Tier 1
(train_xgboost.py) -- see that module's docstring for why (no GPU needed,
grouped CV to avoid land-cover leakage across a single AOI's rows).

Grouping is still by AOI, not by cell: at 100+ cells per AOI, a random or
cell-level split would leak hard (neighboring cells share nearly
identical land cover), so an entire AOI's cells -- across every date_time
-- must land in the same fold, exactly as in Tier 1.

Target is `cellAnomaly` (this cell's temp minus its own AOI's mean at that
date_time) -- different question from Tier 1's AOI-vs-regional `anomaly`.
Elevation and distance-to-coast are included as features but constrained
to 0 (unconstrained): real signal, but non-actionable context per
COLLECTION_PLAN.md/ENRICHMENT_PLAN.md -- a city can't move a block's
elevation, so they should never be presented as an intervention lever
even if the model finds them predictive. Albedo IS constrained (-1,
higher albedo -> cooler): physically well-established and actionable
(reflective roofing/paving), unlike elevation/coast-distance.

Trains on the *Rel (AOI-relative, mean-centered) feature columns from
build_dataset_percell.py, not the absolute ones. Verified empirically:
absolute values give a NEGATIVE cross-AOI CV R2 (-0.051, worse than
predicting the AOI mean) because land-cover ranges differ wildly across
AOIs, so a tree threshold learned on one AOI's range doesn't transfer.
Relative features fix this (CV R2 -> positive) by asking "warmer/cooler
than THIS neighborhood's own norm" -- exactly what cellAnomaly measures.
See build_dataset_percell.py's comment on the *Rel columns for detail.
"""

from __future__ import annotations

import json
from itertools import product
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_absolute_error, r2_score

DATASET_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "dataset_percell.parquet"
MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "thermal_xgb_percell_v1.json"
SCHEMA_PATH = Path(__file__).resolve().parents[2] / "models" / "feature_schema_percell.json"

FEATURE_COLUMNS = [
    "imperviousPctRel",
    "canopyPctRel",
    "albedoRel",
    "elevationMRel",
    "distanceToCoastMRel",
    "buildingDensity",
    "windMph",
    "humidity",
    "cloudCoverPct",
    "solarIrradiance",
    "heatIndex",
    "hourOfDay",
]

MONOTONE_CONSTRAINTS = {
    "imperviousPctRel": 1,
    "canopyPctRel": -1,
    "albedoRel": -1,
    "elevationMRel": 0,       # non-actionable context, see module docstring
    "distanceToCoastMRel": 0,  # non-actionable context, see module docstring
    "buildingDensity": 1,
    "windMph": -1,
    "humidity": 0,
    "cloudCoverPct": 0,
    "solarIrradiance": 0,
    "heatIndex": 0,
    "hourOfDay": 0,
}

# Flagged for consumers (e.g. serve/export_for_app.py's SHAP ranking) so
# these never get presented as an actionable recommendation even if they
# rank high by |SHAP value| -- see module docstring.
NON_ACTIONABLE_FEATURES = ["elevationMRel", "distanceToCoastMRel"]

TARGET_COLUMN = "cellAnomaly"
GROUP_COLUMN = "aoi"

_PARAM_GRID = {
    "max_depth": [2, 3, 4],
    "n_estimators": [100, 150, 200],
    "learning_rate": [0.03, 0.05, 0.1],
}


def _monotone_tuple() -> tuple[int, ...]:
    return tuple(MONOTONE_CONSTRAINTS[col] for col in FEATURE_COLUMNS)


def _make_model(**params) -> xgb.XGBRegressor:
    return xgb.XGBRegressor(
        tree_method="hist",
        monotone_constraints=_monotone_tuple(),
        objective="reg:squarederror",
        random_state=0,
        **params,
    )


def _cross_validate(df: pd.DataFrame, params: dict, n_splits: int) -> float:
    X, y, groups = df[FEATURE_COLUMNS], df[TARGET_COLUMN], df[GROUP_COLUMN]
    gkf = GroupKFold(n_splits=n_splits)
    maes = []
    for train_idx, test_idx in gkf.split(X, y, groups):
        model = _make_model(**params)
        model.fit(X.iloc[train_idx], y.iloc[train_idx])
        pred = model.predict(X.iloc[test_idx])
        maes.append(mean_absolute_error(y.iloc[test_idx], pred))
    return float(np.mean(maes))


def main() -> None:
    if not DATASET_PATH.exists():
        raise SystemExit(f"{DATASET_PATH} not found. Run `python -m src.features.build_dataset_percell` first.")
    df = pd.read_parquet(DATASET_PATH)
    df = df.dropna(subset=FEATURE_COLUMNS + [TARGET_COLUMN])
    n_groups = df[GROUP_COLUMN].nunique()
    if len(df) < 20 or n_groups < 3:
        raise SystemExit(
            f"Only {len(df)} usable rows across {n_groups} AOIs -- not enough to train/cross-validate yet."
        )
    n_splits = min(5, n_groups)
    print(f"{len(df)} cell-rows across {n_groups} AOIs. GroupKFold with {n_splits} splits.\n")

    best_params, best_mae = None, float("inf")
    for max_depth, n_estimators, learning_rate in product(*_PARAM_GRID.values()):
        params = {"max_depth": max_depth, "n_estimators": n_estimators, "learning_rate": learning_rate}
        mae = _cross_validate(df, params, n_splits)
        print(f"  max_depth={max_depth} n_estimators={n_estimators} lr={learning_rate} -> CV MAE {mae:.3f}")
        if mae < best_mae:
            best_mae, best_params = mae, params

    print(f"\nBest params: {best_params}  (CV MAE {best_mae:.3f})")

    X, y, groups = df[FEATURE_COLUMNS], df[TARGET_COLUMN], df[GROUP_COLUMN]
    gkf = GroupKFold(n_splits=n_splits)
    r2s = []
    for train_idx, test_idx in gkf.split(X, y, groups):
        model = _make_model(**best_params)
        model.fit(X.iloc[train_idx], y.iloc[train_idx])
        r2s.append(r2_score(y.iloc[test_idx], model.predict(X.iloc[test_idx])))
    print(f"CV R2: {np.mean(r2s):.3f} (avg across folds)")

    final_model = _make_model(**best_params)
    final_model.fit(X, y)

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    final_model.save_model(str(MODEL_PATH))
    SCHEMA_PATH.write_text(
        json.dumps(
            {
                "feature_columns": FEATURE_COLUMNS,
                "monotone_constraints": MONOTONE_CONSTRAINTS,
                "non_actionable_features": NON_ACTIONABLE_FEATURES,
                "target": TARGET_COLUMN,
                "group_column": GROUP_COLUMN,
                "best_params": best_params,
                "cv_mae": best_mae,
                "cv_r2": float(np.mean(r2s)),
                "n_rows": len(df),
                "n_aois": int(n_groups),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\nSaved model to {MODEL_PATH}")
    print(f"Saved feature schema to {SCHEMA_PATH}")


if __name__ == "__main__":
    main()
