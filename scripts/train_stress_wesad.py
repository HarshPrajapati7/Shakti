"""WESAD stress detection: handcrafted-feature LightGBM vs multimodal 1-D CNN, population vs personal baseline.

Labels: 1 baseline, 2 stress (TSST), 3 amusement (meditation and transients excluded, as in Schmidt et al. 2018).
Windows: 60 s, 5 s shift, fully inside one condition. Leave-one-subject-out over 15 subjects.
Personal calibration: the first 5 min of each subject's baseline condition (a pre-flight rest recording in
deployment). Calibration windows are excluded from every test set, for every method.
"""
import io
import json
import os
import pickle
import sys
import time
import warnings
import zipfile
from pathlib import Path

warnings.filterwarnings("ignore", message="X does not have valid feature names")

import lightgbm as lgb
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn
from scipy.signal import butter, find_peaks, sosfiltfilt, welch
from sklearn.metrics import balanced_accuracy_score, f1_score, roc_auc_score

ROOT = Path(__file__).resolve().parents[1]
ZIP = next((p for p in (ROOT / "data" / "raw" / "downloads" / "WESAD.zip", ROOT.parent / "WESAD.zip") if p.exists()),
           ROOT / "data" / "raw" / "downloads" / "WESAD.zip")
CACHE = ROOT / "data" / "processed" / "wesad_4hz.pkl"
SMOKE = os.environ.get("ASTRA_SMOKE") == "1"
_sub = ("smoke",) if SMOKE else ()
OUT_M, OUT_R = ROOT.joinpath("models", *_sub, "stress"), ROOT.joinpath("results", *_sub, "stress")
SUBJ = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17]
TEST_SUBJ = SUBJ[:2] if SMOKE else SUBJ
CNN_EPOCHS = 1 if SMOKE else 30
FS = 4                      # common stream rate (Hz)
WIN, HOP, CAL_S = 60, 5, 300
CH_CHEST = ["c_hr", "c_resp", "c_eda", "c_temp", "c_act", "c_emg"]
CH_WRIST = ["w_hr", "w_bvpamp", "w_eda", "w_temp", "w_act"]
DEV = "cuda" if torch.cuda.is_available() else "cpu"


# ------------------------------------------------------------------ signal processing
def bp(x, lo, hi, fs, order=3):
    return sosfiltfilt(butter(order, [lo, hi], btype="band", fs=fs, output="sos"), x)


def lp(x, hi, fs, order=3):
    return sosfiltfilt(butter(order, hi, btype="low", fs=fs, output="sos"), x)


def block(x, fs_in, fn=np.mean):
    k = int(round(fs_in / FS))
    n = len(x) // k
    return fn(x[: n * k].reshape(n, k), axis=1)


def clean_ibi(tp):
    ibi = np.diff(tp)
    t = tp[1:]
    ok = (ibi > 0.33) & (ibi < 1.5)
    t, ibi = t[ok], ibi[ok]
    if len(ibi) > 7:
        med = np.array([np.median(ibi[max(0, i - 5):i + 6]) for i in range(len(ibi))])
        ok = np.abs(ibi - med) < 0.2 * med
        t, ibi = t[ok], ibi[ok]
    return t, ibi


def rpeaks(ecg, fs=700):
    f = bp(ecg, 5, 20, fs)
    e = np.convolve(np.gradient(f) ** 2, np.ones(int(0.15 * fs)) / int(0.15 * fs), mode="same")
    thr = 0.35 * np.array([np.percentile(e[i:i + 10 * fs], 98) for i in range(0, len(e), 10 * fs)]).repeat(10 * fs)[: len(e)]
    pk, _ = find_peaks(e, height=thr, distance=int(0.33 * fs))
    w = int(0.06 * fs)
    pk = np.array([p - w + np.argmax(np.abs(f[max(0, p - w):p + w])) for p in pk if p > w])
    return pk / fs


