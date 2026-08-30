# Per-cell enrichment plan (free data sources)

Companion to `COLLECTION_PLAN.md`, not a replacement. That plan governs
FortyGuard paid data (satellite/heatmap/env_params, credit-gated, sequential
by AOI priority). This plan governs free per-100m-cell enrichment features
for the Tier 2 model. **The two have no dependency on each other and can run
simultaneously** — this pipeline touches no FortyGuard credits and doesn't
care which AOIs have been collected yet; it only needs an AOI's polygon
(already defined in `aoi_sampling.py`) to fetch and compute against.

## Scope — what's in, what's out, and why

| Feature | Source | Granularity | Status |
|---|---|---|---|
| NDVI → canopy disaggregation | Sentinel-2 (Planetary Computer) | per 100m cell | **Validated** — real, sensible within-AOI spatial variance; used to redistribute FortyGuard's trusted AOI-level canopy% across cells, never to replace it |
| Elevation | Open-Elevation API (free, batch) | per 100m cell | In scope — per-cell, not per-AOI (per-AOI was the original stub in `COLLECTION_PLAN.md`, superseded) |
| Distance-to-coast | Pure geometry (reference coastline polyline) | per 100m cell | In scope — per-cell, no API cost |
| Albedo | Sentinel-2 bands, Liang (2001) broadband formula | per 100m cell | In scope — physically well-defined, computed successfully (Downtown LA mean ≈ 0.311). **Open item:** didn't precisely reconcile with a rough hand-estimate derived from the Heat Intelligence report's per-material albedo ranges. That hand-estimate has its own uncertainty (my weighting assumptions, not a ground-truth number), so this is logged as an unresolved discrepancy to keep an eye on, not a validation failure — treat the computed value as usable for now. |
| NDBI → impervious disaggregation | Sentinel-2 | — | **Excluded.** Failed cross-AOI ranking test earlier, and failed the within-AOI test (NDVI/NDBI correlation = -0.058, near-zero — expected meaningfully negative if it carried real built-up signal). Built-up surfaces don't have one clean spectral signature the way vegetation does, so a simple 2-band index isn't reliable here. |
| Impervious% | — | AOI-flat (unchanged from Tier 1) | No validated free source exists yet to disaggregate this to cell level. Carried forward as an AOI-constant feature in Tier 2, same as it is in Tier 1. |

Terrain/slope: explicitly out of scope per prior direction ("leave aside the
terrain — don't think it helps").

## Non-actionable context flag

Elevation and distance-to-coast are informational context, not intervention
levers — a city can't move a block's elevation. Same treatment specified in
`COLLECTION_PLAN.md`: keep them as model features, but flag them in SHAP
output so they aren't presented as actionable recommendations.

## What needs building

1. **NDVI disaggregation module** — compute per-cell canopy% by redistributing
   each AOI's real FortyGuard canopy% according to relative NDVI variation
   across that AOI's cells. Computation already prototyped this session;
   needs to become a real module, not a scratch script.
2. **Elevation fetch module** — batch Open-Elevation calls per AOI's cell
   centroids, cache results (same pattern as the FortyGuard fetchers —
   checkpoint per AOI, cache to `data/raw/`).
3. **Distance-to-coast module** — geometry only, no network call. Needs a
   reference coastline (can reuse a public coastline dataset or a simplified
   hand-defined polyline for the LA coast, given the area is fixed).
4. **Albedo module** — same Sentinel-2 fetch as NDVI (same Planetary
   Computer scene), Liang formula, cache alongside NDVI output.

All four write into the same per-cell feature table that `build_dataset.py`
will need for Tier 2 rows — see the Tier 2 difficulty assessment already
discussed for how this plugs into training.

## Sequencing

Can start immediately, independent of `COLLECTION_PLAN.md` progress. The
only shared dependency is the AOI list (`aoi_sampling.py`), which already
exists. Do not block this on FortyGuard collection finishing, and don't
block FortyGuard collection on this either.
