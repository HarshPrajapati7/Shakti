"""PRCP (PhysioNet: Physiologic Response to Changes in Posture) -> 1 Hz beat-to-beat maneuver dataset.

10 healthy adults; 250 Hz finger arterial pressure (Finapres), ECG and tilt-table angle; each subject
performs repeated rapid head-up tilts (~2 s to 75 deg), slow tilts (~50 s to 75 deg) and active
stand-ups from supine. Tilts are detected from the measured angle channel; stand-ups from the
event annotations (the table stays flat during active standing).
"""
import re
from pathlib import Path

import numpy as np
import wfdb
from scipy.ndimage import median_filter

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "data" / "raw" / "prcp" / "physiologic-response-to-changes-in-posture-1.0.0"
FS = 250
PRE, POST, BASE = 60, 60, (-40, -3)  # window seconds before onset / after offset; baseline window


def meta(rec):
    m = dict(re.findall(r"<(\w+)>:\s*(\S+)", " ".join(rec.comments)))
    return {"age": int(m["age"]), "sex": m["sex"], "height_cm": float(m["Height"]), "weight_kg": float(m["Weight"])}


def abp_beats(abp, onsets):
    """Beat-wise (time, SBP, DBP, MAP, inter-beat interval) between consecutive pulse onsets."""
    out = []
    for a, b in zip(onsets[:-1], onsets[1:]):
        if not 0.3 * FS <= b - a <= 2.0 * FS:
            continue
        seg = abp[a:b]
        if np.isnan(seg).any():
            continue
        s, d, m = seg.max(), seg.min(), seg.mean()
        if d >= 20 and s <= 250 and s - d >= 10 and 40 <= m <= 170:
            out.append(((a + b) / (2 * FS), s, d, m, (b - a) / FS))
    return np.array(out).T if out else np.zeros((5, 0))


def clean_hr(t, ibi):
    """Interval-plausibility and local-median outlier rejection -> (time, HR bpm)."""
    ok = (ibi > 0.33) & (ibi < 1.6)
    t, ibi = t[ok], ibi[ok]
    med = median_filter(ibi, size=7, mode="nearest")
    ok = np.abs(ibi - med) < 0.2 * med
    return t[ok], 60.0 / ibi[ok]


def to_grid(tb, vb, n, max_gap=3.0):
    """Linear interpolation onto a 1 Hz grid; samples > max_gap s from any beat become NaN."""
    g = np.arange(n) + 0.5
    if len(tb) < 2:
        return np.full(n, np.nan)
    v = np.interp(g, tb, vb, left=np.nan, right=np.nan)
    i = np.clip(np.searchsorted(tb, g), 1, len(tb) - 1)
    v[np.minimum(np.abs(g - tb[i - 1]), np.abs(tb[i] - g)) > max_gap] = np.nan
    return v


def load_record(rid):
    rec = wfdb.rdrecord(str(RAW / rid))
    x = rec.p_signal
    n = x.shape[0] // FS
    abp, ang = x[:, 0], x[:, 2]
    tb, sbp, dbp, mp, ibi = abp_beats(abp, wfdb.rdann(str(RAW / rid), "wabp").sample)
    q = wfdb.rdann(str(RAW / rid), "wqrs").sample
    hr = to_grid(*clean_hr(q[1:] / FS, np.diff(q) / FS), n)
    hr_pulse = to_grid(*clean_hr(tb, ibi), n)
    ann = wfdb.rdann(str(RAW / rid), "anI")
    return {
        "id": rid, **meta(rec),
        "hr": np.where(np.isnan(hr), hr_pulse, hr),
        "map": to_grid(tb, mp, n), "sbp": to_grid(tb, sbp, n), "dbp": to_grid(tb, dbp, n),
        "angle": np.nanmean(ang[: n * FS].reshape(n, FS), axis=1),
        "events": [(s / FS, txt.strip()) for s, txt in zip(ann.sample, ann.aux_note)],
    }


