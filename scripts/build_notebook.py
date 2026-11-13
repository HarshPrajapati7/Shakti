"""Build notebooks/ASTRA_HEALTH_training.ipynb (run: python scripts/build_notebook.py)."""
from pathlib import Path

import nbformat as nbf

ROOT = Path(__file__).resolve().parents[1]
C = []


def md(s):
    C.append(nbf.v4.new_markdown_cell(s.strip()))


def code(s):
    C.append(nbf.v4.new_code_cell(s.strip()))


md(r"""
# ASTRA-HEALTH — training & evaluation notebook
**NASA Space Apps 2026 · Create Health Monitoring Software for Astronauts on Space Missions**

This notebook trains and evaluates every model behind the ASTRA-HEALTH dashboard, then stress-tests them.
Every number below is computed from held-out subjects (subject-wise cross-validation). Nothing is synthetic, except the
Moon/Mars scenarios, which are labelled as *simulations*.

| NASA HRP hazard ([hazards](https://www.nasa.gov/hrp/hazards/), [risks](https://www.nasa.gov/hrp/risks/)) | Health indicator | ASTRA-HEALTH module | Training data |
|---|---|---|---|
| Altered gravity fields → orthostatic intolerance after landing | HR, blood pressure on standing | **GRAVITY-HEART** gravity-driven physiological digital twin | PhysioNet PRCP (tilt-table + active stand, 10 subjects) |
| Hostile closed environment / workload → continuous cardiac monitoring | Heart rate from a wrist wearable under motion | **PPG-HR** spectro-temporal CNN + belief tracking | PPG-DaLiA (15 subjects, ECG reference) |
| Isolation & confinement → behavioural health | Physiological stress state | **STRESS** personal-baseline classifier | WESAD (15 subjects, TSST stress protocol) |
| Space radiation | Cumulative dose (external dosimeter, see [CSA radiation monitoring](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp)) | dashboard input, not a learned model | — |

Further context: [ongoing HRP research](https://www.nasa.gov/hrp/ongoing-hrp-research/) ·
[why experiments in space (CSA)](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp).
The NASA/CSA pages are the risk framework. They are not labelled training datasets.

**Evaluation rules used throughout:** leave-one-subject-out (or leave-one-maneuver-out for personalisation),
no window from a test subject is ever seen in training, the personal-calibration segment is never scored,
and simple baselines are reported next to every deep model.
""")

code(r"""
# ---- configuration -------------------------------------------------------------
import os, sys, json, pickle, subprocess
from pathlib import Path
SMOKE = os.environ.get("ASTRA_SMOKE", "0") == "1"   # True = tiny 2-minute check run, False = real training
RUN_TRAINING = os.environ.get("ASTRA_RUN_TRAINING", "1") == "1"  # False = only load saved results
ROOT = Path.cwd().parent if Path.cwd().name == "notebooks" else Path.cwd()
PPG_VER = os.environ.get("PPG_VER", json.load(open(ROOT / "results" / "ppg_best.json"))["best"] if (ROOT / "results" / "ppg_best.json").exists() else "v2")  # best heart-rate model
sys.path.insert(0, str(ROOT / "src")); sys.path.insert(0, str(ROOT / "scripts"))
SUB = ("smoke",) if SMOKE else ()
R = lambda *p: ROOT.joinpath("results", *SUB, *p)
Mdir = lambda *p: ROOT.joinpath("models", *SUB, *p)
PPG_DIR = {"v1": "ppg_hr", "v2": "ppg_hr_v2", "v3": "ppg_hr_v3"}[PPG_VER]
import numpy as np, pandas as pd, matplotlib.pyplot as plt
pd.set_option("display.precision", 3); plt.rcParams.update({"figure.dpi": 110, "axes.grid": True, "grid.alpha": .3})
print(f"ROOT={ROOT}\nmode={'SMOKE' if SMOKE else 'FULL'}  run_training={RUN_TRAINING}  ppg={PPG_VER}")
""")

