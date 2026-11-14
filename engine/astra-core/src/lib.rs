//! ASTRA-HEALTH engine: every prediction the console makes runs through this crate,
//! natively (astra-console) or in the browser (astra-wasm).
pub mod assess;
pub mod gravity;
pub mod ppg;

/// JSON in, JSON out entry points shared by the server API and the WebAssembly build.
pub fn call(op: &str, input: &str) -> Result<String, String> {
    let out = match op {
        "assess" => serde_json::to_string(&assess::assess(&serde_json::from_str(input).map_err(|e| e.to_string())?)),
        "gravity" => serde_json::to_string(&gravity::predict(&serde_json::from_str(input).map_err(|e| e.to_string())?)?),
        "ppg" => serde_json::to_string(&ppg::analyse_csv(input)?),
        "ppg_member" => serde_json::to_string(&ppg::member_probs(&serde_json::from_str(input).map_err(|e| e.to_string())?)?),
        "ppg_track" => serde_json::to_string(&ppg::track_members(&serde_json::from_str(input).map_err(|e| e.to_string())?)?),
        "info" => serde_json::to_string(&info()),
        _ => return Err(format!("unknown operation '{op}'")),
    };
    out.map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct Info { pub engine: &'static str, pub version: &'static str, pub ppg_models: usize, pub ppg_loso_mae_bpm: f64 }

pub fn info() -> Info {
    Info { engine: "astra-core", version: env!("CARGO_PKG_VERSION"), ppg_models: ppg::model().nets.len(), ppg_loso_mae_bpm: ppg::model().meta.loso_online_mae }
}
