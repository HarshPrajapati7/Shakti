// Simulated mission telemetry (clearly labelled SIMULATION in the UI) + personal-baseline scoring.
// Model outputs shown elsewhere (heart rate, stress, gravity twin) come from the trained models on real data.
import type { Status } from "./utils"

export type Mission = "iss" | "transit" | "moon" | "mars"
export const MISSIONS: Record<Mission, { name: string; g: number; dose: number; delay: string }> = {
  iss: { name: "Low Earth orbit", g: 0, dose: 0.5, delay: "< 1 s" },          // dose: mSv/day (approximate)
  transit: { name: "Deep-space transit", g: 0, dose: 1.8, delay: "4–24 min" },
  moon: { name: "Lunar surface", g: 0.165, dose: 1.4, delay: "1.3 s" },
  mars: { name: "Mars surface", g: 0.38, dose: 0.7, delay: "4–24 min" },
}

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export interface Day { day: number; hrRest: number; sbp: number; dbp: number; sleep: number; mood: number; temp: number;
  glucose: number; pvt: number; dose: number }

/** 60-day mission: a deconditioning trend + sleep debt from day 38 (a scripted scenario for the demo). */
export function simulateMission(mission: Mission, days = 60, seed = 7): Day[] {
  const r = rng(seed), n = () => (r() + r() + r() - 1.5) * 1.15
  let dose = 0
  return Array.from({ length: days }, (_, d) => {
    const decond = Math.min(d / 45, 1), debt = d >= 38 ? Math.min((d - 37) / 10, 1) : 0
    dose += MISSIONS[mission].dose * (1 + 0.15 * n())
    return {
      day: d + 1,
      hrRest: 58 + 4 * decond + 5 * debt + 1.6 * n(),
      sbp: 116 - 3 * decond + 2.5 * n(), dbp: 74 + 1.8 * n(),
      sleep: 7.1 - 1.7 * debt + 0.45 * n(), mood: Math.max(1, Math.min(5, 4.1 - 1.2 * debt + 0.4 * n())),
      temp: 36.7 + 0.12 * n(), glucose: 92 + 4 * n(), pvt: 255 + 40 * debt + 9 * n(), dose,
    }
  })
}

const median = (x: number[]) => { const s = [...x].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** Robust personal-baseline z: (x - median(B)) / (1.4826 MAD(B)), baseline = first 10 mission days. */
export function robustZ(series: number[], x: number, floor = 0.06) {
  const b = series.slice(0, 10), med = median(b)
  // spread floor stops a very steady baseline from turning tiny day-to-day noise into alarms
  const mad = Math.max(1.4826 * median(b.map((v) => Math.abs(v - med))), floor * Math.abs(med), 1e-6)
  return { z: (x - med) / mad, baseline: med, spread: mad }
}

export function zStatus(z: number, worseIsHigh = true): Status {
  const w = worseIsHigh ? z : -z
  return w >= 3.5 ? "alert" : w >= 2 ? "watch" : "ok"
}

export interface SystemCard { id: string; label: string; bone: string; offset: [number, number, number]; status: Status
  value: string; detail: string; risk: string; action: string }

export function systemsFor(days: Day[], d: number, cardioMargin: number): SystemCard[] {
  const s = days.slice(0, d), now = s[s.length - 1]
  const hr = robustZ(s.map((x) => x.hrRest), now.hrRest), sl = robustZ(s.map((x) => x.sleep), now.sleep)
  const pv = robustZ(s.map((x) => x.pvt), now.pvt), mo = robustZ(s.map((x) => x.mood), now.mood, 0.13)
  const sleep3 = s.slice(-3).reduce((a, x) => a + x.sleep, 0) / Math.min(3, s.length)
  const cardio: Status = cardioMargin < 0 ? "alert" : cardioMargin < 4 ? "watch" : zStatus(hr.z)
  const sleepS: Status = sleep3 < 5.5 ? "alert" : zStatus(sl.z, false)
  return [
    { id: "heart", label: "Heart & circulation", bone: "mixamorig:Spine2", offset: [0.04, -0.02, 0.09], status: cardio,
      value: `${now.hrRest.toFixed(0)} bpm rest`, detail: `Personal baseline ${hr.baseline.toFixed(0)} bpm (z ${hr.z.toFixed(1)}). Orthostatic margin ${cardioMargin.toFixed(1)} mmHg on standing.`,
      risk: "Cardiovascular deconditioning and orthostatic intolerance after gravity transitions.",
      action: cardio === "ok" ? "Keep the scheduled aerobic session." : "Repeat a seated cuff BP, then a 3-minute stand test before EVA or landing tasks." },
    { id: "brain", label: "Cognition & sleep", bone: "mixamorig:Head", offset: [0, 0.1, 0.02], status: sleepS === "alert" || zStatus(pv.z) === "alert" ? "alert" : sleepS === "watch" || zStatus(pv.z) === "watch" ? "watch" : "ok",
      value: `${sleep3.toFixed(1)} h sleep (3-day)`, detail: `Reaction time ${now.pvt.toFixed(0)} ms vs ${pv.baseline.toFixed(0)} ms baseline. Sleep z ${sl.z.toFixed(1)}.`,
      risk: "Sleep loss and circadian misalignment degrade performance on critical tasks.",
      action: "Protect an 8-hour sleep window tonight and repeat the reaction-time check after waking." },
    { id: "eyes", label: "Eyes (SANS)", bone: "mixamorig:Head", offset: [0, 0.05, 0.1], status: "ok",
      value: "Vision check 6/6", detail: "Headward fluid shift can change eye structure on long flights. Weekly self-check.",
      risk: "Spaceflight-associated neuro-ocular syndrome.", action: "Complete the weekly Amsler-grid self-test." },
    { id: "mind", label: "Mood & stress", bone: "mixamorig:Neck", offset: [0, 0.02, 0.08], status: zStatus(mo.z, false),
      value: `${now.mood.toFixed(1)} / 5 mood`, detail: `Self-report z ${mo.z.toFixed(1)} against the personal baseline. The wearable stress model provides the physiological view.`,
      risk: "Isolation and confinement affect behavioural health.", action: "Schedule a private conference with family or the crew psychologist." },
    { id: "bone", label: "Bone & muscle", bone: "mixamorig:Hips", offset: [0, 0, 0.06], status: d > 40 ? "watch" : "ok",
      value: `${(0.0125 * d).toFixed(2)}% est. hip BMD loss`, detail: "Estimated from the published ~1–1.5 %/month loss in weight-bearing bone without countermeasures.",
      risk: "Bone demineralisation and muscle atrophy in reduced gravity.", action: "Complete resistance exercise (ARED) 6 days a week." },
    { id: "legs", label: "Legs & fluid", bone: "mixamorig:LeftLeg", offset: [-0.02, 0.1, 0.06], status: cardioMargin < 4 ? "watch" : "ok",
      value: "Venous pooling on stand", detail: "In gravity, blood pools in the legs. The twin estimates how much the astronaut can tolerate.",
      risk: "Fluid redistribution on landing.", action: "Plan fluid loading and compression garments before re-entry." },
  ]
}
