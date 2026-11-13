import { useEffect, useState } from "react"
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card } from "@/components/ui"
import { getJSON } from "@/lib/utils"

interface Trace { subject: number; t_min: number[]; p_stress: number[]; condition: number[] }
interface M { stress: Record<string, { f1: number; bal_acc: number; auroc: number }> }
const COND: Record<number, [string, string]> = { 1: ["Rest", "#3fd49a"], 2: ["Stress task", "#ff4a3d"], 3: ["Amusement", "#5cc8ff"] }

export default function Stress() {
  const [tr, setTr] = useState<Trace>()
  const [m, setM] = useState<M>()
  useEffect(() => { getJSON<Trace>("stress_trace.json").then(setTr); getJSON<M>("metrics.json").then(setM) }, [])
  if (!tr || !m) return <div className="label p-10">Loading…</div>
  const data = tr.t_min.map((t, i) => ({ t, p: tr.p_stress[i], c: tr.condition[i] }))
  const spans: { c: number; a: number; b: number }[] = []
  data.forEach((d, i) => { const last = spans[spans.length - 1]
    if (last && last.c === d.c && d.t - data[i - 1].t < 1) last.b = d.t; else spans.push({ c: d.c, a: d.t, b: d.t }) })
  const rows = [["Wrist only", "binary|wrist|cnn_personal"], ["Chest strap", "binary|chest|cnn_personal"], ["Chest + wrist", "binary|chest+wrist|cnn_personal"]] as const

  return (
    <div className="grid gap-px bg-line lg:grid-cols-[1fr_320px]">
      <section className="bg-void p-6">
        <p className="label">Physiological stress · held-out person S{tr.subject} · real WESAD session</p>
        <h2 className="mt-3 text-2xl font-medium">Stress your body shows before you say it</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/80">
          Heart-rate variability, skin conductance, breathing and skin temperature, compared with a 5-minute personal rest
          calibration. Coloured bands show what the person was actually doing. The model never saw this person during training.
        </p>
        <div className="mt-4 flex gap-5">{Object.values(COND).map(([n, c]) => <span key={n} className="label flex items-center gap-2"><span className="size-2" style={{ background: c }} />{n}</span>)}</div>
        <div className="mt-4 h-80">
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
              <CartesianGrid stroke="#1a2230" vertical={false} />
              {spans.map((s, i) => <ReferenceArea key={i} x1={s.a} x2={s.b} fill={COND[s.c][1]} fillOpacity={0.09} />)}
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} stroke="#8792a2" fontSize={11} tickLine={false} unit=" min" />
              <YAxis stroke="#8792a2" fontSize={11} tickLine={false} domain={[0, 1]} />
              <ReferenceLine y={0.5} stroke="#8792a2" strokeDasharray="3 4" />
              <Tooltip contentStyle={{ background: "#0a0e15", border: "1px solid #1a2230", fontSize: 12 }} formatter={(v: number) => [v.toFixed(2), "p(stress)"]} labelFormatter={(x) => `${x} min`} />
              <Area type="stepAfter" dataKey="p" stroke="#ffb340" fill="#ffb340" fillOpacity={0.12} strokeWidth={1.4} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
      <aside className="bg-void">
        <Card className="border-0">
          <p className="label">Stress vs non-stress · 15 unseen people</p>
          <table className="num mt-4 w-full text-sm"><thead><tr className="label text-left"><th className="pb-2 font-normal">Sensors</th><th className="text-right font-normal">F1</th><th className="text-right font-normal">AUROC</th></tr></thead>
            <tbody>{rows.map(([n, k]) => m.stress[k] && (
              <tr key={k} className="border-t border-line/60"><td className="py-2 font-sans">{n}</td><td className="text-right">{m.stress[k].f1.toFixed(3)}</td><td className="text-right">{m.stress[k].auroc.toFixed(3)}</td></tr>))}
            </tbody></table>
          <p className="mt-4 text-xs leading-relaxed text-mute">Published reference (Schmidt et al. 2018, chest + wrist): F1 0.912. Self-reported mood stays the primary measure. This model adds an objective second opinion.</p>
        </Card>
      </aside>
    </div>
  )
}
