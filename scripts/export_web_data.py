"""Export compact JSON for the web dashboard -> apps/web/public/data/  (run after training / make_figures)."""
import json
import os
import shutil
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RES, OUT = ROOT / "results", ROOT / "apps" / "web" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)
PPG = os.environ.get("ASTRA_PPG_DIR") or next(v for v in ("ppg_hr_v3", "ppg_hr_v2", "ppg_hr") if (RES / v / "metrics.json").exists())


def dump(obj, name):
    (OUT / name).write_text(json.dumps(obj, separators=(",", ":")))
    print(f"  {name} {(OUT / name).stat().st_size / 1e3:.0f} kB")


# GRAVITY-HEART: model parameters + per-subject twins (no covariance) + scenario summaries
g = json.load(open(ROOT / "models" / "gravity_heart" / "gravity_heart_v1.json"))
sc = json.load(open(RES / "gravity_heart" / "scenarios.json"))
twins = []
for i, (sid, p) in enumerate(g["personal"].items()):
    env = sc[sid]["environments"]
    twins.append({"id": sid, "label": f"Crew twin {i + 1:02d}", "sex": p["sex"], "age": p["age"], "height_cm": p["height_cm"],
                  "weight_kg": p["weight_kg"], "hr0": round(p["hr0"], 1), "map0": round(p["map0"], 1),
                  "theta": [round(v, 5) for v in p["theta_log"]], "plasma_volume_ml": round(sc[sid]["plasma_volume_ml"]),
                  "tolerance_ml": {e: env[e]["volume_tolerance_ml"] for e in env}})
dump({"params": g["params"], "units": g["units"], "fixed": g["fixed"], "thresholds": g["thresholds"],
      "population_theta": [round(v, 5) for v in g["population"]["theta_log"]], "twins": twins,
      "test_vector": {k: (np.round(v, 4).tolist() if isinstance(v, list) else v) for k, v in g["test_vector"].items()}},
     "gravity.json")

gm = json.load(open(RES / "gravity_heart" / "metrics.json"))["summary"]
pm = json.load(open(RES / PPG / "metrics.json"))
sm = json.load(open(RES / "stress" / "metrics.json"))["results"]
lat = {}
lt = ROOT / "reports" / "tables" / "live_inference_latency.csv"
if lt.exists():
    for line in lt.read_text().splitlines()[1:]:
        k, v = line.rsplit(",", 1)
        lat[k.strip('"')] = float(v)
dump({"gravity": {m: {"rmse_hr": gm[m]["rmse_hr"]["mean"], "rmse_map": gm[m]["rmse_map"]["mean"]} for m in gm},
      "ppg": {"version": PPG, "online_mae": pm["summary"]["cnn_hmm_online"]["mae_mean_over_subjects"],
              "offline_mae": pm["summary"]["cnn_hmm_offline"]["mae_mean_over_subjects"],
              "classical_mae": pm["summary"]["tracker"]["mae_mean_over_subjects"],
              "coverage90": pm["uncertainty"].get("cov90_conformal"), "by_activity": pm["by_activity"]},
      "stress": {k: {"f1": v["macro_f1"], "bal_acc": v["bal_acc"], "auroc": v["auroc"]} for k, v in sm.items()},
      "latency": lat}, "metrics.json")
shutil.copy(RES / PPG / "demo_trace.json", OUT / "ppg_trace.json")
shutil.copy(RES / "stress" / "demo_trace.json", OUT / "stress_trace.json")
print("  copied traces")
