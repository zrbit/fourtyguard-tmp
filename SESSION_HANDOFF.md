# Session handoff — FortyGuard Thermal Reasoning Agent

Last updated: 2026-08-31

This is the canonical continuity record for `C:\Fortyguard_batra`. Read it
before collecting data, training, or altering the app.

**2026-08-31:** This session (separate from the 08-30 entries below) built
the Action Feasibility Guard, removed a confirmed-broken Tier 1 live lookup,
and added live address search. Full detail in "Action Plans / Feasibility
Guard work (2026-08-31)" further down. **A Street View imagery task for
action-plan tiles is now authorized and assigned to Codex** (see that same
section for the exact spec) — as of this writing no imagery-related files
exist yet (`git status` checked clean of them). Any other session picking
this repo up should NOT start imagery/Street View work on action-plan tiles
without checking current git status first, to avoid duplicating Codex's
in-flight work.

**2026-08-30, later same day:** the user confirmed `C:\Fortyguard_batra`
replaces `D:\Fortyguard_batra` going forward for the web app. The D: copy's
`next dev` server (web app only, not any Python process) has been stopped so
it stops shadowing C:. `ml/cooling_deficit`'s multi-night collector finished
this session (24/24 AOI-nights, per `runtime/multi_night.stdout.log` and
`data/multi_night_manifest_local-time-v2.json` on D:) but **its `data/` and
`runtime/` have deliberately not been copied to C: yet** — do that
consciously, not as a side effect, since another agent may already be
mid-transfer per the note above about parallel Claude/Codex work.

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

## Action Plans / Feasibility Guard work (2026-08-31)

New work this session, on top of everything above (which still stands).

**Action Feasibility Guard — built and verified.** Classifies each of the 48
priority tiles into a practical site type from real OSM geometry (roads,
buildings, parking, canopy), then shows which interventions are physically
plausible before any generic advice (e.g. "plant trees") is suggested
somewhere it can't apply (a highway shoulder, a rooftop-dominated block).

- New files: `ml/src/collect/fetch_osm_sitetype.py` (per-tile Overpass fetch,
  cached, retries across a mirror — the free public instance is flaky, saw
  real 504s), `ml/src/serve/site_type.py` (the rule engine), `ml/src/serve/
  export_site_types.py` (standalone augmenter — reads/writes
  `cluster-action-plans.json` directly, does NOT re-run
  `export_clusters_for_app.py`'s pandas/numpy/xgboost pipeline, so it works
  even when that stack breaks — see below).
- `classify_site_type()` checks major-road coverage FIRST as a deliberate
  safety-priority override (not a dominance comparison — even a mostly-
  building tile gets flagged highway_dominated if it also carries meaningful
  live-road frontage), then picks whichever of {parking, building, green}
  has the actually-largest share among those crossing their own threshold.
  **A real bug was caught and fixed here**: the first version checked
  parking before building in fixed order regardless of actual size: a tile
  43% building / 21% parking was wrongly called "surface parking." Verify
  this class of bug doesn't creep back in if this file is touched again.
- `cluster-action-plans.json` now carries `siteType`/`siteTypeLabel`/
  `suitableActions`/`excludedActions`/`requiresFieldVerification` on all 48
  priority tiles (`hasFeasibilityScreen: true` at the top level), rendered
  in `ActionPlanTileCard.tsx`'s new `FeasibilityScreen` sub-component.
- `ActionPlanTile` type in `src/lib/reasoning/clusterActionPlans.ts` extended
  with these fields, all optional.
- venv note: hit the numpy/pandas incompatibility live this session
  (`numpy.core._multiarray_umath` missing under Python 3.14, then a broken
  `pandas._libs.pandas_parser` after upgrading numpy to 2.5.2). Upgrading
  numpy alone did NOT fully fix the venv — pandas is still suspect. This is
  exactly why `export_site_types.py` was deliberately kept independent of
  pandas/numpy/xgboost (uses only `requests` + stdlib json).

