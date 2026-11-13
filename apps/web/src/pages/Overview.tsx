import { lazy, Suspense, useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Badge, Card } from "@/components/ui"
import { MISSIONS, robustZ, systemsFor, type Day } from "@/lib/crew"
import { landingMargin, useGravity } from "@/lib/twin"
import { STATUS_COLOR, STATUS_TEXT, type Status } from "@/lib/utils"
import { useMission } from "./Console"

const HoloBody = lazy(() => import("@/components/HoloBody"))

const METRICS: { key: keyof Day; label: string; unit: string; digits: number }[] = [
  { key: "hrRest", label: "Resting HR", unit: "bpm", digits: 0 }, { key: "sleep", label: "Sleep", unit: "h", digits: 1 },
  { key: "pvt", label: "Reaction time", unit: "ms", digits: 0 }, { key: "sbp", label: "Systolic BP", unit: "mmHg", digits: 0 },
  { key: "mood", label: "Mood", unit: "/5", digits: 1 }, { key: "dose", label: "Radiation dose", unit: "mSv", digits: 0 },
]

export default function Overview() {
  const { mission, day, days } = useMission()
  const g = useGravity()
  const twin = g?.twins[0]
  const margin = useMemo(() => (twin ? landingMargin(twin, day, MISSIONS[mission].g) : 10), [twin, day, mission])
  const systems = useMemo(() => systemsFor(days, day, margin), [days, day, margin])
  const [sel, setSel] = useState("heart")
  const [metric, setMetric] = useState(METRICS[0])
  const s = systems.find((x) => x.id === sel) ?? systems[0]
  const worst: Status = systems.some((x) => x.status === "alert") ? "alert" : systems.some((x) => x.status === "watch") ? "watch" : "ok"
  const now = days[day - 1]

  const series = days.slice(0, day).map((d) => ({ day: d.day, v: d[metric.key] as number }))
  const rz = robustZ(series.map((x) => x.v), series[series.length - 1].v)
  const dose = now.dose, doseLimit = 600 // mSv career limit (NASA standard)

  const margins = [
    ["Cardiovascular", Math.max(0, Math.min(1, margin / 12))], ["Sleep & circadian", Math.max(0, Math.min(1, (now.sleep - 4.5) / 3))],
    ["Cognitive", Math.max(0, Math.min(1, (360 - now.pvt) / 110))], ["Radiation budget", Math.max(0, 1 - dose / doseLimit)],
  ] as const

  return (
    <div className="grid gap-px bg-line xl:grid-cols-[300px_1fr_360px]">
      <section className="bg-void p-6" aria-label="Body systems">
        <p className="label">Crew status · day {day}</p>
        <p className="display mt-3 text-4xl" style={{ color: STATUS_COLOR[worst] }}>{STATUS_TEXT[worst]}</p>
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {systems.map((x) => (
            <li key={x.id}>
              <button onClick={() => setSel(x.id)} aria-pressed={sel === x.id}
                className={`flex w-full items-center justify-between gap-3 py-3 text-left transition-colors ${sel === x.id ? "text-ink" : "text-mute hover:text-ink"}`}>
                <span className="text-sm">{x.label}</span><Badge color={STATUS_COLOR[x.status]}>{STATUS_TEXT[x.status]}</Badge>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-8 space-y-4">
          <p className="label">Mission health margin</p>
          {margins.map(([k, v]) => {
            const c = v < 0.2 ? STATUS_COLOR.alert : v < 0.45 ? STATUS_COLOR.watch : STATUS_COLOR.ok
            return (
              <div key={k}>
                <div className="flex justify-between text-xs"><span className="text-mute">{k}</span><span className="num">{Math.round(v * 100)}%</span></div>
                <div className="mt-1.5 h-[3px] bg-line"><div className="h-full transition-[width] duration-500" style={{ width: `${v * 100}%`, background: c }} /></div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="relative min-h-[560px] bg-void" aria-label="Digital twin">
        <div className="absolute left-6 top-5 z-10"><p className="label">Digital twin · drag to rotate · tap a point</p></div>
        <Suspense fallback={<div className="label grid h-full place-items-center">Loading twin…</div>}>
          <HoloBody zones={systems} selected={sel} onSelect={setSel} className="absolute inset-0" />
        </Suspense>
      </section>

      <section className="bg-void p-6" aria-live="polite">
        <Badge color={STATUS_COLOR[s.status]}>{STATUS_TEXT[s.status]}</Badge>
        <h2 className="mt-3 text-2xl font-medium">{s.label}</h2>
        <p className="num mt-4 text-3xl">{s.value}</p>
        <p className="mt-4 text-sm leading-relaxed text-ink/80">{s.detail}</p>
        <Card className="mt-6 border-l-2 bg-transparent" style={{ borderLeftColor: STATUS_COLOR[s.status] }}>
          <p className="label">Next action</p>
          <p className="mt-2 text-[15px] leading-relaxed">{s.action}</p>
        </Card>
        <p className="label mt-6">Why it matters</p>
        <p className="mt-2 text-sm leading-relaxed text-mute">{s.risk}</p>
        <p className="mt-6 text-xs leading-relaxed text-mute">
          Each alert shows what changed, against whose baseline, and how sure the model is. A poor sensor reading is flagged as
          poor quality, not as illness. Confirm with the instrument before acting. Escalate to flight surgeons for any red status.
        </p>
      </section>

      <section className="bg-void p-6 xl:col-span-3" aria-label="Trend">
        <div className="flex flex-wrap items-center gap-2">
          {METRICS.map((x) => (
            <button key={x.key} onClick={() => setMetric(x)} aria-pressed={metric.key === x.key}
              className={`label border px-3 py-1.5 transition-colors ${metric.key === x.key ? "border-ink/60 !text-ink" : "border-line hover:!text-ink"}`}>{x.label}</button>
          ))}
          <span className="ml-auto text-xs text-mute">Shaded band = personal baseline (median ± 2 robust SD, days 1–10) · simulated telemetry</span>
        </div>
        <div className="mt-4 h-56">
          <ResponsiveContainer>
            <AreaChart data={series} margin={{ left: -12, right: 8, top: 8 }}>
              <defs><linearGradient id="fillv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5cc8ff" stopOpacity={0.25} /><stop offset="1" stopColor="#5cc8ff" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="#1a2230" vertical={false} />
              {metric.key !== "dose" && <ReferenceArea y1={rz.baseline - 2 * rz.spread} y2={rz.baseline + 2 * rz.spread} fill="#e9edf2" fillOpacity={0.05} />}
              <XAxis dataKey="day" stroke="#8792a2" tickLine={false} fontSize={11} />
              <YAxis stroke="#8792a2" tickLine={false} fontSize={11} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "#0a0e15", border: "1px solid #1a2230", fontSize: 12 }}
                formatter={(v: number) => [`${v.toFixed(metric.digits)} ${metric.unit}`, metric.label]} labelFormatter={(d) => `Day ${d}`} />
              <Area type="monotone" dataKey="v" stroke="#5cc8ff" strokeWidth={1.5} fill="url(#fillv)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}
