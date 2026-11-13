import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Badge, Slider } from "@/components/ui"
import { G_RATIO, OH_INITIAL, OH_SUSTAINED, runStand, type Env } from "@/lib/gravity"
import { useGravity } from "@/lib/twin"
import { STATUS_COLOR } from "@/lib/utils"

const ENVS: [Env, string][] = [["moon", "Moon"], ["mars", "Mars"], ["earth", "Earth"]]

export default function Gravity() {
  const g = useGravity()
  const [ti, setTi] = useState(0)
  const [gr, setGr] = useState(1)
  const [pv, setPv] = useState(12)
  const [fluid, setFluid] = useState(false)
  const [compress, setCompress] = useState(false)
  const t = g?.twins[ti]

  const res = useMemo(() => {
    if (!t) return undefined
    const dv = Math.max(0, (pv / 100) * t.plasma_volume_ml - (fluid ? 250 : 0))
    const run = (x: number, d: number, c: number) => runStand(t.theta, t.hr0, t.map0, t.height_cm, x, d, c)
    const cur = run(gr, dv, compress ? 0.6 : 1), pre = run(gr, 0, 1)
    const data = cur.sim.map.map((m, i) => ({ t: i - 60, map: m, pre: pre.sim.map[i], hr: cur.sim.hr[i] })).filter((_, i) => i >= 20)
    return { cur: cur.summary, data, envs: ENVS.map(([e, n]) => [n, run(G_RATIO[e], dv, compress ? 0.6 : 1).summary.margin] as const) }
  }, [t, gr, pv, fluid, compress])

  if (!g || !t || !res) return <div className="label p-10">Loading twin…</div>
  const st = res.cur.margin < 0 ? "alert" : res.cur.margin < 4 ? "watch" : "ok"
  const gName = ENVS.find(([e]) => Math.abs(G_RATIO[e] - gr) < 1e-3)?.[1] ?? `${gr.toFixed(2)} g`

  return (
    <div className="grid gap-px bg-line lg:grid-cols-[340px_1fr]">
      <section className="space-y-7 bg-void p-6">
        <div>
          <p className="label">GRAVITY-HEART · personal circulation twin</p>
          <p className="mt-3 text-sm leading-relaxed text-ink/80">
            Fitted to one volunteer's tilt-table and stand tests (PhysioNet PRCP). It predicts that person's blood pressure when standing up after the deconditioning you choose.
          </p>
        </div>
        <label className="grid gap-2"><span className="label">Twin</span>
          <select value={ti} onChange={(e) => setTi(+e.target.value)} className="border border-line bg-panel px-2 py-2 text-sm">
            {g.twins.map((x, i) => <option key={x.id} value={i}>{x.label} · {x.sex}, {x.age} y, {x.height_cm} cm</option>)}
          </select>
        </label>
        <div className="grid gap-2">
          <span className="label">Gravity</span>
          <div className="grid grid-cols-3 border border-line">
            {ENVS.map(([e, n]) => (
              <button key={e} onClick={() => setGr(G_RATIO[e])} aria-pressed={gName === n}
                className={`py-2 text-sm transition-colors ${gName === n ? "bg-ink text-void" : "text-mute hover:text-ink"}`}>{n}</button>
            ))}
          </div>
          <Slider label="Custom" valueText={`${gr.toFixed(2)} g`} min={0} max={1} step={0.01} value={[gr]} onValueChange={([v]) => setGr(v)} />
        </div>
        <Slider label="Plasma volume lost in flight" valueText={`${pv}% · ${Math.round((pv / 100) * t.plasma_volume_ml)} mL`}
          min={0} max={20} step={1} value={[pv]} onValueChange={([v]) => setPv(v)} />
        <fieldset className="grid gap-3"><legend className="label mb-2">Countermeasures</legend>
          {[["Fluid loading (≈250 mL saline)", fluid, setFluid], ["Lower-body compression garment", compress, setCompress]].map(([l, v, set]) => (
            <label key={l as string} className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={v as boolean} onChange={(e) => (set as (b: boolean) => void)(e.target.checked)} className="accent-[#5cc8ff]" /> {l as string}
            </label>
          ))}
        </fieldset>
      </section>

      <section className="bg-void p-6">
        <div className="flex flex-wrap items-end gap-x-12 gap-y-4">
          <div>
            <Badge color={STATUS_COLOR[st]}>{st === "alert" ? "Orthostatic hypotension predicted" : st === "watch" ? "Low margin" : "Tolerated"}</Badge>
            <p className="num mt-2 text-5xl" style={{ color: STATUS_COLOR[st] }}>{res.cur.margin >= 0 ? "+" : ""}{res.cur.margin.toFixed(1)}<span className="ml-2 text-base text-mute">mmHg margin</span></p>
          </div>
          <dl className="grid grid-cols-3 gap-8 text-sm">
            <div><dt className="label">Initial drop</dt><dd className="num mt-1">{res.cur.dmapInitial.toFixed(1)} mmHg</dd></div>
            <div><dt className="label">HR rise</dt><dd className="num mt-1">+{res.cur.dhrSustained.toFixed(0)} bpm</dd></div>
            <div><dt className="label">Blood in legs</dt><dd className="num mt-1">{res.cur.vpool.toFixed(0)} mL</dd></div>
          </dl>
        </div>
        <div className="mt-8 h-80">
          <ResponsiveContainer>
            <LineChart data={res.data} margin={{ left: -8, right: 12, top: 8, bottom: 18 }}>
              <CartesianGrid stroke="#1a2230" vertical={false} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} stroke="#8792a2" fontSize={11} tickLine={false}
                label={{ value: "seconds from standing up", position: "insideBottom", offset: -14, fill: "#8792a2", fontSize: 11 }} />
              <YAxis stroke="#8792a2" fontSize={11} tickLine={false} domain={["auto", "auto"]} />
              <ReferenceLine x={0} stroke="#8792a2" strokeDasharray="2 4" />
              <ReferenceLine y={t.map0 - OH_SUSTAINED} stroke="#ff4a3d" strokeDasharray="4 4" label={{ value: "sustained OH limit", fill: "#ff4a3d", fontSize: 10, position: "insideBottomRight" }} />
              <ReferenceLine y={t.map0 - OH_INITIAL} stroke="#ff4a3d" strokeOpacity={0.5} strokeDasharray="1 4" />
              <Tooltip contentStyle={{ background: "#0a0e15", border: "1px solid #1a2230", fontSize: 12 }} formatter={(v: number) => v.toFixed(1)} labelFormatter={(x) => `${x} s`} />
              <Line dataKey="pre" name="Pre-flight MAP" stroke="#8792a2" dot={false} strokeWidth={1} isAnimationActive={false} />
              <Line dataKey="map" name="Now MAP" stroke="#5cc8ff" dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line dataKey="hr" name="Heart rate" stroke="#ffb340" dot={false} strokeWidth={1} strokeDasharray="3 3" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-px bg-line">
          {res.envs.map(([n, m]) => {
            const c = STATUS_COLOR[m < 0 ? "alert" : m < 4 ? "watch" : "ok"]
            return <div key={n} className="bg-void p-4"><p className="label">{n}</p><p className="num mt-1 text-xl" style={{ color: c }}>{m >= 0 ? "+" : ""}{m.toFixed(1)} mmHg</p></div>
          })}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-mute">
          Blue: mean arterial pressure at heart level. Grey: same person before flight. Amber: heart rate. Red lines: consensus orthostatic-hypotension limits (MAP-equivalent).
          The twin was fitted at 1 g; lower gravities are physics-based extrapolations and have not been validated in flight.
        </p>
      </section>
    </div>
  )
}
