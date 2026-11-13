"""PPG-DaLiA wrist heart-rate estimation: classical spectral tracker vs spectro-temporal CNN + HMM belief tracking.

Protocol (Reiss et al., Sensors 2019): 8 s windows, 2 s shift, ECG-derived reference HR, leave-one-subject-out
(15 folds). Online (causal) estimates are the headline numbers.
"""
import io
import json
import os
import pickle
import sys
import time
import zipfile
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn

ROOT = Path(__file__).resolve().parents[1]
ZIP = next((p for p in (ROOT / "data" / "raw" / "downloads" / "PPG_DaLiA.zip", ROOT.parent / "ppg+dalia.zip") if p.exists()),
           ROOT / "data" / "raw" / "downloads" / "PPG_DaLiA.zip")
CACHE = ROOT / "data" / "processed" / "ppg_dalia_spec.npz"
OUT_M, OUT_R = ROOT / "models" / "ppg_hr", ROOT / "results" / "ppg_hr"
SMOKE = os.environ.get("ASTRA_SMOKE") == "1"
FS_PPG, FS_ACC, NFFT_PPG, NFFT_ACC = 64, 32, 4096, 2048
DF = FS_PPG / NFFT_PPG                 # 0.015625 Hz = 0.9375 bpm per bin
K0, NB = 32, 224                       # bins 32..255 -> 30..239 bpm
BPM = (np.arange(NB) + K0) * DF * 60
K_CTX = 8                              # current + 7 previous windows (22 s of context)
ACT = {0: "transient", 1: "sitting", 2: "stairs", 3: "table_soccer", 4: "cycling", 5: "driving", 6: "lunch", 7: "walking", 8: "working"}
CFG = dict(width=32, epochs=14, batch=256, lr=3e-3, wd=1e-4, sigma_bins=1.5, scale_aug=(0.85, 1.15), p_aug=0.5,
           n_seeds=1, transition="laplace")
VER = os.environ.get("PPG_VER", "v1")
if VER == "v2":  # stronger frequency-stretch augmentation, longer training, 3-seed ensemble, log-HR Gaussian transition
    CFG.update(epochs=20, scale_aug=(0.75, 1.25), p_aug=0.7, n_seeds=3, transition="loggauss")
    OUT_M, OUT_R = ROOT / "models" / "ppg_hr_v2", ROOT / "results" / "ppg_hr_v2"
if VER == "v3":  # v2 + time-domain autocorrelation channels (PPG and motion) aligned to the HR-bin axis
    CFG.update(epochs=20, scale_aug=(0.75, 1.25), p_aug=0.7, n_seeds=3, transition="loggauss", acf=True)
    OUT_M, OUT_R = ROOT / "models" / "ppg_hr_v3", ROOT / "results" / "ppg_hr_v3"
if SMOKE:  # 1 fold, 1 epoch, 1 seed; separate output folder
    CFG.update(epochs=1, n_seeds=1)
    OUT_M, OUT_R = ROOT / "models" / "smoke" / OUT_M.name, ROOT / "results" / "smoke" / OUT_R.name
DEV = "cuda" if torch.cuda.is_available() else "cpu"


# ------------------------------------------------------------------ preprocessing
def spectra(bvp, acc, n):
    hp = np.hanning(512)[None]
    ha = np.hanning(256)[None, :, None]
    i = np.arange(n)
    wp = bvp[i[:, None] * 128 + np.arange(512)[None]]
    wa = acc[i[:, None] * 64 + np.arange(256)[None]]
    wp = (wp - wp.mean(1, keepdims=True)) * hp
    wa = (wa - wa.mean(1, keepdims=True)) * ha
    P = np.abs(np.fft.rfft(wp, NFFT_PPG, axis=1))[:, K0:K0 + NB]
    A = np.abs(np.fft.rfft(wa, NFFT_ACC, axis=1))[:, K0:K0 + NB, :]
    P = P / (P.max(1, keepdims=True) + 1e-9)
    return P.astype(np.float32), np.log1p(A).transpose(0, 2, 1).astype(np.float32)


