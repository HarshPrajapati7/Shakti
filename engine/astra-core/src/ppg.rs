//! Wrist PPG heart-rate estimation: spectra -> spectro-temporal CNN ensemble -> HMM belief tracking.
//! Bit-for-bit the same preprocessing as scripts/train_ppg_hr.py; weights exported by scripts/export_rust_assets.py.
use rustfft::{num_complex::Complex, FftPlanner};
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Deserialize, Clone)]
pub struct Layer { pub name: String, pub shape: Vec<usize>, pub dilation: usize }

#[derive(Deserialize, Clone)]
pub struct Meta { pub n_models: usize, pub cin: usize, pub k_context: usize, pub nb: usize, pub k0: usize, pub df_hz: f64,
    pub nfft_ppg: usize, pub nfft_acc: usize, pub trans_mu: f64, pub trans_sigma: f64, pub eps: f64, pub conformal_q: f64,
    pub layers: Vec<Layer>, pub loso_online_mae: f64 }

pub struct Conv { pub w: Vec<f32>, pub b: Vec<f32>, pub shape: Vec<usize>, pub dil: usize }
pub struct Net { pub layers: Vec<Conv> }
pub struct Model { pub meta: Meta, pub nets: Vec<Net>, bpm: Vec<f64>, trans: Vec<f64> }

pub fn model() -> &'static Model {
    static M: OnceLock<Model> = OnceLock::new();
    M.get_or_init(|| {
        let meta: Meta = serde_json::from_str(include_str!("../../assets/ppg_model.json")).expect("ppg_model.json");
        let raw = include_bytes!("../../assets/ppg_model.bin");
        let f: Vec<f32> = raw.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
        let (mut pos, mut nets) = (0usize, vec![]);
        for _ in 0..meta.n_models {
            let mut layers = vec![];
            for l in &meta.layers {
                let nw: usize = l.shape.iter().product();
                let w = f[pos..pos + nw].to_vec(); pos += nw;
                let b = f[pos..pos + l.shape[0]].to_vec(); pos += l.shape[0];
                layers.push(Conv { w, b, shape: l.shape.clone(), dil: l.dilation });
            }
            nets.push(Net { layers });
        }
        assert_eq!(pos, f.len(), "weight file does not match ppg_model.json");
        let nb = meta.nb;
        let bpm: Vec<f64> = (0..nb).map(|k| (k + meta.k0) as f64 * meta.df_hz * 60.0).collect();
        let mut trans = vec![0.0; nb * nb];
        for i in 0..nb {
            let row: Vec<f64> = (0..nb).map(|j| (-0.5 * ((bpm[j].ln() - bpm[i].ln() - meta.trans_mu) / meta.trans_sigma).powi(2)).exp()).collect();
            let s: f64 = row.iter().sum();
            for j in 0..nb { trans[i * nb + j] = (1.0 - meta.eps) * row[j] / s + meta.eps / nb as f64; }
        }
        Model { meta, nets, bpm, trans }
    })
}

#[inline]
fn gelu(x: f32) -> f32 { 0.5 * x * (1.0 + libm::erff(x * std::f32::consts::FRAC_1_SQRT_2)) }