def find_maneuvers(r):
    ang, n, man = r["angle"], len(r["angle"]), []
    e = np.diff(np.r_[0, (ang > 5).astype(np.int8), 0])
    for a, b in zip(np.where(e == 1)[0], np.where(e == -1)[0]):
        if b - a < 30:  # ignore blips such as a failed tilt attempt
            continue
        on, off = a, b
        while on > 0 and ang[on - 1] > 1.0:
            on -= 1
        while off < n and ang[off] > 1.0:
            off += 1
        pk = ang[a:b].max()
        rise = int(np.argmax(ang[on:b] >= 0.9 * pk))
        man.append({"kind": "rapid" if rise <= 8 else "slow", "t_on": on, "t_off": off})
    ev = r["events"]
    for i, (t, txt) in enumerate(ev):
        if "stand" in txt.lower():
            nxt = [t2 for t2, x2 in ev[i + 1:] if "supine" in x2.lower()]
            if nxt and nxt[0] - t < 600:
                man.append({"kind": "stand", "t_on": int(round(t)), "t_off": int(round(nxt[0]))})
    return sorted(man, key=lambda m: m["t_on"])


def stand_input(n, i_on, i_off, ramp=3):
    u = np.zeros(n)
    for k in range(n):
        u[k] = np.clip((k - i_on + 1) / ramp, 0, 1) * np.clip((i_off - k + ramp - 1) / ramp, 0, 1)
    return u


def build_dataset(log=print):
    """Return a list of maneuver dicts (1 Hz arrays, time 0 = maneuver onset) and a list of drop reasons."""
    out, dropped = [], []
    for rid in (RAW / "RECORDS").read_text().split():
        r = load_record(rid)
        mans, n = find_maneuvers(r), len(r["hr"])
        for j, m in enumerate(mans):
            prev_off = mans[j - 1]["t_off"] if j else -10**9
            next_on = mans[j + 1]["t_on"] if j + 1 < len(mans) else 10**9
            w0 = max(0, m["t_on"] - PRE, prev_off + 30)
            w1 = min(n, m["t_off"] + POST, next_on - 10)
            sl = slice(w0, w1)
            t = np.arange(w0, w1) - m["t_on"]
            if m["kind"] == "stand":
                u = stand_input(w1 - w0, m["t_on"] - w0, m["t_off"] - w0)
            else:
                u = np.sin(np.deg2rad(np.clip(r["angle"][sl], 0, 90)))
            onset = np.zeros(w1 - w0)
            if m["kind"] == "stand":
                onset[m["t_on"] - w0] = 1.0
            base = (t >= BASE[0]) & (t <= BASE[1])
            resp = (t >= 0) & (t <= m["t_off"] - m["t_on"] + 30)
            d = {"subject": rid, "kind": m["kind"], "t_on_abs": m["t_on"], "dur": m["t_off"] - m["t_on"], "t": t, "u": u,
                 "onset": onset, "resp": resp, **{k: r[k][sl].copy() for k in ("hr", "map", "sbp", "dbp")},
                 **{k: r[k] for k in ("age", "sex", "height_cm", "weight_kg")}}
            nb = min(np.isfinite(d["hr"][base]).sum(), np.isfinite(d["map"][base]).sum())
            q = min(np.isfinite(d["hr"][resp]).mean(), np.isfinite(d["map"][resp]).mean())
            if nb < 15 or q < 0.7 or t[0] > -30:
                dropped.append((rid, m["kind"], m["t_on"], f"baseline_n={nb} valid_frac={q:.2f} pre={-t[0]}"))
                continue
            for k in ("hr", "map", "sbp", "dbp"):
                d[k + "0"] = float(np.nanmedian(d[k][base]))
            out.append(d)
        log(f"{rid}: {sum(1 for d in out if d['subject'] == rid)} maneuvers kept")
    return out, dropped