def build_cache():
    zf, S, A, H, ACTS, SUB = zipfile.ZipFile(ZIP), [], [], [], [], []
    for s in range(1, 16):
        t0 = time.time()
        with zf.open(f"PPG_FieldStudy/S{s}/S{s}.pkl") as f:
            d = pickle.load(io.BufferedReader(f), encoding="latin1")
        bvp = d["signal"]["wrist"]["BVP"][:, 0].astype(np.float64)
        acc = d["signal"]["wrist"]["ACC"].astype(np.float64)
        hr = np.asarray(d["label"], float)
        act = d["activity"][:, 0].astype(int)
        n = min(len(hr), (len(bvp) - 512) // 128 + 1, (len(acc) - 256) // 64 + 1)
        P, Acc = spectra(bvp, acc, n)
        a = np.array([np.bincount(act[i * 8:i * 8 + 32], minlength=9).argmax() if i * 8 < len(act) else 0 for i in range(n)])
        S.append(P), A.append(Acc), H.append(hr[:n]), ACTS.append(a), SUB.append(np.full(n, s))
        del d
        print(f"  S{s}: {n} windows ({time.time() - t0:.0f}s)", flush=True)
    np.savez_compressed(CACHE, ppg=np.concatenate(S), acc=np.concatenate(A), hr=np.concatenate(H),
                        act=np.concatenate(ACTS), sub=np.concatenate(SUB))


def load_cache():
    if not CACHE.exists():
        build_cache()
    z = np.load(CACHE)
    D = {k: z[k] for k in z.files}
    if CFG.get("acf"):
        if not CACHE_ACF.exists():
            build_acf_cache()
        D["acf"] = np.load(CACHE_ACF)["acf"].astype(np.float32)
    return D


CACHE_ACF = ROOT / "data" / "processed" / "ppg_dalia_acf.npz"


def acf_on_bins(x, fs=32):
    """Normalised autocorrelation of each window (N, L) evaluated at the lag of every HR bin -> (N, NB).
    A pulse at f bpm produces a peak at lag 60*fs/f, so time-domain periodicity lands on the same axis as the spectra."""
    x = x - x.mean(1, keepdims=True)
    x = x / (x.std(1, keepdims=True) + 1e-9)
    L = x.shape[1]
    F_ = np.fft.rfft(x, 2 * L, axis=1)
    r = np.fft.irfft(F_ * np.conj(F_), axis=1)[:, :L] / L
    lag = 60.0 * fs / BPM
    i0 = np.floor(lag).astype(int)
    w = lag - i0
    return ((1 - w) * r[:, i0] + w * r[:, np.minimum(i0 + 1, L - 1)]).astype(np.float32)


def build_acf_cache():
    from scipy.signal import butter, sosfiltfilt
    sos64 = butter(3, [0.5, 4.0], btype="band", fs=64, output="sos")
    sos32 = butter(3, [0.5, 4.0], btype="band", fs=32, output="sos")
    zf, out = zipfile.ZipFile(ZIP), []
    for s in range(1, 16):
        t0 = time.time()
        with zf.open(f"PPG_FieldStudy/S{s}/S{s}.pkl") as f:
            d = pickle.load(io.BufferedReader(f), encoding="latin1")
        bvp = sosfiltfilt(sos64, d["signal"]["wrist"]["BVP"][:, 0].astype(np.float64))[::2]  # -> 32 Hz
        acc = sosfiltfilt(sos32, np.linalg.norm(d["signal"]["wrist"]["ACC"].astype(np.float64), axis=1))
        n = min(len(d["label"]), (len(bvp) - 256) // 64 + 1, (len(acc) - 256) // 64 + 1)
        idx = np.arange(n)[:, None] * 64 + np.arange(256)[None]
        out.append(np.stack([acf_on_bins(bvp[idx]), acf_on_bins(acc[idx])], 1).astype(np.float16))
        del d
        print(f"  acf S{s}: {n} windows ({time.time() - t0:.0f}s)", flush=True)
    np.savez_compressed(CACHE_ACF, acf=np.concatenate(out))


def features_tensor(D):
    """(N, C, NB): PPG, PPG at 2f (harmonic-aligned), ACC x/y/z, [PPG ACF, ACC ACF], frequency coordinate (last)."""
    P = D["ppg"]
    k2 = 2 * (np.arange(NB) + K0) - K0
    H2 = np.where(k2 < NB, P[:, np.minimum(k2, NB - 1)], 0.0)
    coord = np.broadcast_to(np.linspace(-1, 1, NB, dtype=np.float32), P.shape)
    extra = [D["acf"]] if "acf" in D else []
    return np.concatenate([P[:, None], H2[:, None], D["acc"], *extra, coord[:, None]], 1).astype(np.float32)


def context_index(sub):
    """(N, K) indices of the current and previous K-1 windows within the same subject (edge-padded)."""
    n = len(sub)
    idx = np.arange(n)[:, None] - np.arange(K_CTX - 1, -1, -1)[None]
    first = np.r_[0, np.where(np.diff(sub) != 0)[0] + 1]
    start = first[np.searchsorted(first, np.arange(n), side="right") - 1]
    return np.maximum(idx, start[:, None])


# ------------------------------------------------------------------ model
class ResF(nn.Module):
    def __init__(self, c, d):
        super().__init__()
        self.c = nn.Conv1d(c, c, 9, padding=4 * d, dilation=d)
        self.b = nn.BatchNorm1d(c)

    def forward(self, x):
        return x + Fn.gelu(self.b(self.c(x)))


class PPGNet(nn.Module):
    """Spectro-temporal CNN: 2-D convs over (context window, frequency), collapse time, dilated 1-D
    convs over frequency, per-bin logits -> categorical distribution over heart-rate bins."""

    def __init__(self, cin=6, w=32, k=K_CTX):
        super().__init__()
        self.stem = nn.Sequential(nn.Conv2d(cin, w, (3, 9), padding=(1, 4)), nn.BatchNorm2d(w), nn.GELU(),
                                  nn.Conv2d(w, w, (3, 9), padding=(1, 4)), nn.BatchNorm2d(w), nn.GELU())
        self.tc = nn.Sequential(nn.Conv2d(w, 2 * w, (k, 1)), nn.BatchNorm2d(2 * w), nn.GELU())
        self.fr = nn.Sequential(*[ResF(2 * w, d) for d in (1, 2, 4, 8, 16)])
        self.head = nn.Conv1d(2 * w, 1, 1)

    def forward(self, x):  # x: (B, C, K, F)
        return self.head(self.fr(self.tc(self.stem(x)).squeeze(2))).squeeze(1)


def batch(X, ctx, hr, b, aug, rng):
    x = X[ctx[b]].permute(0, 2, 1, 3)  # (B, C, K, F)
    y = hr[b].clone()
    if aug:
        m = torch.rand(len(b), device=x.device) < CFG["p_aug"]
        a = torch.where(m, torch.empty(len(b), device=x.device).uniform_(*CFG["scale_aug"]), torch.ones(len(b), device=x.device))
        kk = torch.arange(NB, device=x.device, dtype=torch.float32)
        src = (kk[None] + K0) / a[:, None] - K0                     # (B, F) source bin positions
        lo = src.floor().clamp(0, NB - 1).long()
        hi = (lo + 1).clamp(max=NB - 1)
        w = (src - src.floor()).clamp(0, 1)
        valid = ((src >= 0) & (src <= NB - 1)).float()
        g = lambda t: t.gather(3, lo[:, None, None, :].expand_as(t)) * (1 - w)[:, None, None] + t.gather(3, hi[:, None, None, :].expand_as(t)) * w[:, None, None]
        xs = g(x[:, :-1]) * valid[:, None, None]
        x = torch.cat([xs, x[:, -1:]], 1)
        y = y * a
    return x, y


def soft_target(y_bpm, dev):
    c = y_bpm / (DF * 60) - K0
    k = torch.arange(NB, device=dev, dtype=torch.float32)
    t = torch.exp(-0.5 * ((k[None] - c[:, None]) / CFG["sigma_bins"]) ** 2)
    return t / t.sum(1, keepdim=True).clamp_min(1e-9)


def train_model(X, ctx, hr, tr_idx, seed=0, log=None):
    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    net = PPGNet(cin=X.shape[1], w=CFG["width"]).to(DEV)
    opt = torch.optim.AdamW(net.parameters(), lr=CFG["lr"], weight_decay=CFG["wd"])
    steps = CFG["epochs"] * int(np.ceil(len(tr_idx) / CFG["batch"]))
    sch = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=CFG["lr"], total_steps=steps, pct_start=0.15)
    tr = torch.as_tensor(tr_idx, device=DEV)
    for ep in range(CFG["epochs"]):
        net.train()
        perm = tr[torch.randperm(len(tr), device=DEV)]
        tot = 0.0
        for i in range(0, len(perm), CFG["batch"]):
            b = perm[i:i + CFG["batch"]]
            x, y = batch(X, ctx, hr, b, True, rng)
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=DEV == "cuda"):
                logit = net(x)
            loss = -(soft_target(y, DEV) * Fn.log_softmax(logit.float(), 1)).sum(1).mean()
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            sch.step()
            tot += loss.item() * len(b)
        if log:
            log(f"    ep {ep + 1:2d} loss {tot / len(perm):.3f}")
    return net


