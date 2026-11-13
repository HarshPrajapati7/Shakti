"""Train and evaluate GRAVITY-HEART on PRCP; write models/ and results/ artefacts.

Ablation (all predictions are for maneuvers the model never saw):
  Z   zero-response reference (predict the pre-maneuver baseline)
  E0  population data-driven FIR (ridge, inner-CV alpha), leave-one-subject-out
  E1  population mechanistic model, leave-one-subject-out
  E2  personalised mechanistic model, weak prior, leave-one-maneuver-out within subject
  E3  personalised mechanistic model, hierarchical prior from the other subjects, leave-one-maneuver-out
  E3_1cal  as E3 but calibrated on a single other maneuver of the subject
"""
import json
import os
import pickle
import sys
import time
from pathlib import Path

import numpy as np
from scipy.stats import wilcoxon

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from astra.gravity import fit as F, model as M, prcp  # noqa: E402

SMOKE = os.environ.get("ASTRA_SMOKE") == "1"
_sub = ("smoke",) if SMOKE else ()
OUT_R, OUT_M = ROOT.joinpath("results", *_sub, "gravity_heart"), ROOT.joinpath("models", *_sub, "gravity_heart")
OUT_R.mkdir(parents=True, exist_ok=True)
OUT_M.mkdir(parents=True, exist_ok=True)


def jdump(obj, path):
    def conv(o):
        if isinstance(o, (np.floating, np.integer)):
            return o.item()
        if isinstance(o, np.ndarray):
            return [None if (isinstance(v, float) and not np.isfinite(v)) else v for v in np.round(o, 3).tolist()]
        if isinstance(o, np.bool_):
            return bool(o)
        raise TypeError(type(o))
    Path(path).write_text(json.dumps(obj, default=conv, indent=1))