def bvp_peaks(bvp, fs=64):
    f = bp(bvp, 0.7, 3.5, fs)
    s = np.array([np.std(f[i:i + 10 * fs]) for i in range(0, len(f), 10 * fs)]).repeat(10 * fs)[: len(f)]
    pk, _ = find_peaks(f, distance=int(0.33 * fs), prominence=0.4 * s)
    return pk / fs, f


def hr_stream(t, ibi, n):
    g = np.arange(n) / FS
    if len(t) < 3:
        return np.full(n, np.nan)
    return np.interp(g, t, 60.0 / ibi)


def preprocess_subject(d):
    ch, wr, lab = d["signal"]["chest"], d["signal"]["wrist"], d["label"]
    n = len(lab) // 175
    out = {"label": np.array([np.bincount(lab[i * 175:(i + 1) * 175]).argmax() for i in range(n)], dtype=np.int8)}
    tr = rpeaks(ch["ECG"][:, 0])
    out["c_ibi"] = clean_ibi(tr)
    out["c_hr"] = hr_stream(*out["c_ibi"], n)
    out["c_resp"] = block(bp(ch["Resp"][:, 0], 0.1, 0.7, 700, 2), 700)[:n]
    out["c_eda"] = block(lp(ch["EDA"][:, 0], 1.0, 700), 700)[:n]
    out["c_temp"] = block(ch["Temp"][:, 0].astype(float), 700)[:n]
    acc = np.linalg.norm(ch["ACC"], axis=1)
    out["c_act"] = block(acc, 700, np.std)[:n]
    out["c_accxyz"] = np.stack([block(ch["ACC"][:, i], 700)[:n] for i in range(3)], 1)
    emg = np.abs(sosfiltfilt(butter(3, 20, btype="high", fs=700, output="sos"), ch["EMG"][:, 0]))
    out["c_emg"] = block(emg, 700)[:n]
    tb, fb = bvp_peaks(wr["BVP"][:, 0])
    out["w_ibi"] = clean_ibi(tb)
    out["w_hr"] = hr_stream(*out["w_ibi"], n)
    out["w_bvpamp"] = block(np.abs(fb), 64)[:n]
    out["w_eda"] = np.interp(np.arange(n), np.arange(len(wr["EDA"])), wr["EDA"][:, 0])
    out["w_temp"] = np.interp(np.arange(n), np.arange(len(wr["TEMP"])), wr["TEMP"][:, 0])
    wa = wr["ACC"] / 64.0
    out["w_act"] = block(np.linalg.norm(wa, axis=1), 32, np.std)[:n]
    out["w_accxyz"] = np.stack([block(wa[:, i], 32)[:n] for i in range(3)], 1)
    for k in CH_CHEST + CH_WRIST:
        x = out[k]
        if np.isnan(x).any():
            i = np.arange(len(x))
            ok = ~np.isnan(x)
            out[k] = np.interp(i, i[ok], x[ok])
        out[k] = out[k].astype(np.float32)
    return out


def build_cache():
    zf, data = zipfile.ZipFile(ZIP), {}
    for s in SUBJ:
        t0 = time.time()
        with zf.open(f"WESAD/S{s}/S{s}.pkl") as f:
            d = pickle.load(io.BufferedReader(f), encoding="latin1")
        data[s] = preprocess_subject(d)
        del d
        print(f"  S{s}: {len(data[s]['label']) / FS / 60:.1f} min, R-peaks {len(data[s]['c_ibi'][0])}, BVP beats "
              f"{len(data[s]['w_ibi'][0])} ({time.time() - t0:.0f}s)", flush=True)
    pickle.dump(data, open(CACHE, "wb"))


# ------------------------------------------------------------------ windows & features
def windows(lab):
    n, L, H, out = len(lab), WIN * FS, HOP * FS, []
    for a in range(0, n - L + 1, H):
        seg = lab[a:a + L]
        if seg[0] in (1, 2, 3) and (seg == seg[0]).all():
            out.append((a, int(seg[0])))
    return out


