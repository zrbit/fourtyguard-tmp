# Session handoff — FortyGuard Thermal Reasoning Agent

Last updated: 2026-08-30

This is the canonical handoff for agents working in `D:\Fortyguard_batra`.
Read this file first, followed by:

- `ml/COLLECTION_PLAN.md` — paid FortyGuard collection plan.
- `ml/ENRICHMENT_PLAN.md` — free-data enrichment plan; do not execute until the user asks.

Never place API key values in tracked files. The keys are stored in the
gitignored root `.env.local` as `FORTYGUARD_TRAINING_API_KEY` and
`FORTYGUARD_TRAINING_API_KEY_2`.

## Project objective

This hackathon project combines a Next.js application with a Python ML pipeline.
It explains why an LA heatmap cell is hotter or cooler than its surroundings
using FortyGuard temperature, environmental and satellite data, XGBoost and
SHAP. The long-term product design has two analytical tiers:

1. An AOI-level model for broad neighborhood effects.
2. A 100 m-cell model for local explanations, with nearby cells clustered into
   roughly 400–500 m intervention zones for city action plans.

The second model and clustering layer have been planned but are not yet built.

## Current state

- `COLLECTION_PLAN.md` Tier 1–6 collection is complete, including retries.
- All 33 planned AOIs completed with no remaining failed AOIs after the retry.
- The processed dataset was rebuilt to **261 rows, 80 AOIs and 5 date-times**.
- Last known API balances after Tier 1–6:
  - training key 1: **48,100 credits remaining**
  - training key 2: **1,159,420 credits remaining**
  Treat the live FortyGuard usage endpoint as authoritative; local ledger totals
  are only bookkeeping estimates.
- Weather-diversity collection is the next paid-data task. The user wants to
  launch and monitor it themselves to control credit use.
- `ENRICHMENT_PLAN.md` must remain on hold until explicitly requested.
- Do not retrain until all requested fetching is complete and the updated
  category/weather distribution has been reported.

## Running the weather-diversity collection

Run these commands from PowerShell in `D:\Fortyguard_batra\ml`.

The bare `python` command may select system Python and fail with
`ModuleNotFoundError: No module named 'requests'`. Use the repository virtual
environment explicitly:

```powershell
.\.venv\Scripts\python.exe -m src.collect.run_weather_diversity --dry-run
.\.venv\Scripts\python.exe -m src.collect.run_weather_diversity --execute
```

Optional environment activation:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
python -m src.collect.run_weather_diversity --dry-run
python -m src.collect.run_weather_diversity --execute
```

The runner targets 12 backbone AOIs across six historical weather regimes:
extreme heat, winter storm, Santa Ana, June gloom, mild clear weather and cold
windy winter weather. The historical range starts in 2021. Approximate expected
spend is **512,640 credits** for 72 heatmap/environment snapshot pairs because
satellite data for these AOIs is already cached. The dry-run may show a higher
worst-case figure because its estimate includes satellite calls.

## ML pipeline

1. `ml/src/collect/` fetches and caches paid FortyGuard data plus free OSM and
   Open-Meteo inputs in `ml/data/raw/`. Collection checkpoints after each AOI.
2. `ml/src/features/build_dataset.py` creates
   `ml/data/processed/dataset.parquet`. The current AOI-level target is the AOI
   mean temperature minus the mean of AOIs sharing the same date-time.
3. `ml/src/train/train_xgboost.py` trains CPU-only XGBoost using GroupKFold by
   AOI and monotonic constraints. A GPU or Colab/Kaggle is unnecessary at this
   scale.
4. `ml/src/train/explain_shap.py` generates and sanity-checks SHAP evidence.
5. `ml/src/serve/export_for_app.py` and
   `ml/src/serve/export_training_coverage.py` export static JSON for the app.

Confirmed FortyGuard call costs are:

- heatmap: 4,220 credits
- environmental parameters: 2,900 credits
- satellite segmentation: 14,400 credits
- street view: 8,600 credits
- Heat Intelligence: 8,600 credits

There is no confirmed two-calls-per-day satellite quota. Satellite calls are
billed as complete calls; individual segmentation outputs cannot be purchased
separately.

## App integration

- `src/components/analysis/LiveThermalReasoning.tsx` is the live-rendered
  reasoning component. Do not mistakenly implement against the unused
  `AnalysisPanel.tsx`.
- `src/components/analysis/MlAttribution.tsx` renders ranked SHAP evidence.
- `/training-data` shows candidate and collected AOIs on a coverage map.
- Static ML exports live under `src/lib/mock-data/`.

## Agreed enrichment direction

The enrichment work is documented separately and has not started.

- Sentinel-2 NDVI may be used for relative, within-AOI disaggregation of
  FortyGuard's trusted canopy percentage to 100 m cells. It must not be framed
  as replacing or validating FortyGuard's AOI-level value.
- Per-cell elevation and distance to the ocean are planned as non-actionable
  context features.
- Sentinel-2 albedo is planned, but an earlier calculation did not cleanly
  reconcile with a rough Heat Intelligence material-based estimate; retain this
  as an open calibration issue.
- Terrain/slope was explicitly dropped.
- NDBI is excluded: it failed both cross-AOI and within-AOI tests; the measured
  within-AOI NDVI/NDBI correlation was only -0.058.
- ESA WorldCover built percentage is not a reliable replacement for FortyGuard
  impervious segmentation.

Free sources add resolution or new dimensions; they are not used to
second-guess FortyGuard, which should be treated as the trusted reference.

## Important files

- `ml/src/fortyguard_client.py` — API client and key loading.
- `ml/src/collect/run_collection.py` — general collection runner.
- `ml/src/collect/run_weather_diversity.py` — historical weather runner.
- `ml/src/collect/aoi_sampling.py` — AOI definitions.
- `ml/src/collect/credit_ledger.py` — cost estimates and local ledger.
- `ml/src/features/build_dataset.py` — AOI-level dataset builder.
- `ml/src/train/train_xgboost.py` — current training pipeline.
- `ml/reports/heat_intelligence_downtown_la.pdf` — downloaded report,
  gitignored but useful for SVF, albedo and cooling-equity context.

## Non-negotiable constraints and next steps

1. Let the user run and monitor weather-diversity collection; do not launch it
   independently unless asked.
2. Stop paid collection when available training-key credits are exhausted and
   notify the user.
3. Keep `ENRICHMENT_PLAN.md` paused until explicitly authorized.
4. After fetching, rebuild the dataset, report AOI/category/date/weather
   distributions, and only then retrain.
5. Preserve GroupKFold-by-AOI for both the AOI and future per-cell models to
   prevent location leakage.
6. For the future per-cell model, use cell-versus-AOI temperature anomaly as
   the local target. The 400–500 m action-plan layer is an aggregation layer,
   not a third model.
