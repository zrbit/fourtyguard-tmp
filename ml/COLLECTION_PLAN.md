# LA thermal dataset expansion — collection plan

Given verbatim by the user (2026-08-30), lightly reformatted; key value
redacted below on purpose — see "Keys" at the bottom.

## Goal

Expand the LA thermal dataset. Current state (at time of writing): 195 rows,
47 AOIs, 5 date_time snapshots, daytime hours only (10am/1pm/4pm LA-local).

## Key constraint — read before planning any fetches

Land cover (impervious%, canopy%) and OSM building density are collected
ONCE per AOI and reused across all its rows. So for those features we
effectively have n=47, not n=195. Additional hours at an EXISTING AOI add
rows but no new information about land-cover effects. Therefore:
**prioritize new AOIs over additional hours.** Do not backfill hours at
already-collected AOIs until every priority AOI below has at least 2 hours.

## Hour policy

- Default to 2 hours per AOI: **1pm and 4pm.**
- Drop 10am — surfaces haven't charged yet; least discriminative power
  between high- and low-thermal-mass blocks.
- Only add 10am once all priority AOIs below are collected and credits remain.
- Where possible, collect a given batch on a single date so AOIs within a
  batch are weather-comparable. Log the date_time on every row.

## Fetch order — strictly in this order, stop when credits run out

**Tier 1** (highest value — currently zero collected in Southeast LA):
Huntington Park, Bell, South Gate, Lynwood, Compton

**Tier 2** (categories currently at n=1):
Commerce (Industrial), Elysian Park (Park-adjacent)

**Tier 3** (confound breakers — coastal AND hot; prevent the model from
collapsing "coastal" into "cool"):
Wilmington, El Segundo

**Tier 4** (hot inland valley, low canopy):
Sun Valley, Panorama City, Sylmar

**Tier 5** (SE LA suburban — within-region contrast vs Tier 1):
Downey, Bellflower, Lakewood

**Tier 6** (dense, low canopy, mid-range fill):
West Adams, Mid-City, Harbor City

**Deprioritized** — do not fetch unless everything above is done (hillside/
leafy or already-saturated categories, near-zero marginal value):
Larchmont, Atwater Village, Angelino Heights, Cypress Park, El Sereno,
Glendale, Burbank, Little Tokyo, South Pasadena, West LA, Playa del Rey,
Long Beach downtown, Westchester, Whittier, Palms

**If credits remain after Tier 6**, add new AOIs not on the pending list, in
this priority order (still 2 hours each):
1. Large surface parking: stadium lots, regional mall lots, park-and-rides
2. Freeway-adjacent parcels
3. Irrigated golf courses and cemeteries — important: green but largely
   unshaded, unlike parks (green AND shaded). Breaks the collinearity
   between evapotranspiration and canopy shading, otherwise inseparable in
   SHAP.
4. Additional industrial: Vernon, City of Industry

## Also do

- Retry the 3 rows with incomplete humidity/cloud/solar/heat-index fields.
- Add a derived target column: `temp_anomaly` = AOI meanTemperature minus
  the mean of all AOIs sharing that same date_time. Rationale: AOIs were
  collected across 5 snapshots on different days, so absolute temperature
  partly encodes sampling date rather than urban form; anomaly removes that
  confound and matches the product framing ("hotter than surroundings").
  **Note (Claude, when executing): this already matches `anomaly` in
  `build_dataset.py` — confirm it lines up with this definition rather than
  adding a duplicate column.**
- Log distance-to-coast and elevation per AOI as context variables. Do NOT
  drop them, but flag them in SHAP output as non-actionable context so
  they aren't presented as intervention levers.
- Checkpoint after every AOI so a transient failure doesn't lose the batch.
- Print running totals: AOIs collected, rows, per-category counts.

## Generalization across weather conditions and years — known gap

Current date_time sampling is NOT a deliberate spread across weather
regimes or years — it's whatever calendar days happened to be running
during development, all from the same season (late Aug 2026). This is
partially, but not fully, mitigated:

