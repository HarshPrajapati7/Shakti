// Crew record: a JSON file in the app-data folder (desktop app) or browser storage (web build).
import { useSyncExternalStore } from "react"
import { isApp, recordsGet, recordsPut } from "./engine"
import type { Records } from "./types"

const KEY = "sakti-records-v1"
const EMPTY: Records = { checkins: [], recordings: [], gravity: [] }
let state: Records = (() => { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") } } catch { return EMPTY } })()
const subs = new Set<() => void>()
let timer: number | undefined

if (isApp) recordsGet().then((t) => { const r = JSON.parse(t); if (Array.isArray(r.checkins)) { state = { ...EMPTY, ...r }; subs.forEach((f) => f()) } }).catch(() => undefined)

export function update(fn: (r: Records) => Records) {
  state = fn(state)
  subs.forEach((f) => f())
  localStorage.setItem(KEY, JSON.stringify(state))
  if (isApp) { clearTimeout(timer); timer = window.setTimeout(() => recordsPut(JSON.stringify(state)).catch(() => undefined), 300) }
}

export function useRecords() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => state)
}
