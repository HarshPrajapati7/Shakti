"""Paper-ready figures (PNG 220 dpi + PDF), result tables (CSV + LaTeX) and a live-inference latency proof.
Run after training:  python scripts/make_figures.py   ->  reports/figures, reports/tables
"""
import json
import os
import pickle
import sys
import time
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import torch  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src")); sys.path.insert(0, str(ROOT / "scripts"))
from astra.gravity import fit as F, model as M  # noqa: E402

FIG, TAB, RES = ROOT / "reports" / "figures", ROOT / "reports" / "tables", ROOT / "results"
FIG.mkdir(parents=True, exist_ok=True); TAB.mkdir(parents=True, exist_ok=True)
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.grid": True, "grid.alpha": .25, "figure.dpi": 110})
BLUE, ORANGE, GREY, RED = "#2f6fd6", "#e07b28", "#8a8f98", "#c8372d"
PPG = os.environ.get("ASTRA_PPG_DIR") or next(v for v in ("ppg_hr_v3", "ppg_hr_v2", "ppg_hr") if (RES / v / "metrics.json").exists())


def save(fig, name):
    fig.tight_layout()
    fig.savefig(FIG / f"{name}.png", dpi=220); fig.savefig(FIG / f"{name}.pdf")
    plt.close(fig); print("  fig", name)


def table(df, name, caption):
    df.to_csv(TAB / f"{name}.csv")
    (TAB / f"{name}.tex").write_text(df.to_latex(float_format="%.3f", caption=caption, label=f"tab:{name}"))
    print("  tab", name)


# ------------------------------------------------------------------ GRAVITY-HEART
gm = json.load(open(RES / "gravity_heart" / "metrics.json"))
S = gm["summary"]
order = ["Z", "E0", "E1", "E2", "E3", "E3_1cal"]
label = {"Z": "zero response", "E0": "population FIR", "E1": "population physics", "E2": "personal (weak prior)",
         "E3": "personal (hier. prior)", "E3_1cal": "personal, 1 calibration"}
t1 = pd.DataFrame({label[m]: {"RMSE HR (bpm)": S[m]["rmse_hr"]["mean"], "RMSE MAP (mmHg)": S[m]["rmse_map"]["mean"],
                              "|err| plateau dHR": S[m]["abserr_dhr_plateau"]["mean"],
                              "|err| plateau dMAP": S[m]["abserr_dmap_plateau"]["mean"],
                              "|err| MAP nadir": S[m]["abserr_dmap_nadir30"]["mean"],
                              "PI90 cov HR": S[m].get("cov90_hr", np.nan), "PI90 cov MAP": S[m].get("cov90_map", np.nan)}
                   for m in order}).T
table(t1, "gravity_ablation", f"GRAVITY-HEART ablation on {gm['n_maneuvers']} held-out maneuvers from {len(gm['subjects'])} subjects (PhysioNet PRCP).")
table(pd.DataFrame(gm["tests"]).T, "gravity_tests", "Paired Wilcoxon tests over subjects (RMSE).")

fig, ax = plt.subplots(1, 2, figsize=(7.2, 2.6))
for a, k, u in zip(ax, ["rmse_hr", "rmse_map"], ["bpm", "mmHg"]):
    v = [S[m][k]["mean"] for m in order]
    a.bar(range(len(order)), v, color=[GREY, GREY, ORANGE, BLUE, BLUE, BLUE])
    a.set_xticks(range(len(order)), [label[m] for m in order], rotation=35, ha="right", fontsize=7); a.set_ylabel(f"RMSE ({u})")
    a.set_title("Heart rate" if k == "rmse_hr" else "Mean arterial pressure")
save(fig, "fig1_gravity_ablation")