**Tier 1 (`MlAttribution`) removed from the live per-cell view.** Confirmed a
real bug, not a misread: `getMlEvidenceNearestTo()` in `mlExplain.ts` does
nearest-AOI lookup with no timestamp tie-break. Van Nuys has 5 liveGrid
records at the identical lat/lng (different `date_time`s), with predicted
anomalies ranging +2.22°F to +11.15°F — the code silently always returned
whichever sorted first, unrelated to what the live scan actually shows.
Removed the `<MlAttribution>` block from `LiveThermalReasoning.tsx` (left a
comment explaining why). The component/route/`mlExplain.ts` are UNTOUCHED
and still valid for `AnalysisPanel.tsx`'s `blockId` lookup mode (exact, not
nearest-neighbor) — but `AnalysisPanel.tsx` is dead code (see ml/
SESSION_HANDOFF.md), so this path currently has no live caller. Tier 2's
`CellAttributionSection` (uses the selected cell's own features, no
nearest-neighbor) is unaffected and still renders on the live map.

**Address search added to the live map.** `src/components/map/
AddressSearch.tsx` + server-side `/api/geocode` (proxies Nominatim, proper
User-Agent per its usage policy, submit-triggered not per-keystroke).
`ThermalMap.tsx` gained an `onMapReady` prop so a sibling overlay can drive
`flyTo`; `MapView.tsx` wires it. In-bounds results fly + auto-select the
nearest cell; out-of-bounds results fly there anyway but explicitly decline
to fabricate a cell selection ("outside today's scan area").

**Tier A: live heatmap for an arbitrary searched address + size, built.**
`/api/fortyguard/heatmap` now accepts either `{city, period}` (unchanged,
the 3 fixed STUDY_AREAS) or `{bbox: [w,s,e,n], period}` (new: any address,
server-validated size/continental-US bounds — `bboxError()` in that route).
`AddressSearch.tsx` was redesigned: address input + a direct numeric
"block size" input (meters, user-typed, not presets -- clamped client-side
in `clampSize()` to 200-2000m, a hard ceiling computed to stay inside the
route's own MAX_BOX_DEG even at the northern edge of the allowed
continental-US range) + an explicit "Scan" button, replacing its old
fly-to-nearest-existing-cell behavior entirely — every search now triggers
a genuinely new FortyGuard call for that exact spot (real credits spent per
search, on `FORTYGUARD_API_KEY` -- the same key Codex's Street View task
will likely use too, see the shared-budget note earlier in this doc).
`page.tsx` gained `customArea` state; switching back to a named city clears
it. Explicitly **out of scope for Tier A** (per the user, discussed
separately): live model attribution or action plans for a searched area --
those stay on the existing precomputed 80-AOI pipeline.

Two real, previously-latent bugs were caught and fixed live while building
this (both would eventually have hit the fixed cities too, just less
likely to trigger there):
1. `thermalColorExpression()` in `ThermalMap.tsx` used the raw
   `maxTemperature` as its last color-stop while computing the middle stops
   from an artificially-widened `range` -- any scan with a real range under
   0.01°F (confirmed live: a small custom-area search came back with all 15
   cells at exactly 80.0°F) produced non-ascending stops, which MapLibre
   rejects outright, silently failing to add the whole color layer. Fixed
   by deriving every stop from `minTemperature + range` consistently.
2. `page.tsx`'s `load()` calls `setLoading(true)` then, on a localStorage
   cache hit, `setLoading(false)` with no `await` in between -- React
   batches this, so the intermediate loading state never actually renders,
   `<ThermalMap>` never unmounts/remounts, and its mount-once `fitBounds`
   never re-runs for the new area (data/colors update fine via the reactive
   effect; the viewport just silently stays wherever it was). Same root
   cause, same fix shape as the original day/night bug fixed earlier this
   session. Fixed by moving `fitBounds` into the reactive effect too, keyed
   off `blocks` changing (harmless no-op-looking snap when blocks represent
   the same area, e.g. a day/night toggle).

