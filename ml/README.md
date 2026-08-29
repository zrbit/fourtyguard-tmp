# Thermal Reasoning Agent — scientific reasoning agent (Phase 8)

XGBoost + SHAP model that explains block-level thermal anomalies, trained on
real FortyGuard data plus free supplementary sources. Standalone from the
Next.js app: this directory produces static JSON artifacts the app reads —
see `../.claude/plans` (or ask Claude) for the full plan this implements.

## Setup

```
py -3.11 -m venv ml/.venv
ml/.venv/Scripts/activate      # PowerShell: ml/.venv/Scripts/Activate.ps1
pip install -r ml/requirements.txt
```

Requires `FORTYGUARD_API_KEY` in a `.env.local` (or `.env`) at the repo
root — the same file/variable name the Next.js app uses
(`src/lib/fortyguard/client.ts`). Never commit this file.

## Pipeline order

1. `python -m src.collect.run_collection --dry-run` — print the AOI/date_time
   call plan and estimated credit cost. No network calls.
2. Pilot (do this first, manually, before the full run): fire one real
   `/heatmap` and one real `/satellite` call for a single AOI to confirm the
   response shape and actual credits deducted, since only Satellite's cost
   (~14,400/call) is confirmed going in — `/heatmap` and `/env_params` are
   not. Update `COST_ESTIMATES` in `src/collect/credit_ledger.py` once real
   numbers are known.
3. `python -m src.collect.run_collection --execute` — full collection, hard
   capped by the ledger. Every raw response is cached under `data/raw/` by
   request hash, so re-running never re-spends credits already spent.
4. `python -m src.features.build_dataset` — joins raw sources into
   `data/processed/dataset.parquet`.
5. `python -m src.train.train_xgboost` — trains `models/thermal_xgb_v1.json`
   (CPU only — see plan for why GPU/Colab/Kaggle isn't needed here).
6. `python -m src.train.explain_shap` — SHAP values + the sign-vs-
   monotone-constraint sanity check.
7. `python -m src.serve.export_for_app` — writes the static JSON the Next.js
   app reads (no Python at app runtime for this first pass).