impl Net {
    /// x: [cin][K][F] -> logits [F]
    pub fn forward(&self, x: &[f32], cin: usize, kk: usize, nf: usize) -> Vec<f32> {
        let conv2d = |l: &Conv, inp: &[f32], ci: usize| -> Vec<f32> {
            // kernel (3, 9), padding (1, 4); padded input for branch-free inner loops
            let (co, pk, pf) = (l.shape[0], kk + 2, nf + 8);
            let mut pad = vec![0f32; ci * pk * pf];
            for c in 0..ci { for k in 0..kk { pad[(c * pk + k + 1) * pf + 4..(c * pk + k + 1) * pf + 4 + nf].copy_from_slice(&inp[(c * kk + k) * nf..(c * kk + k + 1) * nf]); } }
            let mut out = vec![0f32; co * kk * nf];
            for o in 0..co {
                let ob = &mut out[o * kk * nf..(o + 1) * kk * nf];
                ob.iter_mut().for_each(|v| *v = l.b[o]);
                for c in 0..ci { for dk in 0..3 { for df in 0..9 {
                    let w = l.w[((o * ci + c) * 3 + dk) * 9 + df];
                    for k in 0..kk {
                        let src = &pad[(c * pk + k + dk) * pf + df..(c * pk + k + dk) * pf + df + nf];
                        for (d, s) in ob[k * nf..(k + 1) * nf].iter_mut().zip(src) { *d += w * s; }
                    }
                } } }
            }
            out.iter_mut().for_each(|v| *v = gelu(*v));
            out
        };
        let l = &self.layers;
        let w = l[0].shape[0];
        let h = conv2d(&l[0], x, cin);
        let h = conv2d(&l[1], &h, w);
        // temporal collapse: kernel (K, 1)
        let c2 = l[2].shape[0];
        let mut z = vec![0f32; c2 * nf];
        for o in 0..c2 {
            let zo = &mut z[o * nf..(o + 1) * nf];
            zo.iter_mut().for_each(|v| *v = l[2].b[o]);
            for c in 0..w { for k in 0..kk {
                let wt = l[2].w[(o * w + c) * kk + k];
                for (d, s) in zo.iter_mut().zip(&h[(c * kk + k) * nf..(c * kk + k + 1) * nf]) { *d += wt * s; }
            } }
            zo.iter_mut().for_each(|v| *v = gelu(*v));
        }
        // dilated residual 1-D convs over frequency
        for r in &l[3..l.len() - 1] {
            let (d, p) = (r.dil, 4 * r.dil);
            let pf = nf + 2 * p;
            let mut pad = vec![0f32; c2 * pf];
            for c in 0..c2 { pad[c * pf + p..c * pf + p + nf].copy_from_slice(&z[c * nf..(c + 1) * nf]); }
            for o in 0..c2 {
                let mut y = vec![r.b[o]; nf];
                for c in 0..c2 { for t in 0..9 {
                    let wt = r.w[(o * c2 + c) * 9 + t];
                    for (dst, s) in y.iter_mut().zip(&pad[c * pf + t * d..c * pf + t * d + nf]) { *dst += wt * s; }
                } }
                for (zz, yy) in z[o * nf..(o + 1) * nf].iter_mut().zip(&y) { *zz += gelu(*yy); }
            }
        }
        let hd = &l[l.len() - 1];
        let mut out = vec![hd.b[0]; nf];
        for c in 0..c2 { let wt = hd.w[c]; for (d, s) in out.iter_mut().zip(&z[c * nf..(c + 1) * nf]) { *d += wt * s; } }
        out
    }
}

fn hann(n: usize) -> Vec<f64> { (0..n).map(|i| 0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / (n - 1) as f64).cos()).collect() }

/// Per-window spectra -> feature tensor [n][cin][NB] (PPG, PPG@2f, ACC x/y/z, frequency coordinate).
pub fn features(bvp: &[f64], acc: &[[f64; 3]]) -> Vec<Vec<f32>> {
    let m = model();
    let (nb, k0) = (m.meta.nb, m.meta.k0);
    if bvp.len() < 512 || acc.len() < 256 { return vec![]; }
    let n = ((bvp.len() - 512) / 128 + 1).min((acc.len() - 256) / 64 + 1);
    let mut planner = FftPlanner::<f64>::new();
    let (fp, fa) = (planner.plan_fft_forward(m.meta.nfft_ppg), planner.plan_fft_forward(m.meta.nfft_acc));
    let (hp, ha) = (hann(512), hann(256));
    let mag = |seg: &[f64], win: &[f64], nfft: usize, plan: &std::sync::Arc<dyn rustfft::Fft<f64>>| -> Vec<f64> {
        let mu = seg.iter().sum::<f64>() / seg.len() as f64;
        let mut buf = vec![Complex::new(0.0, 0.0); nfft];
        for (i, (s, w)) in seg.iter().zip(win).enumerate() { buf[i].re = (s - mu) * w; }
        plan.process(&mut buf);
        (k0..k0 + nb).map(|k| buf[k].norm()).collect()
    };
    (0..n).map(|i| {
        let mut p = mag(&bvp[i * 128..i * 128 + 512], &hp, m.meta.nfft_ppg, &fp);
        let mx = p.iter().cloned().fold(0.0, f64::max) + 1e-9;
        p.iter_mut().for_each(|v| *v /= mx);
        let mut x = vec![0f32; m.meta.cin * nb];
        for k in 0..nb {
            x[k] = p[k] as f32;
            let k2 = 2 * k + k0;
            x[nb + k] = if k2 < nb { p[k2] as f32 } else { 0.0 };
            x[5 * nb + k] = (-1.0 + 2.0 * k as f64 / (nb - 1) as f64) as f32;
        }
        for ax in 0..3 {
            let seg: Vec<f64> = acc[i * 64..i * 64 + 256].iter().map(|a| a[ax]).collect();
            for (k, v) in mag(&seg, &ha, m.meta.nfft_acc, &fa).iter().enumerate() { x[(2 + ax) * nb + k] = v.ln_1p() as f32; }
        }
        x
    }).collect()
}

