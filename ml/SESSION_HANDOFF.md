# Session handoff — Thermal Reasoning Agent (ml/ pipeline)

Written 2026-08-30 so a fresh Claude session in this directory (`D:\Fortyguard_batra`)
can pick up with full context. Read this first, then `COLLECTION_PLAN.md` and
`ENRICHMENT_PLAN.md` alongside it.

## What this project is

A hackathon submission: a Next.js app + Python ML pipeline that explains why a
city block in LA is hotter/cooler than its neighbors, using FortyGuard's
Temperature/Satellite/Environmental APIs. The ML side (`ml/`) is an
XGBoost + SHAP model that ranks feature contributions (impervious%, canopy%,
building density, wind, etc.) per area, feeding a static export the Next.js
app consumes for live "why is this hot" reasoning.

## Architecture, end to end

1. **Collection** (`ml/src/collect/`) — pulls real paid data from FortyGuard
   (`/v1/heatmap`, `/v1/satellite`, `/v1/env_params`) plus free supplementary
   sources (OSM buildings/landcover, Open-Meteo wind) per AOI (area of
   interest, ~2km x 1.85km hand-picked LA neighborhoods) and per date_time
   snapshot. Results cache to `ml/data/raw/`.
2. **Feature building** (`ml/src/features/build_dataset.py`) — turns raw
   cache into `ml/data/processed/dataset.parquet`: one row per (AOI,
   date_time), target = `anomaly` (AOI meanTemp minus the mean of all AOIs
   sharing that date_time — removes date-of-collection as a confound).
3. **Training** (`ml/src/train/train_xgboost.py`) — XGBoost with
   monotone constraints (imperviousPct:+1, canopyPct:-1, buildingDensity:+1,
   windMph:-1), GroupKFold by AOI (not random split — avoids leakage).
4. **Explanation** (`ml/src/train/explain_shap.py`) — SHAP TreeExplainer +
   a sign-vs-constraint sanity check.
5. **Export** (`ml/src/serve/export_for_app.py`,
   `export_training_coverage.py`) — writes static JSON consumed by the
   Next.js app (`src/lib/mock-data/ml-explanations.json`,
   `training-coverage.json`).
6. **App wiring** — `src/components/analysis/MlAttribution.tsx` (renders
   ranked SHAP evidence) is wired into `src/components/analysis/
   LiveThermalReasoning.tsx` — **this is the real live-rendered component**;
   `AnalysisPanel.tsx` is dead code, not imported anywhere, don't edit it by
   mistake. There's also a `/training-data` page showing all candidate AOIs
   on a custom SVG map (no tile server, due to CSP), color-coded, solid=
   collected / dashed=pending.

## Where things stand right now (2026-08-30)

- **Dataset**: last confirmed real build was 195 rows / 47 AOIs / 5 date_time
  snapshots, daytime only. Raw cache on disk now has more than that
  (267 heatmap, 264 env_params, 47 satellite files cached) from collection
  runs since — **the processed dataset has likely NOT been rebuilt to match
  the current raw cache. Rebuild via `python -m src.features.build_dataset`
  before assuming row/AOI counts, and before retraining.**
