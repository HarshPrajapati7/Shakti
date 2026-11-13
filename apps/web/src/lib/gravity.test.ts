import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { G_RATIO, runStand, simulate } from "./gravity"

const g = JSON.parse(readFileSync(new URL("../../public/data/gravity.json", import.meta.url), "utf8"))

describe("GRAVITY-HEART TypeScript port", () => {
  it("reproduces the Python test vector", () => {
    const tv = g.test_vector
    const s = simulate(g.population_theta, tv.u, tv.hr0, tv.map0, tv.height_cm, tv.onset, tv.dvcs, tv.cmul)
    const err = Math.max(...s.hr.map((v, i) => Math.abs(v - tv.hr[i])), ...s.map.map((v, i) => Math.abs(v - tv.map[i])))
    expect(err).toBeLessThan(0.05)
  })
  it("microgravity leaves HR and MAP at baseline", () => {
    const sim = simulate(g.population_theta, new Array(300).fill(0), 65, 85, 175)
    expect(Math.max(...sim.hr.map((v) => Math.abs(v - 65)))).toBeLessThan(1e-9)
  })
  it("orthostatic margin shrinks with gravity", () => {
    const m = [G_RATIO.moon, G_RATIO.mars, 1].map((x) => runStand(g.population_theta, 65, 85, 175, x, 300).summary.margin)
    expect(m[0]).toBeGreaterThan(m[1]); expect(m[1]).toBeGreaterThan(m[2])
  })
})
