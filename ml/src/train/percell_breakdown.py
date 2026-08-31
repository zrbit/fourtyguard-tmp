"""Turns one Tier 2 cell's SHAP values into a transparent percentage-of-
total-contribution breakdown, tagged by category -- not filtered down to
"actionable recommendations only."

Per the product decision (2026-08-30): elevation and distance-to-coast
dominating a cell's SHAP explanation is a real, physically expected result
(marine-layer/sea-breeze cooling and the lapse rate are well-established
effects, and even the small within-AOI variation in these picks up real
signal -- see train_xgboost_percell.py's docstring for the empirical
evidence). Rather than only surface actionable levers, this shows the
honest full breakdown across three categories so geography isn't hidden:

- ACTIONABLE: things a city could realistically change (paving, canopy,
  reflective surfaces, density/zoning).
- GEOGRAPHIC_CONTEXT: fixed, non-actionable location context (elevation,
  distance to coast) -- schema["non_actionable_features"].
- WEATHER_CONTEXT: transient conditions at the moment of the reading (sun,
  humidity, cloud, wind, hour) -- also not actionable, but for a different
  reason (they change hour to hour, not something to "fix").
"""

from __future__ import annotations

from ..train.explain_shap import ranked_contributions

ACTIONABLE_FEATURES = {"imperviousPctRel", "canopyPctRel", "albedoRel", "buildingDensity"}
WEATHER_CONTEXT_FEATURES = {"windMph", "humidity", "cloudCoverPct", "solarIrradiance", "heatIndex", "hourOfDay"}


def _category(feature: str, non_actionable_features: set[str]) -> str:
    if feature in ACTIONABLE_FEATURES:
        return "actionable"
    if feature in non_actionable_features:
        return "geographic_context"
    if feature in WEATHER_CONTEXT_FEATURES:
        return "weather_context"
    return "other"


def percentage_breakdown(
    shap_row, feature_values: dict, feature_columns: list[str], non_actionable_features: list[str],
    min_pct: float = 0.5,
) -> list[dict]:
    """Returns [{feature, pct, direction, category}, ...] sorted by |contribution|
    descending, filtered to contributions above min_pct of the row's total
    |SHAP| so tiny near-zero features don't clutter the breakdown."""
    non_actionable = set(non_actionable_features)
    items = ranked_contributions(shap_row, feature_values, feature_columns)
    total_abs = sum(abs(it["shapValue"]) for it in items) or 1.0
    breakdown = []
    for it in items:
        pct = 100 * abs(it["shapValue"]) / total_abs
        if pct < min_pct:
            continue
        breakdown.append({
            "feature": it["feature"],
            "pct": round(pct, 1),
            "direction": it["direction"],
            "category": _category(it["feature"], non_actionable),
        })
    return breakdown