md("## 1. Environment, data integrity and training run\n"
   "The runner checks dependencies, the GPU and every dataset archive (all subject files present), then trains each "
   "module in its own process and runs the edge-case suite. Full run on an RTX 4050: GRAVITY-HEART ~3 min, "
   "PPG v2 ~2 h, WESAD ~25 min.")

code(r"""
def run(args):
    env = {**os.environ, "ASTRA_SMOKE": "1" if SMOKE else "0", "PPG_VER": PPG_VER, "PYTHONIOENCODING": "utf-8"}
    p = subprocess.Popen([sys.executable, str(ROOT / "scripts" / "run_pipeline.py"), *args], cwd=ROOT, env=env,
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    for line in p.stdout:
        print(line, end="")
    assert p.wait() == 0, "pipeline stage failed - see the log printed above"

run((["--smoke"] if SMOKE else []) + ["--ppg-ver", PPG_VER] +
    ([] if RUN_TRAINING else ["--stages", "check,prepare"]))
""")

md(r"""
## 2. GRAVITY-HEART — gravity-driven cardiovascular digital twin
**Question:** can a small, physics-based model personalised to one person predict that person's heart-rate and
blood-pressure response to a gravity change, here a head-up tilt or standing up, better than a population model?

Model (11 learnable parameters, `src/astra/gravity/model.py`): the axial gravity load
$u = (g/g_\oplus)\sin\theta$ pools venous blood ($\Delta V = C\,\rho g h\,u$) and drives slow capillary
filtration. This reduces central volume and stroke volume (Frank–Starling curve), so
$\text{MAP} = \text{MAP}_0\,\tfrac{HR}{HR_0}\tfrac{SV}{SV_0}\tfrac{TPR}{TPR_0}$. A carotid baroreflex, which sees
$\text{MAP}$ plus its own hydrostatic offset, and a cardiopulmonary reflex feed back through saturating effectors.
Parameters are fitted by robust MAP estimation with a log-normal prior. The uncertainty bands come from the
Laplace posterior plus the residual noise.

**Ablation (all scored on maneuvers that were not used to fit):**
`Z` zero-response · `E0` population data-driven FIR (ridge) · `E1` population physics model ·
`E2` personalised (weak prior) · `E3` personalised with a hierarchical prior from *other* subjects · `E3_1cal` E3 from a single calibration maneuver.
""")

code(r"""
gm = json.load(open(R("gravity_heart", "metrics.json")))
S = gm["summary"]
rows = {m: {"RMSE HR (bpm)": S[m]["rmse_hr"]["mean"], "RMSE MAP (mmHg)": S[m]["rmse_map"]["mean"],
            "|err| plateau dHR": S[m]["abserr_dhr_plateau"]["mean"], "|err| plateau dMAP": S[m]["abserr_dmap_plateau"]["mean"],
            "|err| initial MAP nadir": S[m]["abserr_dmap_nadir30"]["mean"],
            "90% PI coverage HR/MAP": (f"{S[m]['cov90_hr']:.2f}/{S[m]['cov90_map']:.2f}" if "cov90_hr" in S[m] else "")}
        for m in ["Z", "E0", "E1", "E2", "E3", "E3_1cal"]}
display(pd.DataFrame(rows).T)
print(f"{gm['n_maneuvers']} maneuvers {gm['kinds']} from {len(gm['subjects'])} subjects; dropped (quality): {len(gm['dropped'])}")
display(pd.DataFrame(gm["tests"]).T.rename(columns={"mean_diff": "mean RMSE diff", "wilcoxon_p": "Wilcoxon p (paired by subject)"}))
""")

