"""GRAVITY-HEART fitting, evaluation (E0-E3 ablation) and gravity / countermeasure scenarios."""
import numpy as np
from scipy.optimize import least_squares
from sklearn.linear_model import Ridge

from . import model as M

SIG = {"hr": 3.0, "map": 4.0}  # observation noise scales (bpm, mmHg)
NU = 8.0                       # 1 Hz samples per effectively independent residual (reflex time constants ~5-10 s)
HUBER_C = 2.0                  # robust (pseudo-Huber) threshold in noise-SD units, data residuals only
MU0, SD0 = np.log(M.PRIOR_MEDIAN), M.PRIOR_SDLOG
LO, HI = MU0 - 3 * SD0, MU0 + 3 * SD0
OH_SUSTAINED = 10 + (20 - 10) / 3  # MAP-equivalent of consensus classical OH (SBP -20 / DBP -10 mmHg)
OH_INITIAL = 20 + (40 - 20) / 3    # MAP-equivalent of consensus initial OH (SBP -40 / DBP -20 mmHg within 15 s)


def onset_idx(d):
    return float(np.argmax(d["onset"])) if d["onset"].any() else -1.0


def sim_man(theta, d, **kw):
    return M.simulate(np.exp(theta), d["u"], d["hr0"], d["map0"], d["height_cm"], onset=onset_idx(d), **kw)


def _robust(e):
    c = HUBER_C
    return np.sign(e) * np.sqrt(2 * c * c * (np.sqrt(1 + (e / c) ** 2) - 1))


def _res(theta, mans, mu, sd):
    r = []
    for d in mans:
        s = sim_man(theta, d)
        for k in ("hr", "map"):
            e = (s[k] - d[k]) / SIG[k]
            r.append(_robust(e[np.isfinite(e)]) / np.sqrt(NU))
    r.append((theta - mu) / sd)
    return np.concatenate(r)


def fit(mans, mu=MU0, sd=SD0, x0=None):
    """MAP estimate of log-parameters with Gaussian prior N(mu, sd^2); returns (theta, cov, obs_sd)."""
    x0 = np.clip(mu if x0 is None else x0, LO + 1e-3, HI - 1e-3)
    r = least_squares(_res, x0, bounds=(LO, HI), args=(mans, mu, sd), x_scale=1.0, max_nfev=300, diff_step=1e-3)
    J = r.jac
    cov = np.linalg.pinv(J.T @ J)
    obs = {}
    for k in ("hr", "map"):
        e = np.concatenate([(sim_man(r.x, d)[k] - d[k]) for d in mans])
        obs[k] = float(np.sqrt(np.nanmean(e ** 2)))
    return r.x, cov, obs


def interval(theta, cov, obs_sd, d, n=200, seed=0, q=(0.05, 0.5, 0.95)):
    rng = np.random.default_rng(seed)
    L = np.linalg.cholesky(cov + 1e-8 * np.eye(len(theta)))
    sims = []
    for _ in range(n):
        th = np.clip(theta + L @ rng.standard_normal(len(theta)), LO, HI)
        s = sim_man(th, d)
        sims.append(np.stack([s["hr"], s["map"]]))
    sims = np.array(sims)
    sims += rng.standard_normal(sims.shape) * np.array([obs_sd["hr"], obs_sd["map"]])[None, :, None]
    return np.quantile(sims, q, axis=0)  # (len(q), 2, T)


# ---------------------------------------------------------------- E0: data-driven linear FIR baseline
K_FIR = 90


def _fir_X(d):
    T, cols = len(d["u"]), []
    for sig in (d["u"], d["onset"]):
        Z = np.zeros((T, K_FIR))
        for k in range(K_FIR):
            Z[k:, k] = sig[: T - k]
        cols.append(Z)
    return np.hstack(cols)


def fir_fit(mans, alpha):
    models = {}
    X = np.vstack([_fir_X(d) for d in mans])
    for k in ("hr", "map"):
        y = np.concatenate([d[k] - d[k + "0"] for d in mans])
        ok = np.isfinite(y)
        models[k] = Ridge(alpha=alpha, fit_intercept=False).fit(X[ok], y[ok])
    return models


def fir_predict(models, d):
    X = _fir_X(d)
    return {k: d[k + "0"] + models[k].predict(X) for k in ("hr", "map")}


def fir_fit_cv(mans, alphas=(1.0, 10.0, 100.0, 1000.0)):
    subs = sorted({d["subject"] for d in mans})
    best = None
    for a in alphas:
        err = []
        for s in subs:
            m = fir_fit([d for d in mans if d["subject"] != s], a)
            for d in mans:
                if d["subject"] == s:
                    p = fir_predict(m, d)
                    err += [np.nanmean(((p[k] - d[k]) / SIG[k])[d["resp"]] ** 2) for k in ("hr", "map")]
        e = float(np.mean(err))
        if best is None or e < best[0]:
            best = (e, a)
    return fir_fit(mans, best[1]), best[1]


