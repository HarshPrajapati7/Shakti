"""Wait for PPG v3, pick the better heart-rate model (v2 vs v3, online LOSO MAE), then refresh every artefact:
edge tests -> paper figures/tables -> web data -> executed notebook -> web build.   Log: logs/finalize.txt
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable
log = open(ROOT / "logs" / "finalize.txt", "a", encoding="utf-8")


def say(m):
    log.write(f"[{time.strftime('%H:%M:%S')}] {m}\n"); log.flush()


def run(cmd, env=None, cwd=ROOT):
    say("run " + " ".join(map(str, cmd)))
    r = subprocess.run(cmd, cwd=cwd, env={**os.environ, "PYTHONIOENCODING": "utf-8", **(env or {})}, capture_output=True,
                       text=True, encoding="utf-8", errors="replace", shell=isinstance(cmd, str))
    say(f"exit {r.returncode}\n" + (r.stdout[-1500:] + r.stderr[-1500:]).strip())
    return r.returncode


v3 = ROOT / "results" / "ppg_hr_v3" / "metrics.json"
while not v3.exists():
    time.sleep(120)
time.sleep(240)  # final all-subject models + ONNX export are written after metrics.json
mae = {v: json.load(open(ROOT / "results" / d / "metrics.json"))["summary"]["cnn_hmm_online"]["mae_mean_over_subjects"]
       for v, d in (("v2", "ppg_hr_v2"), ("v3", "ppg_hr_v3"))}
best = min(mae, key=mae.get)
say(f"online MAE {mae} -> using {best}")
(ROOT / "results" / "ppg_best.json").write_text(json.dumps({"best": best, "online_mae": mae}))
env = {"PPG_VER": best, "ASTRA_PPG_DIR": "ppg_hr_" + best, "ASTRA_SMOKE": "0", "ASTRA_RUN_TRAINING": "0"}
run([PY, "scripts/run_pipeline.py", "--stages", "edge", "--ppg-ver", best], env)
run([PY, "scripts/make_figures.py"], env)
run([PY, "scripts/export_web_data.py"], env)
run([PY, "-m", "jupyter", "nbconvert", "--to", "notebook", "--execute", "--inplace", "--ExecutePreprocessor.timeout=1800",
     "--ExecutePreprocessor.kernel_name=astra-health", "notebooks/ASTRA_HEALTH_training.ipynb"], env)
run("npm run build", cwd=ROOT / "apps" / "web")
say("FINALIZE DONE")
