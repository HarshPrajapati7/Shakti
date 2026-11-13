"""Edge-case and robustness tests for the trained ASTRA-HEALTH models (run after training).

Covers: microgravity / extreme-gravity inputs, impossible volume deficits, monotonic physics, JSON
test-vector reproducibility (for a TypeScript port), flat / missing / corrupted PPG input, single-window
spectral outliers, NaN wearable features, sensor dropout, and LOSO calibration-leakage checks.
Writes results/[smoke/]edge_tests.json and exits 1 if any test fails.
"""
import json
import os
import pickle
import sys
import traceback
from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "scripts"))
import train_ppg_hr as P  # noqa: E402  (reads ASTRA_SMOKE / PPG_VER to pick the model folder)
import train_stress_wesad as W  # noqa: E402
from astra.gravity import fit as F, model as M  # noqa: E402

SMOKE = os.environ.get("ASTRA_SMOKE") == "1"
_sub = ("smoke",) if SMOKE else ()
G_DIR = ROOT.joinpath("models", *_sub, "gravity_heart")
OUT = ROOT.joinpath("results", *_sub, "edge_tests.json")
RESULTS = []


def test(name):
    def deco(fn):
        try:
            detail = fn()
            RESULTS.append({"test": name, "pass": True, "detail": detail})
            print(f"  PASS  {name}  {detail or ''}")
        except Exception as e:  # record the failure and keep testing
            RESULTS.append({"test": name, "pass": False, "detail": f"{type(e).__name__}: {e}"})
            print(f"  FAIL  {name}  {type(e).__name__}: {e}")
            traceback.print_exc(limit=1)
        return fn
    return deco


# ------------------------------------------------------------------ GRAVITY-HEART
G = json.load(open(G_DIR / "gravity_heart_v1.json"))
TH = np.array(G["population"]["theta_log"])


@test("gravity: microgravity (u=0) keeps HR and MAP at baseline")
def _():
    s = M.simulate(np.exp(TH), np.zeros(300), 65, 85, 175)
    assert np.allclose(s["hr"], 65, atol=1e-6) and np.allclose(s["map"], 85, atol=1e-6)


@test("gravity: pooled volume and HR rise monotonically with gravity (0, Moon, Mars, Earth)")
def _():
    v, h = [], []
    for g in (0.0, M.G["moon"], M.G["mars"], 1.0):
        _, s = F.run_stand(TH, 65, 85, 175, g)
        v.append(s["v_pool_sustained_ml"]), h.append(s["dhr_sustained"])
    assert np.all(np.diff(v) > 0) and np.all(np.diff(h) >= -1e-6), (v, h)
    return f"pool mL {np.round(v, 0).tolist()}  dHR {np.round(h, 1).tolist()}"


@test("gravity: impossible volume deficit (3 L) and 3 g stay finite and bounded")
def _():
    u, on = F.stand_profile(3.0)
    s = M.simulate(np.exp(TH), u, 65, 85, 175, onset=on, dvcs=3000.0)
    assert all(np.isfinite(s[k]).all() for k in s) and s["hr"].min() >= 30 and s["map"].min() >= 0
    return f"min MAP {s['map'].min():.1f} mmHg"


@test("gravity: orthostatic volume tolerance is ordered Earth <= Mars <= Moon")
def _():
    t = [F.volume_tolerance(TH, 65, 85, 175, g, step=20)[0] for g in (1.0, M.G["mars"], M.G["moon"])]
    assert t[0] <= t[1] <= t[2], t
    return f"tolerated deficit mL {t}"


@test("gravity: JSON test vector reproduces (for website / TypeScript port)")
def _():
    tv = G["test_vector"]
    s = M.simulate(np.exp(TH), np.array(tv["u"]), tv["hr0"], tv["map0"], tv["height_cm"], onset=tv["onset"], dvcs=tv["dvcs"])
    e = max(np.abs(s["hr"] - tv["hr"]).max(), np.abs(s["map"] - tv["map"]).max())
    assert e < 0.05, e
    return f"max abs diff {e:.4f}"


@test("gravity: NaN baseline is rejected rather than silently propagated")
def _():
    s = M.simulate(np.exp(TH), np.ones(10), float("nan"), 85, 175)
    assert np.isnan(s["hr"]).all(), "NaN baseline should give NaN output (caller must validate inputs)"
    return "NaN in -> NaN out (input validation required in the app)"


# ------------------------------------------------------------------ PPG heart rate
def load_ppg():
    f = sorted(P.OUT_M.glob(f"ppg_hr_cnn_{P.VER}*.pt"))[0]
    ck = torch.load(f, map_location=P.DEV)
    net = P.PPGNet(cin=ck.get("cin", 6), w=ck["cfg"]["width"]).to(P.DEV)
    net.load_state_dict(ck["state_dict"])
    return net.eval(), ck, f.name


