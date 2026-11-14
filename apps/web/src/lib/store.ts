// Crew record: a local JSON file through astra-console when native, browser storage otherwise. Always offline.
import { useSyncExternalStore } from "react"
import { engineMode } from "./engine"
import type { Records } from "./types"

const KEY = "astra-records-v1"
const EMPTY: Records = { checkins: [], recordings: [], gravity: [] }
let state: Records = (() => { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") } } catch { return EMPTY } })()
const subs = new Set<() => void>()
let timer: number | undefined

engineMode().then(async (m) => {
  if (m !== "native") return
  const r = await fetch("/api/records").then((x) => x.json()).catch(() => ({}))
  if (r && Array.isArray(r.checkins)) { state = { ...EMPTY, ...r }; subs.forEach((f) => f()) }
})

export function update(fn: (r: Records) => Records) {
  state = fn(state)
  subs.forEach((f) => f())
  localStorage.setItem(KEY, JSON.stringify(state))
  clearTimeout(timer)
  timer = window.setTimeout(async () => {
    if ((await engineMode()) === "native") fetch("/api/records", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(state) })
  }, 300)
}

export function useRecords() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => state)
}