- **The `anomaly` target already cancels uniform weather effects** within a
  snapshot (a hot day shifts every AOI in that snapshot together, so it
  drops out of AOI-minus-regional-mean). This is why the target has been
  usable without a large weather-diversity effort so far.
- **`env_params` features do NOT get this protection.** humidity,
  cloudCoverPct, windMph, solarIrradiance, heatIndex, hourOfDay are fed to
  the model as raw absolute values. Every snapshot collected so far is a
  clear late-August LA afternoon — the model has never seen an overcast
  day, a winter day, or a Santa Ana wind event, and can't be assumed to
  generalize to those without evidence.
- **Year diversity is untested, not just absent.** `/heatmap` and
  `/env_params` have only ever been called with `completed_hour()` (very
  recent). Whether they'll serve a genuinely old date_time (last winter,
  last year) the way `/satellite` accepts ~30-45-day-old dates is unknown —
  needs one cheap test call (heatmap + env_params only, skip satellite) to
  confirm before planning any real seasonal-diversity collection around it.

**Resolved:** the API supports date_time back to 2021 (confirmed). Rather
than test-and-guess a date, real diverse weather days were identified for
free via Open-Meteo's historical archive (LA, 1pm LA-local, 2021-2026) and
picked to span genuinely different regimes, not just different calendar
dates:

| Regime | Date (1pm LA) | Temp | Humidity | Cloud | Wind | Precip |
|---|---|---|---|---|---|---|
| Extreme heat wave | 2024-09-06 | 43.5°C | 11% | 0% | calm | 0 |
| Winter storm | 2026-02-16 | 12.2°C | 94% | 100% | 5.3 | 11.7mm |
| Santa Ana wind event | 2021-11-25 | 24.4°C | 5% | 0% | 15.4 | 0 |
| June gloom / marine layer | 2021-06-07 | 19.2°C | 59% | 100% | 12.2 | 0 |
| Mild clear shoulder season | 2022-10-27 | 22.9°C | 47% | 2% | calm | 0 |
| Cold windy winter | 2023-02-25 | 8.1°C | 76% | 100% | 22.5 | 0.3mm |

## Tier 7 — weather/year diversity pass

Land cover (satellite + OSM) is captured once per AOI and reused, so
applying these 6 dates to AOIs that are **already collected** only costs
heatmap+env_params (7,120 credits/snapshot each), not a fresh AOI's full
cost. Apply to the 12-AOI "one per category" backbone already in
`aoi_sampling.AOIS` (Downtown LA, Vernon, Venice, Los Feliz, Griffith Park
edge, Sherman Oaks, Chatsworth, South LA / Watts, Westwood / UCLA, Silver
Lake, Koreatown, San Pedro) — already spans the widest land-cover category
spread, so it tests whether the land-cover-vs-anomaly relationship holds
across weather regimes without needing a full AOI x weather cross product.

Estimated cost: 12 AOIs x 6 dates x 7,120 = ~512,640 credits.

Run this AFTER Tier 1-6 completes (avoid two processes racing the same
ledger file). Script: `src/collect/run_weather_diversity.py`.

**Result (executed):** 4 of 6 dates returned real data across all 12
backbone AOIs (extreme heat 2024-09-06, winter storm 2026-02-16, mild clear
2022-10-27, cold windy 2023-02-25). The 2 dates from 2021 (santa ana wind
2021-11-25, june gloom 2021-06-07) came back as **valid API responses with
zero temperature cells, universally across all 12 AOIs** -- not a request
error, a real gap in FortyGuard's practical historical coverage. The "API
supports data from 2021" claim holds for the request being accepted, not
for data actually existing that far back. **Treat ~2022 onward as the
reliable floor for /heatmap and /env_params**, not 2021, for any future
historical collection. Cost note: empty responses still bill in full (no
exception raised, so no ledger refund) -- ~170,880 credits were spent on
the 2 empty 2021 dates before this was discovered.

## Sequencing

Do NOT retrain until fetching is done. Report the updated per-category
distribution first.

## Keys

Use the full extent of `FORTYGUARD_TRAINING_API_KEY` first, then
`FORTYGUARD_TRAINING_API_KEY_2` — both in the repo-root `.env.local`
(gitignored, not in this file on purpose).