code(r"""
from astra.gravity import fit as F, model as M
G = pickle.load(open(Mdir("gravity_heart", "gravity_heart_v1.pkl"), "rb"))
mans, full = G["mans"], G["full"]
subs = sorted({d["subject"] for d in mans})
s = subs[0]; te = [d for d in mans if d["subject"] == s]
d = next(x for x in te if x["kind"] == "stand"); cal = [x for x in te if x is not d]
th_pop = F.fit([x for x in mans if x["subject"] != s])[0]
mu, sd = F.hier_prior([full[o] for o in subs if o != s])
th3, cov3, obs3 = F.fit(cal, mu=mu, sd=sd, x0=mu)
pi = F.interval(th3, cov3, obs3, d); p1, p3 = F.sim_man(th_pop, d), F.sim_man(th3, d)
fig, ax = plt.subplots(1, 2, figsize=(12, 3.6))
for j, k in enumerate(["hr", "map"]):
    ax[j].fill_between(d["t"], pi[0, j], pi[2, j], color="tab:blue", alpha=.2, label="E3 90% interval")
    ax[j].plot(d["t"], d[k], "k", lw=1, label="measured"); ax[j].plot(d["t"], p1[k], "--", c="tab:orange", label="E1 population")
    ax[j].plot(d["t"], p3[k], c="tab:blue", label="E3 personalised"); ax[j].axvspan(0, d["dur"], color="grey", alpha=.08)
    ax[j].set_xlabel("s from stand-up"); ax[j].set_ylabel(["HR (bpm)", "MAP (mmHg)"][j])
ax[0].legend(fontsize=8); fig.suptitle(f"Held-out active stand, subject {s} (model never saw this maneuver)"); plt.tight_layout()
""")

md(r"""
### Gravity-transition scenarios (simulation, clearly *not* validated in reduced gravity)
For each subject's personalised twin we simulate a 4-minute stand at Earth, Mars (0.38 g) and Moon (0.17 g), before
flight and after flight. "After flight" assumes a 12 % plasma-volume loss, NASA's technical brief cites roughly 15 % intravascular loss.
We also test two countermeasures: 250 mL fluid loading, and lower-body compression that cuts venous capacitance by 40 %.
*Orthostatic volume tolerance* is the largest central-volume deficit that still avoids consensus orthostatic-hypotension
thresholds, converted to MAP-equivalents. It is the dashboard's **Mission Health Margin** for the cardiovascular domain.
""")

code(r"""
sc = json.load(open(R("gravity_heart", "scenarios.json")))
tab = pd.DataFrame({s_: {e: v["volume_tolerance_ml"] for e, v in sc[s_]["environments"].items()} for s_ in sc}).T
tab["PV loss 12% (mL)"] = [0.12 * sc[s_]["plasma_volume_ml"] for s_ in tab.index]
for e in ["earth", "mars", "moon"]:
    tab[f"margin {e} after flight (mL)"] = tab[e] - tab["PV loss 12% (mL)"]
display(tab.round(0)); print("Negative margin = this person is predicted to develop orthostatic hypotension at that gravity after flight.")
s0 = list(sc)[0]; fig, ax = plt.subplots(1, 3, figsize=(13, 3.3), sharey=True)
for a, e in zip(ax, ["earth", "mars", "moon"]):
    for cname, c in sc[s0]["environments"][e]["cases"].items():
        a.plot(np.arange(len(c["trace"]["map"])) * 2 - 60, c["trace"]["map"], label=cname.replace("postflight_", "post: "))
    a.set_title(f"{e} ({sc[s0]['environments'][e]['g_ratio']:.2f} g)"); a.set_xlabel("s from stand")
ax[0].set_ylabel("MAP at heart (mmHg)"); ax[0].legend(fontsize=7); plt.suptitle(f"SIMULATION — subject {s0}"); plt.tight_layout()
""")

md(r"""
## 3. PPG-HR — wrist heart rate under motion (PPG-DaLiA)
Protocol (Reiss et al. 2019): 8 s windows with a 2 s shift, ECG-derived reference, leave-one-subject-out over 15 subjects.
The model is a spectro-temporal CNN over 22 s of PPG and accelerometer spectra. It outputs a *probability distribution* over
heart-rate bins, which is tracked with an HMM (BeliefPPG-style belief propagation). **Online** means causal, which is what
the device can do in real time; **offline** means forward-backward smoothing for post-hoc review. The 90 % intervals use
cross-subject split-conformal calibration.
""")

