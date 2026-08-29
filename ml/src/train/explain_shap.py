"""SHAP TreeExplainer over the trained model, plus the sign-vs-constraint
sanity check.

This directly re-applies the lesson from the Phase 3 `Evidence.warmingEffect`
bug (project memory): a feature's reported direction must reflect its true
physical effect, never be trusted from raw arithmetic sign alone. Here that
means: for every feature with a non-zero monotone_constraints direction, the
correlation between that feature's value and its SHAP contribution must
agree in sign with the constraint -- if canopy's SHAP values correlate
*positively* with canopy%, something is wrong (canopy should push the
prediction down, i.e. cooler, as it increases).

Also exposed for reuse by serve/export_for_app.py: `ranked_contributions()`
turns one row's SHAP values into evidence items ready to rank.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import shap
import xgboost as xgb

MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "thermal_xgb_v1.json"
SCHEMA_PATH = Path(__file__).resolve().parents[2] / "models" / "feature_schema.json"
DATASET_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "dataset.parquet"


def load_model_and_schema() -> tuple[xgb.XGBRegressor, dict]:
    if not MODEL_PATH.exists():
        raise SystemExit(f"{MODEL_PATH} not found. Run `python -m src.train.train_xgboost` first.")
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    model = xgb.XGBRegressor()
    model.load_model(str(MODEL_PATH))
    return model, schema


def make_explainer(model: xgb.XGBRegressor) -> shap.TreeExplainer:
    return shap.TreeExplainer(model)


def ranked_contributions(shap_row: np.ndarray, feature_values: dict, feature_columns: list[str]) -> list[dict]:
    """One row's SHAP values -> a list of {feature, value, shapValue, direction}
    sorted by |shapValue| descending. `direction` is "warmer"/"cooler"/"neutral"
    from the SHAP sign itself -- NOT re-derived from the raw feature value, for
    the same reason Evidence.warmingEffect exists on the TS side."""
    items = []
    for i, col in enumerate(feature_columns):
        contribution = float(shap_row[i])
        direction = "warmer" if contribution > 1e-6 else "cooler" if contribution < -1e-6 else "neutral"
        items.append({"feature": col, "value": feature_values.get(col), "shapValue": contribution, "direction": direction})
    return sorted(items, key=lambda item: abs(item["shapValue"]), reverse=True)


def sanity_check(shap_values: np.ndarray, df: pd.DataFrame, feature_columns: list[str], monotone_constraints: dict) -> dict:
    results = {}
    for i, col in enumerate(feature_columns):
        constraint = monotone_constraints.get(col, 0)
        col_values = df[col].to_numpy()
        col_shap = shap_values[:, i]
        if constraint == 0:
            results[col] = {"constraint": 0, "status": "unconstrained"}
            continue
        if np.std(col_values) < 1e-9:
            results[col] = {"constraint": constraint, "status": "no_variance_in_data"}
            continue
        if np.std(col_shap) < 1e-9:
            results[col] = {"constraint": constraint, "status": "zero_shap_importance"}
            continue
        correlation = float(np.corrcoef(col_values, col_shap)[0, 1])
        consistent = (correlation >= 0) == (constraint >= 0)
        results[col] = {"constraint": constraint, "correlation": correlation, "status": "OK" if consistent else "MISMATCH"}
    return results


def main() -> None:
    model, schema = load_model_and_schema()
    feature_columns = schema["feature_columns"]
    if not DATASET_PATH.exists():
        raise SystemExit(f"{DATASET_PATH} not found. Run `python -m src.features.build_dataset` first.")
    df = pd.read_parquet(DATASET_PATH).dropna(subset=feature_columns + [schema["target"]])

    explainer = make_explainer(model)
    shap_values = explainer.shap_values(df[feature_columns])

    print(f"SHAP values computed for {len(df)} rows.\n")
    results = sanity_check(shap_values, df, feature_columns, schema["monotone_constraints"])
    any_mismatch = False
    for col, result in results.items():
        status = result["status"]
        if status == "MISMATCH":
            any_mismatch = True
        corr = f" corr={result['correlation']:+.3f}" if "correlation" in result else ""
        print(f"  {col:<16} constraint={result['constraint']:+d}{corr:<16} -> {status}")

    print()
    if any_mismatch:
        print("MISMATCH found -- do not export until resolved. Likely causes: a swapped feature sign in "
              "build_dataset.py, or a schema_adapter.py key alias pointing at the wrong field.")
        raise SystemExit(1)
    print("All constrained features are direction-consistent. Safe to proceed to export_for_app.py.")


if __name__ == "__main__":
    main()
