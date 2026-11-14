import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const cn = (...i: ClassValue[]) => twMerge(clsx(i))

export type Status = "ok" | "watch" | "alert"
export const COLOR: Record<Status, string> = { ok: "#6fc49a", watch: "#e2ad4c", alert: "#e0503a" }
export const WORD: Record<Status, string> = { ok: "Normal", watch: "Watch", alert: "Act now" }

export const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
export const uid = () => Math.random().toString(36).slice(2, 10)
export const MODEL_URL = `${import.meta.env.BASE_URL}models/human.glb`