def calib_end(lab):
    i = np.where(lab == 1)[0]
    return int(i[0] + CAL_S * FS)


def slope(x):
    t = np.arange(len(x)) / FS
    return float(np.polyfit(t, x, 1)[0])


def hrv(t, ibi, a, b):
    m = (t >= a) & (t < b)
    x = ibi[m]
    if len(x) < 10:
        return [np.nan] * 7
    d = np.diff(x)
    tt = t[m]
    g = np.arange(tt[0], tt[-1], 0.25)
    if len(g) < 64:
        lf = hf = np.nan
    else:
        f, p = welch(np.interp(g, tt, x) - x.mean(), fs=4, nperseg=min(len(g), 128))
        lf = p[(f >= 0.04) & (f < 0.15)].sum()
        hf = p[(f >= 0.15) & (f < 0.4)].sum()
    return [60 / x.mean(), np.std(60 / x), x.std() * 1e3, np.sqrt(np.mean(d ** 2)) * 1e3, np.mean(np.abs(d) > 0.05),
            np.log1p(lf * 1e6), np.log1p(hf * 1e6)]


def eda_feats(x):
    p, _ = find_peaks(x, prominence=max(0.01, 0.02 * (np.percentile(x, 95) - np.percentile(x, 5) + 1e-6)), distance=FS)
    return [x.mean(), x.std(), x.min(), x.max(), slope(x), len(p), (x - lp(x, 0.05, FS, 2)).std()]


def resp_feats(x):
    f, p = welch(x - x.mean(), fs=FS, nperseg=len(x), nfft=1024)
    m = (f >= 0.1) & (f <= 0.7)
    return [f[m][np.argmax(p[m])] * 60, x.std(), len(find_peaks(x, distance=int(1.5 * FS))[0])]


FEAT_NAMES = {
    "chest": [f"c_{k}" for k in ("hr", "hr_sd", "sdnn", "rmssd", "pnn50", "lf", "hf")] +
             [f"c_eda_{k}" for k in ("mean", "sd", "min", "max", "slope", "nscr", "phasic_sd")] +
             ["c_resp_rate", "c_resp_amp", "c_resp_n"] + ["c_temp_mean", "c_temp_sd", "c_temp_slope"] +
             ["c_act_mean", "c_act_sd", "c_accx", "c_accy", "c_accz", "c_emg_mean", "c_emg_sd", "c_emg_p90"],
    "wrist": [f"w_{k}" for k in ("hr", "hr_sd", "sdnn", "rmssd", "pnn50", "lf", "hf")] +
             [f"w_eda_{k}" for k in ("mean", "sd", "min", "max", "slope", "nscr", "phasic_sd")] +
             ["w_temp_mean", "w_temp_sd", "w_temp_slope", "w_bvpamp_mean", "w_bvpamp_sd",
              "w_act_mean", "w_act_sd", "w_accx", "w_accy", "w_accz"],
}


def window_features(S, a):
    b = a + WIN * FS
    t0, t1 = a / FS, b / FS
    c = hrv(*S["c_ibi"], t0, t1) + eda_feats(S["c_eda"][a:b]) + resp_feats(S["c_resp"][a:b]) + \
        [S["c_temp"][a:b].mean(), S["c_temp"][a:b].std(), slope(S["c_temp"][a:b])] + \
        [S["c_act"][a:b].mean(), S["c_act"][a:b].std(), *S["c_accxyz"][a:b].mean(0)] + \
        [S["c_emg"][a:b].mean(), S["c_emg"][a:b].std(), np.percentile(S["c_emg"][a:b], 90)]
    w = hrv(*S["w_ibi"], t0, t1) + eda_feats(S["w_eda"][a:b]) + \
        [S["w_temp"][a:b].mean(), S["w_temp"][a:b].std(), slope(S["w_temp"][a:b])] + \
        [S["w_bvpamp"][a:b].mean(), S["w_bvpamp"][a:b].std()] + \
        [S["w_act"][a:b].mean(), S["w_act"][a:b].std(), *S["w_accxyz"][a:b].mean(0)]
    return np.array(c + w, dtype=np.float32)


