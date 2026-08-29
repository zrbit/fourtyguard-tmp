# Heat Lens

Heat Lens is a FortyGuard hackathon project for answering a practical urban-heat question:

> Is this 100 m cell unusually hot, does that heat persist, and what should we investigate next?

It is intentionally not a generic heat-map viewer. It helps a resident, planner, or judge move from a live temperature signal to clear, evidence-labelled follow-up actions.

## The experience

1. **Understand the signal** — choose a live 100 m cell and see its temperature against its eight closest spatial controls and the wider scan.
2. **Check conditions** — request FortyGuard environmental evidence first; add slower satellite and street imagery only if a visual explanation is needed.
3. **Check persistence** — test whether local heat stayed above 90°F / 32°C during the latest complete day, instead of trusting one snapshot.
4. **Compare history** — chart the same calendar day and UTC hour across the previous three years, with Open-Meteo regional air temperature as context.
5. **Explore options** — use the expandable cooling scenario to discuss tree-canopy and cool-pavement assumptions. It is a screening aid, not a forecast.

Every interpretation is intentionally cautious: temperature locates a signal; it does not prove a cause or a health outcome.

## Live data

- **FortyGuard heatmaps:** live 100 m thermal cells in Los Angeles, Chicago, and New York City.
- **FortyGuard environmental parameters:** contextual heat conditions.
- **FortyGuard satellite and street-view segmentation:** optional imagery evidence for shade, vegetation, and exposed-surface investigation.
- **FortyGuard persistence:** continuous time above a selected heat threshold for a compact local AOI.
- **Open-Meteo Archive:** historical 2 m air temperature context; it is clearly kept separate from FortyGuard block-level thermal data.

All FortyGuard work follows the asynchronous submit-and-poll pattern. API keys remain server-side; clients receive only compact job state and safe result summaries.

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
```

The hackathon-provided `api_key=...` is also supported. Never use a `NEXT_PUBLIC_` prefix, commit `.env`, or put the key in browser code.

## Data and product guardrails

- The live map is a local comparison tool, not a city-wide health-risk model.
- Persistence uses the latest completed UTC day, so partial hourly data is not mistaken for a short heat event.
- Segmentation and environmental results are leads for investigation—not causal proof.
- The intervention control shows a transparent, hypothetical screening estimate only.
- External historical air temperature is regional background context, not a substitute for block-level surface thermal data.

## API documentation

The implementation follows the official FortyGuard documentation for [heatmaps](https://docs-api.fortyguard.com/docs/create-heatmap), [environmental parameters](https://docs-api.fortyguard.com/docs/environmental-parameters), [satellite segmentation](https://docs-api.fortyguard.com/docs/satellite-view-segmentation), [street-view segmentation](https://docs-api.fortyguard.com/docs/street-view-segmentation), and [known limitations](https://docs-api.fortyguard.com/docs/limitations).

See [COMMIT.md](COMMIT.md) for the feature-level history of the project.
