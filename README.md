# Thermal Reasoning Agent

A hackathon prototype for FortyGuard that answers a more useful question than “where is it hot?”:

> Why is this block hotter or cooler than comparable blocks nearby?

The app is an evidence-first urban heat investigator. It combines a map-led analysis interface with ranked hypotheses, an explicit uncertainty/critic pass, block comparison, contextual follow-up questions, and an optional live FortyGuard evidence check.

## What works now

- Generate a live 100 m FortyGuard heatmap in Los Angeles, Chicago, or New York City.
- Click a returned live thermal tile and inspect its anomaly against the live AOI mean.
- Run a server-side **live evidence check** using FortyGuard environmental parameters and satellite segmentation.

There is no demo-data fallback in the product flow. If a live request fails, the UI shows the API error and offers a retry. The API key remains server-side.

## Run locally

Requires Node.js 20.9+ (Node 22 is recommended).

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://localhost:3000`.

On Windows where PowerShell blocks `npm.ps1`, use `npm.cmd` as shown above. A production check is:

```powershell
cmd.exe /d /c "npm run build"
```

## FortyGuard configuration

Create `.env` in the project root:

```dotenv
FORTYGUARD_API_KEY=your_key_here
```

The hackathon-provided `api_key=...` name is also supported for convenience. Do not prefix either variable with `NEXT_PUBLIC_`, commit `.env`, or put the key in client-side code.

The live check submits a roughly 1 km² AOI around the selected US block (well below the documented Premium 50 mi² limit), then polls only from server-side route handlers:

- `POST /api/fortyguard/investigate` submits heatmap, environmental, and satellite jobs.
- `GET /api/fortyguard/status` retrieves a compact job status.

No raw Base64 imagery, signed URLs, activity payloads, or API keys are logged or sent to the browser. The UI only receives job state; this is deliberate while the prototype’s polished hero map continues to use its labelled demo layer.

## Product decisions

- **Evidence is not causation.** The app calls conclusions hypotheses and shows limitations/counter-evidence.
- **Live and demo are distinct.** The demo map stays functional offline. Live API work is explicitly a validation layer until the returned GeoJSON is rendered as a live layer.
- **A small control area is intentional.** Local comparison is more useful for explaining a block anomaly than city-wide weather alone.
- **No database is required for the hackathon build.** Route handlers are the backend-for-frontend and cache nothing by default.

## API reference used

The integration follows the official FortyGuard asynchronous job pattern: submit a request with an `api-key` header, receive an `activity_id`, then poll `/v1/status/{activity_id}` until a terminal status. The request shapes follow the official [heatmap documentation](https://docs-api.fortyguard.com/docs/create-heatmap), [environmental parameters](https://docs-api.fortyguard.com/docs/environmental-parameters), [satellite segmentation](https://docs-api.fortyguard.com/docs/satellite-view-segmentation), and [known limitations](https://docs-api.fortyguard.com/docs/limitations).

## Next demo upgrade

Render completed `map_data` GeoJSON directly as a MapLibre layer and derive the selected-tile anomaly from `stats_data`. That changes the thermal layer from demo to live while retaining the current independent reasoning/critic presentation.