@torch.no_grad()
def predict_proba(net, X, ctx, idx):
    net.eval()
    out = []
    for i in range(0, len(idx), 1024):
        b = torch.as_tensor(idx[i:i + 1024], device=DEV)
        x = X[ctx[b]].permute(0, 2, 1, 3)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=DEV == "cuda"):
            out.append(torch.softmax(net(x).float(), 1).cpu().numpy())
    return np.concatenate(out)


# ------------------------------------------------------------------ belief tracking
def transition(hr_train_seq, eps=1e-3):
    """Laplace transition on bin differences fitted to consecutive training labels, plus a uniform floor."""
    k = np.arange(NB)
    if CFG["transition"] == "loggauss":  # BeliefPPG-style: Gaussian on log(HR_t / HR_{t-1})
        r = np.concatenate([np.diff(np.log(h)) for h in hr_train_seq])
        mu, b = float(r.mean()), float(max(r.std(), 1e-3))
        L = np.log(BPM)
        T = np.exp(-0.5 * ((L[None] - L[:, None] - mu) / b) ** 2)
        T = T / T.sum(1, keepdims=True)
        return (1 - eps) * T + eps / NB, b
    d = np.concatenate([np.diff(h) for h in hr_train_seq]) / (DF * 60)
    b = max(np.mean(np.abs(d)), 0.3)
    T = np.exp(-np.abs(k[:, None] - k[None]) / b)
    T = T / T.sum(1, keepdims=True)
    return (1 - eps) * T + eps / NB, float(b)


