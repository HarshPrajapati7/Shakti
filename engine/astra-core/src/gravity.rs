//! GRAVITY-HEART reduced-order cardiovascular model (exact port of src/astra/gravity/model.py)
//! + stand-test personalisation + gravity/countermeasure prediction from user-entered values.
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

const MMHG_PER_M: f64 = 1060.0 * 9.80665 / 133.322;
const VCS0: f64 = 1000.0;
const TFILT: f64 = 300.0;
const TVD: f64 = 6.0;
const TCC: f64 = 4.0;
const HRMAX: f64 = 70.0;
const TPRMAX: f64 = 0.8;
pub const OH_SUSTAINED: f64 = 10.0 + (20.0 - 10.0) / 3.0;
pub const OH_INITIAL: f64 = 20.0 + (40.0 - 20.0) / 3.0;

#[derive(Deserialize)]
struct GravityJson { population_theta: Vec<f64> }

pub fn population_theta() -> &'static [f64] {
    static T: OnceLock<Vec<f64>> = OnceLock::new();
    T.get_or_init(|| serde_json::from_str::<GravityJson>(include_str!("../../assets/gravity.json")).expect("gravity.json").population_theta)
}

#[derive(Serialize, Clone, Default)]
pub struct Sim { pub hr: Vec<f64>, pub map: Vec<f64>, pub sv: Vec<f64>, pub vpool: Vec<f64>, pub map_brain: Vec<f64> }

#[allow(clippy::too_many_arguments)]
pub fn simulate(theta: &[f64], u: &[f64], hr0: f64, map0: f64, height_cm: f64, onset: f64, dvcs: f64, cmul: f64) -> Sim {
    let p: Vec<f64> = theta.iter().map(|v| v.exp()).collect();
    let (c, tpool, vk, ghr, thr, gtpr, gcp, ttpr, avd, acc, kf) = (p[0] * cmul, p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10]);
    let s = height_cm / 100.0 / 1.75;
    let (rgh, rcs, rbr) = (MMHG_PER_M * 0.5 * s, MMHG_PER_M * 0.25 * s, MMHG_PER_M * 0.32 * s);
    let sub = 4usize;
    let dt = 1.0 / sub as f64;
    let f0 = 1.0 - (-VCS0 / vk).exp();
    let (af, asl, ah, ar) = (1.0 - (-dt / tpool).exp(), 1.0 - (-dt / TFILT).exp(), 1.0 - (-dt / thr).exp(), 1.0 - (-dt / ttpr).exp());
    let (mut vf, mut vs, mut dhr, mut dr) = (0.0, 0.0, 0.0, 0.0);
    let n = u.len();
    let mut o = Sim::default();
    for k in 0..n {
        for j in 0..sub {
            let uk = if k + 1 >= n || j == 0 { u[k] } else { u[k] + (u[k + 1] - u[k]) * j as f64 * dt };
            let ts = k as f64 + j as f64 * dt - onset;
            let on = onset >= 0.0 && ts >= 0.0;
            let vd = if on { avd * (-ts / TVD).exp() } else { 0.0 };
            let cc = if on { acc * (-ts / TCC).exp() } else { 0.0 };
            let vp = vf + vs;
            let vcs = (VCS0 - dvcs - vp).max(20.0);
            let sv = (1.0 - (-vcs / vk).exp()) / f0;
            let hr = (hr0 + dhr + cc).max(30.0);
            let mp = map0 * (hr / hr0) * sv * (1.0 + dr) * (1.0 - vd);
            if j == 0 { o.hr.push(hr); o.map.push(mp); o.sv.push(sv); o.vpool.push(vp); o.map_brain.push(mp - rbr * uk); }
            let e = map0 - mp + rcs * uk;
            let th = HRMAX * (ghr * e / HRMAX).tanh();
            let tr = TPRMAX * ((gtpr * e + gcp * vp / 100.0) / TPRMAX).tanh();
            vf += af * (c * rgh * uk - vf);
            vs += asl * (kf * c * rgh * uk - vs);
            dhr += ah * (th - dhr);
            dr += ar * (tr - dr);
        }
    }
    o
}

