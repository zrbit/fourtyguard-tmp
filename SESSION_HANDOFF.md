# Session handoff — FortyGuard Thermal Reasoning Agent

Last updated: 2026-08-30

This is the canonical continuity record for `D:\Fortyguard_batra`. Read it
before collecting data, training, or altering the app.

## Security and working-directory rules

- API-key values belong only in the gitignored root `.env.local`. Never print,
  commit, or copy a value into a plan, report, or source file.
- Current training-key variable names are
  `FORTYGUARD_TRAINING_API_KEY`, `FORTYGUARD_TRAINING_API_KEY_2`, and
  `FORTYGUARD_TRAINING_API_KEY_3`. Cooling-deficit code selects key 3 first,
  then the other training keys; it intentionally does not fall back to the
  general `FORTYGUARD_API_KEY`.
- Do not overwrite or reset unrelated dirty work. The repository contains
  parallel work from the user/Claude/Codex.
- Paid daytime collection uses `ml/data/`. The cooling-deficit project is
  deliberately isolated in `ml/cooling_deficit/data/` and must not read/write
  the daytime raw cache or its ledger.

## Product and model design agreed so far

The product explains why an LA location is hotter/cooler than surrounding
locations, then suggests feasible heat interventions.

1. **Tier 1 — AOI model.** Neighborhood-scale XGBoost/SHAP model trained on
   AOI observations. Target is AOI mean temperature minus the mean of AOIs
   sharing its exact date-time.
2. **Tier 2 — per-cell model.** A 100 m-granularity cell model explains why a
   specific heatmap cell is hot relative to its AOI. It is exported separately
   from Tier 1.
3. **Action-plan scale.** Do not prescribe interventions for a lone 100 m cell.
   Cluster adjacent cell results into roughly 400–500 m intervention zones for
   city-official-facing plans. This is an aggregation/reporting layer, not a
   third ML model.
4. Keep `GroupKFold` grouped by AOI for both models to avoid location leakage.
   XGBoost is CPU-scale here; no GPU, Kaggle, or Colab is required.

## FortyGuard collection work completed

- Implemented the `ml/` pipeline: collection, cache, dataset build,
  CPU XGBoost training, SHAP explanations, and static exports for Next.js.
- Corrected several live API assumptions through real calls:
  - heatmap returns cell temperatures (`average_temperature`);
  - satellite is a whole paid point call and returns segmented land-cover
    percentages; its parts cannot be bought separately;
  - satellite imagery needs an older reference date (~30–45 days), while
    heatmap/environment calls can use the requested historical time;
  - there is **no confirmed two-calls-per-day satellite quota**. Earlier
    apparent limits were transient service failures.
- Confirmed approximate API costs from the provider usage endpoint:
  heatmap 4,220; environmental parameters 2,900; satellite 14,400; street
  view 8,600; Heat Intelligence 8,600 credits.
- Added checkpointing, persistent date-time generation, cache stripping of
  unused satellite image blobs, corrected API nesting/payload bugs, and a
  local credit ledger. Treat the live provider usage endpoint—not the local
  ledger—as credit truth.
- Executed `ml/COLLECTION_PLAN.md` Tier 1–6 and retry passes. At the last
  rebuilt reporting point the AOI data had **261 rows, 80 AOIs, and 5
  date-times**. Rebuild/verify before quoting this count again if collection
  has changed.
- A historical weather-diversity runner exists at
  `ml/src/collect/run_weather_diversity.py`. It covers six weather regimes
  from 2021 onward. The user chose to launch/monitor that paid runner
  themselves; do not launch it without explicit permission.
- `ml/COLLECTION_PLAN.md` is the paid FortyGuard collection specification.
  Its key was intentionally redacted; it must stay that way.

## Existing ML/application outputs

- Tier 1 models: `ml/models/thermal_xgb_v1.json` and
  `ml/models/feature_schema.json`.
- Tier 2 models: `ml/models/thermal_xgb_percell_v1.json` and
  `ml/models/feature_schema_percell.json`.
- Processed datasets include `ml/data/processed/dataset.parquet` and
  `ml/data/processed/dataset_percell.parquet`.
- Important app exports:
  - `src/lib/mock-data/ml-explanations.json`
  - `src/lib/mock-data/cell-attribution.json`
  - `src/lib/mock-data/cluster-action-plans.json`
  - `src/lib/mock-data/training-coverage.json`
- `src/components/analysis/LiveThermalReasoning.tsx` is the actual rendered
  live component. `AnalysisPanel.tsx` is not the place to wire new work.
- `/training-data` visualizes training coverage. `/action-plans` consumes the
  cluster-plan export.

## Free-data enrichment: decisions and status

`ml/ENRICHMENT_PLAN.md` is intentionally separate from paid collection. Do not
start it until the user explicitly authorizes it. It can run in parallel with
future FortyGuard collection as long as it writes only its own enrichment cache
and does not rewrite shared dataset/model exports.

Agreed direction:

- Use **raw per-cell Sentinel-2 NDVI** as an independent feature; do not rescale
  it into FortyGuard canopy percentage. The rescale would map identical NDVI
  to different canopy values per AOI and adds circularity.
- Use **NLCD Fractional Impervious Surface** (30 m) per cell rather than NDBI
  for imperviousness; use **NLCD Tree Canopy Cover** as another independent
  canopy feature; use **NLCD Impervious Descriptor** to separate road-like from
  non-road impervious area.
- Elevation should come from a DEM raster (3DEP/Copernicus), not the
  Open-Elevation service. Distance-to-coast should use a public coastline
  geometry. Both are per heatmap cell and must be flagged as non-actionable
  context in product explanations.
