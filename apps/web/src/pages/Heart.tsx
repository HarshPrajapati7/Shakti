import { useEffect, useState } from "react"
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card } from "@/components/ui"
import { getJSON } from "@/lib/utils"

interface Trace { subject: number; t_s: number[]; y: number[]; online: number[]; lo_conf: number[]; hi_conf: number[]; tracker: number[]; activity: string[] }
interface M { ppg: { version: string; online_mae: number; offline_mae: number; classical_mae: number; coverage90: number; by_activity: Record<string, { tracker: number; online: number }> } }

export default function Heart() {
  const [tr, setTr] = useState<Trace>()
  const [m, setM] = useState<M>()
  const [showClassic, setShowClassic] = useState(false)
  useEffect(() => { getJSON<Trace>("ppg_trace.json").then(setTr); getJSON<M>("metrics.json").then(setM) }, [])
  if (!tr || !m) return <div className="label p-10">Loading…</div>
  const data = tr.t_s.map((t, i) => ({ min: +(t / 60).toFixed(2), ecg: tr.y[i], ours: tr.online[i], band: [tr.lo_conf[i], tr.hi_conf[i]], classic: tr.tracker[i], act: tr.activity[i] }))
  const acts = Object.entries(m.ppg.by_activity).filter(([k]) => k !== "transient")

  return (
    <div className="grid gap-px bg-line lg:grid-cols-[1fr_320px]">
      <section className="bg-void p-6">
        <p className="label">Wrist PPG → heart rate · held-out person S{tr.subject} · real recording</p>
        <h2 className="mt-3 text-2xl font-medium">Heart rate you can trust while moving</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/80">
          Arm motion corrupts optical pulse signals. The model reads pulse and motion spectra together and tracks a probability distribution over heart rate.
          When the shaded band widens, the reading is uncertain: re-check with the chest ECG.
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm text-mute">
          <input type="checkbox" checked={showClassic} onChange={(e) => setShowClassic(e.target.checked)} className="accent-[#5cc8ff]" /> Show classical spectral tracker
        </label>
        <div className="mt-4 h-96">
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
              <CartesianGrid stroke="#1a2230" vertical={false} />
              <XAxis dataKey="min" type="number" domain={["dataMin", "dataMax"]} stroke="#8792a2" fontSize={11} tickLine={false} unit=" min" />
              <YAxis stroke="#8792a2" fontSize={11} tickLine={false} domain={[40, 180]} unit=" bpm" />
              <Tooltip contentStyle={{ background: "#0a0e15", border: "1px solid #1a2230", fontSize: 12 }}
                formatter={(v: number | number[], n: string) => [Array.isArray(v) ? `${v[0].toFixed(0)}–${v[1].toFixed(0)}` : v.toFixed(0), n]}
                labelFormatter={(x, p) => `${x} min · ${p?.[0]?.payload?.act ?? ""}`} />
              <Area dataKey="band" name="90% interval" stroke="none" fill="#5cc8ff" fillOpacity={0.18} isAnimationActive={false} />
              {showClassic && <Line dataKey="classic" name="Classical" stroke="#8792a2" dot={false} strokeWidth={0.8} isAnimationActive={false} />}
              <Line dataKey="ecg" name="ECG reference" stroke="#e9edf2" dot={false} strokeWidth={1} isAnimationActive={false} />
              <Line dataKey="ours" name="ASTRA wrist" stroke="#5cc8ff" dot={false} strokeWidth={1.4} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
      <aside className="space-y-px bg-line">
        <Card className="border-0 bg-void">
          <p className="label">Error on 15 unseen people</p>
          <p className="num mt-2 text-4xl">{m.ppg.online_mae.toFixed(2)}<span className="ml-2 text-sm text-mute">bpm, real-time</span></p>
          <p className="mt-2 text-sm text-mute">Offline review {m.ppg.offline_mae.toFixed(2)} bpm · classical {m.ppg.classical_mae.toFixed(1)} bpm</p>
          <p className="mt-2 text-sm text-mute">90% interval holds {(m.ppg.coverage90 * 100).toFixed(0)}% of the time</p>
        </Card>
        <Card className="border-0 bg-void">
          <p className="label">By activity (MAE, bpm)</p>
          <table className="num mt-3 w-full text-sm"><tbody>
            {acts.map(([k, v]) => (
              <tr key={k} className="border-b border-line/60"><td className="py-1.5 font-sans text-mute">{k.replace("_", " ")}</td>
                <td className="text-right text-mute">{v.tracker.toFixed(1)}</td><td className="text-right">{v.online.toFixed(1)}</td></tr>
            ))}</tbody></table>
          <p className="mt-2 text-xs text-mute">classical · ours</p>
        </Card>
      </aside>
    </div>
  )
}