pub fn stand_profile(g: f64, t_pre: usize, t_stand: usize) -> Vec<f64> {
    (0..t_pre + t_stand).map(|i| ((i as f64 - t_pre as f64 + 1.0) / 3.0).clamp(0.0, 1.0) * g).collect()
}

fn smooth(x: &[f64], w: usize) -> Vec<f64> {
    (0..x.len()).map(|i| { let a = i.saturating_sub(w / 2); let b = (i + w / 2 + 1).min(x.len()); x[a..b].iter().sum::<f64>() / (b - a) as f64 }).collect()
}
fn mean(x: &[f64]) -> f64 { x.iter().sum::<f64>() / x.len() as f64 }

#[derive(Serialize, Clone)]
pub struct StandSummary { pub dmap_initial: f64, pub dmap_sustained: f64, pub dhr_sustained: f64, pub map_brain: f64,
    pub vpool_ml: f64, pub initial_oh: bool, pub classical_oh: bool, pub margin_mmhg: f64 }

pub fn summarize(s: &Sim, map0: f64, hr0: f64, t_pre: usize) -> StandSummary {
    let sm = smooth(&s.map, 5);
    let dmap_initial = sm[t_pre..t_pre + 15].iter().cloned().fold(f64::INFINITY, f64::min) - map0;
    let (a, b) = (t_pre + 30, t_pre + 180);
    let dmap_sustained = mean(&s.map[a..b]) - map0;
    StandSummary { dmap_initial, dmap_sustained, dhr_sustained: mean(&s.hr[a..b]) - hr0, map_brain: mean(&s.map_brain[a..b]),
        vpool_ml: mean(&s.vpool[a..b]), initial_oh: dmap_initial <= -OH_INITIAL, classical_oh: dmap_sustained <= -OH_SUSTAINED,
        margin_mmhg: (dmap_sustained + OH_SUSTAINED).min(dmap_initial + OH_INITIAL) }
}

/// Optional personal stand test (supine rest, then 1 and 3 minutes after standing at 1 g).
#[derive(Deserialize, Serialize, Clone)]
pub struct StandTest { pub hr_supine: f64, pub sbp_supine: f64, pub dbp_supine: f64, pub hr_1min: f64, pub sbp_1min: f64, pub dbp_1min: f64,
    pub hr_3min: f64, pub sbp_3min: f64, pub dbp_3min: f64 }

#[derive(Deserialize)]
pub struct GravityInput {
    pub sex: String, pub age: f64, pub height_cm: f64, pub weight_kg: f64,
    pub hr_rest: f64, pub sbp: f64, pub dbp: f64,
    pub days_in_flight: f64, #[serde(default)] pub flight_gravity: f64, pub target_gravity: f64,
    #[serde(default)] pub fluid_loading: bool, #[serde(default)] pub compression: bool,
    #[serde(default)] pub stand_test: Option<StandTest>,
}

#[derive(Serialize)]
pub struct GravityOutput {
    pub map0: f64, pub plasma_volume_ml: f64, pub plasma_loss_ml: f64, pub central_deficit_ml: f64, pub personalised: bool,
    pub calibration_rmse: Option<f64>, pub pooling_factor: f64, pub reflex_factor: f64, pub summary: StandSummary, pub preflight: StandSummary,
    pub t: Vec<f64>, pub map: Vec<f64>, pub map_preflight: Vec<f64>, pub hr: Vec<f64>,
    pub by_destination: Vec<(String, f64, f64)>, pub status: &'static str, pub advice: Vec<String>,
}

const MAPF: fn(f64, f64) -> f64 = |s, d| d + (s - d) / 3.0;