# ---------------------------------------------------------------- metrics
def _smooth(x, w=5):
    return np.convolve(np.nan_to_num(x, nan=np.nanmean(x)), np.ones(w) / w, mode="same")


def features(hr, mp, d):
    t, dur = d["t"], d["dur"]
    plateau = (t >= max(dur - 60, 30)) & (t < dur)
    early = (t >= 0) & (t <= 30)
    return {
        "dhr_plateau": float(np.nanmean(hr[plateau]) - d["hr0"]),
        "dmap_plateau": float(np.nanmean(mp[plateau]) - d["map0"]),
        "dhr_peak30": float(np.nanmax(_smooth(hr)[early]) - d["hr0"]),
        "dmap_nadir30": float(np.nanmin(_smooth(mp)[early]) - d["map0"]),
    }


def metrics(pred, d, pi=None):
    m, out = d["resp"], {}
    for k in ("hr", "map"):
        e = (pred[k] - d[k])[m]
        out["rmse_" + k] = float(np.sqrt(np.nanmean(e ** 2)))
    fo, fp = features(d["hr"], d["map"], d), features(pred["hr"], pred["map"], d)
    for k in fo:
        out["obs_" + k], out["pred_" + k], out["abserr_" + k] = fo[k], fp[k], abs(fp[k] - fo[k])
    if pi is not None:
        for j, k in enumerate(("hr", "map")):
            y, lo, hi = d[k][m], pi[0, j][m], pi[2, j][m]
            ok = np.isfinite(y)
            out["cov90_" + k] = float(np.mean((y[ok] >= lo[ok]) & (y[ok] <= hi[ok])))
            out["piw90_" + k] = float(np.mean((hi - lo)[ok]))
    return out


def hier_prior(thetas):
    """Empirical-Bayes population prior from per-subject fits (log space), floored and capped."""
    T = np.array(thetas)
    return T.mean(0), np.clip(T.std(0, ddof=1), 0.15, SD0)


# ---------------------------------------------------------------- scenarios
def stand_profile(g_ratio, t_pre=60, t_stand=240, ramp=3):
    T = t_pre + t_stand
    u = np.clip((np.arange(T) - t_pre + 1) / ramp, 0, 1) * g_ratio
    return u, float(t_pre)


def stand_summary(sim, map0, hr0, t_pre=60):
    mp, hr = sim["map"], sim["hr"]
    sm = _smooth(mp)
    s = slice(t_pre, t_pre + 15)
    sus = slice(t_pre + 30, t_pre + 180)
    return {
        "dmap_initial": float(sm[s].min() - map0),
        "dmap_sustained": float(np.mean(mp[sus]) - map0),
        "dhr_sustained": float(np.mean(hr[sus]) - hr0),
        "map_brain_sustained": float(np.mean(sim["map_brain"][sus])),
        "sv_rel_sustained": float(np.mean(sim["sv_rel"][sus])),
        "v_pool_sustained_ml": float(np.mean(sim["v_pool"][sus])),
    }


def oh_flags(s):
    return {
        "initial_oh": s["dmap_initial"] <= -OH_INITIAL,
        "classical_oh": s["dmap_sustained"] <= -OH_SUSTAINED,
        "margin_sustained_mmHg": float(s["dmap_sustained"] + OH_SUSTAINED),
        "margin_initial_mmHg": float(s["dmap_initial"] + OH_INITIAL),
    }


def run_stand(theta, hr0, map0, height_cm, g_ratio, dvcs=0.0, cmul=1.0):
    u, on = stand_profile(g_ratio)
    sim = M.simulate(np.exp(theta), u, hr0, map0, height_cm, onset=on, dvcs=dvcs, cmul=cmul)
    s = stand_summary(sim, map0, hr0)
    return sim, {**s, **oh_flags(s)}


def volume_tolerance(theta, hr0, map0, height_cm, g_ratio, cmul=1.0, step=10.0, vmax=900.0):
    """Largest central-volume deficit (mL) with no predicted initial or classical OH."""
    last_ok = None
    for v in np.arange(0.0, vmax + step, step):
        _, s = run_stand(theta, hr0, map0, height_cm, g_ratio, dvcs=v, cmul=cmul)
        if s["initial_oh"] or s["classical_oh"]:
            return last_ok if last_ok is not None else 0.0, False
        last_ok = float(v)
    return float(vmax), True  # censored: tolerated the full range
