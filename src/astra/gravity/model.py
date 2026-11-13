"""GRAVITY-HEART: reduced-order, gravity-driven closed-loop cardiovascular model.

Input u(t) is the gravitational load along the head-to-foot body axis as a fraction of Earth
gravity: u = (g_local / g_earth) * sin(tilt angle). For an active stand u = g_local / g_earth.

Mechanisms (all pressures in mmHg, volumes in mL, time in s):
  * Hydrostatic venous pooling     V_f -> C_pool * rho*g*h_pool * u            (time constant tau_pool)
  * Transcapillary filtration      V_s -> k_filt * C_pool * rho*g*h_pool * u   (tau_filt, fixed)
  * Frank-Starling preload curve   SV/SV0 = (1 - exp(-V_cs / V_k)) / (1 - exp(-V_cs0 / V_k)),
                                   V_cs = V_cs0 - dV_cs_loss - V_f - V_s    (central stressed volume)
  * Haemodynamics                  MAP = MAP0 * (HR/HR0) * (SV/SV0) * (TPR/TPR0)
  * Arterial baroreflex            carotid-sinus error e = (MAP0 - MAP) + rho*g*h_cs * u
  * Cardiopulmonary reflex         TPR drive proportional to pooled volume
  * Effector saturation            dHR -> hr_max * tanh(G_hr*e / hr_max)                      (tau_hr)
                                   dTPR -> tpr_max * tanh((G_tpr*e + G_cp*V/100) / tpr_max)   (tau_tpr)
  * Active stand (leg-muscle vasodilation + central command), only at a stand onset:
                                   TPR *= 1 - A_vd*exp(-t/tau_vd),  HR += A_cc*exp(-t/tau_cc)
"""
import numpy as np
from numba import njit

MMHG_PER_M = 1060.0 * 9.80665 / 133.322  # hydrostatic gradient of blood at 1 g (mmHg per metre)
G = {"earth": 1.0, "mars": 3.721 / 9.80665, "moon": 1.625 / 9.80665, "microgravity": 0.0}

PARAMS = ["C_pool", "tau_pool", "V_k", "G_hr", "tau_hr", "G_tpr", "G_cp", "tau_tpr", "A_vd", "A_cc", "k_filt"]
UNITS = ["mL/mmHg", "s", "mL", "bpm/mmHg", "s", "1/mmHg", "1/100mL", "s", "-", "bpm", "-"]
PRIOR_MEDIAN = np.array([12.0, 8.0, 600.0, 0.8, 4.0, 0.010, 0.05, 12.0, 0.25, 12.0, 0.30])
PRIOR_SDLOG = np.array([0.5, 0.5, 0.5, 0.6, 0.5, 0.8, 0.8, 0.5, 0.6, 0.6, 0.8])

# Fixed physiology (literature-scale values; see reports/gravity_heart.md for sources and caveats)
FIXED = {
    "V_cs0": 1000.0,      # central stressed blood volume, supine (mL)
    "tau_filt": 300.0,    # capillary filtration time constant (s)
    "tau_vd": 6.0,        # active-stand vasodilation decay (s)
    "tau_cc": 4.0,        # central-command HR transient decay (s)
    "hr_max": 70.0,       # reflex HR range (bpm)
    "tpr_max": 0.8,       # reflex TPR range (fraction)
    "h_pool": 0.50,       # effective hydrostatic column for venous pooling for a 1.75 m adult (m)
    "h_cs": 0.25,         # heart -> carotid sinus height for a 1.75 m adult (m)
    "h_brain": 0.32,      # heart -> brain (MCA) height for a 1.75 m adult (m)
}
_FIX = np.array([FIXED[k] for k in ("V_cs0", "tau_filt", "tau_vd", "tau_cc", "hr_max", "tpr_max")])


@njit(cache=True)
def _sim(p, fx, u, onset, hr0, map0, height_m, dvcs, cmul, sub):
    C, tpool, vk, ghr, thr, gtpr, gcp, ttpr, avd, acc, kf = p
    vcs0, tfilt, tvd, tcc, hrmax, tprmax = fx
    C = C * cmul
    s = height_m / 1.75
    rgh = MMHG_PER_M * 0.50 * s
    rcs = MMHG_PER_M * 0.25 * s
    rbr = MMHG_PER_M * 0.32 * s
    n = u.shape[0]
    out = np.empty((n, 5))  # HR, MAP, SV_rel, V_pooled, MAP_brain
    f0 = 1.0 - np.exp(-vcs0 / vk)
    vf = 0.0
    vs = 0.0
    dhr = 0.0
    dr = 0.0
    dt = 1.0 / sub
    af = 1.0 - np.exp(-dt / tpool)
    asl = 1.0 - np.exp(-dt / tfilt)
    ah = 1.0 - np.exp(-dt / thr)
    ar = 1.0 - np.exp(-dt / ttpr)
    for k in range(n):
        for j in range(sub):
            uk = u[k] if (k + 1 >= n or j == 0) else u[k] + (u[k + 1] - u[k]) * j * dt
            ts = k + j * dt - onset
            vd = avd * np.exp(-ts / tvd) if (onset >= 0 and ts >= 0) else 0.0
            cc = acc * np.exp(-ts / tcc) if (onset >= 0 and ts >= 0) else 0.0
            vp = vf + vs
            vcs = max(vcs0 - dvcs - vp, 20.0)
            sv = (1.0 - np.exp(-vcs / vk)) / f0
            hr = max(hr0 + dhr + cc, 30.0)
            mp = map0 * (hr / hr0) * sv * (1.0 + dr) * (1.0 - vd)
            if j == 0:
                out[k, 0] = hr
                out[k, 1] = mp
                out[k, 2] = sv
                out[k, 3] = vp
                out[k, 4] = mp - rbr * uk
            e = (map0 - mp) + rcs * uk
            th = hrmax * np.tanh(ghr * e / hrmax)
            tr = tprmax * np.tanh((gtpr * e + gcp * vp / 100.0) / tprmax)
            vf += af * (C * rgh * uk - vf)
            vs += asl * (kf * C * rgh * uk - vs)
            dhr += ah * (th - dhr)
            dr += ar * (tr - dr)
    return out


def simulate(params, u, hr0, map0, height_cm, onset=-1, dvcs=0.0, cmul=1.0, sub=4):
    """Return dict of 1 Hz trajectories. params: natural-unit array ordered as PARAMS."""
    o = _sim(np.asarray(params, float), _FIX, np.asarray(u, float), float(onset), float(hr0), float(map0),
             float(height_cm) / 100.0, float(dvcs), float(cmul), int(sub))
    return {"hr": o[:, 0], "map": o[:, 1], "sv_rel": o[:, 2], "v_pool": o[:, 3], "map_brain": o[:, 4]}


def blood_volume_ml(weight_kg, sex):
    return weight_kg * (70.0 if str(sex).upper().startswith("M") else 65.0)