def forward_filter(P, T):
    a = np.full(NB, 1.0 / NB)
    out = np.empty_like(P)
    for t in range(len(P)):
        a = (a @ T) * (P[t] + 1e-12)
        a /= a.sum()
        out[t] = a
    return out


def forward_backward(P, T):
    A = forward_filter(P, T)
    B = np.ones(NB)
    out = np.empty_like(P)
    for t in range(len(P) - 1, -1, -1):
        g = A[t] * B
        out[t] = g / g.sum()
        B = T @ ((P[t] + 1e-12) * B)
        B /= B.sum()
    return out


def point_estimate(Q, half=10):
    m = Q.argmax(1)
    k = np.arange(NB)
    w = np.where(np.abs(k[None] - m[:, None]) <= half, Q, 0.0)
    est = (w * BPM[None]).sum(1) / w.sum(1)
    mu = (Q * BPM[None]).sum(1)
    sd = np.sqrt((Q * (BPM[None] - mu[:, None]) ** 2).sum(1))
    c = np.cumsum(Q, 1)
    lo = BPM[np.minimum((c < 0.05).sum(1), NB - 1)]
    hi = BPM[np.minimum((c < 0.95).sum(1), NB - 1)]
    return est, sd, lo, hi


# ------------------------------------------------------------------ classical baseline
def spectral_tracker(ppg, acc, search=10, rel=0.3, max_miss=3):
    """Classical baseline: motion-frequency attenuation using the accelerometer spectra, local peak tracking
    around the previous estimate, re-acquisition from the global maximum after repeated misses."""
    est, prev, miss = np.empty(len(ppg)), None, 0
    lo, hi = np.searchsorted(BPM, 40), np.searchsorted(BPM, 200)
    for t in range(len(ppg)):
        a = np.expm1(acc[t])
        an = (a / (a.max(1, keepdims=True) + 1e-9)).max(0)
        p = ppg[t] * (1.0 - 0.8 * an)
        gmax = p[lo:hi].max()
        if prev is None or miss >= max_miss:
            k, miss = lo + int(np.argmax(p[lo:hi])), 0
        else:
            a0, a1 = max(lo, prev - search), min(hi, prev + search + 1)
            kk = a0 + int(np.argmax(p[a0:a1]))
            if p[kk] >= rel * gmax:
                k, miss = kk, 0
            else:
                k, miss = prev, miss + 1
        prev = int(k)
        est[t] = BPM[prev]
    return est


