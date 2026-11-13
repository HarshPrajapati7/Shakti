# AGENTS.md — ASTRA-HEALTH

NASA Space Apps 2026 "Health Monitoring Software for Astronauts". Python research pipeline + React dashboard.
Windows, PowerShell. Python 3.9 venv at `.venv` (CUDA torch 2.2.2, RTX 4050 6 GB). Node 22.

## Commands (run from repo root unless noted)
- Smoke test, all stages, ~3 min: `.\.venv\Scripts\python.exe scripts\run_pipeline.py --smoke`
- Full training: `.\.venv\Scripts\python.exe scripts\run_pipeline.py [--stages gravity,ppg,stress,edge] [--ppg-ver v1|v2|v3]`
- Edge-case tests only: `... run_pipeline.py --stages edge`. They must report 13/13.
- Paper figures/tables: `.\.venv\Scripts\python.exe scripts\make_figures.py` → `reports/figures`, `reports/tables`
- Web data export: `.\.venv\Scripts\python.exe scripts\export_web_data.py` → `apps/web/public/data`
- Notebook: `python scripts/build_notebook.py` regenerates it. Kernel `astra-health`. Set env `ASTRA_RUN_TRAINING=0` to only plot.
- Web (in `apps/web`): `npm run dev` · `npm run build` (tsc + vite) · `npx vitest run` (TS twin must match the Python test vector)

## Layout
- `src/astra/gravity/` GRAVITY-HEART: `prcp.py` data, `model.py` numba ODE, `fit.py` fitting/ablation/scenarios
- `scripts/train_*.py` one script per module. `ASTRA_SMOKE=1` writes to `models/smoke`, `results/smoke`
- `models/` deployable artefacts · `results/` metrics + LOSO predictions · `data/` raw + caches (gitignored)
- `apps/web/src/lib/gravity.ts` is an exact port of `model.py`. Change both together and keep `gravity.test.ts` green.

## Rules
- Evaluation is always subject-wise (LOSO / leave-one-maneuver-out). Never random-split windows.
- WESAD calibration windows (first 5 min of rest) are never scored. `lgbm_subject_z` is transductive: report it as a reference only.
- Moon/Mars outputs are simulations: label them so in UI and text. Telemetry in the console is simulated. Model results are real.
- Never report smoke-mode numbers. Never invent metrics. Read them from `results/*/metrics.json`.
- UI: one palette (`src/index.css` @theme). Status colours only for status. No icon tiles, gradients-as-decoration or nested cards.

## Gotchas
- PowerShell: no `&&` and no inline multi-line `python -c`. Write a temp script and delete it after.
- Console output on Windows is cp1252. Avoid non-ASCII in Python prints (use `+/-`, not `±`).
- three.js strips `:` from bone names (`mixamorig:Hips` → `mixamorigHips`).
- `torch` CUDA losses need int64 labels (`dtype=torch.long`).
- The cardioresp dataset's 3 Hz BP is not usable (uncalibrated, aliased). Do not build models on it.

## Status (keep updated)
- Done: GRAVITY-HEART, PPG v1/v2, WESAD stress, edge tests, figures, notebook, dashboard (home + 5 console pages).
- Running: PPG v3 (autocorrelation channels). `scripts/finalize.py` picks the best of v2/v3 and refreshes everything. Log: `logs/finalize.txt`.