def build_table(data):
    rows = []
    for s in SUBJ:
        S = data[s]
        ce = calib_end(S["label"])
        cal_start = np.where(S["label"] == 1)[0][0]
        for a, y in windows(S["label"]):
            rows.append((s, a, y, a < ce and a + WIN * FS > cal_start, window_features(S, a)))
    sub = np.array([r[0] for r in rows])
    start = np.array([r[1] for r in rows])
    y = np.array([r[2] for r in rows])
    is_cal = np.array([r[3] for r in rows])
    X = np.stack([r[4] for r in rows])
    # calibration median per subject (windows fully inside the calibration segment)
    names = FEAT_NAMES["chest"] + FEAT_NAMES["wrist"]
    calmed = {}
    for s in SUBJ:
        S = data[s]
        cs, ce = np.where(S["label"] == 1)[0][0], calib_end(S["label"])
        cw = [window_features(S, a) for a in range(cs, ce - WIN * FS + 1, HOP * FS)]
        calmed[s] = np.nanmedian(np.stack(cw), 0)
    return {"sub": sub, "start": start, "y": y, "is_cal": is_cal, "X": X, "names": names, "calmed": calmed}


# ------------------------------------------------------------------ models
def task_labels(y, task):
    return (y == 2).astype(int) if task == "binary" else (y - 1).astype(int)


def evaluate(yt, prob, task):
    yp = prob.argmax(1)
    auc = roc_auc_score(yt, prob[:, 1]) if task == "binary" else roc_auc_score(yt, prob, multi_class="ovr", average="macro")
    return {"macro_f1": f1_score(yt, yp, average="macro"), "bal_acc": balanced_accuracy_score(yt, yp),
            "acc": float(np.mean(yt == yp)), "auroc": float(auc)}


LGB_P = dict(n_estimators=300, learning_rate=0.05, num_leaves=15, min_child_samples=20, subsample=0.8, subsample_freq=1,
             colsample_bytree=0.7, reg_lambda=1.0, class_weight="balanced", verbose=-1)


def feat_matrix(T, cols, mode):
    X = T["X"][:, cols].copy()
    if mode == "personal":
        X -= np.stack([T["calmed"][s][cols] for s in T["sub"]])
    elif mode == "subject_z":  # transductive, common in literature; reported as an optimistic reference
        for s in SUBJ:
            m = T["sub"] == s
            X[m] = (X[m] - np.nanmean(X[m], 0)) / (np.nanstd(X[m], 0) + 1e-6)
    return X


class StressCNN(nn.Module):
    def __init__(self, cin, ncls, w=48, p=0.3):
        super().__init__()
        L = []
        c = cin
        for co in (w, w, 2 * w, 2 * w):
            L += [nn.Conv1d(c, co, 7, padding=3), nn.BatchNorm1d(co), nn.GELU(), nn.MaxPool1d(2)]
            c = co
        self.f = nn.Sequential(*L)
        self.drop = nn.Dropout(p)
        self.head = nn.Linear(2 * c, ncls)

    def forward(self, x):
        h = self.f(x)
        return self.head(self.drop(torch.cat([h.mean(-1), h.amax(-1)], 1)))


def stream_tensor(data, T, chans, scale=None):
    """(N, C, 240) windows, personal-baseline offset removed, divided by a population scale."""
    Xs = []
    for s, a in zip(T["sub"], T["start"]):
        S = data[s]
        cs, ce = np.where(S["label"] == 1)[0][0], calib_end(S["label"])
        Xs.append(np.stack([S[c][a:a + WIN * FS] - np.median(S[c][cs:ce]) for c in chans]))
    X = np.stack(Xs).astype(np.float32)
    return X


