"""Export the trained models for the Rust engine (engine/assets) + reference outputs for Rust tests.

* gravity.json        GRAVITY-HEART parameters / test vector (copied from the web data export)
* ppg_model.bin/.json heart-rate CNN ensemble, BatchNorm folded into conv weights, little-endian f32
* sample_wrist.csv    6-minute wrist recording (PPG-DaLiA S15, CC BY 4.0): bvp, acc_x, acc_y, acc_z @ 64 Hz, acc in g
* ppg_reference.json  Python fp32 outputs of the full pipeline on that CSV (Rust must reproduce them)
"""
import io
import json
import os
import pickle
import shutil
import struct
import sys
import zipfile
from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
os.environ.setdefault("PPG_VER", "v2")
import train_ppg_hr as P  # noqa: E402

A = ROOT / "engine" / "assets"
A.mkdir(parents=True, exist_ok=True)
shutil.copy(ROOT / "apps" / "web" / "public" / "data" / "gravity.json", A / "gravity.json")

ckpts = sorted((ROOT / "models" / f"ppg_hr_{P.VER}").glob(f"ppg_hr_cnn_{P.VER}*.pt"))
nets, layers_meta, blob = [], None, []


def fold(conv, bn):
    w, b = conv.weight.detach().double(), (conv.bias.detach().double() if conv.bias is not None else torch.zeros(conv.out_channels, dtype=torch.float64))
    if bn is not None:
        s = bn.weight.detach().double() / torch.sqrt(bn.running_var.double() + bn.eps)
        w = w * s.view(-1, *([1] * (w.dim() - 1)))
        b = (b - bn.running_mean.double()) * s + bn.bias.detach().double()
    return w.float().numpy(), b.float().numpy()


for f in ckpts:
    ck = torch.load(f, map_location="cpu")
    net = P.PPGNet(cin=ck.get("cin", 6), w=ck["cfg"]["width"]).eval()
    net.load_state_dict(ck["state_dict"])
    nets.append(net)
    L = [("stem0", *fold(net.stem[0], net.stem[1]), 1), ("stem1", *fold(net.stem[3], net.stem[4]), 1), ("tc", *fold(net.tc[0], net.tc[1]), 1)]
    L += [(f"res{i}", *fold(r.c, r.b), r.c.dilation[0]) for i, r in enumerate(net.fr)]
    L += [("head", *fold(net.head, None), 1)]
    meta = []
    for name, w, b, dil in L:
        meta.append({"name": name, "shape": list(w.shape), "dilation": int(dil)})
        blob += [w.ravel(), b.ravel()]
    layers_meta = meta

D = P.load_cache()
lr = np.concatenate([np.diff(np.log(D["hr"][D["sub"] == s])) for s in np.unique(D["sub"])])
pm = json.load(open(ROOT / "results" / f"ppg_hr_{P.VER}" / "metrics.json"))
(A / "ppg_model.bin").write_bytes(np.concatenate(blob).astype("<f4").tobytes())
json.dump({"version": P.VER, "n_models": len(nets), "cin": nets[0].stem[0].in_channels, "k_context": P.K_CTX, "nb": P.NB,
           "k0": P.K0, "df_hz": P.DF, "fs_ppg": P.FS_PPG, "fs_acc": P.FS_ACC, "nfft_ppg": P.NFFT_PPG, "nfft_acc": P.NFFT_ACC,
           "trans_mu": float(lr.mean()), "trans_sigma": float(max(lr.std(), 1e-3)), "eps": 1e-3,
           "conformal_q": pm["uncertainty"].get("conformal_q_mean", 3.5), "layers": layers_meta,
           "loso_online_mae": pm["summary"]["cnn_hmm_online"]["mae_mean_over_subjects"]}, open(A / "ppg_model.json", "w"), indent=1)

# ---- sample recording (6 min of S15) + fp32 python reference
z = zipfile.ZipFile(P.ZIP)
with z.open("PPG_FieldStudy/S15/S15.pkl") as fh:
    d = pickle.load(io.BufferedReader(fh), encoding="latin1")
t0, secs = 600, 360
bvp = d["signal"]["wrist"]["BVP"][t0 * 64:(t0 + secs) * 64, 0].astype(np.float64)
acc32 = d["signal"]["wrist"]["ACC"][t0 * 32:(t0 + secs) * 32].astype(np.float64)
ecg_hr = np.asarray(d["label"], float)[t0 // 2:(t0 + secs) // 2]
acc64 = np.repeat(acc32, 2, axis=0) / 64.0  # g units at 64 Hz (what a user file contains)
with open(A / "sample_wrist.csv", "w") as f:
    f.write("bvp,acc_x,acc_y,acc_z\n")
    for i in range(len(bvp)):
        f.write(f"{bvp[i]:.2f},{acc64[i, 0]:.4f},{acc64[i, 1]:.4f},{acc64[i, 2]:.4f}\n")
# reference = exactly what the Rust engine does: parse CSV -> acc*64 at 32 Hz -> spectra -> net -> HMM
csv = np.loadtxt(A / "sample_wrist.csv", delimiter=",", skiprows=1)
b_, a_ = csv[:, 0], csv[::2, 1:4] * 64.0
n = min((len(b_) - 512) // 128 + 1, (len(a_) - 256) // 64 + 1)
Pp, Aa = P.spectra(b_, a_, n)
X = P.features_tensor({"ppg": Pp, "acc": Aa})
ctx = P.context_index(np.zeros(n, int))
xin = torch.as_tensor(X[ctx].transpose(0, 2, 1, 3))
with torch.no_grad():
    logits0 = nets[0](xin).numpy()
    prob = np.mean([torch.softmax(m(xin), 1).numpy() for m in nets], 0)
k = np.arange(P.NB)
Lg = np.log(P.BPM)
T = np.exp(-0.5 * ((Lg[None] - Lg[:, None] - lr.mean()) / max(lr.std(), 1e-3)) ** 2)
T = T / T.sum(1, keepdims=True)
T = (1 - 1e-3) * T + 1e-3 / P.NB
est, sd, _, _ = P.point_estimate(P.forward_filter(prob, T))
json.dump({"n_windows": int(n), "logits0_w0": logits0[0].tolist(), "logits0_wlast": logits0[-1].tolist(),
           "hr_online": est.round(3).tolist(), "sd": sd.round(3).tolist(), "ecg_hr": ecg_hr[:n].round(2).tolist()},
          open(A / "ppg_reference.json", "w"))
print(f"{len(nets)} models, {sum(x.size for x in blob) / 1e6:.2f} M floats; sample {n} windows; "
      f"MAE vs ECG on sample {np.abs(est - ecg_hr[:n]).mean():.2f} bpm")