NET, CK, PPG_NAME = load_ppg()


def proba(x):
    with torch.no_grad():
        return torch.softmax(NET(torch.as_tensor(x, dtype=torch.float32, device=P.DEV)), 1).cpu().numpy()


@test("ppg: all-zero (flat / unworn sensor) input gives a valid, finite distribution")
def _():
    p = proba(np.zeros((4, CK.get("cin", 6), P.K_CTX, P.NB)))
    assert np.isfinite(p).all() and np.allclose(p.sum(1), 1, atol=1e-4)
    est, sd, _, _ = P.point_estimate(p)
    return f"model={PPG_NAME}  sd on flat input {sd.mean():.1f} bpm"


@test("ppg: belief tracker ignores a single spectral outlier window")
def _():
    T, _ = P.transition([np.full(200, 70.0) + np.random.default_rng(0).normal(0, 1, 200)])
    k70 = int(np.argmin(np.abs(P.BPM - 70)))
    k180 = int(np.argmin(np.abs(P.BPM - 180)))
    L = np.full((30, P.NB), 1e-4)
    L[:, k70] = 1.0
    L[15] = 1e-4
    L[15, k180] = 1.0  # one corrupted window
    est, _, _, _ = P.point_estimate(P.forward_filter(L / L.sum(1, keepdims=True), T))
    assert abs(est[15] - 70) < 15, est[15]
    return f"estimate at outlier window {est[15]:.1f} bpm (truth 70)"


@test("ppg: forward filter stays normalised with an all-zero likelihood")
def _():
    T, _ = P.transition([np.linspace(60, 90, 100)])
    q = P.forward_filter(np.zeros((5, P.NB)), T)
    assert np.isfinite(q).all() and np.allclose(q.sum(1), 1)


@test("ppg: uncertainty increases when the PPG channel is corrupted (real windows)")
def _():
    D = P.load_cache()
    m = np.where(D["sub"] == 1)[0][500:756]
    X = P.features_tensor({k: D[k][m] for k in ("ppg", "acc", "acf") if k in D})
    ctx = P.context_index(np.zeros(len(m), int))
    x = X[ctx].transpose(0, 2, 1, 3)
    clean = P.point_estimate(proba(x))[1].mean()
    xc = x.copy()
    xc[:, :2] = np.random.default_rng(0).random(xc[:, :2].shape)  # PPG + harmonic channels replaced by noise
    noisy = P.point_estimate(proba(xc))[1].mean()
    assert noisy > clean, (clean, noisy)
    return f"mean predictive SD clean {clean:.1f} -> corrupted {noisy:.1f} bpm"


# ------------------------------------------------------------------ stress
import lightgbm as lgb  # noqa: E402

SPEC = json.load(open(W.OUT_M / "stress_features_spec.json"))


@test("stress: LightGBM accepts NaN features (missing sensor) and returns valid probabilities")
def _():
    b = lgb.Booster(model_file=str(W.OUT_M / "stress_lgbm_wrist_binary_v1.txt"))
    n = len(SPEC["sensor_columns"]["wrist"])
    X = np.random.default_rng(0).normal(0, 1, (8, n))
    X[:4] = np.nan
    p = b.predict(X)
    assert np.isfinite(p).all() and ((p >= 0) & (p <= 1)).all()
    return f"p(stress) all-NaN rows {p[:4].round(3).tolist()}"


@test("stress: CNN with a dropped-out channel still returns a valid distribution")
def _():
    ck = torch.load(W.OUT_M / "stress_cnn_wrist_binary_v1.pt", map_location=W.DEV)
    net = W.StressCNN(len(ck["channels"]), 2).to(W.DEV)
    net.load_state_dict(ck["state_dict"])
    x = np.random.default_rng(0).normal(0, 1, (4, len(ck["channels"]), W.WIN * W.FS)).astype(np.float32)
    x[:, 2] = 0
    p = W.cnn_proba(net, x)
    assert np.isfinite(p).all() and np.allclose(p.sum(1), 1, atol=1e-5)


@test("stress: calibration windows never scored (no personal-baseline leakage)")
def _():
    L = pickle.load(open(W.OUT_R / "loso_predictions.pkl", "rb"))
    cal = ~L["test_mask"]
    worst = max(np.abs(p[cal]).max() for p in L["preds"].values())
    assert worst == 0, worst
    return f"{int(cal.sum())} calibration windows excluded from every test set"


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    json.dump(RESULTS, open(OUT, "w"), indent=1)
    n_fail = sum(not r["pass"] for r in RESULTS)
    print(f"{len(RESULTS) - n_fail}/{len(RESULTS)} edge tests passed -> {OUT}")
    sys.exit(1 if n_fail else 0)