def train_cnn(X, y, ncls, seed, epochs=30, log=None):
    torch.manual_seed(seed)
    net = StressCNN(X.shape[1], ncls).to(DEV)
    opt = torch.optim.AdamW(net.parameters(), lr=2e-3, weight_decay=1e-3)
    n = len(y)
    steps = epochs * int(np.ceil(n / 64))
    sch = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=2e-3, total_steps=steps)
    w = torch.tensor(n / (ncls * np.bincount(y, minlength=ncls)), dtype=torch.float32, device=DEV)
    Xt, yt = torch.as_tensor(X, device=DEV), torch.as_tensor(y, dtype=torch.long, device=DEV)
    for ep in range(epochs):
        net.train()
        for b in torch.randperm(n, device=DEV).split(64):
            x = Xt[b]
            sh = int(torch.randint(-8, 9, (1,)))
            x = torch.roll(x, sh, -1) + 0.05 * torch.randn_like(x)
            drop = (torch.rand(len(b), x.shape[1], 1, device=DEV) < 0.1).float()
            x = x * (1 - drop)
            loss = Fn.cross_entropy(net(x), yt[b], weight=w, label_smoothing=0.05)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            sch.step()
    return net


@torch.no_grad()
def cnn_proba(net, X):
    net.eval()
    return torch.softmax(net(torch.as_tensor(X, device=DEV)), 1).cpu().numpy()


