import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type Status = "ok" | "watch" | "alert"
export const STATUS_COLOR: Record<Status, string> = { ok: "#3fd49a", watch: "#ffb340", alert: "#ff4a3d" }
export const STATUS_TEXT: Record<Status, string> = { ok: "Nominal", watch: "Watch", alert: "Act now" }

export async function getJSON<T>(name: string): Promise<T> {
  const r = await fetch(`${import.meta.env.BASE_URL}data/${name}`)
  if (!r.ok) throw new Error(`failed to load ${name}`)
  return r.json() as Promise<T>
}
