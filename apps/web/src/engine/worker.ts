import init, { call } from "./pkg/astra_wasm.js"

const ready = init()
self.onmessage = async (e: MessageEvent<string>) => {
  await ready
  try { self.postMessage({ ok: true, out: call("ppg_member", e.data) }) } catch (err) { self.postMessage({ ok: false, out: String(err) }) }
}
