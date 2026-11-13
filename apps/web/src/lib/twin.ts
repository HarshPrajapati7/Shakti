import { useEffect, useState } from "react"
import { getJSON } from "./utils"
import { runStand } from "./gravity"

export interface Twin { id: string; label: string; sex: string; age: number; height_cm: number; weight_kg: number; hr0: number
  map0: number; theta: number[]; plasma_volume_ml: number; tolerance_ml: Record<string, number> }
export interface GravityData { twins: Twin[]; population_theta: number[]; thresholds: Record<string, number> }

let cache: Promise<GravityData> | undefined
export function useGravity() {
  const [g, setG] = useState<GravityData>()
  useEffect(() => { (cache ??= getJSON<GravityData>("gravity.json")).then(setG) }, [])
  return g
}

/** Plasma-volume loss after `day` days in weightlessness (≈12 % plateau by day 30, scaled by local gravity). */
export const pvLossFrac = (day: number, g: number) => 0.12 * Math.min(day / 30, 1) * (1 - g)

/** Orthostatic margin (mmHg) if this astronaut stood up on return to `gTarget` today. */
export function landingMargin(t: Twin, day: number, gMission: number, gTarget = 1) {
  return runStand(t.theta, t.hr0, t.map0, t.height_cm, gTarget, pvLossFrac(day, gMission) * t.plasma_volume_ml).summary.margin
}