**Action Plans map view, built as an opt-in toggle.** `/action-plans` now has
a List/Map switch (`ActionPlansView.tsx`, defaults to List -- today's
behavior is unchanged unless a viewer clicks Map). The map
(`ActionPlansMap.tsx`) plots priority tiles (colored by site type from the
Feasibility Guard) and geography-driven tiles (muted, toggleable) as fixed-
pixel circle markers -- NOT geo-sized polygons, deliberately: priority tiles
are genuinely scattered across all of LA county, and a fitBounds wide enough
to show all 48 shrinks a real 450m square to sub-pixel/invisible. Same
problem, same fix already established for the live map's wide-zoom marker
layer (see `blockGeometry.ts`'s `blocksToPointFeatureCollection`). Clicking/
hovering a tile syncs to a sidebar showing the same `ActionPlanTileCard`
used in the list (Codex's Street View imagery included, whatever's landed).
Deliberately no "static"/"precomputed"/timestamp language anywhere in this
UI, per explicit user instruction -- viewers shouldn't be able to tell this
map isn't live.

**Follow-up fix (2026-08-31, later, caught on the deployed Vercel site):**
Map mode rendered correctly at a large viewport (1920x1080) but the map
shrank to a thin strip at a laptop-sized one (1366x768) -- reproduced
directly against the live URL, not a guess. Root cause wasn't a CSS
mechanism bug this time: `/action-plans` carries a long intro paragraph + 3
stat cards + a footer disclaimer that neither the live map page nor
`/training-data` burdens their own map with, and on a shorter viewport that
fixed text ate most of the available height before the map's `flex-1` ever
got real space to grow into. Fixed by moving that intro/stats/footer block
inside `ActionPlansView.tsx` and hiding it specifically in Map mode (a
compact one-line header + the tier counts replaces it there); List mode is
untouched. Verified against the deployed site at both viewport sizes plus a
List-mode regression check, not just locally.

**Markers changed from circles to squares (2026-08-31, later still).**
Circles were deliberately chosen over real geo-sized squares to fix a real
sub-pixel-at-wide-zoom bug (see the block below) -- switching back to
squares had to preserve that fixed-pixel-size property, not just look
different. MapLibre's `circle` layer type has no square equivalent. First
attempt used a `symbol` layer with a "■" text glyph -- rendered nothing,
even though network inspection confirmed the basemap's font server returned
the correct glyph range (200 OK); apparently that glyph just isn't
rasterized reliably by that font server. Second attempt (what's live now)
sidesteps the basemap's font server entirely: `registerSquareIcon()`
draws a plain filled square on a client-side `<canvas>` once and registers
it via `map.addImage(..., {sdf: true})`, then the layer uses `icon-image` +
`icon-color` (recolored per-feature same as circle-color/text-color was) +
`icon-halo-color`/`icon-halo-width` for the hover/selected rings. Verified
working with real colored squares, click-to-select, and hover, both locally
and on the deployed Vercel site. If a future map on this project ever needs
a custom marker shape again, start with the SDF-icon approach directly --
the text-glyph path already burned a round-trip here.

**Geographic + typical tiles made visible by default (2026-08-31, later
still), per explicit user request.** Previously geographic tiles were
hidden behind an unchecked "Show 225 geography-driven tiles" checkbox and
typical tiles (1,433 of them) were never drawn on the map at all -- user
feedback: this read as "we only screened 48 spots," when actually all
1,706 were screened, most just didn't turn up a strong actionable lever.
Now `ActionPlansMap` receives `typicalTiles` too (page.tsx fetches it via
`getActionPlanTilesByTier("typical")`, threaded through `ActionPlansView`),
and every tile renders: priority still colored by site type at full
opacity/size, geographic+typical both drawn as small grey squares at low
opacity (0.32) as a permanent backdrop -- no toggle any more, the checkbox
was removed. The `featureCollection` array deliberately lists grey tiles
BEFORE priority ones (later features paint on top in a single symbol
layer), so the 48 priority squares can never end up visually buried under
the ~1,658 grey ones. Initial `fitBounds` now covers `allTiles` (previously
priority-only) so the full screened footprint is visible by default.
Verified: renders correctly with no performance issues at 1,706 markers,
click-to-select works on both a priority tile and a grey one, both locally
and on the deployed Vercel site.

Hit a genuinely unusual dev-environment issue building this, worth flagging
for whoever touches this file next: **brand-new Tailwind utility classes in
a newly-created file took multiple save/reload cycles to actually appear in
the compiled CSS under this project's Turbopack setup** -- not just
arbitrary values (`w-[380px]` silently produced no rule at all, confirmed by
checking `document.styleSheets` directly), but at least one completely
standard utility too (`top-4`, despite being already used and working in
`AddressSearch.tsx`) computed to a bogus value on first use in this file.
Diagnosed via direct `getBoundingClientRect()`/`getComputedStyle()`
inspection in the browser, not by reasoning about the CSS alone -- the
symptom (child of a properly-sized flex/grid parent measuring 0) looks
identical to a real flexbox/grid layout bug, so don't assume a Tailwind
class silently failing to compile is impossible just because the class name
looks right in the source. If a brand-new file's layout looks broken in a
way that defies the CSS logic, check the compiled stylesheet before
assuming the JSX/className is wrong. Worked around here by using inline
`style` for the handful of positioning-critical values instead of chasing
the compiler.

**`InterventionSimulator.tsx` confirmed as genuine dead code** — defined,
never imported anywhere (`grep` verified). Its formula (`canopy*0.045 +
pavement*0.025`) is also just made up, not model-derived. If someone wires
it in, do NOT do it naively on live-map cells (same nearest-AOI credibility
problem as the Tier 1 bug above). The scoped, low-risk way to do this: for
each of the 48 priority tiles, offline-precompute a few real perturbed-
feature-vector predictions (canopy +10/20/30pp, impervious -10/20/30pp,
albedo +0.1/0.2) by reusing the model already loaded in
`export_clusters_for_app.py`, store them per tile, and gate which sliders
show by that tile's `suitableActions` from the Feasibility Guard above so
the two features don't contradict each other. Not started — an estimate
only, given to the user, not yet authorized as a task.

### Authorized, assigned to Codex: action-plan Street View evidence

The user authorized adding representative Street View evidence to the fixed
~450m action-plan tiles. As of this entry, not started (no imagery files in
git status). Implementation rules given to Codex, recorded verbatim so
anyone picking this up mid-flight has the real spec:

- The geographic grid is deterministic. Cache imagery by stable `tileId`; a
  later model export may change a tile's priority/rank but not its boundary.
- Fetch imagery **on demand** from a priority tile card. Do not prefetch all
  48 priority tiles and do not fetch imagery for geography/typical tiles.
- One FortyGuard Street View request uses the tile's representative
  coordinate with `back_view: true`, yielding front and optional back
  views. Maximum cost if all current priority tiles are inspected is
  48 x 8,600 = 412,800 credits; cached tiles must spend no credits on repeat
  views.
- Store the original and segmented images in a separate server-side cache.
  Never embed Base64 imagery in `cluster-action-plans.json`, which would
  make the static action-plan export unmanageably large.
- The UI must label this as a **representative street-level inspection
  within the tile**, not complete coverage of the entire 450m area. It may
  identify candidate planting constraints/opportunities from segmentation,
  but must not claim shovel-ready planting coordinates.
- Keep this path isolated from the generic live-investigation status route,
  which deliberately strips imagery. Validate submitted `tileId` and
  coordinates against the exported priority-tile list so the endpoint
  cannot become an unrestricted paid-call proxy.
- Work carefully around the separate Action Feasibility Guard changes
  (above). Prefer new imagery-specific modules and make only the smallest
  integration change to `ActionPlanTileCard.tsx`.

**Deployed to Vercel (2026-08-31, later same day).** Live at
`https://heatlens-fortyguard.vercel.app` (project `x-rugved/heatlens-fortyguard`,
not yet connected to GitHub -- `vercel deploy` failed to auto-link because
the account has no GitHub login connection; deployed straight from the CLI
instead, works fine, just means it won't auto-redeploy on push). Real
FortyGuard/geocode/static-JSON pages all verified live and working (`/`,
`/action-plans`, `/training-data` -- zero console errors, real heatmap data
rendered). `FORTYGUARD_API_KEY`, `FORTYGUARD_TRAINING_API_KEY`, `_2`, `_3`
are set as Vercel Secrets on both Production and Preview (values never
printed anywhere, piped directly from local `.env.local`). `GROQ_API_KEY`/
`GROQ_MODEL` (referenced in code, presumably Codex's work) are NOT set on
Vercel because they don't exist in local `.env.local` either -- whatever
uses them may not be live yet; check before assuming that path works
deployed.

Two things fixed/created to make this deploy possible, both worth knowing
about if redeploying:
- **`.vercelignore` added** (didn't exist before). Without it, `vercel
  deploy` tried to upload the entire working directory including
  `ml/data/raw/` (~1.46GB, 1,590+ files) and failed with a cascading
  "Upload aborted" error on the first attempt. `ml/` is entirely excluded
  now -- nothing under it is needed at runtime, only the small static
  exports already inside `src/lib/mock-data/`.
- **`jobStore.ts` made Vercel-safe** (this session, same as the entry
  below) -- its filesystem writes are now wrapped in try/catch so a
  read-only serverless filesystem degrades to "no dedup cache" instead of
  throwing and breaking heatmap submission.

**Vercel deploy note (2026-08-31, later):** `actionPlanImageryStore.ts`
(Codex's -- writes to `ml/data/live-cache/action-plan-streetview/`, plus a
file-based lock to prevent double-purchasing the same tile's imagery) is
broken on Vercel: the deployed filesystem is read-only and never
shared/persistent across serverless invocations, so the cache never
actually caches and the double-purchase lock won't reliably hold either.
Same root problem as `jobStore.ts` (already made Vercel-safe with a
try/catch, see above) but higher stakes here -- this store exists
specifically to protect a real 8,600-credit-per-pull budget. **Explicit
user decision: deploy anyway, known-broken, for demo purposes** -- every
tile's imagery view on the deployed site may silently re-purchase instead
of hitting cache. Fix properly (move to Vercel KV/Upstash Redis or similar)
before this deployment sees real/sustained traffic, not just before judging.

**Do not duplicate this work from another session.** Check `git status` for
imagery/Street-View-related new files before starting anything in this
area.

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

For the web app in `C:\Fortyguard_batra` (canonical — D: is retired for the app):

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
6. Codex is implementing action-plan Street View evidence (see "Action
   Plans / Feasibility Guard work" above for the full spec) - don't start
   overlapping work on `ActionPlanTileCard.tsx` imagery/photo features
   without checking git status first.

## Action-plan Street View implementation

Implemented in the canonical `C:\Fortyguard_batra` app:

- Priority cards fetch one representative FortyGuard Street View request on
  demand using their stable fixed-grid `tileId`; there is no bulk prefetch.
- Submission and polling prefer `FORTYGUARD_TRAINING_API_KEY_3`, with older
  training-key variables as fallbacks. The live-app key is not used.
- A per-tile atomic lock prevents duplicate simultaneous purchases. Completed
  original and segmented front/back images are cached beneath
  `ml/data/live-cache/action-plan-streetview/` and reused.
- The server accepts only exported priority tile IDs and gets coordinates from
  the trusted export rather than accepting arbitrary browser coordinates.
- The UI presents original and segmented images plus a conservative planting
  assessment, labelled as one representative location rather than complete
  ~450m tile coverage or a construction-ready plan.
- All 48 priority tiles would cost at most 412,800 credits, but each 8,600-credit
  call occurs only when that card is inspected for the first time.
- `C:\Fortyguard_batra` is the sole working copy for future changes. Do not
  implement further work in the retired D-drive copy.