/// Ensemble probability over HR bins for every window (context = current + K-1 previous windows, edge-clamped).
pub fn probabilities(feats: &[Vec<f32>], n_models: usize) -> Vec<Vec<f64>> {
    let m = model();
    let (cin, kk, nb) = (m.meta.cin, m.meta.k_context, m.meta.nb);
    let nets = &m.nets[..n_models.clamp(1, m.nets.len())];
    (0..feats.len()).map(|t| {
        let mut x = vec![0f32; cin * kk * nb];
        for k in 0..kk {
            let j = (t + k + 1).saturating_sub(kk);
            for c in 0..cin { x[(c * kk + k) * nb..(c * kk + k + 1) * nb].copy_from_slice(&feats[j][c * nb..(c + 1) * nb]); }
        }
        let mut p = vec![0.0; nb];
        for net in nets {
            let lg = net.forward(&x, cin, kk, nb);
            let mx = lg.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
            let e: Vec<f64> = lg.iter().map(|v| ((v - mx) as f64).exp()).collect();
            let s: f64 = e.iter().sum();
            for (a, b) in p.iter_mut().zip(&e) { *a += b / s / nets.len() as f64; }
        }
        p
    }).collect()
}

#[derive(Serialize)]
pub struct HrOutput { pub n_windows: usize, pub seconds: f64, pub t_s: Vec<f64>, pub hr: Vec<f64>, pub lo: Vec<f64>, pub hi: Vec<f64>,
    pub sd: Vec<f64>, pub low_confidence: Vec<bool>, pub mean_hr: f64, pub min_hr: f64, pub max_hr: f64,
    pub reliable_fraction: f64, pub skipped_rows: usize, pub models: usize, pub loso_mae_bpm: f64, pub status: &'static str, pub message: String }

pub fn track(prob: &[Vec<f64>]) -> (Vec<f64>, Vec<f64>) {
    let m = model();
    let nb = m.meta.nb;
    let mut a = vec![1.0 / nb as f64; nb];
    let (mut est, mut sds) = (vec![], vec![]);
    for p in prob {
        let mut b = vec![0.0; nb];
        for i in 0..nb { let ai = a[i]; if ai == 0.0 { continue; } let row = &m.trans[i * nb..(i + 1) * nb]; for j in 0..nb { b[j] += ai * row[j]; } }
        for j in 0..nb { b[j] *= p[j] + 1e-12; }
        let s: f64 = b.iter().sum();
        b.iter_mut().for_each(|v| *v /= s);
        let am = (0..nb).max_by(|&i, &j| b[i].total_cmp(&b[j])).unwrap();
        let (lo, hi) = (am.saturating_sub(10), (am + 10).min(nb - 1));
        let ws: f64 = b[lo..=hi].iter().sum();
        est.push((lo..=hi).map(|k| b[k] * m.bpm[k]).sum::<f64>() / ws);
        let mu: f64 = (0..nb).map(|k| b[k] * m.bpm[k]).sum();
        sds.push((0..nb).map(|k| b[k] * (m.bpm[k] - mu).powi(2)).sum::<f64>().sqrt());
        a = b;
    }
    (est, sds)
}

/// CSV with header containing bvp, acc_x, acc_y, acc_z at 64 Hz, acceleration in g.
pub fn parse_csv(text: &str) -> Result<(Vec<f64>, Vec<[f64; 3]>, usize), String> {
    let mut lines = text.lines().filter(|l| !l.trim().is_empty());
    let header: Vec<String> = lines.next().ok_or("empty file")?.split(',').map(|s| s.trim().to_lowercase()).collect();
    let col = |names: &[&str]| header.iter().position(|h| names.contains(&h.as_str()));
    let (ib, ix, iy, iz) = (col(&["bvp", "ppg"]).ok_or("missing 'bvp' column")?, col(&["acc_x", "ax"]).ok_or("missing 'acc_x' column")?,
        col(&["acc_y", "ay"]).ok_or("missing 'acc_y' column")?, col(&["acc_z", "az"]).ok_or("missing 'acc_z' column")?);
    let (mut bvp, mut acc64, mut skipped) = (vec![], vec![], 0usize);
    for l in lines {
        let v: Vec<f64> = l.split(',').map(|s| s.trim().parse::<f64>().unwrap_or(f64::NAN)).collect();
        let get = |i: usize| v.get(i).copied().unwrap_or(f64::NAN);
        let row = [get(ib), get(ix), get(iy), get(iz)];
        if row.iter().any(|x| !x.is_finite()) {
            // hold the last valid sample so a few bad rows do not shift timing
            skipped += 1;
            if let (Some(&b), Some(&a)) = (bvp.last(), acc64.last()) { bvp.push(b); acc64.push(a); }
            continue;
        }
        bvp.push(row[0]);
        acc64.push([row[1], row[2], row[3]]);
    }
    if bvp.len() < 64 * 30 { return Err(format!("need at least 30 s of 64 Hz data, got {:.1} s", bvp.len() as f64 / 64.0)); }
    // the model was trained on Empatica E4 units: ACC at 32 Hz in 1/64 g
    let acc = acc64.iter().step_by(2).map(|a| [a[0] * 64.0, a[1] * 64.0, a[2] * 64.0]).collect();
    Ok((bvp, acc, skipped))
}

pub fn analyse(bvp: &[f64], acc: &[[f64; 3]], skipped: usize, n_models: usize) -> Result<HrOutput, String> {
    let feats = features(bvp, acc);
    if feats.is_empty() { return Err("recording too short".into()); }
    let prob = probabilities(&feats, n_models);
    Ok(finish(&prob, bvp.len() as f64 / 64.0, skipped, n_models.clamp(1, model().nets.len())))
}

/// Step 1 of the parallel path (one Web Worker per network): probabilities of a single ensemble member.
#[derive(Deserialize)]
pub struct ProbsIn { pub csv: String, pub model: usize }
#[derive(Serialize, Deserialize)]
pub struct ProbsOut { pub probs: Vec<Vec<f64>>, pub seconds: f64, pub skipped: usize }

pub fn member_probs(x: &ProbsIn) -> Result<ProbsOut, String> {
    let (b, a, s) = parse_csv(&x.csv)?;
    let feats = features(&b, &a);
    if feats.is_empty() { return Err("recording too short".into()); }
    let m = model();
    let net = m.nets.get(x.model).ok_or("model index out of range")?;
    let (cin, kk, nb) = (m.meta.cin, m.meta.k_context, m.meta.nb);
    let probs = (0..feats.len()).map(|t| {
        let mut xin = vec![0f32; cin * kk * nb];
        for k in 0..kk { let j = (t + k + 1).saturating_sub(kk); for c in 0..cin { xin[(c * kk + k) * nb..(c * kk + k + 1) * nb].copy_from_slice(&feats[j][c * nb..(c + 1) * nb]); } }
        let lg = net.forward(&xin, cin, kk, nb);
        let mx = lg.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let e: Vec<f64> = lg.iter().map(|v| ((v - mx) as f64).exp()).collect();
        let s: f64 = e.iter().sum();
        e.iter().map(|v| v / s).collect()
    }).collect();
    Ok(ProbsOut { probs, seconds: b.len() as f64 / 64.0, skipped: s })
}

/// Step 2: average the members' probabilities and run the belief tracker.
#[derive(Deserialize)]
pub struct TrackIn { pub members: Vec<ProbsOut> }

pub fn track_members(x: &TrackIn) -> Result<HrOutput, String> {
    let first = x.members.first().ok_or("no ensemble members")?;
    let k = x.members.len() as f64;
    let prob: Vec<Vec<f64>> = (0..first.probs.len()).map(|t| (0..first.probs[t].len()).map(|j| x.members.iter().map(|m| m.probs[t][j]).sum::<f64>() / k).collect()).collect();
    Ok(finish(&prob, first.seconds, first.skipped, x.members.len()))
}

fn finish(prob: &[Vec<f64>], seconds: f64, skipped: usize, models: usize) -> HrOutput {
    let m = model();
    let (hr, sd) = track(prob);
    let q = m.meta.conformal_q;
    let half: Vec<f64> = sd.iter().map(|s| q * s.max(0.5)).collect();
    let low: Vec<bool> = half.iter().map(|h| *h > 15.0).collect();
    let n = hr.len();
    let good: Vec<f64> = hr.iter().zip(&low).filter(|(_, l)| !**l).map(|(h, _)| *h).collect();
    let rel = good.len() as f64 / n as f64;
    let pick = if good.is_empty() { &hr } else { &good };
    let mean_hr = pick.iter().sum::<f64>() / pick.len() as f64;
    let (min_hr, max_hr) = (pick.iter().cloned().fold(f64::INFINITY, f64::min), pick.iter().cloned().fold(0.0, f64::max));
    let status = if rel < 0.5 { "watch" } else if mean_hr > 110.0 || mean_hr < 40.0 { "alert" } else if mean_hr > 90.0 || mean_hr < 50.0 { "watch" } else { "ok" };
    let message = if rel < 0.5 { "Most of this recording is too noisy to trust. Re-seat the wristband, keep the arm still and record again.".into() }
        else { format!("Average heart rate {mean_hr:.0} bpm across the reliable {:.0}% of the recording.", rel * 100.0) };
    HrOutput { n_windows: n, seconds, t_s: (0..n).map(|i| i as f64 * 2.0 + 4.0).collect(),
        lo: hr.iter().zip(&half).map(|(h, d)| h - d).collect(), hi: hr.iter().zip(&half).map(|(h, d)| h + d).collect(),
        hr, sd, low_confidence: low, mean_hr, min_hr, max_hr, reliable_fraction: rel, skipped_rows: skipped,
        models, loso_mae_bpm: m.meta.loso_online_mae, status, message }
}

pub fn analyse_csv(text: &str) -> Result<HrOutput, String> {
    let (b, a, s) = parse_csv(text)?;
    analyse(&b, &a, s, usize::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[derive(Deserialize)]
    struct Ref { n_windows: usize, logits0_w0: Vec<f64>, hr_online: Vec<f64> }

    #[test]
    fn reproduces_python_pipeline_on_sample() {
        let r: Ref = serde_json::from_str(include_str!("../../assets/ppg_reference.json")).unwrap();
        let (b, a, _) = parse_csv(include_str!("../../assets/sample_wrist.csv")).unwrap();
        let f = features(&b, &a);
        assert_eq!(f.len(), r.n_windows);
        let m = model();
        let (cin, kk, nb) = (m.meta.cin, m.meta.k_context, m.meta.nb);
        let mut x = vec![0f32; cin * kk * nb];
        for k in 0..kk { for c in 0..cin { x[(c * kk + k) * nb..(c * kk + k + 1) * nb].copy_from_slice(&f[0][c * nb..(c + 1) * nb]); } }
        let lg = m.nets[0].forward(&x, cin, kk, nb);
        let e = lg.iter().zip(&r.logits0_w0).map(|(a, b)| (*a as f64 - b).abs()).fold(0.0, f64::max);
        assert!(e < 1e-2, "logit max diff {e}");
        let out = analyse(&b, &a, 0, usize::MAX).unwrap();
        let mae = out.hr.iter().zip(&r.hr_online).map(|(a, b)| (a - b).abs()).sum::<f64>() / out.hr.len() as f64;
        assert!(mae < 0.25, "HR differs from python by {mae} bpm on average");
    }

    #[test]
    fn rejects_bad_files() {
        assert!(parse_csv("foo,bar\n1,2\n").is_err());
        assert!(parse_csv("bvp,acc_x,acc_y,acc_z\n1,0,0,1\n").is_err());
    }
}