/// Personalise the two most identifiable parameters (venous pooling capacity, baroreflex HR gain) from a stand test.
fn calibrate(theta: &[f64], st: &StandTest, height: f64) -> (Vec<f64>, f64) {
    let (hr0, map0) = (st.hr_supine, MAPF(st.sbp_supine, st.dbp_supine));
    let u = stand_profile(1.0, 60, 200);
    let obs = [(120usize, st.hr_1min, MAPF(st.sbp_1min, st.dbp_1min)), (240usize, st.hr_3min, MAPF(st.sbp_3min, st.dbp_3min))];
    let mut best = (f64::INFINITY, theta.to_vec());
    for i in 0..21 {
        for j in 0..21 {
            let mut th = theta.to_vec();
            th[0] += -1.0 + 0.1 * i as f64;
            th[3] += -1.2 + 0.12 * j as f64;
            let s = simulate(&th, &u, hr0, map0, height, 60.0, 0.0, 1.0);
            let prior = ((th[0] - theta[0]) / 0.5).powi(2) + ((th[3] - theta[3]) / 0.6).powi(2);
            let e: f64 = obs.iter().map(|&(k, h, m)| ((s.hr[k] - h) / 3.0).powi(2) + ((s.map[k] - m) / 4.0).powi(2)).sum::<f64>() + 0.5 * prior;
            if e < best.0 { best = (e, th); }
        }
    }
    let s = simulate(&best.1, &u, hr0, map0, height, 60.0, 0.0, 1.0);
    let rmse = (obs.iter().map(|&(k, h, m)| (s.hr[k] - h).powi(2) + (s.map[k] - m).powi(2)).sum::<f64>() / 4.0).sqrt();
    (best.1, rmse)
}