G = pickle.load(open(ROOT / "models" / "gravity_heart" / "gravity_heart_v1.pkl", "rb"))
mans, full = G["mans"], G["full"]
subs = sorted({d["subject"] for d in mans})
s = subs[0]; te = [d for d in mans if d["subject"] == s]
d = next(x for x in te if x["kind"] == "stand"); cal = [x for x in te if x is not d]
th_pop = F.fit([x for x in mans if x["subject"] != s])[0]
mu, sd = F.hier_prior([full[o] for o in subs if o != s])
th3, cov3, obs3 = F.fit(cal, mu=mu, sd=sd, x0=mu)
pi, p1, p3 = F.interval(th3, cov3, obs3, d), F.sim_man(th_pop, d), F.sim_man(th3, d)
fig, ax = plt.subplots(1, 2, figsize=(7.2, 2.6))
for j, k in enumerate(["hr", "map"]):
    ax[j].fill_between(d["t"], pi[0, j], pi[2, j], color=BLUE, alpha=.18, lw=0, label="personal 90% interval")
    ax[j].plot(d["t"], d[k], "k", lw=.8, label="measured")
    ax[j].plot(d["t"], p1[k], "--", c=ORANGE, lw=1, label="population model")
    ax[j].plot(d["t"], p3[k], c=BLUE, lw=1.2, label="personalised twin")
    ax[j].axvspan(0, d["dur"], color=GREY, alpha=.08, lw=0)
    ax[j].set_xlabel("time from stand-up (s)"); ax[j].set_ylabel(["HR (bpm)", "MAP (mmHg)"][j])
ax[0].legend(fontsize=6.5, frameon=False)
save(fig, "fig2_gravity_heldout_stand")

sc = json.load(open(RES / "gravity_heart" / "scenarios.json"))
tol = pd.DataFrame({k: {e: v["volume_tolerance_ml"] for e, v in sc[k]["environments"].items()} for k in sc}).T
tol["plasma_loss_12pct_ml"] = [0.12 * sc[k]["plasma_volume_ml"] for k in tol.index]
table(tol, "gravity_volume_tolerance", "Simulated orthostatic volume tolerance (mL of central-volume deficit) by gravity level.")
s0 = list(sc)[0]
fig, ax = plt.subplots(1, 4, figsize=(9.6, 2.5), gridspec_kw={"width_ratios": [1, 1, 1, 1.3]})
for a, e in zip(ax[:3], ["earth", "mars", "moon"]):
    for cname, c, col in [("preflight", None, GREY), ("postflight_pv12", None, RED), ("postflight_pv12_fluid_loading", None, ORANGE),
                          ("postflight_pv12_compression", None, BLUE)]:
        tr_ = sc[s0]["environments"][e]["cases"][cname]["trace"]["map"]
        a.plot((np.arange(len(tr_)) * 2 - 60)[12:], tr_[12:], c=col, lw=1, label=cname.replace("postflight_pv12", "post-flight").replace("_", " "))
    a.set_title(f"{e.capitalize()} ({sc[s0]['environments'][e]['g_ratio']:.2f} g)"); a.set_xlabel("s from stand")
ax[0].set_ylabel("MAP (mmHg)"); fig.legend(*ax[0].get_legend_handles_labels(), loc="lower center", ncol=4, fontsize=7, frameon=False, bbox_to_anchor=(0.38, -0.02))
x = np.arange(len(tol))
for i, (e, col) in enumerate([("earth", RED), ("mars", ORANGE), ("moon", BLUE)]):
    ax[3].bar(x + (i - 1) * .27, tol[e], .27, color=col, label=e)
ax[3].plot(x, tol["plasma_loss_12pct_ml"], "k_", ms=10, label="12% PV loss")
ax[3].set_xticks(x, [str(i + 1) for i in x]); ax[3].set_xlabel("subject"); ax[3].set_ylabel("tolerated deficit (mL)")
ax[3].legend(fontsize=5.5, frameon=False, ncol=4, loc="upper left", bbox_to_anchor=(0, 1.16))
fig.suptitle("SIMULATION (extrapolated from 1 g tilt data)", fontsize=8, color=GREY); fig.subplots_adjust(bottom=0.28)
save(fig, "fig3_gravity_scenarios")