code(r"""
pm = json.load(open(R(PPG_DIR, "metrics.json")))
t = pd.DataFrame({k: {"MAE (bpm)": v["mae_mean_over_subjects"], "MAE sd over subjects": v["mae_sd_over_subjects"],
                      "RMSE (bpm)": v["rmse_mean_over_subjects"]} for k, v in pm["summary"].items()}).T
t.loc["published: DeepPPG (Reiss 2019)", "MAE (bpm)"] = 7.65
t.loc["published: BeliefPPG online (Bieri 2023)", "MAE (bpm)"] = 3.57
display(t); display(pd.Series(pm["uncertainty"], name="uncertainty / calibration"))
display(pd.DataFrame(pm["by_activity"]).T.rename(columns={"tracker": "classical MAE", "online": "ours MAE"}))
""")

code(r"""
L = pickle.load(open(R(PPG_DIR, "loso_predictions.pkl"), "rb"))
y = np.concatenate([v["y"] for v in L.values()]); e = np.concatenate([v["online"] for v in L.values()])
sdv = np.concatenate([v["sd"] for v in L.values()])
fig, ax = plt.subplots(1, 3, figsize=(14, 3.6))
m_, df_ = (y + e) / 2, e - y; b, l = df_.mean(), 1.96 * df_.std()
ax[0].scatter(m_, df_, s=1, alpha=.15); [ax[0].axhline(v, c=c, ls="--") for v, c in ((b, "k"), (b - l, "r"), (b + l, "r"))]
ax[0].set(title=f"Bland-Altman (bias {b:.2f}, LoA ±{l:.1f} bpm)", xlabel="mean of ECG & PPG HR", ylabel="PPG - ECG")
q = np.linspace(0, .5, 11); ax[1].plot(q * 100, [np.abs(df_[sdv <= np.quantile(sdv, 1 - qq)]).mean() for qq in q], "o-")
ax[1].set(title="selective prediction: reject most uncertain", xlabel="% windows rejected", ylabel="MAE (bpm)")
dt = json.load(open(R(PPG_DIR, "demo_trace.json"))); tm = np.array(dt["t_s"]) / 60
ax[2].fill_between(tm, dt["lo_conf"], dt["hi_conf"], alpha=.25, label="90% conformal"); ax[2].plot(tm, dt["y"], "k", lw=.8, label="ECG")
ax[2].plot(tm, dt["online"], lw=.8, label="ours (online)"); ax[2].set(title=f"subject S{dt['subject']}", xlabel="min", ylabel="bpm")
ax[2].legend(fontsize=7); plt.tight_layout()
""")

md(r"""
## 4. STRESS — physiological stress detection (WESAD)
Baseline vs TSST stress vs amusement; 60 s windows with a 5 s shift; leave-one-subject-out. Each subject's **first 5 minutes
of rest are a personal calibration**, standing in for a pre-flight baseline. Those windows are removed from every test set.
* `lgbm_population`: 52 handcrafted HRV/EDA/respiration/temperature/motion features, LightGBM.
* `lgbm_personal`: the same features expressed relative to the person's calibration median (deployable).
* `cnn_personal`: multimodal 1-D CNN on baseline-referenced 4 Hz streams (deployable).
* `lgbm_subject_z`: z-scores each subject using *all* of their windows, test windows included. This is transductive and common in the
  literature, so it is shown **only as an optimistic upper reference**. It cannot run online.
""")

code(r"""
sm = json.load(open(R("stress", "metrics.json")))
rr = pd.DataFrame({k: {"macro-F1": v["macro_f1"], "F1 sd": v["macro_f1_sd"], "balanced acc": v["bal_acc"], "AUROC": v["auroc"]}
                   for k, v in sm["results"].items()}).T
rr.index = pd.MultiIndex.from_tuples([tuple(i.split("|")) for i in rr.index], names=["task", "sensors", "model"])
display(rr.style.format("{:.3f}").highlight_max(subset=["macro-F1"], color="#cde"))
print("Published reference (Schmidt et al. 2018, LOSO, chest+wrist): binary F1 0.912, 3-class F1 0.723")
""")