- **Credits** (checked live via the undocumented
  `POST /v1/system/fetch-api-key-usage {api_key: <key>}` endpoint — the only
  reliable source of truth for real costs/balances, confirmed real costs:
  heatmap=4,220/call, env_params=2,900/call, satellite=14,400/call,
  streetview=8,600/call, heat_intelligence=8,600/call, no daily quota on
  anything):
  - `FORTYGUARD_TRAINING_API_KEY`: **152,640 credits remaining** (of
    2,000,000; cycle resets Oct 3, 2026)
  - `FORTYGUARD_TRAINING_API_KEY_2`: **2,000,000 credits remaining**, unused
    (cycle resets Oct 4, 2026)
  - Local ledger (`ml/data/raw/_ledger_v2.json`) shows cumulative spent
    1,820,140 — this is bookkeeping only; the two numbers above (from the
    live endpoint) are authoritative for actual remaining budget.
  - **Currently executing**: `COLLECTION_PLAN.md`'s Tier 1-6 fetch order,
    spending down `FORTYGUARD_TRAINING_API_KEY` first, then
    `FORTYGUARD_TRAINING_API_KEY_2`, per explicit user instruction. Will
    stop and notify the user when both keys are exhausted.
  - **Important discovery mid-resume**: the Tier 1-6 AOIs named in
    `COLLECTION_PLAN.md` (Huntington Park, Bell, South Gate, Lynwood,
    Compton, Wilmington, El Segundo, Sun Valley, Sylmar, Downey, Bellflower,
    Lakewood, West Adams, Mid-City, Harbor City, etc.) **already exist as
    `Aoi` objects — but sitting in `NIGHT_AOIS` in `aoi_sampling.py`, not
    `AOIS`**, left over from the night-batch work the user later cancelled
    ("I don't think I will need night batch"). They need to be collected
    with `daytime_date_times()` only (1pm/4pm per the plan's hour policy),
    not via the `--night-batch` CLI flag (which forces day+night). The
    current session plan is to call `run()` directly (not through
    `main()`/argparse) with a filtered/ordered AOI list pulled from
    `NIGHT_AOIS` matching the plan's tier order, `date_times=
    daytime_date_times(2)`.
  - Some Tier 2 names (Commerce, Elysian Park) already exist in the main
    `AOIS` list and were likely already collected in earlier runs — verify
    against raw cache before re-spending on them.

## Established practices / hard constraints (don't relitigate)

- **API keys**: only ever in `.env.local` at repo root (gitignored). Never
  write a real key value into any committed file — reference the env var
  name instead (see `COLLECTION_PLAN.md`'s "Keys" section as the pattern).
- **No GPU/Colab needed** — CPU-only XGBoost (`tree_method="hist"`) is fine
  at this data scale.
- **Satellite billing**: charged as one flat cost per call (14,400 credits)
  — you cannot pay for only part of what it returns (e.g. only the canopy
  segment, not buildings). All-or-nothing per AOI.
- **Free-data integration constraint** (explicit user instruction): any
  free source (Sentinel-2 NDVI/NDBI, ESA WorldCover, NAIP, elevation, etc.)
  must be framed as adding NEW capability (resolution, new dimensions) —
  **never** as validating/second-guessing FortyGuard's own numbers. Assume
  FortyGuard's AOI-level numbers to be ground truth.
- **Validated empirically this session**:
  - NDVI: reliable for WITHIN-AOI relative disaggregation of FortyGuard's
    trusted AOI-level canopy% (real, sensible spatial variance). NOT
    reliable as an absolute cross-AOI replacement (failed ranking tests).
  - NDBI: failed BOTH the cross-AOI absolute test AND the within-AOI test
    (NDVI/NDBI correlation = -0.058, near-zero — expected meaningfully
    negative if it carried real built-up signal). **Excluded** — see
    `ENRICHMENT_PLAN.md`. Built-up surfaces don't have one clean spectral
    signature the way vegetation does.
  - ESA WorldCover built% is NOT a reliable free substitute for FortyGuard's
    real impervious classification (concrete counter-example: Vernon
    97.7% vs FortyGuard's real 62.25%).
  - Albedo (Liang 2001 formula on Sentinel-2 bands): computed successfully
    (Downtown LA mean ≈0.311), physically well-defined — but didn't cleanly
    reconcile with a rough hand-estimate derived from the Heat Intelligence
    report's material albedo ranges. Logged as an open, unresolved
    discrepancy (not a validation failure — the hand-estimate itself has
    real uncertainty), still in scope.
  - Heat Intelligence report (`/v1/heat_intelligence`, 8,600 credits, async,
    returns a PDF via `download_link`, not structured data) IS genuinely
    valuable — real SVF numbers (~0.40-0.55 downtown LA), per-material
    albedo ranges, cooling-equity analysis. Don't dismiss it as "not
    bulk-trainable" — it has standalone value. Saved at
    `ml/reports/heat_intelligence_downtown_la.pdf` (gitignored).
- **2-tier model direction** (agreed, not yet built): Tier 1 = existing
  AOI-level model (done). Tier 2 = new 100m-per-cell model ("why is this
  cell hot"), features = existing per-cell temperature (already cached,
  currently discarded at AOI-average step) + NDVI-disaggregated canopy +
  per-cell elevation + per-cell distance-to-coast; impervious stays AOI-flat
  (no validated free disaggregation source). Zero new FortyGuard API calls
  needed. A separate ~400-500m clustering/aggregation layer (NOT a third
  trained model) sits on top of Tier 2 for city-official-facing action
  plans — this granularity was chosen over 100m because per-cell action
  plans are too fine-grained to be useful to city officials.
  `ENRICHMENT_PLAN.md` covers the free-data side of Tier 2; the per-cell
  `build_dataset.py` restructuring + retraining is separate, not yet
  started.
- **Elevation/distance-to-coast**: per-cell, not per-AOI (this superseded an
  earlier per-AOI stub in `COLLECTION_PLAN.md`). Terrain/slope explicitly
  dropped — "don't think it helps."
- **"100 m2" terminology**: the user's consistent shorthand for "the
  100m-granularity heatmap cell" (not literally 100 square meters — actually
  ~1 hectare). Match this usage, already flagged once, don't re-flag it.

## Key files map

- `ml/COLLECTION_PLAN.md` — the FortyGuard paid-data collection plan
  (credit-gated, Tier 1-6 priority order, hour policy, currently executing).
- `ml/ENRICHMENT_PLAN.md` — the free per-cell enrichment plan (NDVI,
  elevation, distance-to-coast, albedo; NDBI explicitly excluded). Runs
  independently of the collection plan — not yet started, on hold per
  explicit user instruction ("Don't start ENRICHMENT_PLAN.md yet").
  Sequencing: collection plan and enrichment plan have no dependency on
  each other and can run at the same time when both are active.
- `ml/src/collect/aoi_sampling.py` — `AOIS` (57, daytime-only) +
  `NIGHT_AOIS` (23, originally for day+night batch, now being drawn from
  for daytime-only Tier 1-6 collection — see "where things stand" above).
- `ml/src/collect/run_collection.py` — `run(date_times, credit_cap, aois)`
  is the reusable entry point; `main()`/argparse is a thin CLI wrapper that
  doesn't cleanly support "AOIS subset, daytime-only" — call `run()`
  directly for that case.
- `ml/src/collect/credit_ledger.py` — `COST_ESTIMATES` (confirmed real
  costs), `CreditLedger` (reserve/release/summary), ledger file at
  `ml/data/raw/_ledger_v2.json` (bookkeeping only, not authoritative for
  balance — use the live usage endpoint for that).
- `ml/src/collect/date_times.py` — `daytime_date_times(count)`,
  `nighttime_date_times(count)`, both persist to
  `ml/data/raw/_session_date_times.json` so restarts across day boundaries
  don't cause redundant re-collection.
- `ml/src/fortyguard_client.py` — key resolution order:
  `FORTYGUARD_TRAINING_API_KEY` → `FORTYGUARD_API_KEY` → `api_key`. To use
  the second training key, the env var read needs to be swapped/extended
  (currently single-key per process — see "Open questions" below).

## Open questions / likely next decisions for a fresh session

1. Whether to formalize "switch to key 2 when key 1 is exhausted" as code
   (e.g. a wrapper that catches a credit-exhausted error and retries with
   `FORTYGUARD_TRAINING_API_KEY_2`) rather than a manual restart — currently
   handled manually by watching the live usage endpoint.
2. Rebuild `dataset.parquet` before trusting any row/AOI count, and before
   any retraining.
3. Once `COLLECTION_PLAN.md` finishes (or credits run out), report the
   updated per-category distribution before retraining (explicit
   instruction already in the plan's "Sequencing" section).
4. `ENRICHMENT_PLAN.md` and the Tier 2 per-cell model build are agreed
   direction but explicitly on hold — don't start until the user asks.

## Don't re-litigate

- No satellite quota exists (confirmed; earlier false "2/day" hypothesis
  was disproven and removed from the code).
- Satellite billing is per-call, not per-segment-type.
- Heat Intelligence report has real standalone value, already established.
- NDBI is excluded from the enrichment plan (tested twice, failed both).