# ------------------------------------------------------------------ PPG heart rate
vers = [v for v in ("ppg_hr", "ppg_hr_v2", "ppg_hr_v3") if (RES / v / "metrics.json").exists()]
rows = {}
for v in vers:
    m = json.load(open(RES / v / "metrics.json"))
    for k, val in m["summary"].items():
        if v == vers[0] or k.startswith("cnn"):
            name = k if k in ("argmax", "tracker") else f"{v.replace('ppg_hr', 'ours').replace('ours_', 'ours ')} {k.replace('cnn_hmm_', '').replace('cnn', 'cnn-only')}"
            rows[name] = {"MAE (bpm)": val["mae_mean_over_subjects"], "MAE sd": val["mae_sd_over_subjects"], "RMSE": val["rmse_mean_over_subjects"]}
rows["published DeepPPG [Reiss 2019]"] = {"MAE (bpm)": 7.65}
rows["published BeliefPPG online [Bieri 2023]"] = {"MAE (bpm)": 3.57}
table(pd.DataFrame(rows).T, "ppg_results", "PPG-DaLiA leave-one-subject-out heart-rate error (15 subjects).")
pm = json.load(open(RES / PPG / "metrics.json"))
table(pd.DataFrame(pm["by_activity"]).T, "ppg_by_activity", "MAE by activity (bpm).")
table(pd.Series(pm["uncertainty"]).to_frame("value"), "ppg_uncertainty", "Uncertainty calibration and selective prediction.")

L = pickle.load(open(RES / PPG / "loso_predictions.pkl", "rb"))
fig, ax = plt.subplots(1, 3, figsize=(9.6, 2.7))
subj = sorted(L)
ax[0].bar(np.arange(len(subj)) - .2, [np.abs(L[s]["tracker"] - L[s]["y"]).mean() for s in subj], .4, color=GREY, label="classical tracker")
ax[0].bar(np.arange(len(subj)) + .2, [np.abs(L[s]["online"] - L[s]["y"]).mean() for s in subj], .4, color=BLUE, label="ours (online)")
ax[0].set_xticks(range(len(subj)), [f"S{s}" for s in subj], rotation=90, fontsize=6); ax[0].set_ylabel("MAE (bpm)"); ax[0].legend(fontsize=6, frameon=False)
y = np.concatenate([L[s]["y"] for s in subj]); e = np.concatenate([L[s]["online"] for s in subj]); sdv = np.concatenate([L[s]["sd"] for s in subj])
mm, df_ = (y + e) / 2, e - y
ax[1].scatter(mm, df_, s=.6, alpha=.12, c=BLUE, rasterized=True)
for v_, c_ in ((df_.mean(), "k"), (df_.mean() - 1.96 * df_.std(), RED), (df_.mean() + 1.96 * df_.std(), RED)):
    ax[1].axhline(v_, c=c_, ls="--", lw=.8)
ax[1].set(xlabel="mean of ECG and PPG HR (bpm)", ylabel="PPG - ECG (bpm)", ylim=(-60, 60), title=f"Bland-Altman, bias {df_.mean():.2f}")
q = np.linspace(0, .5, 11)
ax[2].plot(q * 100, [np.abs(df_[sdv <= np.quantile(sdv, 1 - qq)]).mean() for qq in q], "o-", c=BLUE, ms=3)
ax[2].set(xlabel="most-uncertain windows rejected (%)", ylabel="MAE (bpm)", title="Selective prediction")
save(fig, "fig4_ppg_results")
dt = json.load(open(RES / PPG / "demo_trace.json")); tm = np.array(dt["t_s"]) / 60
fig, ax = plt.subplots(figsize=(7.2, 2.3))
ax.fill_between(tm, dt["lo_conf"], dt["hi_conf"], color=BLUE, alpha=.18, lw=0, label="90% conformal interval")
ax.plot(tm, dt["y"], "k", lw=.7, label="ECG reference"); ax.plot(tm, dt["online"], c=BLUE, lw=.8, label="wrist PPG (ours, online)")
ax.plot(tm, dt["tracker"], c=GREY, lw=.5, alpha=.7, label="classical tracker")
ax.set(xlabel="time (min)", ylabel="HR (bpm)", title=f"Held-out subject S{dt['subject']} through daily activities"); ax.legend(fontsize=6, frameon=False, ncol=4)
save(fig, "fig5_ppg_trace")

