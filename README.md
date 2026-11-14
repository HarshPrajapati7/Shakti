# Sakti

**Astronaut health monitoring software by Team Star Busters** (NASA Space Apps 2026).

## Desktop app
```powershell
.\build-app.ps1        # builds the UI and the native Tauri app -> sakti.exe
```
The app opens with a loading screen, offers a 14-day sample crew record, and runs every model natively (Rust).


**Mission health intelligence for astronauts far from a doctor.** NASA Space Apps Challenge 2026: *Create Health Monitoring Software for Astronauts on Space Missions*.

ASTRA-HEALTH learns each astronaut's own normal, and shows what is changing and what to do next. At its centre is **GRAVITY-HEART**, a personalised, physics-based twin of the circulation. It predicts how an astronaut's blood pressure will respond to standing up after months in weightlessness, on the Moon, on Mars or back on Earth.

| Module | What it does | Data (real) | Result (people never seen in training) |
|---|---|---|---|
| GRAVITY-HEART | Personal hydrostatic + baroreflex circulation model, gravity scenarios, countermeasures | PhysioNet PRCP, 10 subjects, 59 maneuvers | Personalised error 6.21 bpm / 6.26 mmHg vs 8.05 / 7.61 population (p = 0.002 / 0.010) |
| PPG-HR | Wrist heart rate under motion, with calibrated uncertainty | PPG-DaLiA, 15 subjects | 4.46 bpm MAE real-time, 3.82 offline (classical 13.95) |
| STRESS | Physiological stress vs personal rest baseline | WESAD, 15 subjects | macro-F1 0.952 chest, 0.919 wrist (Schmidt et al. 2018: 0.912) |

All numbers come from `results/*/metrics.json`. Full tables are in `reports/tables`, figures in `reports/figures`.

## Quick start
```powershell
py -3.9 -m venv --system-site-packages .venv          # needs CUDA torch 2.2.2 (see requirements.txt)
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts\run_pipeline.py --smoke   # 3-minute check that everything runs
.\.venv\Scripts\python.exe scripts\run_pipeline.py           # full training (~3-4 h on an RTX 4050)
cd apps\web; npm install; npm run dev                        # dashboard at http://localhost:5173
```
Datasets are found automatically in this folder or its parent: `prcp-1.0.0.zip`, `cardioresp-response-orthostat-1.0.zip`, `ppg+dalia.zip`, `WESAD.zip`.

## Repository
```
src/astra/gravity/     GRAVITY-HEART model, data pipeline, fitting
scripts/               run_pipeline, train_*, edge_tests, make_figures, export_web_data, build_notebook
notebooks/             ASTRA_HEALTH_training.ipynb (runnable, judge-facing)
models/  results/      trained artefacts (.json/.pt/.onnx/.txt) and metrics
reports/               paper-ready figures (PNG + PDF) and tables (CSV + LaTeX)
apps/web/              React + Vite + Tailwind + shadcn/ui + react-three-fiber dashboard
```

## Evaluation protocol
Leave-one-subject-out for PPG-DaLiA and WESAD. Leave-one-maneuver-out, with a hierarchical prior from *other* subjects, for GRAVITY-HEART personalisation. Simple baselines are reported next to every model, alongside 13 edge-case tests and a TypeScript/Python numerical equivalence test.

## Limitations
- GRAVITY-HEART was fitted on ground subjects at 1 g. Moon, Mars and post-flight results are simulations that extrapolate the fitted physics.
- PPG-DaLiA and WESAD are terrestrial cohorts.
- The console's mission telemetry is simulated and labelled as such. ASTRA-HEALTH is decision support, not a medical device.

## Credits
NASA Human Research Program hazard and risk framework · Hero video: *Earth Views from the ISS*, NASA (public domain) · PhysioNet PRCP (Heldt et al.) · PPG-DaLiA (Reiss et al., CC BY 4.0) · WESAD (Schmidt et al., non-commercial research use) · Body model: three.js examples (Mixamo Xbot).
