// One client for the Rust engine (astra-core). Uses the native astra-console server when the UI is served by it,
// otherwise the same engine compiled to WebAssembly, running fully offline in the browser.
import type { AssessOut, GravityIn, GravityOut, HrOut, Vitals } from "./types"

type Mode = "native" | "wasm"
let modeP: Promise<Mode> | undefined
let wasmP: Promise<typeof import("../engine/pkg/astra_wasm.js")> | undefined

const loadWasm = () => (wasmP ??= import("../engine/pkg/astra_wasm.js").then(async (m) => { await m.default(); return m }))

export function engineMode() {
  return (modeP ??= fetch("/api/info", { method: "POST", body: "{}" })
    .then((r) => (r.ok && r.headers.get("content-type")?.includes("json") ? "native" : "wasm") as Mode)
    .catch(() => "wasm" as Mode))
}

async function call<T>(op: string, input: string): Promise<T> {
  if ((await engineMode()) === "native") {
    const r = await fetch(`/api/${op}`, { method: "POST", body: input })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error ?? "engine error")
    return j as T
  }
  const m = await loadWasm()
  try { return JSON.parse(m.call(op, input)) as T } catch (e) { throw new Error(String(e instanceof Error ? e.message : e)) }
}

export const assess = (today: Vitals, history: Vitals[]) => call<AssessOut>("assess", JSON.stringify({ today, history }))
export const gravity = (x: GravityIn) => call<GravityOut>("gravity", JSON.stringify(x))
export const info = () => call<{ engine: string; version: string; ppg_models: number; ppg_loso_mae_bpm: number }>("info", "{}")

/** Heart rate from a wrist recording. In the browser each ensemble network runs in its own Web Worker. */
export async function heartRate(csv: string): Promise<HrOut> {
  if ((await engineMode()) === "native") return call<HrOut>("ppg", csv)
  const n = (await info()).ppg_models
  const members = await Promise.all(Array.from({ length: n }, (_, model) => new Promise<unknown>((res, rej) => {
    const w = new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" })
    w.onmessage = (e: MessageEvent<{ ok: boolean; out: string }>) => { w.terminate(); e.data.ok ? res(JSON.parse(e.data.out)) : rej(new Error(e.data.out)) }
    w.onerror = (e) => { w.terminate(); rej(new Error(e.message)) }
    w.postMessage(JSON.stringify({ csv, model }))
  })))
  return call<HrOut>("ppg_track", JSON.stringify({ members }))
}
