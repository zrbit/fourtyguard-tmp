# Heat Lens

Heat Lens is a FortyGuard hackathon project for answering a practical urban-heat question:

> Is this 100 m cell unusually hot, does that heat persist, and what should we investigate next?

It is intentionally not a generic heat-map viewer. It helps a resident, planner, or judge move from a live temperature signal to clear, evidence-labelled follow-up actions.

## The experience

1. **Choose a place to start** — the Action Brief lists the five places that are warmest compared with their closest neighbours. It is an investigation shortlist, not a danger rating.
2. **Understand the signal** — choose a live 100 m cell and see its temperature against its eight closest spatial controls and the wider scan. Rectangle colors are scaled from the coldest to hottest cell in the active scan, with exact °F endpoints in the legend.
3. **Check conditions** — request FortyGuard environmental evidence first; add slower satellite and street imagery only if a visual explanation is needed.
4. **Check persistence** — test whether local heat stayed above 90°F / 32°C during the latest complete day, instead of trusting one snapshot.
5. **Compare history** — chart the same calendar day and UTC hour across the previous three years, with Open-Meteo regional air temperature as context.
6. **Build an action plan** — combine the local temperature difference, closest control places, and the next 24-hour weather forecast to rank practical shade, surface, and near-term protection actions. It is a transparent screening model, not a guaranteed intervention forecast.

7. **Read the map in context** — CARTO Voyager provides a light, labelled streets basemap beneath the thermal overlays, while the header control lets people choose light or dark application chrome.
8. **Compare day and night** — load the labelled Daytime and Nighttime scans, then choose **Compare** to map each cell's `Night − Day` temperature change. The view displays both UTC scan timestamps, ranks the five cells with the least overnight cooling, and assigns a relative overnight-cooling priority score to the selected cell.

Every interpretation is intentionally cautious: temperature locates a signal; it does not prove a cause or a health outcome.

## Live data

### Optional AI action brief

After the deterministic Action Plan is built, a user can request an **AI site brief**. It uses only the plan's aggregate evidence to produce a concise explanation and one or two site checks. It cannot change the ranked recommendations, introduce a new intervention, or replace the underlying comparison and forecast evidence.

- **FortyGuard heatmaps:** live 100 m thermal cells for Los Angeles, Chicago, New York City, or any user-searched US address (address search picks the center point and a user-chosen block size, 200–2000 m, then requests a fresh scan for that exact box). Each fixed city uses its own local 12 PM (noon) daytime and 12 AM (midnight) nighttime scan; the app converts those local times to UTC for FortyGuard and uses the latest completed instance.
- **FortyGuard environmental parameters:** contextual heat conditions.
- **FortyGuard satellite and street-view segmentation:** optional imagery evidence for shade, vegetation, and exposed-surface investigation, including the Action Plan tiles' "Inspect street-level evidence" check.
- **FortyGuard persistence:** continuous time above a selected heat threshold for a compact local AOI.
- **Open-Meteo Archive:** historical 2 m air temperature context; it is clearly kept separate from FortyGuard block-level thermal data.
- **Open-Meteo Forecast:** next-24-hour temperature, apparent temperature, and sunlight context for the Action Plan.
- **OpenStreetMap Nominatim:** free geocoding for address search, proxied server-side with an identifying User-Agent per Nominatim's usage policy; submit-triggered, never per-keystroke.
- **CARTO Voyager:** a light, colourful vector basemap with roads, labels, and places for every map in the app (live map, training-data coverage, action-plan tiles); it does not contribute to thermal analysis.
- **Groq (`qwen/qwen3.8-27b` by default, configurable via `GROQ_MODEL`):** generates the optional AI site brief above from aggregate plan evidence only — never raw thermal data, never a new recommendation.

All FortyGuard work follows the asynchronous submit-and-poll pattern. API keys remain server-side; clients receive only compact job state and safe result summaries.

### ML pipeline data sources (offline, `ml/` — never called by the deployed app)