- Compute Sentinel-2 broadband albedo once from a fixed, cloud-masked
  July–August median composite for all AOIs in a temperature year. The prior
  `0.311` vs Heat Intelligence report estimate is a definition mismatch
  (nadir surface vs effective urban/canyon albedo), not proof of a bug; shadow
  masking remains a required validation.
- Terrain, slope/aspect, and sky-view factor are **deferred/excluded for now**
  at the user's direction.
- NDBI is excluded from the current feature set. The prior dense-AOI test gave
  only `-0.058` NDVI/NDBI correlation; this alone is weak evidence, but NLCD is
  the purpose-built alternative.
- ESA WorldCover built percentage is not a reliable substitute for FortyGuard
  impervious segmentation.
- Free data should add resolution/new dimensions, never be framed as validating
  or second-guessing FortyGuard, which the user wants treated as trusted.

## Heat Intelligence and street imagery findings

- A real FortyGuard Heat Intelligence report was fetched and saved at
  `ml/reports/heat_intelligence_downtown_la.pdf` (gitignored). It is a useful
  44-page PDF with contextual SVF, albedo, cooling-equity, and intervention
  material—not a convenient structured bulk-training endpoint.
- Street View segmentation is best used on demand after a user clicks a tile:
  it distinguishes a highway from a street with planting space and helps reject
  infeasible suggestions. It complements satellite imagery rather than
  replacing it. It costs 8,600 credits per view. The docs do not confirm the
  camera field of view, so four 90-degree shots cannot be assumed to cover
  exactly 360 degrees without empirical testing.

## Cooling-deficit feature work (separate, active)

Goal: find cells that cool less than nearby peers overnight, alongside a
nighttime heat-exposure measure. This is not the original daytime model.

### Package and safeguards

Implemented under `ml/cooling_deficit/`:

- `capability_check.py` — endpoint/time acceptance test.
- `collect_overnight.py` — original single-night 12-AOI collector.
- `screen_nights.py` — candidate-night screen using three sentinel AOIs.
- `collect_multi_night.py` — multi-night, three-timepoint panel collector.
- `extract_pairs.py`, `compute_deficit.py`, `validate_local_time.py`,
  `fortyguard.py`, `config.py`, `isolation.py`, tests, and README.
- Data/cache/locks live only beneath `ml/cooling_deficit/data/` and
  `ml/cooling_deficit/runtime/`; `ml/data/` is untouched.

### Important correction

The first 12-AOI overnight run is **invalid for overnight inference**: it sent
UTC clock values to an API that interprets `start_time` as location-local. It
therefore sampled approximately 05:00 and 11:00 LA instead of 22:00 and 04:00.
Never train from that first batch.

The corrected `local-time-v2` path converts aware timestamps to LA local time,
adds versioned filenames to avoid accidental old-cache hits, and was verified
on Downtown LA. For the tested night: 22:00 mean 25.91 C vs 04:00 mean 25.97 C;
this showed a near-flat/warmer night, not a reliable citywide cool-down.

### Current collection status (verify before intervening)

- Six-AOI panel: Downtown LA, Vernon, Huntington Park, Elysian Park, Sylmar,
  Venice.
- Four screened valid nights: extreme heat wave, winter storm, mild clear
  shoulder, cold windy winter.
- Three local sample times each: 22:00, 01:00, 04:00.
- Maximum planned cost is 72 heatmap calls / 303,840 credits before cache reuse.
- At handoff time the runner lock is present and its manifest reports **19
  completed AOI-nights**. It is still running. Do not copy its `data/` or
  `runtime/` to C: until the lock disappears and completion is verified.

After it completes:

1. Verify manifest completion (24 AOI-nights), errors, and lock removal.
2. Extend extraction for multi-night `evening/overnight/predawn` cache names;
   the current pair extractor only covers one-night-style inputs.
3. Generate per-cell cooling, peer-relative cooling deficit per night, median
   deficit/consistency across nights, and nighttime heat exposure.
4. Merge approved enrichment features, then train/export a separate cooling
   model only after the data quality/distribution report.

## D → C transfer completed this session

The requested non-destructive D-to-C copy finished from
`D:\Fortyguard_batra` to `C:\Fortyguard_batra`. It used additive copying, not
mirror/delete operations.

Copied and verified:

- `.env.local`: training key variables `_2` and `_3` were merged without
  exposing values or overwriting unrelated entries.
- `ml/models/` including Tier 2 model files.
- `ml/data/processed/` (85 files, ~43 MB).
- `ml/data/raw/` (1,590 files, ~1.46 GB); all D file paths existed on C after
  a follow-up copy of four files written during the main transfer.
- `ml/data/live-cache/`.
- The four app JSON exports listed above.

Not copied: `ml/cooling_deficit/data/` or `runtime/`, because the multi-night
cooling collection is active. Copy those only after its collector completes.

## How to run locally

For the web app in `C:\Fortyguard_batra` or `D:\Fortyguard_batra`:

```powershell
npm install
npm run dev
```

If `next` is not recognized, dependencies have not been installed in that copy;
run `npm install` from the repository root. A Python virtualenv being active
does not supply Node dependencies.

For Python use 3.11, not the environment where pandas attempted a source build.
From `ml`:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Cooling commands use their own `.venv-cooling` when running from the copied C
project. Read `ml/cooling_deficit/README.md` before a new collector launch.

## Immediate next steps and guardrails

1. Let the active cooling collection finish; monitor the lock, manifest and
   `runtime/multi_night.stdout.log` rather than launching a duplicate runner.
2. Do not launch paid weather-diversity collection or enrichment without user
   authorization.
3. When any collection ends, report actual rows/AOIs/weather/night coverage
   before retraining.
4. Preserve the shared daytime cache; never delete/re-fetch paid raw data just
   to regenerate a model.
5. When the cooling run finishes, sync its finalized data to C separately.