pub fn predict(x: &GravityInput) -> Result<GravityOutput, String> {
    let checks = [("height_cm", x.height_cm, 120.0, 220.0), ("weight_kg", x.weight_kg, 30.0, 200.0), ("hr_rest", x.hr_rest, 30.0, 140.0),
        ("sbp", x.sbp, 70.0, 220.0), ("dbp", x.dbp, 40.0, 140.0), ("days_in_flight", x.days_in_flight, 0.0, 1500.0),
        ("target_gravity", x.target_gravity, 0.0, 1.5), ("flight_gravity", x.flight_gravity, 0.0, 1.0)];
    for (k, v, lo, hi) in checks {
        if !v.is_finite() || v < lo || v > hi { return Err(format!("{k} must be between {lo} and {hi}")); }
    }
    if x.dbp >= x.sbp { return Err("diastolic pressure must be lower than systolic".into()); }
    let mut theta = population_theta().to_vec();
    let (mut personalised, mut cal) = (false, None);
    if let Some(st) = &x.stand_test { let (t, r) = calibrate(&theta, st, x.height_cm); theta = t; personalised = true; cal = Some(r); }
    let map0 = MAPF(x.sbp, x.dbp);
    let pv = x.weight_kg * if x.sex.to_lowercase().starts_with('f') { 65.0 } else { 70.0 } * 0.58;
    let loss = pv * 0.12 * (x.days_in_flight / 30.0).min(1.0) * (1.0 - x.flight_gravity);
    let dv = (loss - if x.fluid_loading { 250.0 } else { 0.0 }).max(0.0);
    let cm = if x.compression { 0.6 } else { 1.0 };
    let u = stand_profile(x.target_gravity, 60, 240);
    let run = |g: f64, dv: f64, cm: f64| { let u = stand_profile(g, 60, 240); let s = simulate(&theta, &u, x.hr_rest, map0, x.height_cm, 60.0, dv, cm); let m = summarize(&s, map0, x.hr_rest, 60); (s, m) };
    let (now, summary) = run(x.target_gravity, dv, cm);
    let (pre, preflight) = run(x.target_gravity, 0.0, 1.0);
    let dests = [("Moon", 1.625 / 9.80665), ("Mars", 3.721 / 9.80665), ("Earth", 1.0)];
    let by_destination = dests.iter().map(|&(n, g)| (n.to_string(), g, run(g, dv, cm).1.margin_mmhg)).collect();
    let m = summary.margin_mmhg;
    let status = if m < 0.0 { "alert" } else if m < 4.0 { "watch" } else { "ok" };
    let mut advice = vec![];
    if m < 4.0 {
        if !x.fluid_loading { advice.push("Drink about 1 L of isotonic fluid with salt tablets in the 2 hours before the gravity transition.".into()); }
        if !x.compression { advice.push("Wear a lower-body compression garment for landing and the first hours of standing.".into()); }
        advice.push("Stand up slowly in stages (sit, then stand) and have a crewmate nearby. Lie down at the first sign of light-headedness.".into());
    } else {
        advice.push("Tolerance predicted. Keep the scheduled countermeasure exercise to preserve it.".into());
    }
    let t = (0..u.len()).map(|i| i as f64 - 60.0).collect();
    Ok(GravityOutput { map0, plasma_volume_ml: pv, plasma_loss_ml: loss, central_deficit_ml: dv, personalised, calibration_rmse: cal,
        pooling_factor: (theta[0] - population_theta()[0]).exp(), reflex_factor: (theta[3] - population_theta()[3]).exp(), summary, preflight,
        t, map: now.map, map_preflight: pre.map, hr: now.hr, by_destination, status, advice })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[derive(Deserialize)]
    struct Tv { u: Vec<f64>, hr0: f64, map0: f64, height_cm: f64, onset: f64, dvcs: f64, cmul: f64, hr: Vec<f64>, map: Vec<f64> }
    #[derive(Deserialize)]
    struct G { test_vector: Tv }

    #[test]
    fn matches_python_test_vector() {
        let g: G = serde_json::from_str(include_str!("../../assets/gravity.json")).unwrap();
        let t = g.test_vector;
        let s = simulate(population_theta(), &t.u, t.hr0, t.map0, t.height_cm, t.onset, t.dvcs, t.cmul);
        let e = s.hr.iter().zip(&t.hr).chain(s.map.iter().zip(&t.map)).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max);
        assert!(e < 0.05, "max diff {e}");
    }

    #[test]
    fn longer_flight_lowers_margin_and_countermeasures_help() {
        let base = GravityInput { sex: "M".into(), age: 40.0, height_cm: 178.0, weight_kg: 78.0, hr_rest: 62.0, sbp: 118.0, dbp: 76.0,
            days_in_flight: 0.0, flight_gravity: 0.0, target_gravity: 1.0, fluid_loading: false, compression: false, stand_test: None };
        let m0 = predict(&base).unwrap().summary.margin_mmhg;
        let m180 = predict(&GravityInput { days_in_flight: 180.0, ..base }).unwrap().summary.margin_mmhg;
        let b2 = GravityInput { sex: "M".into(), age: 40.0, height_cm: 178.0, weight_kg: 78.0, hr_rest: 62.0, sbp: 118.0, dbp: 76.0,
            days_in_flight: 180.0, flight_gravity: 0.0, target_gravity: 1.0, fluid_loading: true, compression: true, stand_test: None };
        let mcm = predict(&b2).unwrap().summary.margin_mmhg;
        assert!(m180 < m0 && mcm > m180, "{m0} {m180} {mcm}");
    }

    #[test]
    fn rejects_impossible_inputs() {
        let bad = GravityInput { sex: "F".into(), age: 30.0, height_cm: 170.0, weight_kg: 60.0, hr_rest: 60.0, sbp: 80.0, dbp: 90.0,
            days_in_flight: 10.0, flight_gravity: 0.0, target_gravity: 1.0, fluid_loading: false, compression: false, stand_test: None };
        assert!(predict(&bad).is_err());
    }
}