The trained model, SHAP explanations, training-coverage map, and Action Plan tiles (including the Feasibility Guard's site-type screening) are all produced by a separate, manually-run Python pipeline under `ml/`, not computed live. It draws on more external sources than the app itself, all free/no-key unless noted:

| Source | Used for |
| --- | --- |
| **FortyGuard** (`/heatmap`, `/env_params`, `/satellite`) | Bulk offline collection across ~80 hand-picked LA AOIs — the training dataset itself. Same paid API as the live app, billed to a training key. |
| **OpenStreetMap Overpass API** (`overpass-api.de`, mirrored via `overpass.kumi.systems`) | Two distinct uses: (1) AOI-level building/road/canopy geometry as a fallback impervious/canopy % estimate; (2) per-priority-tile road/building/parking/canopy geometry that drives the Action Feasibility Guard's site-type classification (highway / parking / building / green / residential). |
| **Microsoft Planetary Computer — Sentinel-2 L2A** (free, no auth, via `pystac_client`) | Per-AOI satellite imagery (5 bands, least-cloudy scene in the last 90 days) for NDVI and surface-albedo computation. |
| **USGS/MRLC Annual NLCD** (Fractional Impervious Surface, via MRLC's public WCS) | Per-cell impervious-surface %, an independent cross-check/disaggregation source alongside FortyGuard's own land-cover numbers. |
| **Open-Elevation** (`api.open-elevation.com`) | Per-cell elevation — a non-actionable geographic-context feature (a city can't change a block's elevation). |
| **Open-Meteo** (forecast + archive endpoints) | Per-cell/AOI wind speed, since FortyGuard's `/env_params` has no wind field, plus the app-level historical/forecast uses above. |
| **Bundled coastline geometry** (not a live source) | A hand-picked, simplified LA-coastline polyline (real landmark coordinates) embedded directly in code, for per-cell distance-to-coast — pure local geometry, no network call. |

A local, optional second process (`ml/src/serve/live_predict_server.py`, started manually alongside `npm run dev`) can additionally call FortyGuard satellite, Sentinel-2, Open-Elevation, and Open-Meteo live, per exact clicked point, for a genuinely real-time Tier 2 prediction instead of the nearest precomputed AOI's summary — see that file's docstring. It never runs on the deployed site (it needs `rasterio`/GDAL, which isn't part of the Next.js deployment).

## Run locally

Requires Node.js 20.9+ (Node 22 recommended).

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://localhost:3000`.

On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`. Verify a production build with:

```powershell
npm.cmd run lint
cmd.exe /d /c "npm run build"
```

## Configuration

Create `.env` in the project root:

```dotenv
FORTYGUARD_API_KEY=your_key_here
GROQ_API_KEY=your_key_here
```

The hackathon-provided `api_key=...` is also supported. `GROQ_API_KEY` is optional: without it, the transparent action plan still works and only the AI site brief is unavailable. Never use a `NEXT_PUBLIC_` prefix, commit `.env`, or put either key in browser code.

## Data and product guardrails

- The live map is a local comparison tool, not a city-wide health-risk model.
- The overnight-cooling priority is a relative ranking within the displayed study area. It identifies cells that cooled least between the selected scans; it is not a health-risk score or a causal diagnosis.
- Persistence uses the latest completed UTC day, so partial hourly data is not mistaken for a short heat event.
- Segmentation and environmental results are leads for investigation—not causal proof.
- The Action Plan is a transparent screening model. It ranks what to inspect or do first; it does not prove a heat cause, calculate a health outcome, or guarantee an intervention benefit.
- External historical air temperature is regional background context, not a substitute for block-level surface thermal data.

- The AI site brief receives only aggregated plan evidence, is validated as structured output, and cannot change the transparent ranking. It may fail independently without affecting the action plan.

## API documentation

The implementation follows the official FortyGuard documentation for [heatmaps](https://docs-api.fortyguard.com/docs/create-heatmap), [environmental parameters](https://docs-api.fortyguard.com/docs/environmental-parameters), [satellite segmentation](https://docs-api.fortyguard.com/docs/satellite-view-segmentation), [street-view segmentation](https://docs-api.fortyguard.com/docs/street-view-segmentation), and [known limitations](https://docs-api.fortyguard.com/docs/limitations).

Other external sources used, official docs for each: [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/), [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API), [Open-Meteo](https://open-meteo.com/en/docs), [CARTO basemaps](https://github.com/CartoDB/basemap-styles), [Groq API](https://console.groq.com/docs), [Microsoft Planetary Computer STAC](https://planetarycomputer.microsoft.com/docs/quickstarts/reading-stac-data/), [USGS/MRLC NLCD](https://www.mrlc.gov/data), and [Open-Elevation](https://open-elevation.com/).

See [COMMIT.md](COMMIT.md) for the feature-level history of the project.