def main():
    t0 = time.time()
    cache = ROOT / "data" / "processed" / "prcp_maneuvers.pkl"
    if cache.exists():
        mans, dropped = pickle.load(open(cache, "rb"))
    else:
        mans, dropped = prcp.build_dataset()
        pickle.dump((mans, dropped), open(cache, "wb"))
    subs = sorted({d["subject"] for d in mans})
    if SMOKE:  # 3 subjects only
        subs = subs[:3]
        mans = [d for d in mans if d["subject"] in subs]
    kinds = {k: sum(d["kind"] == k for d in mans) for k in ("rapid", "slow", "stand")}
    print(f"{len(mans)} maneuvers from {len(subs)} subjects {kinds}; dropped {len(dropped)}")

    # per-subject full fits (weak prior) -> used for hierarchical priors of OTHER subjects
    full = {s: F.fit([d for d in mans if d["subject"] == s])[0] for s in subs}
    rows = []
    for s in subs:
        tr = [d for d in mans if d["subject"] != s]
        te = [d for d in mans if d["subject"] == s]
        th_pop, _, _ = F.fit(tr)
        fir, alpha = F.fir_fit_cv(tr)
        mu_h, sd_h = F.hier_prior([full[o] for o in subs if o != s])
        for i, d in enumerate(te):
            cal = [x for j, x in enumerate(te) if j != i]
            th2, _, _ = F.fit(cal, x0=th_pop)
            th3, cov3, obs3 = F.fit(cal, mu=mu_h, sd=sd_h, x0=mu_h)
            th31, cov31, obs31 = F.fit(cal[:1], mu=mu_h, sd=sd_h, x0=mu_h)
            preds = {
                "Z": ({"hr": np.full(len(d["t"]), d["hr0"]), "map": np.full(len(d["t"]), d["map0"])}, None),
                "E0": (F.fir_predict(fir, d), None),
                "E1": (F.sim_man(th_pop, d), None),
                "E2": (F.sim_man(th2, d), None),
                "E3": (F.sim_man(th3, d), F.interval(th3, cov3, obs3, d)),
                "E3_1cal": (F.sim_man(th31, d), F.interval(th31, cov31, obs31, d)),
            }
            for name, (p, pi) in preds.items():
                rows.append({"method": name, "subject": s, "kind": d["kind"], "t_on": d["t_on_abs"], **F.metrics(p, d, pi)})
        print(f"  {s} done ({time.time() - t0:.0f}s)  fir_alpha={alpha}")

    # ---------------- aggregate
    methods = ["Z", "E0", "E1", "E2", "E3", "E3_1cal"]
    keys = ["rmse_hr", "rmse_map", "abserr_dhr_plateau", "abserr_dmap_plateau", "abserr_dhr_peak30", "abserr_dmap_nadir30"]
    summary = {}
    for mth in methods:
        R = [r for r in rows if r["method"] == mth]
        persub = {k: [np.mean([r[k] for r in R if r["subject"] == s]) for s in subs] for k in keys}
        summary[mth] = {k: {"mean": float(np.mean([r[k] for r in R])), "median": float(np.median([r[k] for r in R])),
                            "subject_mean": float(np.mean(persub[k]))} for k in keys}
        for k in ("cov90_hr", "cov90_map", "piw90_hr", "piw90_map"):
            if k in R[0]:
                summary[mth][k] = float(np.mean([r[k] for r in R]))
        summary[mth]["by_kind"] = {kd: {k: float(np.mean([r[k] for r in R if r["kind"] == kd])) for k in ("rmse_hr", "rmse_map")}
                                   for kd in kinds}
    tests = {}
    for a, b in [("E1", "E0"), ("E2", "E1"), ("E3", "E1"), ("E3", "E2"), ("E3_1cal", "E1")]:
        for k in ("rmse_hr", "rmse_map"):
            xa = [np.mean([r[k] for r in rows if r["method"] == a and r["subject"] == s]) for s in subs]
            xb = [np.mean([r[k] for r in rows if r["method"] == b and r["subject"] == s]) for s in subs]
            tests[f"{a}_vs_{b}_{k}"] = {"mean_diff": float(np.mean(np.array(xa) - np.array(xb))),
                                        "wilcoxon_p": float(wilcoxon(xa, xb).pvalue), "n_subjects": len(subs)}

    # ---------------- deployable model file: population + personalised parameters
    th_all, cov_all, obs_all = F.fit(mans)
    mu_all, sd_all = F.hier_prior(list(full.values()))
    personal, scen = {}, {}
    env = {k: M.G[k] for k in ("earth", "mars", "moon")}
    for s in subs:
        ds = [d for d in mans if d["subject"] == s]
        mu_o, sd_o = F.hier_prior([full[o] for o in subs if o != s])
        th, cov, obs = F.fit(ds, mu=mu_o, sd=sd_o, x0=mu_o)
        hr0, map0 = float(np.median([d["hr0"] for d in ds])), float(np.median([d["map0"] for d in ds]))
        h, w, sex = ds[0]["height_cm"], ds[0]["weight_kg"], ds[0]["sex"]
        personal[s] = {"theta_log": th, "params": dict(zip(M.PARAMS, np.exp(th))), "cov_log": cov, "obs_sd": obs,
                       "hr0": hr0, "map0": map0, "height_cm": h, "weight_kg": w, "sex": sex, "age": ds[0]["age"],
                       "n_maneuvers": len(ds)}
        pv = 0.58 * M.blood_volume_ml(w, sex)  # plasma volume (Hct ~0.42)
        sc = {"plasma_volume_ml": pv, "environments": {}}
        for e, g in env.items():
            tol, cens = F.volume_tolerance(th, hr0, map0, h, g)
            cases = {}
            for cname, dv, cm in [("preflight", 0.0, 1.0), ("postflight_pv12", 0.12 * pv, 1.0),
                                  ("postflight_pv12_fluid_loading", max(0.0, 0.12 * pv - 250.0), 1.0),
                                  ("postflight_pv12_compression", 0.12 * pv, 0.6)]:
                sim, summ = F.run_stand(th, hr0, map0, h, g, dvcs=dv, cmul=cm)
                cases[cname] = {"dvcs_ml": dv, "cmul": cm, "summary": summ,
                                "trace": {k: sim[k][::2] for k in ("hr", "map", "map_brain", "sv_rel", "v_pool")}}
            sc["environments"][e] = {"g_ratio": g, "equivalent_tilt_deg": float(np.degrees(np.arcsin(g))),
                                     "volume_tolerance_ml": tol, "tolerance_censored": cens, "cases": cases}
        scen[s] = sc
    model_file = {
        "name": "GRAVITY-HEART", "version": "1.0.0", "trained_on": "PhysioNet PRCP v1.0.0 (10 subjects)",
        "created": time.strftime("%Y-%m-%d %H:%M"), "params": M.PARAMS, "units": M.UNITS, "fixed": M.FIXED,
        "prior_median": M.PRIOR_MEDIAN, "prior_sdlog": M.PRIOR_SDLOG,
        "population": {"theta_log": th_all, "params": dict(zip(M.PARAMS, np.exp(th_all))), "cov_log": cov_all,
                       "obs_sd": obs_all, "hier_mu_log": mu_all, "hier_sd_log": sd_all},
        "personal": personal,
        "thresholds": {"oh_sustained_map_drop": F.OH_SUSTAINED, "oh_initial_map_drop": F.OH_INITIAL},
        "input_definition": "u = (g_local/g_earth) * sin(head-up tilt angle); active stand: u = g_local/g_earth, onset index marks stand",
    }
    # reference test vector so ports of the simulator (e.g. TypeScript) can be verified
    u_ref, on_ref = F.stand_profile(M.G["mars"])
    ref = M.simulate(np.exp(th_all), u_ref, 65.0, 85.0, 175.0, onset=on_ref, dvcs=300.0, cmul=1.0)
    model_file["test_vector"] = {"g_ratio": M.G["mars"], "hr0": 65.0, "map0": 85.0, "height_cm": 175.0, "onset": on_ref,
                                 "dvcs": 300.0, "cmul": 1.0, "u": u_ref, "hr": ref["hr"], "map": ref["map"]}
    jdump(model_file, OUT_M / "gravity_heart_v1.json")
    jdump({"summary": summary, "tests": tests, "rows": rows, "n_maneuvers": len(mans), "kinds": kinds,
           "dropped": dropped, "subjects": subs}, OUT_R / "metrics.json")
    jdump(scen, OUT_R / "scenarios.json")
    pickle.dump({"mans": mans, "full": full, "personal": personal, "population": th_all}, open(OUT_M / "gravity_heart_v1.pkl", "wb"))
    print(f"total {time.time() - t0:.0f}s")
    for mth in methods:
        s_ = summary[mth]
        print(f"{mth:8s} RMSE HR {s_['rmse_hr']['mean']:.2f}  MAP {s_['rmse_map']['mean']:.2f} | plateau err dHR "
              f"{s_['abserr_dhr_plateau']['mean']:.2f} dMAP {s_['abserr_dmap_plateau']['mean']:.2f} | nadir err "
              f"{s_['abserr_dmap_nadir30']['mean']:.2f}" + (f" | cov90 {s_.get('cov90_hr', 0):.2f}/{s_.get('cov90_map', 0):.2f}" if "cov90_hr" in s_ else ""))
    for k, v in tests.items():
        print(f"  {k}: diff {v['mean_diff']:+.2f} p={v['wilcoxon_p']:.3f}")
    for s in subs:
        print(s, {e: (round(scen[s]["environments"][e]["volume_tolerance_ml"]), scen[s]["environments"][e]["tolerance_censored"]) for e in env})


if __name__ == "__main__":
    main()
