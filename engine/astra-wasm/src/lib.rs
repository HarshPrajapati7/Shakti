use wasm_bindgen::prelude::*;

/// JSON in, JSON out. op: assess | gravity | ppg | info
#[wasm_bindgen]
pub fn call(op: &str, input: &str) -> Result<String, JsValue> {
    astra_core::call(op, input).map_err(|e| JsValue::from_str(&e))
}