code(r"""
from sklearn.metrics import confusion_matrix
SP = pickle.load(open(R("stress", "loso_predictions.pkl"), "rb")); tm_ = SP["test_mask"] & np.isin(SP["sub"], sorted(set(SP["sub"][SP["test_mask"]])))
deploy = [k for k in sm["results"] if k.startswith("binary") and "subject_z" not in k]
best = max(deploy, key=lambda k: sm["results"][k]["macro_f1"]); P_ = SP["preds"][best]
ok = tm_ & (P_.sum(1) > 0); yt = (SP["y"][ok] == 2).astype(int)
fig, ax = plt.subplots(1, 2, figsize=(10, 3.4))
cm = confusion_matrix(yt, P_[ok].argmax(1), normalize="true"); ax[0].imshow(cm, cmap="Blues", vmin=0, vmax=1)
[ax[0].text(j, i, f"{cm[i, j]:.2f}", ha="center") for i in range(2) for j in range(2)]
ax[0].set(xticks=[0, 1], yticks=[0, 1], xticklabels=["non-stress", "stress"], yticklabels=["non-stress", "stress"], title=best)
ps = sm["results"][best]["per_subject"]; ax[1].bar(range(len(ps)), [p["macro_f1"] for p in ps]); ax[1].set(title="per held-out subject", ylabel="macro-F1")
plt.tight_layout()
""")

md("## 5. Edge cases & robustness\nMicrogravity, extreme gravity, impossible volume deficits, physical monotonicity, website test-vector "
   "reproducibility, flat/unworn PPG, single-window outliers, corrupted PPG (uncertainty must rise), NaN features, "
   "sensor dropout, and calibration-leakage checks.")

code(r"""
et = pd.DataFrame(json.load(open(R("edge_tests.json"))))
display(et.style.apply(lambda r: ["background:#dfd" if r["pass"] else "background:#fdd"] * len(r), axis=1))
assert et["pass"].all(), "an edge-case test failed"
""")

md("## 6. Saved models for the website\nAll artefacts are under `models/`. GRAVITY-HEART is a single JSON file (parameters, "
   "priors, thresholds and a numerical test vector), so the simulator can be ported to TypeScript and checked exactly. "
   "PPG and stress networks are exported as PyTorch `.pt` and ONNX, for `onnxruntime-web`.")

code(r"""
inv = [(str(p.relative_to(ROOT)), round(p.stat().st_size / 1e6, 2)) for p in sorted(Mdir().rglob("*"))
       if p.is_file() and "folds" not in p.parts]
display(pd.DataFrame(inv, columns=["file", "MB"]))
""")

md(r"""
## 7. Limitations (state these in the pitch)
* GRAVITY-HEART is fitted on 10 healthy ground subjects. Moon/Mars/post-flight outputs **extrapolate** the fitted physics
  and are simulations, not predictions validated in reduced gravity. Validating them needs NASA bed-rest or flight data
  from the NASA Life Sciences Data Archive or OSDR.
* PPG-DaLiA and WESAD are terrestrial cohorts of 15 people. They show that the sensing models work on unseen people, not in space.
* Outputs are decision support with uncertainty. They are not a diagnosis. Alerts must be confirmed with a cuff and ECG and follow flight-surgeon protocols.
""")

nb = nbf.v4.new_notebook(cells=C, metadata={"kernelspec": {"name": "astra-health", "display_name": "ASTRA-HEALTH (.venv)"}})
out = ROOT / "notebooks" / "ASTRA_HEALTH_training.ipynb"
out.parent.mkdir(exist_ok=True)
nbf.write(nb, out)
print("wrote", out)