# ------------------------------------------------------------------ stress
sm = json.load(open(RES / "stress" / "metrics.json"))["results"]
st = pd.DataFrame({k: {"macro-F1": v["macro_f1"], "F1 sd": v["macro_f1_sd"], "bal. acc": v["bal_acc"], "AUROC": v["auroc"]} for k, v in sm.items()}).T
table(st, "stress_results", "WESAD leave-one-subject-out stress detection (15 subjects). subject_z is transductive (upper reference only).")
fig, ax = plt.subplots(1, 2, figsize=(7.2, 2.6))
for a, task, ref in zip(ax, ["binary", "3class"], [0.912, 0.723]):
    ks = [f"{task}|{s_}|{m_}" for s_ in ("wrist", "chest", "chest+wrist") for m_ in ("lgbm_population", "lgbm_personal", "cnn_personal")]
    a.bar(range(len(ks)), [sm[k]["macro_f1"] for k in ks], yerr=[sm[k]["macro_f1_sd"] for k in ks], color=[GREY, ORANGE, BLUE] * 3,
          error_kw={"lw": .6})
    a.axhline(ref, c=RED, ls="--", lw=.8, label="Schmidt et al. 2018")
    a.set_xticks(range(len(ks)), [k.split("|")[1] + "\n" + k.split("|")[2].replace("lgbm_", "gbm ").replace("cnn_personal", "cnn") for k in ks],
                 fontsize=5.5, rotation=90)
    a.set(ylim=(0.4, 1.0), ylabel="macro-F1", title="stress vs non-stress" if task == "binary" else "baseline / stress / amusement")
    a.legend(fontsize=6, frameon=False)
save(fig, "fig6_stress_results")

# ------------------------------------------------------------------ live inference latency proof (CPU = onboard tablet proxy)
import train_ppg_hr as P  # noqa: E402
ck_path = sorted((ROOT / "models" / PPG).glob("ppg_hr_cnn_*.pt"))[0]
ck = torch.load(ck_path, map_location="cpu")
net = P.PPGNet(cin=ck.get("cin", 6), w=ck["cfg"]["width"]).eval()
net.load_state_dict(ck["state_dict"])
x = torch.zeros(1, ck.get("cin", 6), P.K_CTX, P.NB)
torch.set_num_threads(1)
with torch.no_grad():
    for _ in range(5):
        net(x)
    t0 = time.perf_counter(); n = 200
    for _ in range(n):
        net(x)
ms = (time.perf_counter() - t0) / n * 1e3
T_, _ = P.transition([np.linspace(60, 120, 500)])
q = np.full(P.NB, 1 / P.NB); t0 = time.perf_counter()
for _ in range(1000):
    q = (q @ T_) * q; q /= q.sum()
ms_hmm = (time.perf_counter() - t0)
lat = pd.DataFrame({"value": {"PPG CNN forward, 1 CPU thread (ms/window)": ms, "HMM belief update (ms/window)": ms_hmm,
                              "window period (ms)": 2000.0, "real-time factor": 2000.0 / (ms + ms_hmm),
                              "parameters": sum(p.numel() for p in net.parameters())}})
table(lat, "live_inference_latency", f"On-device inference cost of {ck_path.name} (single CPU thread).")
print(lat)
