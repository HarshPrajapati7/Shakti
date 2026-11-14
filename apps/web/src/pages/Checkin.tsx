import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Button, Field, Num, Sheet, StatusPill, Tile } from "@/components/ui"
import { assess } from "@/lib/engine"
import { update, useRecords } from "@/lib/store"
import type { AssessOut, Vitals } from "@/lib/types"
import { COLOR, uid } from "@/lib/utils"

type F = { k: keyof Vitals; label: string; unit: string; step?: number; min: number; max: number; hint?: string }
const GROUPS: { title: string; fields: F[] }[] = [
  { title: "Heart & breathing", fields: [
    { k: "sbp", label: "Systolic BP", unit: "mmHg", min: 60, max: 250, hint: "Seated, after 5 min rest" }, { k: "dbp", label: "Diastolic BP", unit: "mmHg", min: 30, max: 150 },
    { k: "hr", label: "Resting heart rate", unit: "bpm", min: 25, max: 220 }, { k: "spo2", label: "Oxygen saturation", unit: "%", min: 50, max: 100 },
    { k: "resp_rate", label: "Breathing rate", unit: "/min", min: 4, max: 60, hint: "Count breaths for 30 s, double it" }] },
  { title: "Body", fields: [
    { k: "temp_c", label: "Body temperature", unit: "°C", step: 0.1, min: 30, max: 43 }, { k: "glucose", label: "Blood glucose", unit: "mg/dL", min: 20, max: 600 },
    { k: "weight_kg", label: "Body mass", unit: "kg", step: 0.1, min: 30, max: 200, hint: "Mass measurement device (SLAMMD) on the ISS" },
    { k: "exercise_min", label: "Exercise today", unit: "min", min: 0, max: 600 }] },
  { title: "Sleep & mind", fields: [
    { k: "sleep_h", label: "Sleep last night", unit: "h", step: 0.5, min: 0, max: 24 }, { k: "mood", label: "Mood", unit: "1–5", min: 1, max: 5, hint: "1 very low · 5 very good" }] },
  { title: "Environment", fields: [
    { k: "radiation_msv", label: "Mission radiation dose", unit: "mSv", step: 0.1, min: 0, max: 2000, hint: "Total from your personal dosimeter" }] },
]

function ReactionTest({ onDone }: { onDone: (ms: number) => void }) {
  const N = 8
  const [phase, setPhase] = useState<"idle" | "wait" | "go" | "early">("idle")
  const [times, setTimes] = useState<number[]>([])
  const t0 = useRef(0), timer = useRef<number>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const arm = () => { setPhase("wait"); timer.current = window.setTimeout(() => { t0.current = performance.now(); setPhase("go") }, 1200 + Math.random() * 2600) }
  const tap = () => {
    if (phase === "idle" || phase === "early") return arm()
    if (phase === "wait") { clearTimeout(timer.current); return setPhase("early") }
    const next = [...times, performance.now() - t0.current]
    if (next.length < N) { setTimes(next); return arm() }
    const s = [...next].sort((a, b) => a - b); onDone(Math.round((s[3] + s[4]) / 2)); setTimes([]); setPhase("idle")
  }
  const bg = { idle: "bg-tile2", wait: "bg-tile2", go: "bg-ok", early: "bg-alert/40" }[phase]
  return (
    <button onClick={tap} className={`grid h-56 w-full place-items-center rounded-[6px] border border-edge transition-colors duration-75 ${bg}`}>
      <span className={`dot text-3xl ${phase === "go" ? "text-[#10261b]" : ""}`}>{{ idle: "Tap to start", wait: "Wait…", go: "TAP", early: "Too early" }[phase]}</span>
      <span className="text-[12px] text-mute">{times.length} / {N}</span>
    </button>
  )
}

