"""Trains the thermal-anomaly XGBoost regressor.

CPU only (tree_method="hist", no device="cuda") -- deliberately. This is a
few thousand rows and ~9 features; GPU acceleration buys nothing at this
scale and just adds CUDA/xgboost-gpu setup risk. See the plan for the full
reasoning (Kaggle/Colab is not needed either, for the same reason).

Cross-validation is grouped by AOI (GroupKFold), not a random row split:
different date_times of the same AOI share land cover and building density,
so a random split would leak and overstate accuracy.

Row/target granularity is AOI x date_time (see build_dataset.py's docstring
for why): target is each AOI's mean temperature minus the regional
(all-AOIs-at-that-hour) mean -- "how much hotter/cooler is this neighborhood
than the city-wide average right now." Every feature is consistently at
that same AOI x date_time granularity.
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

DATASET_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "dataset.parquet"
MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "thermal_xgb_v1.json"
SCHEMA_PATH = Path(__file__).resolve().parents[2] / "models" / "feature_schema.json"

FEATURE_COLUMNS = [
    "imperviousPct",
    "canopyPct",
    "buildingDensity",
    "windMph",
    "humidity",
    "cloudCoverPct",
    "solarIrradiance",
    "heatIndex",
    "hourOfDay",
]

# Domain-knowledge direction per feature, from project memory:
# impervious/asphalt -> warmer (+1), tree canopy -> cooler (-1), wind -> cooler (-1).
# Matches the same physical direction already encoded in
# src/lib/reasoning/analyze.ts's weights and Evidence.warmingEffect.
MONOTONE_CONSTRAINTS = {
    "imperviousPct": 1,
    "canopyPct": -1,
    "buildingDensity": 1,
    "windMph": -1,
    "humidity": 0,
    "cloudCoverPct": 0,
    "solarIrradiance": 0,
    "heatIndex": 0,
    "hourOfDay": 0,
}

TARGET_COLUMN = "anomaly"
GROUP_COLUMN = "aoi"

_PARAM_GRID = {
    "max_depth": [2, 3, 4],
    "n_estimators": [100, 200],
    "learning_rate": [0.05, 0.1],
}


def _monotone_tuple() -> tuple[int, ...]:
    return tuple(MONOTONE_CONSTRAINTS[col] for col in FEATURE_COLUMNS)


def _make_model(**params) -> xgb.XGBRegressor:
    return xgb.XGBRegressor(
        tree_method="hist",  # CPU; no device="cuda" -- see module docstring
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
        raise SystemExit(f"{DATASET_PATH} not found. Run `python -m src.features.build_dataset` first.")
    df = pd.read_parquet(DATASET_PATH)
    df = df.dropna(subset=FEATURE_COLUMNS + [TARGET_COLUMN])
    n_groups = df[GROUP_COLUMN].nunique()
    if len(df) < 20 or n_groups < 3:
        raise SystemExit(
            f"Only {len(df)} usable rows across {n_groups} AOIs -- not enough to train/cross-validate "
            "meaningfully yet. Collect more data first."
        )
    n_splits = min(5, n_groups)
    print(f"{len(df)} rows across {n_groups} AOIs. GroupKFold with {n_splits} splits.\n")

    best_params, best_mae = None, float("inf")
    for max_depth, n_estimators, learning_rate in product(*_PARAM_GRID.values()):
        params = {"max_depth": max_depth, "n_estimators": n_estimators, "learning_rate": learning_rate}
        mae = _cross_validate(df, params, n_splits)
        print(f"  max_depth={max_depth} n_estimators={n_estimators} lr={learning_rate} -> CV MAE {mae:.3f}")
        if mae < best_mae:
            best_mae, best_params = mae, params

    print(f"\nBest params: {best_params}  (CV MAE {best_mae:.3f})")

    # Report R2 too, for a sense of overall fit quality (grouped CV, same folds).
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
                "target": TARGET_COLUMN,
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
