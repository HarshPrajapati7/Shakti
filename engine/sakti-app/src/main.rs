//! Sakti desktop app (Tauri 2). The interface runs in a native window; every prediction runs natively in astra-core.
//! The crew record is a JSON file in the user's app-data folder.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::path::PathBuf;
use tauri::Manager;

fn records_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("records.json"))
}

/// Run one engine operation (assess | gravity | ppg | info) off the UI thread.
#[tauri::command]
async fn engine(op: String, input: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || astra_core::call(&op, &input)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn records_get(app: tauri::AppHandle) -> Result<String, String> {
    Ok(std::fs::read_to_string(records_path(&app)?).unwrap_or_else(|_| "{}".into()))
}

#[tauri::command]
fn records_put(app: tauri::AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| e.to_string())?;
    let p = records_path(&app)?;
    let tmp = p.with_extension("tmp");
    // write-then-rename: a crash never leaves a half-written record
    std::fs::write(&tmp, json).and_then(|_| std::fs::rename(&tmp, &p)).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![engine, records_get, records_put])
        .run(tauri::generate_context!())
        .expect("failed to start Sakti");
}
