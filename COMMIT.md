# Commit guide

This file makes the feature history easy to review during the hackathon.

| Commit | Feature introduced |
| --- | --- |
| `3eb3997` | Initial Thermal Reasoning Agent prototype, demonstration data, and Los Angeles map. |
| `15441c6` | Thermal colour/explanation corrections and a mobile block picker. |
| `6fd98dd` | Live FortyGuard thermal workflow with resilient polling and caching. |
| `a17a9f2` | Live thermal reasoning and server-side status handling. |
| `bf37e34` | Live causal-evidence integration for selected cells. |
| `feat: add guided heat validation experience` | Live city heatmaps, clear signal summary, progressive evidence checks, same-day historical chart, optional persistence analysis, refined map UI, and this project documentation. |
| `fix: clarify heat investigation language` | Plain-language weather, imagery, persistence, and heat-duration labels that explain what each check means to a person using the dashboard. |
| `feat: add action brief shortlist` | Interactive top-five shortlist of locally warmer places, plain-language selected-place context, and a direct path to the heat-duration check. |
| `feat: add transparent intervention optimizer` (current HEAD) | On-demand action planning using local thermal controls and the next-24-hour forecast, with ranked recommendations, timing, expected benefit, and disclosed assumptions. |
| `feat: use CARTO Voyager basemap` | Light, labelled, colourful map context for both loading and rendered thermal maps, without changing heat overlays or map interactions. |
| `8d27e78 feat: add Groq action-plan brief` (current HEAD) | Optional server-side Groq brief that turns the scored plan into an evidence-bounded explanation and verification checklist, without changing the deterministic ranking. |

## Current product capabilities

- **Live local anomaly:** compares every selected 100 m tile with its closest spatial controls.
- **Action Brief shortlist:** lets a non-expert choose from the five locally warmest places and explains why the selected place is worth investigating.
- **Plain-language signal summary:** makes the local signal, scan rank, confidence, and next move visible before any technical detail.
- **Progressive investigation:** conditions first, then optional imagery; lengthy provider calls do not block the map.
- **Persistent-heat check:** assesses continuous time over 90°F / 32°C on the latest completed day.
- **Same-day history:** compares the selected place with three previous years and visually separates block thermal data from regional air temperature.
- **Transparent intervention scenario:** lets a user explore canopy and pavement assumptions without presenting them as a forecast.
- **Intervention Optimizer:** ranks shade, surface, and near-term protection actions from local controls and forecast conditions, while keeping its assumptions visible.
- **AI site brief:** optional Groq-assisted explanation and site-check checklist, restricted to the ranked plan's aggregate evidence and validated before display.
- **Map context and themes:** CARTO Voyager supplies labelled street context, and the interface supports persistent light and dark modes.

The current feature batch is documented above by its stable commit subject; `git log -1 --oneline` shows its exact hash.
