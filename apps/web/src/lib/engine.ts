// One client for the Rust engine (astra-core): native inside the Sakti desktop app (Tauri),
// or the same engine compiled to WebAssembly when the interface is opened in a browser.
import type { AssessOut, GravityIn, GravityOut, HrOut, Vitals } from "./types"

export const isApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
let wasmP: Promise<typeof import("../engine/pkg/astra_wasm.js")> | undefined
const loadWasm = () => (wasmP ??= import("../engine/pkg/astra_wasm.js").then(async (m) => { await m.default(); return m }))
const invoke = async <T,>(cmd: string, args: Record<string, unknown>) => (await import("@tauri-apps/api/core")).invoke<T>(cmd, args)

export async function engineReady() { if (!isApp) await loadWasm() }

async function call<T>(op: string, input: string): Promise<T> {
  try {
    if (isApp) return JSON.parse(await invoke<string>("engine", { op, input })) as T
    return JSON.parse((await loadWasm()).call(op, input)) as T
  } catch (e) { throw new Error(String(e instanceof Error ? e.message : e)) }
}

export const assess = (today: Vitals, history: Vitals[]) => call<AssessOut>("assess", JSON.stringify({ today, history }))
export const gravity = (x: GravityIn) => call<GravityOut>("gravity", JSON.stringify(x))
export const info = () => call<{ engine: string; version: string; ppg_models: number; ppg_loso_mae_bpm: number }>("info", "{}")

/** Heart rate from a wrist recording. Native in the app; in a browser each ensemble network runs in its own Web Worker. */
export async function heartRate(csv: string): Promise<HrOut> {
  if (isApp) return call<HrOut>("ppg", csv)
  const n = (await info()).ppg_models
  const members = await Promise.all(Array.from({ length: n }, (_, model) => new Promise<unknown>((res, rej) => {
    const w = new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" })
    w.onmessage = (e: MessageEvent<{ ok: boolean; out: string }>) => { w.terminate(); e.data.ok ? res(JSON.parse(e.data.out)) : rej(new Error(e.data.out)) }
    w.onerror = (e) => { w.terminate(); rej(new Error(e.message)) }
    w.postMessage(JSON.stringify({ csv, model }))
  })))
  return call<HrOut>("ppg_track", JSON.stringify({ members }))
}

export const recordsGet = () => invoke<string>("records_get", {})
export const recordsPut = (json: string) => invoke<void>("records_put", { json })
