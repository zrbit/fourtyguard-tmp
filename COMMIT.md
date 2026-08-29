# Commit guide

This file makes the feature history easy to review during the hackathon.

| Commit | Feature introduced |
| --- | --- |
| `3eb3997` | Initial Thermal Reasoning Agent prototype, demonstration data, and Los Angeles map. |
| `15441c6` | Thermal colour/explanation corrections and a mobile block picker. |
| `6fd98dd` | Live FortyGuard thermal workflow with resilient polling and caching. |
| `a17a9f2` | Live thermal reasoning and server-side status handling. |
| `bf37e34` | Live causal-evidence integration for selected cells. |
| `feat: add guided heat validation experience` (current HEAD) | Live city heatmaps, clear signal summary, progressive evidence checks, same-day historical chart, optional persistence analysis, refined map UI, and this project documentation. |

## Current product capabilities

- **Live local anomaly:** compares every selected 100 m tile with its closest spatial controls.
- **Plain-language signal summary:** makes the local signal, scan rank, confidence, and next move visible before any technical detail.
- **Progressive investigation:** conditions first, then optional imagery; lengthy provider calls do not block the map.
- **Persistent-heat check:** assesses continuous time over 90°F / 32°C on the latest completed day.
- **Same-day history:** compares the selected place with three previous years and visually separates block thermal data from regional air temperature.
- **Transparent intervention scenario:** lets a user explore canopy and pavement assumptions without presenting them as a forecast.

The current feature batch is documented above by its stable commit subject; `git log -1 --oneline` shows its exact hash.