def conformal_coverage(per_window, level=0.9):
    """Cross-subject split-conformal interval: est +/- q * sd, q from the other subjects' normalised residuals."""
    out = {}
    for s, pw in per_window.items():
        r = np.concatenate([np.abs(o["y"] - o["online"]) / np.maximum(o["sd"], 0.5) for t, o in per_window.items() if t != s])
        q = float(np.quantile(r, level))
        half = q * np.maximum(pw["sd"], 0.5)
        pw["lo_conf"], pw["hi_conf"] = pw["online"] - half, pw["online"] + half
        out[s] = {"q": q, "coverage": float(np.mean(np.abs(pw["y"] - pw["online"]) <= half)), "mean_width": float(np.mean(2 * half))}
    return out


def argmax_baseline(ppg):
    lo, hi = np.searchsorted(BPM, 40), np.searchsorted(BPM, 200)
    return BPM[lo + ppg[:, lo:hi].argmax(1)]


# ------------------------------------------------------------------ main
def main():
    OUT_M.mkdir(parents=True, exist_ok=True)
    (OUT_M / "folds").mkdir(exist_ok=True)
    OUT_R.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    D = load_cache()
    sub, hr, act = D["sub"], D["hr"], D["act"]
    print(f"{len(hr)} windows, {len(np.unique(sub))} subjects, cache {time.time() - t0:.0f}s, device {DEV}", flush=True)
    X = torch.as_tensor(features_tensor(D), device=DEV)
    ctx = torch.as_tensor(context_index(sub), device=DEV)
    hr_t = torch.as_tensor(hr, dtype=torch.float32, device=DEV)
    rows, per_window = [], {}
    only = [int(a) for a in sys.argv[1:]] if len(sys.argv) > 1 else ([1] if SMOKE else list(range(1, 16)))
    for s in only:
        t1 = time.time()
        tr = np.where(sub != s)[0]
        if SMOKE:
            tr = tr[sub[tr] <= 4]
        te = np.where(sub == s)[0]
        P = 0
        for k in range(CFG["n_seeds"]):
            net = train_model(X, ctx, hr_t, tr, seed=100 * k + s)
            torch.save(net.state_dict(), OUT_M / "folds" / f"ppgnet_loso_S{s}_seed{k}.pt")
            P = P + predict_proba(net, X, ctx, te) / CFG["n_seeds"]
        T, b = transition([hr[sub == o] for o in np.unique(sub) if o != s])
        y = hr[te]
        cnn, _, _, _ = point_estimate(P)
        on, sd_on, lo_on, hi_on = point_estimate(forward_filter(P, T))
        off, _, _, _ = point_estimate(forward_backward(P, T))
        base = spectral_tracker(D["ppg"][te], D["acc"][te])
        amax = argmax_baseline(D["ppg"][te])
        r = {"subject": s, "n": len(te), "trans_b_bins": b}
        for name, e in [("argmax", amax), ("tracker", base), ("cnn", cnn), ("cnn_hmm_online", on), ("cnn_hmm_offline", off)]:
            err = e - y
            r[f"mae_{name}"] = float(np.mean(np.abs(err)))
            r[f"rmse_{name}"] = float(np.sqrt(np.mean(err ** 2)))
        ae = np.abs(on - y)
        r["cov90_online"] = float(np.mean((y >= lo_on) & (y <= hi_on)))
        r["spearman_sd_abserr"] = float(np.corrcoef(np.argsort(np.argsort(sd_on)), np.argsort(np.argsort(ae)))[0, 1])
        for keep in (0.9, 0.8):
            thr = np.quantile(sd_on, keep)
            r[f"mae_online_keep{int(keep * 100)}"] = float(ae[sd_on <= thr].mean())
        rows.append(r)
        per_window[s] = {"y": y, "online": on, "sd": sd_on, "lo": lo_on, "hi": hi_on, "offline": off, "cnn": cnn,
                         "tracker": base, "act": act[te]}
        print(f"  S{s:2d}: MAE argmax {r['mae_argmax']:.2f} tracker {r['mae_tracker']:.2f} cnn {r['mae_cnn']:.2f} "
              f"online {r['mae_cnn_hmm_online']:.2f} offline {r['mae_cnn_hmm_offline']:.2f} cov90 {r['cov90_online']:.2f} "
              f"({time.time() - t1:.0f}s)", flush=True)
    pickle.dump(per_window, open(OUT_R / "loso_predictions.pkl", "wb"))
    names = ["argmax", "tracker", "cnn", "cnn_hmm_online", "cnn_hmm_offline"]
    summ = {n: {"mae_mean_over_subjects": float(np.mean([r[f"mae_{n}"] for r in rows])),
                "mae_sd_over_subjects": float(np.std([r[f"mae_{n}"] for r in rows])),
                "rmse_mean_over_subjects": float(np.mean([r[f"rmse_{n}"] for r in rows]))} for n in names}
    all_y = np.concatenate([per_window[s]["y"] for s in per_window])
    all_a = np.concatenate([per_window[s]["act"] for s in per_window])
    by_act = {}
    for a_id, a_name in ACT.items():
        m = all_a == a_id
        if m.sum():
            by_act[a_name] = {n: float(np.mean(np.abs(np.concatenate([per_window[s]["tracker" if n == "tracker" else "online"] for s in per_window])[m] - all_y[m])))
                              for n in ("tracker", "online")} | {"n": int(m.sum())}
    unc = {k: float(np.mean([r[k] for r in rows])) for k in ("cov90_online", "spearman_sd_abserr", "mae_online_keep90", "mae_online_keep80")}
    if len(per_window) > 1:
        conf = conformal_coverage(per_window)
        unc["cov90_conformal"] = float(np.mean([c["coverage"] for c in conf.values()]))
        unc["width90_conformal_bpm"] = float(np.mean([c["mean_width"] for c in conf.values()]))
        unc["conformal_q_mean"] = float(np.mean([c["q"] for c in conf.values()]))
        for r in rows:
            r["cov90_conformal"] = conf[r["subject"]]["coverage"]
        pickle.dump(per_window, open(OUT_R / "loso_predictions.pkl", "wb"))
    res = {"config": CFG, "k_context": K_CTX, "bins_bpm": [float(BPM[0]), float(BPM[-1]), float(BPM[1] - BPM[0])],
           "summary": summ, "uncertainty": unc, "by_activity": by_act, "per_subject": rows,
           "literature": {"DeepPPG_Reiss2019_LOSO_MAE": 7.65, "BeliefPPG_Bieri2023_LOSO_MAE_online": 3.57,
                          "note": "published LOSO MAE on PPG-DaLiA (8 s windows, 2 s shift); see report for citations"}}
    if len(only) == 15 or SMOKE:
        json.dump(res, open(OUT_R / "metrics.json", "w"), indent=1)
        # demo trace for the dashboard: subject with median online MAE
        sd_ = sorted(rows, key=lambda r: r["mae_cnn_hmm_online"])[len(rows) // 2]["subject"]
        pw = per_window[sd_]
        if "lo_conf" not in pw:  # conformal needs >1 test subject (smoke mode): fall back to belief quantiles
            pw["lo_conf"], pw["hi_conf"] = pw["lo"], pw["hi"]
        json.dump({"subject": int(sd_), "t_s": (np.arange(len(pw["y"])) * 2).tolist()[::5],
                   **{k: np.round(pw[k], 1).tolist()[::5] for k in ("y", "online", "lo_conf", "hi_conf", "sd", "tracker")},
                   "activity": [ACT[int(a)] for a in pw["act"][::5]]}, open(OUT_R / "demo_trace.json", "w"))
        # deployable model trained on all subjects
        T, b = transition([hr[sub == o] for o in np.unique(sub)])
        for k in range(CFG["n_seeds"]):
            net = train_model(X, ctx, hr_t, np.arange(len(hr)), seed=99 + k)
            tag = f"ppg_hr_cnn_{VER}" + (f"_seed{k}" if CFG["n_seeds"] > 1 else "")
            torch.save({"state_dict": net.state_dict(), "cfg": CFG, "k_context": K_CTX, "nb": NB, "k0": K0, "df_hz": DF,
                        "nfft_ppg": NFFT_PPG, "nfft_acc": NFFT_ACC, "fs_ppg": FS_PPG, "fs_acc": FS_ACC,
                        "cin": int(X.shape[1]), "transition": CFG["transition"], "transition_scale": b, "eps": 1e-3}, OUT_M / f"{tag}.pt")
            try:
                net.eval().cpu()
                torch.onnx.export(net, torch.zeros(1, X.shape[1], K_CTX, NB), str(OUT_M / f"{tag}.onnx"), input_names=["spec"],
                                  output_names=["logits"], dynamic_axes={"spec": {0: "batch"}, "logits": {0: "batch"}}, opset_version=17)
            except Exception as ex:  # ONNX export is optional
                print("onnx export skipped:", ex)
            net.to(DEV)
    print(json.dumps({"summary": summ, "uncertainty": unc}, indent=1))
    print(f"total {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