def main():
    OUT_M.mkdir(parents=True, exist_ok=True)
    OUT_R.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    if not CACHE.exists():
        build_cache()
    data = pickle.load(open(CACHE, "rb"))
    tab_path = ROOT / "data" / "processed" / "wesad_features.pkl"
    if tab_path.exists():
        T = pickle.load(open(tab_path, "rb"))
    else:
        T = build_table(data)
        pickle.dump(T, open(tab_path, "wb"))
    names = T["names"]
    sens_cols = {"wrist": [i for i, n in enumerate(names) if n.startswith("w_")],
                 "chest": [i for i, n in enumerate(names) if n.startswith("c_")],
                 "chest+wrist": list(range(len(names)))}
    sens_ch = {"wrist": CH_WRIST, "chest": CH_CHEST, "chest+wrist": CH_CHEST + CH_WRIST}
    test_mask = ~T["is_cal"]
    eval_mask = test_mask & np.isin(T["sub"], TEST_SUBJ)
    print(f"{len(T['y'])} windows ({test_mask.sum()} test-eligible), {len(names)} features, cache {time.time() - t0:.0f}s", flush=True)
    results, preds = {}, {}
    streams = {k: stream_tensor(data, T, v) for k, v in sens_ch.items()}
    for task in ("binary", "3class"):
        y = task_labels(T["y"], task)
        ncls = 2 if task == "binary" else 3
        for sens in ("wrist", "chest", "chest+wrist"):
            cfgs = [("lgbm_population", "raw"), ("lgbm_subject_z", "subject_z"), ("lgbm_personal", "personal"), ("cnn_personal", None)]
            for name, mode in cfgs:
                key = f"{task}|{sens}|{name}"
                P = np.zeros((len(y), ncls))
                if mode is not None:
                    X = feat_matrix(T, sens_cols[sens], mode)
                for s in TEST_SUBJ:
                    tr, te = T["sub"] != s, (T["sub"] == s) & test_mask
                    if mode is not None:
                        m = lgb.LGBMClassifier(random_state=s, **LGB_P).fit(X[tr], y[tr])
                        P[te] = m.predict_proba(X[te])
                    else:
                        Xs = streams[sens]
                        sc = (np.percentile(np.abs(Xs[tr]), 90, axis=(0, 2), keepdims=True) + 1e-6).astype(np.float32)
                        net = train_cnn(Xs[tr] / sc, y[tr], ncls, seed=s, epochs=CNN_EPOCHS)
                        P[te] = cnn_proba(net, Xs[te] / sc)
                per = [evaluate(y[(T["sub"] == s) & test_mask], P[(T["sub"] == s) & test_mask], task) for s in TEST_SUBJ]
                pooled = evaluate(y[eval_mask], P[eval_mask], task)
                results[key] = {k: float(np.mean([p[k] for p in per])) for k in per[0]} | \
                               {k + "_sd": float(np.std([p[k] for p in per])) for k in per[0]} | \
                               {"pooled_" + k: v for k, v in pooled.items()} | {"per_subject": per}
                preds[key] = P
                r = results[key]
                print(f"{key:40s} F1 {r['macro_f1']:.3f}+/-{r['macro_f1_sd']:.3f}  bAcc {r['bal_acc']:.3f}  AUROC {r['auroc']:.3f}"
                      f"  ({time.time() - t0:.0f}s)", flush=True)
    json.dump({"protocol": {"window_s": WIN, "hop_s": HOP, "calibration_s": CAL_S, "subjects": SUBJ,
                            "n_windows": int(len(T["y"])), "n_test_windows": int(test_mask.sum())},
               "results": results,
               "literature": {"Schmidt2018_binary_chest+wrist_F1": 0.9116, "Schmidt2018_binary_acc": 0.9312,
                              "Schmidt2018_3class_chest+wrist_F1": 0.7225, "Schmidt2018_3class_acc": 0.8034}},
              open(OUT_R / "metrics.json", "w"), indent=1)
    pickle.dump({"preds": preds, "sub": T["sub"], "y": T["y"], "start": T["start"], "test_mask": test_mask},
                open(OUT_R / "loso_predictions.pkl", "wb"))

    # ---------------- deployable models trained on all subjects (personal-baseline variants)
    y_b = task_labels(T["y"], "binary")
    for sens in ("wrist", "chest+wrist"):
        X = feat_matrix(T, sens_cols[sens], "personal")
        m = lgb.LGBMClassifier(random_state=0, **LGB_P).fit(X, y_b)
        m.booster_.save_model(str(OUT_M / f"stress_lgbm_{sens.replace('+', '_')}_binary_v1.txt"))
        Xs = streams[sens]
        sc = (np.percentile(np.abs(Xs), 90, axis=(0, 2), keepdims=True) + 1e-6).astype(np.float32)
        net = train_cnn(Xs / sc, y_b, 2, seed=0, epochs=CNN_EPOCHS)
        torch.save({"state_dict": net.state_dict(), "channels": sens_ch[sens], "scale": sc.squeeze().tolist(), "fs": FS,
                    "window_s": WIN, "calibration_s": CAL_S, "classes": ["non-stress", "stress"]},
                   OUT_M / f"stress_cnn_{sens.replace('+', '_')}_binary_v1.pt")
    json.dump({"feature_names": names, "sensor_columns": {k: [names[i] for i in v] for k, v in sens_cols.items()},
               "normalisation": "feature minus median over the subject's first 5 min of rest (calibration)",
               "classes": ["non-stress", "stress"]}, open(OUT_M / "stress_features_spec.json", "w"), indent=1)
    # demo trace: whole session for the median subject, binary chest+wrist personal LightGBM (LOSO prediction)
    key = "binary|chest+wrist|lgbm_personal"
    f1s = [(p["macro_f1"], s) for p, s in zip(results[key]["per_subject"], TEST_SUBJ)]
    s_demo = sorted(f1s)[len(f1s) // 2][1]
    m = (T["sub"] == s_demo) & test_mask
    json.dump({"subject": int(s_demo), "t_min": (T["start"][m] / FS / 60).round(2).tolist(),
               "p_stress": preds[key][m, 1].round(3).tolist(), "condition": T["y"][m].tolist(),
               "condition_names": {"1": "baseline", "2": "stress", "3": "amusement"}}, open(OUT_R / "demo_trace.json", "w"))
    print(f"total {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
