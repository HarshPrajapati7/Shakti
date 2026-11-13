"""ASTRA-HEALTH training pipeline runner.

  python scripts/run_pipeline.py --smoke                 # ~5 min: every stage on a tiny subset (no real results)
  python scripts/run_pipeline.py                         # full: GRAVITY-HEART + PPG v2 + WESAD stress
  python scripts/run_pipeline.py --stages ppg --ppg-ver v1

Stages: check -> prepare -> gravity -> ppg -> stress -> edge.  Each stage runs in its own process; the
runner stops at the first failure and prints the log tail. Smoke outputs go to models/smoke and results/smoke.
"""
import argparse
import importlib
import json
import os
import subprocess
import sys
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable
RAW = ROOT / "data" / "raw"
DEPS = ["numpy", "scipy", "pandas", "sklearn", "matplotlib", "torch", "wfdb", "numba", "lightgbm"]
SOURCES = {  # dataset -> (zip candidates, required members regex description)
    "prcp": [RAW / "downloads" / "prcp-1.0.0.zip", ROOT.parent / "prcp-1.0.0.zip", RAW / "prcp-1.0.0.zip"],
    
    "ppg": [RAW / "downloads" / "PPG_DaLiA.zip", ROOT.parent / "ppg+dalia.zip"],
    "wesad": [RAW / "downloads" / "WESAD.zip", ROOT.parent / "WESAD.zip"],
}
CACHES = {"ppg": ROOT / "data" / "processed" / "ppg_dalia_spec.npz", "wesad": ROOT / "data" / "processed" / "wesad_4hz.pkl"}
URLS = {"prcp": "https://physionet.org/content/prcp/1.0.0/",
        
        "ppg": "https://uni-siegen.sciebo.de/s/pfHzlTepXkiJ4jP  (or https://archive.ics.uci.edu/dataset/495/ppg+dalia)",
        "wesad": "https://uni-siegen.sciebo.de/s/HGdUkoNlW1Ub0Gx"}


def find(name):
    return next((p for p in SOURCES[name] if p.exists()), None)


def stage_check(a):
    bad = []
    for m in DEPS:
        try:
            importlib.import_module(m)
        except Exception as e:  # report every missing dependency at once
            bad.append(f"{m}: {e}")
    if bad:
        raise SystemExit("Missing dependencies (pip install -r requirements.txt):\n  " + "\n  ".join(bad))
    import torch
    print(f"  python {sys.version.split()[0]}  torch {torch.__version__}  cuda={torch.cuda.is_available()}"
          + (f" ({torch.cuda.get_device_name(0)})" if torch.cuda.is_available() else "  -> deep models will run on CPU (slow)"))
    for n in SOURCES:
        p = find(n)
        cached = n in CACHES and CACHES[n].exists()
        status = f"OK  {p}" if p else ("cache only" if cached else f"MISSING -> run scripts/download_data.py ({URLS[n]})")
        print(f"  {n:10s} {status}")
        if p is None and not cached and n in a.need:
            raise SystemExit(f"Dataset '{n}' not found. Download from {URLS[n]} and place it in {ROOT.parent}")


def stage_prepare(a):
    for n, sub in (("prcp", "prcp"),):
        dst = RAW / sub
        if any(dst.rglob("*.hea")) or any(dst.rglob("*.csv")):
            print(f"  {n}: already extracted")
            continue
        p = find(n)
        print(f"  {n}: extracting {p.name}")
        zipfile.ZipFile(p).extractall(dst)
    for n, pat in (("ppg", "PPG_FieldStudy/S{}/S{}.pkl"), ("wesad", "WESAD/S{}/S{}.pkl")):
        if CACHES[n].exists() or n not in a.need:
            print(f"  {n}: preprocessed cache present" if CACHES[n].exists() else f"  {n}: not needed")
            continue
        names = set(zipfile.ZipFile(find(n)).namelist())
        subs = range(1, 16) if n == "ppg" else [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17]
        miss = [s for s in subs if pat.format(s, s) not in names]
        if miss:
            raise SystemExit(f"{n}: archive is missing subjects {miss} (incomplete download?)")
        print(f"  {n}: all {len(subs)} subject files present in archive (cache is built on first training run)")


def run_script(name, script, env_extra, log):
    env = {**os.environ, **env_extra, "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8"}
    t0 = time.time()
    with open(log, "w", encoding="utf-8") as f:
        p = subprocess.Popen([PY, str(ROOT / "scripts" / script)], cwd=ROOT, env=env, stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
        for line in p.stdout:
            f.write(line)
            if not line.startswith("    ep "):
                print("   |", line.rstrip())
        p.wait()
    if p.returncode != 0:
        raise SystemExit(f"Stage '{name}' failed (exit {p.returncode}); full log: {log}")
    return time.time() - t0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true", help="tiny end-to-end run to catch dependency / code errors")
    ap.add_argument("--stages", default="check,prepare,gravity,ppg,stress,edge")
    ap.add_argument("--ppg-ver", default="v2", choices=["v1", "v2"])
    a = ap.parse_args()
    stages = a.stages.split(",")
    a.need = [n for n, s in (("prcp", "gravity"), ("ppg", "ppg"), ("wesad", "stress")) if s in stages]
    env = {"ASTRA_SMOKE": "1" if a.smoke else "0", "PPG_VER": a.ppg_ver}
    (ROOT / "logs").mkdir(exist_ok=True)
    (ROOT / "data" / "processed").mkdir(parents=True, exist_ok=True)
    tag = "smoke_" if a.smoke else ""
    timings = {}
    print(f"ASTRA-HEALTH pipeline  mode={'SMOKE' if a.smoke else 'FULL'}  stages={stages}")
    for st in stages:
        print(f"\n== {st}")
        t0 = time.time()
        if st == "check":
            stage_check(a)
        elif st == "prepare":
            stage_prepare(a)
        else:
            script = {"gravity": "train_gravity_heart.py", "ppg": "train_ppg_hr.py", "stress": "train_stress_wesad.py",
                      "edge": "edge_tests.py"}[st]
            run_script(st, script, env, ROOT / "logs" / f"{tag}{st}.log")
        timings[st] = round(time.time() - t0, 1)
        print(f"   done in {timings[st]:.0f}s")
    out = ROOT / "results" / ("smoke" if a.smoke else "") / "pipeline_run.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    json.dump({"mode": "smoke" if a.smoke else "full", "ppg_ver": a.ppg_ver, "stages": timings,
               "finished": time.strftime("%Y-%m-%d %H:%M:%S")}, open(out, "w"), indent=1)
    print(f"\nPIPELINE OK  ({sum(timings.values()) / 60:.1f} min)  summary -> {out}")


if __name__ == "__main__":
    main()
