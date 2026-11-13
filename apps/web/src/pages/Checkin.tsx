import { useEffect, useRef, useState } from "react"
import { Badge, Button, Card } from "@/components/ui"
import { STATUS_COLOR, STATUS_TEXT, type Status } from "@/lib/utils"

type Field = { key: string; label: string; unit: string; min: number; max: number; step: number; def: number
  rate: (v: number) => Status; help: string }

// Fixed clinical ranges for manual measurements (adult reference values).
const FIELDS: Field[] = [
  { key: "sbp", label: "Systolic BP", unit: "mmHg", min: 70, max: 200, step: 1, def: 118, rate: (v) => (v >= 160 || v < 90 ? "alert" : v >= 135 ? "watch" : "ok"), help: "Seated, after 5 min rest, cuff at heart level." },
  { key: "dbp", label: "Diastolic BP", unit: "mmHg", min: 40, max: 130, step: 1, def: 76, rate: (v) => (v >= 100 || v < 55 ? "alert" : v >= 85 ? "watch" : "ok"), help: "Recorded with the systolic reading." },
  { key: "glu", label: "Blood glucose", unit: "mg/dL", min: 40, max: 300, step: 1, def: 94, rate: (v) => (v < 60 || v > 200 ? "alert" : v < 70 || v > 140 ? "watch" : "ok"), help: "Finger-stick, fasting if possible." },
  { key: "temp", label: "Body temperature", unit: "°C", min: 34, max: 41, step: 0.1, def: 36.8, rate: (v) => (v >= 38.5 || v < 35.5 ? "alert" : v >= 37.6 ? "watch" : "ok"), help: "Oral or ear thermometer. Skin sensors read lower." },
  { key: "sleep", label: "Sleep last night", unit: "h", min: 0, max: 12, step: 0.5, def: 7, rate: (v) => (v < 5 ? "alert" : v < 6.5 ? "watch" : "ok"), help: "Time asleep, not time in the bag." },
  { key: "mood", label: "Mood", unit: "/ 5", min: 1, max: 5, step: 1, def: 4, rate: (v) => (v <= 1 ? "alert" : v <= 2 ? "watch" : "ok"), help: "1 very low, 5 very good. Private to you unless you share it." },
]

function useStored<T>(key: string, init: T) {
  const [v, setV] = useState<T>(() => { try { return JSON.parse(localStorage.getItem(key) ?? "") as T } catch { return init } })
  useEffect(() => { localStorage.setItem(key, JSON.stringify(v)) }, [key, v])
  return [v, setV] as const
}

function ReactionTest({ onDone }: { onDone: (ms: number) => void }) {
  const [phase, setPhase] = useState<"idle" | "wait" | "go" | "early">("idle")
  const [times, setTimes] = useState<number[]>([])
  const t0 = useRef(0), timer = useRef<number>(undefined)
  const N = 8
  const arm = () => { setPhase("wait"); timer.current = window.setTimeout(() => { t0.current = performance.now(); setPhase("go") }, 1200 + Math.random() * 2800) }
  const press = () => {
    if (phase === "idle") return arm()
    if (phase === "wait") { clearTimeout(timer.current); setPhase("early"); return }
    if (phase === "early") return arm()
    const next = [...times, performance.now() - t0.current]; setTimes(next)
    if (next.length >= N) { const s = [...next].sort((a, b) => a - b); onDone(s[N >> 1]); setPhase("idle"); setTimes([]) } else arm()
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  const bg = phase === "go" ? "bg-ok/90 text-void" : phase === "early" ? "bg-alert/20" : "bg-panel"
  return (
    <button onClick={press} className={`grid h-48 w-full place-items-center border border-line text-center transition-colors duration-75 ${bg}`}>
      <span className="text-lg">{phase === "idle" ? "Start reaction test (8 taps)" : phase === "wait" ? "Wait for green…" : phase === "go" ? "TAP" : "Too early, tap to retry"}</span>
      <span className="label">{times.length} / {N}</span>
    </button>
  )
}

export default function Checkin() {
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, f.def])))
  const [log, setLog] = useStored<{ date: string; vals: Record<string, number>; pvt?: number }[]>("astra-checkins", [])
  const [pvt, setPvt] = useState<number>()
  const streak = log.length
  const save = () => setLog([...log, { date: new Date().toISOString(), vals, pvt }])

  return (
    <div className="grid gap-px bg-line lg:grid-cols-[1fr_380px]">
      <section className="bg-void p-6">
        <p className="label">Daily check-in · about 4 minutes · stored on this device</p>
        <h2 className="mt-3 text-2xl font-medium">Measure, then see where you stand</h2>
        <div className="mt-6 grid gap-px bg-line md:grid-cols-2">
          {FIELDS.map((f) => {
            const st = f.rate(vals[f.key])
            return (
              <label key={f.key} className="grid gap-2 bg-void p-4">
                <span className="flex items-center justify-between"><span className="text-sm">{f.label}</span><Badge color={STATUS_COLOR[st]}>{STATUS_TEXT[st]}</Badge></span>
                <span className="flex items-baseline gap-2">
                  <input type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step} value={vals[f.key]}
                    onChange={(e) => setVals({ ...vals, [f.key]: Number(e.target.value) })}
                    className="num w-28 border-b border-line bg-transparent py-1 text-2xl focus:border-holo focus:outline-none" style={{ color: STATUS_COLOR[st] }} />
                  <span className="text-sm text-mute">{f.unit}</span>
                </span>
                <span className="text-xs text-mute">{f.help}</span>
              </label>
            )
          })}
        </div>
        <div className="mt-6 flex items-center gap-6">
          <Button onClick={save}>Save check-in</Button>
          <p className="text-sm text-mute">Any red value: repeat the measurement once. If it is still red, follow the protocol card and notify the flight surgeon at the next link.</p>
        </div>
      </section>
      <aside className="space-y-px bg-line">
        <Card className="border-0 bg-void">
          <p className="label">Cognitive readiness</p>
          <p className="mt-2 mb-4 text-sm text-mute">Psychomotor vigilance: median reaction time over 8 taps. Sleep loss slows it down before you notice.</p>
          <ReactionTest onDone={setPvt} />
          {pvt && <p className="num mt-4 text-3xl" style={{ color: STATUS_COLOR[pvt > 360 ? "alert" : pvt > 300 ? "watch" : "ok"] }}>{pvt.toFixed(0)} ms</p>}
        </Card>
        <Card className="border-0 bg-void">
          <p className="label">Routine</p>
          <p className="num mt-2 text-4xl">{streak}<span className="ml-2 text-sm text-mute">check-ins logged</span></p>
          <div className="mt-4 flex gap-1" aria-hidden>{Array.from({ length: 14 }, (_, i) => <span key={i} className={`h-6 flex-1 ${i < streak % 15 ? "bg-holo/70" : "bg-line"}`} />)}</div>
          <p className="mt-3 text-xs text-mute">Fourteen in a row earns the crew's weekly recovery block. Consistent data makes the personal baseline sharper.</p>
        </Card>
      </aside>
    </div>
  )
}
