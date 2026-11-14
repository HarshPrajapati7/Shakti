// Sample crew record so a first-time user can explore every screen. All results are computed by the engine.
import { assess, gravity } from "./engine"
import { update } from "./store"
import type { CheckIn, GravityIn, Vitals } from "./types"
import { uid } from "./utils"

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 } }

/** 14 days in orbit: stable at first, then sleep debt and early deconditioning in the last few days. */
function sampleDays(): Vitals[] {
  const r = rng(42), n = (s: number) => (r() + r() + r() - 1.5) * s
  return Array.from({ length: 14 }, (_, d) => {
    const late = Math.max(0, d - 9) / 4
    return {
      sbp: Math.round(117 + n(4) - 3 * late), dbp: Math.round(75 + n(3)), hr: Math.round(60 + n(2) + 9 * late), spo2: Math.round(98 + n(0.8)),
      temp_c: +(36.7 + n(0.15)).toFixed(1), glucose: Math.round(92 + n(5)), sleep_h: +(7.1 + n(0.4) - 2 * late).toFixed(1), mood: Math.max(1, Math.min(5, Math.round(4 + n(0.5) - late))),
      reaction_ms: Math.round(262 + n(10) + 55 * late), resp_rate: Math.round(14 + n(1.2)), weight_kg: +(68.4 + n(0.25) - 1.6 * late).toFixed(1),
      exercise_min: Math.round(115 + n(12) - 50 * late), radiation_msv: +((d + 1) * 0.55).toFixed(1), vision_change: 0,
    }
  })
}

export const SAMPLE_PROFILE: GravityIn = { sex: "F", age: 41, height_cm: 167, weight_kg: 68, hr_rest: 60, sbp: 117, dbp: 75, days_in_flight: 14,
  flight_gravity: 0, target_gravity: 1, fluid_loading: false, compression: false }

export async function loadSample() {
  const days = sampleDays(), start = Date.now() - 14 * 864e5, checkins: CheckIn[] = []
  for (let d = 0; d < days.length; d++) {
    const result = await assess(days[d], days.slice(0, d))
    checkins.push({ id: uid(), date: new Date(start + d * 864e5 + 8 * 36e5).toISOString(), vitals: days[d], result })
  }
  const g = await gravity(SAMPLE_PROFILE)
  update(() => ({ checkins, recordings: [], profile: SAMPLE_PROFILE,
    gravity: [{ id: uid(), date: new Date().toISOString(), input: SAMPLE_PROFILE, margin: g.summary.margin_mmhg, status: g.status, destination: "Earth" }] }))
}