export default function CheckIn() {
  const r = useRecords()
  const [v, setV] = useState<Vitals>({})
  const [res, setRes] = useState<AssessOut>()
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [rt, setRt] = useState(false)
  const prev = r.checkins.at(-1)?.vitals ?? {}
  const filled = Object.values(v).filter((x) => x !== undefined).length

  const run = async () => {
    setBusy(true); setErr(undefined)
    try {
      const out = await assess(v, r.checkins.map((c) => c.vitals))
      setRes(out)
      update((s) => ({ ...s, checkins: [...s.checkins, { id: uid(), date: new Date().toISOString(), vitals: v, result: out }] }))
    } catch (e) { setErr(String((e as Error).message)) } finally { setBusy(false) }
  }

  return (
    <div className="grid flex-1 gap-3 lg:grid-cols-12">
      <Tile className="lg:col-span-8" title="Today's measurements"
        action={<span className="text-[12px] text-mute">Fill in what you measured · empty fields are skipped</span>}>
        <div className="grid gap-7">
          {GROUPS.map((g) => (
            <fieldset key={g.title}>
              <legend className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate2">{g.title}</legend>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {g.fields.map((f) => (
                  <Field key={f.k} label={f.label} unit={f.unit} hint={f.hint}>
                    <Num value={v[f.k]} min={f.min} max={f.max} step={f.step} placeholder={prev[f.k] !== undefined ? `last ${prev[f.k]}` : undefined}
                      onChange={(x) => setV({ ...v, [f.k]: x })} />
                  </Field>
                ))}
                {g.title === "Sleep & mind" && (
                  <Field label="Reaction time" unit="ms" hint="8-tap vigilance test">
                    <div className="flex gap-2"><Num value={v.reaction_ms} min={100} max={2000} onChange={(x) => setV({ ...v, reaction_ms: x })} />
                      <Button type="button" onClick={() => setRt(true)}>Test</Button></div>
                  </Field>
                )}
                {g.title === "Body" && (
                  <Field label="Vision change since last check" hint="Blurring, distortion or a new blind spot">
                    <div className="grid grid-cols-3 rounded-[4px] border border-edge">
                      {([[undefined, "Skip"], [0, "No"], [1, "Yes"]] as const).map(([val, l]) => (
                        <button key={l} type="button" onClick={() => setV({ ...v, vision_change: val })} aria-pressed={v.vision_change === val}
                          className={`py-2 text-[13px] ${v.vision_change === val ? "bg-cream text-[#1c1d20]" : "text-mute hover:text-ink"}`}>{l}</button>))}
                    </div>
                  </Field>
                )}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-3">
          <Button tone="slate" onClick={run} disabled={!filled || busy}>{busy ? "Checking…" : "Run check"}</Button>
          <Button tone="ghost" onClick={() => { setV({}); setRes(undefined) }}>Clear</Button>
          {err && <span className="text-[13px] text-alert">{err}</span>}
        </div>
      </Tile>

      <Tile className="lg:col-span-4" title="Result">
        {res ? (
          <div className="grid gap-4">
            <p className="dot text-5xl" style={{ color: COLOR[res.overall] }}>{{ ok: "Normal", watch: "Watch", alert: "Act now" }[res.overall]}</p>
            <ul className="grid gap-2">{res.readings.map((x) => (
              <li key={x.key} className="rounded-[4px] bg-tile2 px-3 py-2.5">
                <div className="flex items-center justify-between"><span className="text-[13px]">{x.label}</span><StatusPill s={x.status} /></div>
                <p className="mt-1 text-[12px] text-mute">{+x.value.toFixed(1)} {x.unit} · {x.note}</p></li>))}
            </ul>
            {res.systems.some((s) => s.status !== "ok") && <div><p className="mb-2 text-[12px] text-mute">What to do</p>
              <ul className="grid gap-2">{res.systems.filter((s) => s.status !== "ok").map((s) => <li key={s.id} className="text-[13px] leading-relaxed"><StatusPill s={s.status} label={s.label} /> <span className="ml-1">{s.action}</span></li>)}</ul></div>}
            <Link to="/" className="text-[13px] text-slate2 hover:underline">See it on the body →</Link>
          </div>
        ) : <p className="text-mute">Run the check to see each value graded against clinical ranges{r.checkins.length >= 5 ? " and your personal baseline" : ""}.</p>}
      </Tile>

      <Sheet open={rt} onClose={() => setRt(false)} title="Reaction test">
        <p className="mb-4 text-mute">Tap as soon as the panel turns green. Eight taps. Tapping early restarts the trial.</p>
        <ReactionTest onDone={(ms) => { setV((x) => ({ ...x, reaction_ms: ms })); setRt(false) }} />
      </Sheet>
    </div>
  )
}
