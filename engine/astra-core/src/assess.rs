//! Vital-sign assessment from user-entered values: clinical ranges + personal-baseline deviation (robust z)
//! mapped onto body systems with a plain-language next action.
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Clone, Default)]
pub struct Vitals {
    pub sbp: Option<f64>, pub dbp: Option<f64>, pub hr: Option<f64>, pub spo2: Option<f64>, pub temp_c: Option<f64>,
    pub glucose: Option<f64>, pub sleep_h: Option<f64>, pub mood: Option<f64>, pub reaction_ms: Option<f64>,
    pub resp_rate: Option<f64>, pub weight_kg: Option<f64>, pub exercise_min: Option<f64>, pub radiation_msv: Option<f64>, pub vision_change: Option<f64>,
}

#[derive(Deserialize)]
pub struct AssessInput { pub today: Vitals, #[serde(default)] pub history: Vec<Vitals> }

#[derive(Serialize, Clone)]
pub struct Reading { pub key: &'static str, pub label: &'static str, pub value: f64, pub unit: &'static str, pub status: &'static str,
    pub range: &'static str, pub baseline: Option<f64>, pub z: Option<f64>, pub note: String }

#[derive(Serialize)]
pub struct System { pub id: &'static str, pub label: &'static str, pub status: &'static str, pub readings: Vec<&'static str>, pub action: String }

#[derive(Serialize)]
pub struct AssessOutput { pub overall: &'static str, pub readings: Vec<Reading>, pub systems: Vec<System>, pub baseline_days: usize }

struct Spec { key: &'static str, label: &'static str, unit: &'static str, range: &'static str, worse_high: Option<bool>,
    grade: fn(f64) -> &'static str, get: fn(&Vitals) -> Option<f64> }

fn g3(alert: bool, watch: bool) -> &'static str { if alert { "alert" } else if watch { "watch" } else { "ok" } }

const SPECS: [Spec; 14] = [
    Spec { key: "sbp", label: "Systolic BP", unit: "mmHg", range: "90-134", worse_high: Some(true), grade: |v| g3(v >= 160.0 || v < 85.0, v >= 135.0 || v < 90.0), get: |x| x.sbp },
    Spec { key: "dbp", label: "Diastolic BP", unit: "mmHg", range: "55-84", worse_high: Some(true), grade: |v| g3(v >= 100.0 || v < 50.0, v >= 85.0 || v < 55.0), get: |x| x.dbp },
    Spec { key: "hr", label: "Resting heart rate", unit: "bpm", range: "50-90", worse_high: Some(true), grade: |v| g3(v >= 110.0 || v < 40.0, v > 90.0 || v < 50.0), get: |x| x.hr },
    Spec { key: "spo2", label: "Oxygen saturation", unit: "%", range: "95-100", worse_high: Some(false), grade: |v| g3(v < 92.0, v < 95.0), get: |x| x.spo2 },
    Spec { key: "temp_c", label: "Body temperature", unit: "C", range: "36.1-37.5", worse_high: Some(true), grade: |v| g3(v >= 38.5 || v < 35.5, v > 37.5 || v < 36.1), get: |x| x.temp_c },
    Spec { key: "glucose", label: "Blood glucose", unit: "mg/dL", range: "70-140", worse_high: None, grade: |v| g3(v < 60.0 || v > 200.0, v < 70.0 || v > 140.0), get: |x| x.glucose },
    Spec { key: "sleep_h", label: "Sleep", unit: "h", range: "6.5-9", worse_high: Some(false), grade: |v| g3(v < 5.0, v < 6.5), get: |x| x.sleep_h },
    Spec { key: "mood", label: "Mood", unit: "/5", range: "3-5", worse_high: Some(false), grade: |v| g3(v <= 1.0, v <= 2.0), get: |x| x.mood },
    Spec { key: "resp_rate", label: "Breathing rate", unit: "/min", range: "12-20", worse_high: Some(true), grade: |v| g3(v > 24.0 || v < 8.0, v > 20.0 || v < 12.0), get: |x| x.resp_rate },
    Spec { key: "weight_kg", label: "Body mass", unit: "kg", range: "within 3% of baseline", worse_high: None, grade: |_| "ok", get: |x| x.weight_kg },
    Spec { key: "exercise_min", label: "Exercise", unit: "min", range: "60+", worse_high: Some(false), grade: |v| g3(v < 20.0, v < 60.0), get: |x| x.exercise_min },
    Spec { key: "radiation_msv", label: "Mission radiation dose", unit: "mSv", range: "under 300", worse_high: None, grade: |v| g3(v >= 480.0, v >= 300.0), get: |x| x.radiation_msv },
    Spec { key: "vision_change", label: "Vision change", unit: "", range: "none", worse_high: None, grade: |v| g3(false, v >= 0.5), get: |x| x.vision_change },
    Spec { key: "reaction_ms", label: "Reaction time", unit: "ms", range: "< 300", worse_high: Some(true), grade: |v| g3(v > 400.0, v > 300.0), get: |x| x.reaction_ms },
];

fn median(v: &mut [f64]) -> f64 { v.sort_by(|a, b| a.total_cmp(b)); let n = v.len(); if n % 2 == 1 { v[n / 2] } else { (v[n / 2 - 1] + v[n / 2]) / 2.0 } }

fn worst<'a>(xs: impl Iterator<Item = &'a str>) -> &'static str {
    let mut w = "ok";
    for s in xs { if s == "alert" { return "alert"; } if s == "watch" { w = "watch"; } }
    w
}

pub fn assess(x: &AssessInput) -> AssessOutput {
    let mut readings = vec![];
    for s in SPECS.iter() {
        let Some(v) = (s.get)(&x.today) else { continue };
        if !v.is_finite() { continue; }
        let mut status = (s.grade)(v);
        let hist: Vec<f64> = x.history.iter().filter_map(|h| (s.get)(h)).filter(|v| v.is_finite()).collect();
        let (mut baseline, mut z, mut note) = (None, None, String::from("Compared with clinical reference range."));
        if hist.len() >= 5 {
            let mut h = hist.clone();
            let med = median(&mut h);
            let mut dev: Vec<f64> = hist.iter().map(|v| (v - med).abs()).collect();
            let spread = (1.4826 * median(&mut dev)).max(0.06 * med.abs()).max(1e-6);
            let zz = (v - med) / spread;
            baseline = Some(med);
            z = Some(zz);
            if let Some(hi) = s.worse_high {
                let w = if hi { zz } else { -zz };
                // personal drift can raise (never lower) the clinical grade
                if w >= 3.5 { status = "alert" } else if w >= 2.0 && status == "ok" { status = "watch" }
                note = format!("Your baseline is {med:.1} {} over {} entries; today is {zz:+.1} robust SD from it.", s.unit, hist.len());
            }
        }
        if s.key == "weight_kg" {
            if let Some(med) = baseline {
                let pct = (v - med) / med * 100.0;
                status = if pct.abs() >= 5.0 { "alert" } else if pct.abs() >= 3.0 { "watch" } else { "ok" };
                note = format!("{pct:+.1}% from your baseline of {med:.1} kg. Mass loss in flight usually means muscle, bone or fluid loss.");
            } else { note = "Your baseline builds after five check-ins.".into(); }
        }
        if s.key == "vision_change" { note = if v >= 0.5 { "Change reported. Book an eye exam (SANS screening).".into() } else { "No change reported.".into() }; }
        if s.key == "radiation_msv" { note = format!("{:.0}% of the 600 mSv career limit.", v / 6.0); }
        readings.push(Reading { key: s.key, label: s.label, value: v, unit: s.unit, status, range: s.range, baseline, z, note });
    }
    let st = |keys: &[&str]| worst(readings.iter().filter(|r| keys.contains(&r.key)).map(|r| r.status));
    let present = |keys: &[&'static str]| keys.iter().copied().filter(|k| readings.iter().any(|r| r.key == *k)).collect::<Vec<_>>();
    let mk = |id, label, keys: &[&'static str], ok: &str, bad: &str| {
        let s = st(keys);
        System { id, label, status: s, readings: present(keys), action: if s == "ok" { ok.to_string() } else { bad.to_string() } }
    };
    let systems = vec![
        mk("heart", "Heart & circulation", &["sbp", "dbp", "hr"], "Keep the scheduled aerobic session.",
            "Re-measure seated after 5 min rest. If still out of range, run the gravity readiness check and notify the flight surgeon."),
        mk("lungs", "Breathing & oxygen", &["spo2", "resp_rate"], "No action needed.", "Re-check at rest with the finger oximeter. Check cabin CO2 and O2 readings."),
        mk("eyes", "Eyes", &["vision_change"], "No action needed.", "Do the Amsler-grid test and book an eye exam at the next medical conference."),
        mk("muscle", "Muscle & bone", &["weight_kg", "exercise_min"], "Keep the daily resistance and aerobic sessions.",
            "Complete the full exercise prescription today (resistance and aerobic) and log meals. Report sustained mass loss."),
        mk("radiation", "Radiation exposure", &["radiation_msv"], "No action needed.",
            "Shelter during solar particle events and limit time in low-shielded areas. Inform mission control."),
        mk("brain", "Brain, sleep & alertness", &["sleep_h", "reaction_ms"], "Keep the regular sleep window.",
            "Protect an 8-hour sleep window tonight. Avoid critical tasks until the reaction test is back in range."),
        mk("mind", "Mood", &["mood"], "No action needed.", "Schedule a private conference with family or the crew psychologist."),
        mk("metabolic", "Metabolism & immunity", &["glucose", "temp_c"], "No action needed.",
            "Repeat the measurement. For fever, rest, hydrate and log symptoms for the next ground pass."),
    ];
    let overall = worst(readings.iter().map(|r| r.status));
    AssessOutput { overall, readings, systems, baseline_days: x.history.len() }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn clinical_and_personal_grading() {
        let v = |hr| Vitals { hr: Some(hr), ..Default::default() };
        let out = assess(&AssessInput { today: v(120.0), history: vec![] });
        assert_eq!(out.overall, "alert");
        let hist: Vec<Vitals> = (0..8).map(|i| v(55.0 + (i % 2) as f64)).collect();
        let out = assess(&AssessInput { today: v(75.0), history: hist });
        assert_eq!(out.readings[0].status, "alert", "75 bpm is in range but far above a 55 bpm personal baseline");
    }
}
