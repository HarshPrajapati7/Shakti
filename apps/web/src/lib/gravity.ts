// GRAVITY-HEART reduced-order cardiovascular model — exact port of src/astra/gravity/model.py (_sim).
// Verified against the Python test vector in gravity.test.ts.

export const G_RATIO = { earth: 1, mars: 3.721 / 9.80665, moon: 1.625 / 9.80665, microgravity: 0 } as const
export type Env = keyof typeof G_RATIO

const MMHG_PER_M = (1060 * 9.80665) / 133.322
const FIX = { vcs0: 1000, tfilt: 300, tvd: 6, tcc: 4, hrmax: 70, tprmax: 0.8 }

export interface SimOut { hr: number[]; map: number[]; sv: number[]; vpool: number[]; mapBrain: number[] }

export function simulate(theta: number[], u: number[], hr0: number, map0: number, heightCm: number,
  onset = -1, dvcs = 0, cmul = 1, sub = 4): SimOut {
  const [Cn, tpool, vk, ghr, thr, gtpr, gcp, ttpr, avd, acc, kf] = theta.map(Math.exp)
  const C = Cn * cmul
  const s = heightCm / 100 / 1.75
  const rgh = MMHG_PER_M * 0.5 * s, rcs = MMHG_PER_M * 0.25 * s, rbr = MMHG_PER_M * 0.32 * s
  const n = u.length
  const out: SimOut = { hr: [], map: [], sv: [], vpool: [], mapBrain: [] }
  const f0 = 1 - Math.exp(-FIX.vcs0 / vk)
  let vf = 0, vs = 0, dhr = 0, dr = 0
  const dt = 1 / sub
  const af = 1 - Math.exp(-dt / tpool), asl = 1 - Math.exp(-dt / FIX.tfilt)
  const ah = 1 - Math.exp(-dt / thr), ar = 1 - Math.exp(-dt / ttpr)
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < sub; j++) {
      const uk = k + 1 >= n || j === 0 ? u[k] : u[k] + (u[k + 1] - u[k]) * j * dt
      const ts = k + j * dt - onset
      const on = onset >= 0 && ts >= 0
      const vd = on ? avd * Math.exp(-ts / FIX.tvd) : 0
      const cc = on ? acc * Math.exp(-ts / FIX.tcc) : 0
      const vp = vf + vs
      const vcs = Math.max(FIX.vcs0 - dvcs - vp, 20)
      const sv = (1 - Math.exp(-vcs / vk)) / f0
      const hr = Math.max(hr0 + dhr + cc, 30)
      const mp = map0 * (hr / hr0) * sv * (1 + dr) * (1 - vd)
      if (j === 0) { out.hr.push(hr); out.map.push(mp); out.sv.push(sv); out.vpool.push(vp); out.mapBrain.push(mp - rbr * uk) }
      const e = map0 - mp + rcs * uk
      const th = FIX.hrmax * Math.tanh((ghr * e) / FIX.hrmax)
      const tr = FIX.tprmax * Math.tanh((gtpr * e + (gcp * vp) / 100) / FIX.tprmax)
      vf += af * (C * rgh * uk - vf)
      vs += asl * (kf * C * rgh * uk - vs)
      dhr += ah * (th - dhr)
      dr += ar * (tr - dr)
    }
  }
  return out
}

/** 60 s seated/supine rest, then an active stand at the given gravity ratio (3 s ramp). */
export function standProfile(g: number, tPre = 60, tStand = 240, ramp = 3) {
  const u = Array.from({ length: tPre + tStand }, (_, i) => Math.min(Math.max((i - tPre + 1) / ramp, 0), 1) * g)
  return { u, onset: tPre }
}

// Consensus orthostatic-hypotension limits converted to MAP-equivalent drops (see fit.py)
export const OH_SUSTAINED = 10 + (20 - 10) / 3
export const OH_INITIAL = 20 + (40 - 20) / 3

const smooth = (x: number[], w = 5) => x.map((_, i) => {
  const a = Math.max(0, i - (w >> 1)), b = Math.min(x.length, i + (w >> 1) + 1)
  let s = 0; for (let k = a; k < b; k++) s += x[k]; return s / (b - a)
})
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length

export function standSummary(sim: SimOut, map0: number, hr0: number, tPre = 60) {
  const sm = smooth(sim.map)
  const dmapInitial = Math.min(...sm.slice(tPre, tPre + 15)) - map0
  const sus = [tPre + 30, tPre + 180] as const
  const dmapSustained = mean(sim.map.slice(...sus)) - map0
  return {
    dmapInitial, dmapSustained,
    dhrSustained: mean(sim.hr.slice(...sus)) - hr0,
    mapBrain: mean(sim.mapBrain.slice(...sus)),
    vpool: mean(sim.vpool.slice(...sus)),
    initialOH: dmapInitial <= -OH_INITIAL,
    classicalOH: dmapSustained <= -OH_SUSTAINED,
    margin: Math.min(dmapSustained + OH_SUSTAINED, dmapInitial + OH_INITIAL), // mmHg to the nearest OH limit
  }
}

export function runStand(theta: number[], hr0: number, map0: number, heightCm: number, g: number, dvcs = 0, cmul = 1) {
  const { u, onset } = standProfile(g)
  const sim = simulate(theta, u, hr0, map0, heightCm, onset, dvcs, cmul)
  return { sim, summary: standSummary(sim, map0, hr0) }
}
