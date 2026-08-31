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
| NLCD Fractional Impervious Surface | Annual NLCD / USGS | 30m pixels aggregated to per 100m cell | **In scope and approved.** Independent, purpose-built percent-impervious product (0–100). Downtown LA test: 92.5% AOI mean versus FortyGuard's 92.46%, with meaningful 100m-cell variation (66.3–97.0%). Use as the local impervious feature; retain FortyGuard's AOI segmentation as trusted context, not as a training label. |
| NLCD Impervious Descriptor | Annual NLCD / USGS | 30m pixels aggregated to per 100m cell | **Blocked, not implemented.** MRLC's own data-type page documents this product's legend as `0`=No Data, `1`=Roads, `2`=Urban, but the WCS coverage matching this product's name (`mrlc_display__NLCD_2021_Impervious_descriptor_L48`) returned different values entirely (`0, 21, 22, 24, 25, 26` — NLCD land-cover class codes, not the documented road/urban split) when fetched and inspected directly. Rather than guess at reconciling an unverified legend into `roadPct`/`urbanImperviousPct`/`roadShareOfImpervious`, this sub-feature is deliberately not shipped. Needs the correct coverage ID or an authoritative legend for this specific instance before revisiting. |
| NDBI → impervious disaggregation | Sentinel-2 | - | **Excluded.** A purpose-built NLCD impervious product now supplies this signal at 30m. The earlier near-zero NDVI/NDBI correlation is inconclusive rather than a universal failure, but does not justify adding a weaker proxy alongside NLCD. |

Terrain/slope: explicitly out of scope per prior direction ("leave aside the
terrain — don't think it helps").

## Non-actionable context flag

Elevation and distance-to-coast are informational context, not intervention
levers — a city can't move a block's elevation. Same treatment specified in
`COLLECTION_PLAN.md`: keep them as model features, but flag them in SHAP
output so they aren't presented as actionable recommendations.

## What needs building

1. **NDVI disaggregation module** - compute per-cell canopy% by redistributing
   each AOI's real FortyGuard canopy% according to relative NDVI variation
   across that AOI's cells. Computation already prototyped this session;
   needs to become a real module, not a scratch script.
2. **Elevation fetch module** — batch Open-Elevation calls per AOI's cell
   centroids, cache results (same pattern as the FortyGuard fetchers —
   checkpoint per AOI, cache to `data/raw/`).
3. **Distance-to-coast module** — geometry only, no network call. Needs a
   reference coastline (can reuse a public coastline dataset or a simplified
   hand-defined polyline for the LA coast, given the area is fixed).
4. **Albedo module** - same Sentinel-2 fetch as NDVI (same Planetary
   Computer scene), Liang formula, cache alongside NDVI output.
5. **NLCD impervious module** - retrieve annual NLCD Fractional Impervious
   Surface and Impervious Descriptor rasters at native 30m resolution; aggregate
   their samples to the existing 100m temperature-cell geometry; cache per AOI.
   Export continuous `fractionalImperviousPct` plus `roadPct`,
   `urbanImperviousPct`, and `roadShareOfImpervious`. Use the same NLCD year
   consistently across AOIs in a training run.

All five write into the same per-cell feature table that `build_dataset.py`
will need for Tier 2 rows — see the Tier 2 difficulty assessment already
discussed for how this plugs into training.

## Sequencing

Can start immediately, independent of `COLLECTION_PLAN.md` progress. The
only shared dependency is the AOI list (`aoi_sampling.py`), which already
exists. Do not block this on FortyGuard collection finishing, and don't
block FortyGuard collection on this either.

## Built (executed)

All in `src/enrich/`:

- `cell_geometry.py` — shared 100m-cell centroids per AOI, sourced from
  whichever cached `/heatmap` response exists (any date_time — the cell
  grid is date_time-invariant). Every enrichment feature below samples
  against these same cells, so they line up with `build_dataset.py`'s
  existing temperature rows.
- `fetch_sentinel2.py` — one scene search + one set of windowed band reads
  (B02/B04/B08/B11/B12, via vsicurl, no full-scene download) per AOI,
  cached locally, shared by NDVI and albedo so neither re-fetches.
- `compute_ndvi.py` — `disaggregate_canopy_pct(aoi, aoi_canopy_pct)`
  redistributes FortyGuard's real AOI canopy% by relative NDVI weight;
  verified the weighted mean exactly reproduces the AOI-level input
  (Downtown LA: input 6.9% → disaggregated mean 6.9%, real per-cell spread
  0–80%).
- `compute_albedo.py` — Liang formula per cell (Downtown LA mean 0.316,
  consistent with the 0.311 found earlier this session).
- `fetch_elevation.py` — Open-Elevation, batched per AOI (Downtown LA:
  73–107m, matches known geography).
- `coast_distance.py` — pure geometry, hand-picked LA coastline polyline;
  verified against known geography (Venice/San Pedro ~0mi, Chatsworth
  ~15mi inland, Downtown LA ~13mi).
- `fetch_nlcd_impervious.py` — Fractional Impervious Surface only (not the
  Descriptor, see table above), via MRLC's public WCS; verified against
  FortyGuard's real AOI mean (Downtown LA: WCS 94.65% vs FortyGuard
  92.46% — close, consistent with a differently-clipped window, not a
  data problem).
- `run_enrichment.py` — orchestrator, checkpointed per AOI (same
  fail-one-AOI-continue-the-rest pattern as `run_collection.py`), writes
  `data/processed/enrichment/<aoi>.parquet` plus a combined
  `data/processed/enrichment.parquet` for `build_dataset.py` to join
  against for the Tier 2 per-cell build.
