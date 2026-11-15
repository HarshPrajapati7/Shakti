<<<<<<< HEAD
import { Link } from "react-router-dom"
import { Button, Tile } from "@/components/ui"
import { update, useRecords } from "@/lib/store"
import type { MissionState, MissionTask } from "@/lib/types"

const tasks: MissionTask[] = [
  { id: "baseline", title: "Complete a health check-in", route: "/check-in", status: "available" },
  { id: "wearable", title: "Review a wearable recording", route: "/wearable", status: "available" },
  { id: "arrival", title: "Explore the arrival gravity simulation", route: "/gravity", status: "available" },
  { id: "review", title: "Review your health history", route: "/history", status: "available" },
]

export default function Mission() {
  const records = useRecords()
  const mission = records.mission
  const start = () => update(r => ({ ...r, mission: { status: "active", startedAt: new Date().toISOString(), tasks, xp: 0 } }))
  const setStatus = (status: MissionState["status"]) => update(r => r.mission ? { ...r, mission: { ...r.mission, status } } : r)
  const complete = (id: string) => update(r => {
    if (!r.mission || r.mission.tasks.find(t => t.id === id)?.status === "completed") return r
    return { ...r, mission: { ...r.mission, tasks: r.mission.tasks.map(t => t.id === id ? { ...t, status: "completed", completedAt: new Date().toISOString() } : t), xp: r.mission.xp + 5 } }
  })
  const done = mission?.tasks.filter(t => t.status === "completed").length ?? 0
  return <div className="grid flex-1 auto-rows-min gap-3 lg:grid-cols-12">
    <Tile className="lg:col-span-8" title="Suit-Up & EVA Readiness">
      <p className="text-mute">A simulated mission sequence for scheduled health maintenance. This is not an operational or medical clearance.</p>
      {!mission || mission.status === "archived" ? <Button className="mt-5" onClick={start}>Start mission</Button> : <>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="dot text-3xl">{done} / {mission.tasks.length} checkpoints</p><p className="text-mute">{mission.xp} activity XP</p></div>
        <div className="mt-3 h-1.5 rounded bg-tile2"><div className="h-full rounded bg-slate2" style={{ width: `${done / mission.tasks.length * 100}%` }} /></div>
        <ol className="mt-6 grid gap-3">{mission.tasks.map((task, i) => <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-3"><div><p>{i + 1}. {task.title}</p><p className="mt-1 text-xs text-mute">{task.status === "completed" ? "Completed" : "Available · completion requires saved evidence"}</p></div><div className="flex gap-2">{task.status !== "completed" && <Link to={task.route!}><Button tone="light">Open</Button></Link>}{task.status !== "completed" && <Button onClick={() => complete(task.id)}>Acknowledge</Button>}</div></li>)}</ol>
        <div className="mt-5 flex gap-2"><Button tone="light" onClick={() => setStatus(mission.status === "paused" ? "active" : "paused")}>{mission.status === "paused" ? "Resume" : "Pause"}</Button><Button tone="light" onClick={() => setStatus("archived")}>Archive</Button></div>
      </>}
    </Tile>
    <Tile className="lg:col-span-4" title="Mission protocol"><p className="leading-relaxed text-mute">Progress records participation. Health measurements retain their own assessment and source labels. If a health concern needs attention, follow the approved health assessment pathway.</p><p className="mt-5 text-sm">Mission path</p><p className="mt-2 text-xs text-mute">Pre-departure · Transit · Arrival · Recovery</p></Tile>
  </div>
=======
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Chart } from "@/components/Chart"
import { Button, Sheet, StatusPill, Tile } from "@/components/ui"
import { BADGES, complete, dailyCompletion, defer, defOf, EMPTY_MISSION, learn, level, MODULES, resume, robustZ, skip, start, SYMPTOMS, sync, TEMPLATES, tpl, type Module } from "@/lib/mission"
import { update, useRecords } from "@/lib/store"
import type { MissionInstance, MissionState, MissionTask, Vitals } from "@/lib/types"
import { cn, COLOR, fmtDate } from "@/lib/utils"

const SRC: Record<string, string> = { manual: "manual", wearable: "wearable", simulation: "simulation", self_report: "self-report", system: "system" }
const STATE: Record<MissionTask["status"], string> = { locked: "Locked", available: "Current", completed: "Done", deferred: "Deferred", skipped: "Skipped" }
const IND: { key: keyof Vitals; label: string; unit: string }[] = [
  { key: "hr", label: "Resting heart rate", unit: "bpm" }, { key: "sbp", label: "Systolic BP", unit: "mmHg" }, { key: "dbp", label: "Diastolic BP", unit: "mmHg" },
  { key: "spo2", label: "SpO2", unit: "%" }, { key: "sleep_h", label: "Sleep", unit: "h" }, { key: "reaction_ms", label: "Reaction time", unit: "ms" },
  { key: "exercise_min", label: "Exercise", unit: "min" }, { key: "weight_kg", label: "Body mass", unit: "kg" }, { key: "mood", label: "Mood", unit: "1-5" },
  { key: "resp_rate", label: "Respiration", unit: "/min" }, { key: "temp_c", label: "Temperature", unit: "°C" }, { key: "radiation_msv", label: "Dosimeter (external)", unit: "mSv" },
]
const SUIT = ["Health checks reviewed", "Official suit procedure started", "Official suit procedure finished", "Ready for readiness review"]

const set = (fn: (s: MissionState) => MissionState) => update((r) => ({ ...r, mission: fn(r.mission ?? EMPTY_MISSION) }))

export default function Mission() {
  const r = useRecords()
  const nav = useNavigate()
  const s = r.mission ?? EMPTY_MISSION
  const [quiz, setQuiz] = useState<Module>()
  const [flag, setFlag] = useState(false)

  // Pick up check-ins, recordings and gravity runs saved on the other pages.
  useEffect(() => { const n = sync(r); if (JSON.stringify(n) !== JSON.stringify(r.mission ?? EMPTY_MISSION)) update((x) => ({ ...x, mission: n })) }, [r])

  const last = r.checkins[r.checkins.length - 1]
  const alert = flag || last?.result.overall === "alert"
  const m = s.active
  const cur = m?.tasks.find((t) => t.status === "available")
  const lv = level(s.xp)

  return (
    <div className="grid flex-1 auto-rows-min gap-3 lg:grid-cols-3">
      {alert && (
        <section className="tile flex flex-wrap items-center justify-between gap-3 p-5 lg:col-span-3" role="alert" style={{ borderColor: COLOR.alert }}>
          <div><StatusPill s="alert" label="Health first" /><p className="mt-2 text-[13px]">{flag ? "You reported a symptom." : "Your latest check-in needs attention."} Use the approved medical route now. Mission tasks can wait and nothing is lost by pausing.</p></div>
          <Button tone="light" onClick={() => nav("/")}>Open health assessment</Button>
        </section>
      )}

      {!m && (
        <Tile title="Choose a mission" className="lg:col-span-3">
          <p className="mb-4 text-[13px] text-mute">Each mission is a short simulated scenario built from the existing SAKTI checks. Points reward completing a check, never the value of a result.</p>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {TEMPLATES.map((t) => (
              <div key={t.id} className="flex flex-col rounded-[4px] bg-tile2 p-4">
                <span className="text-[11px] text-mute">{t.scenario}</span>
                <h3 className="mt-1 text-[15px] font-semibold">{t.title}</h3>
                <p className="mt-2 flex-1 text-[12px] leading-relaxed text-mute">{t.summary}</p>
                <div className="mt-4 flex items-center justify-between"><span className="text-[12px] text-mute">{t.tasks.length} steps · {t.tasks.reduce((a, x) => a + x.minutes, 0)} min</span>
                  <Button tone="slate" onClick={() => set((x) => start(x, t.id))}>Start</Button></div>
              </div>
            ))}
          </div>
        </Tile>
      )}

      {m && (() => {
        const t = tpl(m.templateId)
        const doneN = m.tasks.filter((x) => x.status === "completed" || x.status === "skipped").length
        const day = Math.floor((Date.now() - new Date(m.startedAt).getTime()) / 864e5) + 1
        return <>
          <Tile title={t.title} action={<Button tone="ghost" onClick={() => set((x) => ({ ...x, archived: [...x.archived, { ...m, status: "abandoned", endedAt: new Date().toISOString() }], active: undefined }))}>End mission</Button>}>
            <p className="text-[12px] text-mute">{t.scenario} · mission day {day} · simulation</p>
            <p className="dot mt-4 text-5xl">{Math.round((100 * doneN) / m.tasks.length)}%</p>
            <p className="mt-1 text-[12px] text-mute">{doneN} of {m.tasks.length} steps resolved</p>
            <div className="mt-5 flex items-center gap-1" aria-label="Mission path">
              {m.tasks.map((x, i) => <span key={x.taskId} className="flex flex-1 items-center gap-1">
                <span title={defOf(m, x.taskId).title} className={cn("size-2.5 shrink-0 rounded-full border", x.status === "completed" ? "border-slate2 bg-slate2" : x.status === "available" ? "border-cream bg-cream" : "border-edge")} />
                {i < m.tasks.length - 1 && <span className="h-px flex-1 bg-edge" />}</span>)}
            </div>
            <p className="mt-2 text-[11px] text-mute">The marker shows the simulated checkpoint, not a real spacecraft position.</p>
          </Tile>
          <Tile title="Current objective" className="lg:col-span-2">
            {cur ? <Objective key={cur.taskId} task={cur} m={m} onQuiz={setQuiz} onFlag={() => setFlag(true)} /> : <p className="text-[13px] text-mute">No step is open. Resume a deferred step from the sequence below.</p>}
          </Tile>
          <Tile title="Mission sequence" className="lg:col-span-3">
            <ol className="grid gap-2 md:grid-cols-2">
              {m.tasks.map((x, i) => { const d = defOf(m, x.taskId); return (
                <li key={x.taskId} className={cn("flex items-center justify-between gap-3 rounded-[4px] bg-tile2 px-3 py-2.5", x.status === "locked" && "opacity-50")}>
                  <span className="min-w-0"><span className="num mr-2 text-[12px] text-mute">{String(i + 1).padStart(2, "0")}</span><span className="text-[13px]">{d.title}</span>
                    <span className="ml-2 text-[11px] text-mute">{STATE[x.status]}{x.source ? ` · ${SRC[x.source]}` : ""}{x.xp ? ` · +${x.xp} XP` : ""}</span></span>
                  {x.status === "deferred" && <Button className="h-7" onClick={() => set((q) => resume(q, x.taskId))}>Resume</Button>}
                </li>) })}
            </ol>
          </Tile>
        </>
      })()}

      <Progress s={s} />
      <Trends />

      <Tile title="Progress and achievements">
        <p className="text-[12px] text-mute">Level {lv.index + 1}</p>
        <p className="dot mt-1 text-3xl">{lv.name}</p>
        <div className="mt-3 h-1.5 rounded-full bg-tile2"><div className="h-full rounded-full bg-slate2" style={{ width: `${lv.frac * 100}%` }} /></div>
        <p className="mt-1 text-[12px] text-mute"><span className="num">{s.xp}</span> XP{lv.next ? ` · next level at ${lv.next}` : ""}</p>
        <p className="mt-1 text-[11px] text-mute">Levels track participation only. They are not a measure of fitness or flight readiness.</p>
        <ul className="mt-4 grid gap-1.5">
          {BADGES.map((b) => { const got = s.badges.includes(b.id); return (
            <li key={b.id} className={cn("rounded-[4px] bg-tile2 px-3 py-2", !got && "opacity-50")}><p className="text-[13px]">{b.title}{got && <span className="ml-2 text-[11px] text-slate2">earned</span>}</p><p className="text-[11px] text-mute">{b.rule}</p></li>) })}
        </ul>
      </Tile>

      <Tile title="Learning">
        <ul className="grid gap-1.5">
          {MODULES.map((x) => <li key={x.id}><button onClick={() => setQuiz(x)} className="flex w-full items-center justify-between rounded-[4px] bg-tile2 px-3 py-2.5 text-left text-[13px] hover:bg-[#2e3035]">
            <span>{x.title}</span><span className="text-[11px] text-mute">{s.learned.includes(x.id) ? "done" : "2 min"}</span></button></li>)}
        </ul>
      </Tile>

      <Tile title="Mission log">
        {s.events.length ? <ul className="grid max-h-[460px] gap-1.5 overflow-auto">{[...s.events].reverse().map((e) => (
          <li key={e.id} className="rounded-[4px] bg-tile2 px-3 py-2 text-[12px]"><span className="text-ink">{e.label}</span>
            <span className="block text-[11px] text-mute">{e.type.replace("_", " ")} · {SRC[e.source]} · {fmtDate(e.date)}{e.xp ? ` · +${e.xp} XP` : ""}</span></li>))}</ul>
          : <p className="text-[13px] text-mute">Events appear here once a mission starts.</p>}
      </Tile>

      <Sheet open={!!quiz} onClose={() => setQuiz(undefined)} title="Learning">{quiz && <Quiz key={quiz.id} mod={quiz} onPass={() => set((x) => learn(x, quiz.id))} />}</Sheet>
    </div>
  )
}

function Objective({ task, m, onQuiz, onFlag }: { task: MissionTask; m: MissionInstance; onQuiz: (q?: Module) => void; onFlag: () => void }) {
    const nav = useNavigate()
    const d = defOf(m, task.taskId)
    const [reason, setReason] = useState(""), [skipping, setSkipping] = useState(false)
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="dot text-3xl">{d.title}</h3>
          <span className="text-[12px] text-mute">about {d.minutes} min{d.xp ? ` · ${d.xp} XP` : ""}{d.optional ? " · optional" : ""}</span></div>
        <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-mute">{d.why}</p>
        <div className="mt-5">
          {d.rule === "ack" && <Button tone="slate" onClick={() => set((x) => complete(x, task.taskId, "self_report"))}>Acknowledge</Button>}
          {d.route && <div className="flex flex-wrap items-center gap-3"><Button tone="slate" onClick={() => nav(d.route!)}>Open {d.route.slice(1).replace("-", " ")}</Button>
            <span className="text-[12px] text-mute">This step completes when a matching record is saved{d.fresh ? " after this step opened" : ""}.</span></div>}
          {d.rule === "symptoms" && <Symptoms onDone={(any) => { set((x) => complete(x, task.taskId, "self_report", undefined, any ? "symptom reported" : "none")); if (any) onFlag() }} />}
          {d.rule === "suit" && <Suit onDone={() => set((x) => complete(x, task.taskId, "self_report", undefined, "self-attested"))} />}
          {d.rule === "review" && <div className="flex flex-wrap items-center gap-3"><Button tone="slate" onClick={() => set((x) => complete(x, task.taskId, "self_report"))}>I reviewed my trends</Button>
            <span className="text-[12px] text-mute">Use the Health trends panel on this page.</span></div>}
          {d.rule === "quiz" && <Button tone="slate" onClick={() => onQuiz(MODULES.find((x) => x.id === d.quiz))}>Open learning module</Button>}
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
          <Button tone="ghost" onClick={() => set((x) => defer(x, task.taskId))}>Defer</Button>
          {skipping ? <><input className="h-9 w-56" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button onClick={() => set((x) => skip(x, task.taskId, reason))}>Skip step</Button></> : <Button tone="ghost" onClick={() => setSkipping(true)}>Skip with reason</Button>}
          <span className="ml-auto text-[11px] text-mute">Deferring or skipping carries no penalty.</span>
        </div>
      </div>
    )
}

function Symptoms({ onDone }: { onDone: (any: boolean) => void }) {
  const [on, setOn] = useState<string[]>([])
  return (
    <div>
      <p className="mb-2 text-[12px] text-mute">Prototype list. A real mission uses the questions configured by the crew medical team.</p>
      <div className="grid gap-1.5 sm:grid-cols-2">{SYMPTOMS.map((q) => (
        <label key={q} className="flex items-center gap-2 rounded-[4px] bg-tile2 px-3 py-2 text-[13px]"><input type="checkbox" className="size-4 accent-[#5d7096]" checked={on.includes(q)} onChange={(e) => setOn(e.target.checked ? [...on, q] : on.filter((x) => x !== q))} />{q}</label>))}</div>
      <Button tone="slate" className="mt-3" onClick={() => onDone(on.length > 0)}>{on.length ? "Report symptoms" : "No symptoms"}</Button>
    </div>
  )
}

function Suit({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  return (
    <div>
      <div className="flex gap-1">{SUIT.map((x, k) => <span key={x} className={cn("h-1 flex-1 rounded-full", k <= i ? "bg-slate2" : "bg-tile2")} />)}</div>
      <p className="mt-3 text-[13px]">{SUIT[i]}</p>
      <p className="mt-1 text-[11px] text-mute">Rehearsal only. The real procedure comes from the mission's approved suit checklist, and SAKTI does not check suit hardware.</p>
      <Button tone="slate" className="mt-3" onClick={() => i < SUIT.length - 1 ? setI(i + 1) : onDone()}>{i < SUIT.length - 1 ? "Confirm and continue" : "I followed the official procedure"}</Button>
    </div>
  )
}

function Quiz({ mod, onPass }: { mod: Module; onPass: () => void }) {
  const [pick, setPick] = useState<number>()
  const right = pick === mod.answer
  return (
    <div>
      <h3 className="text-[15px] font-semibold">{mod.title}</h3>
      <p className="mt-3 text-[13px] leading-relaxed text-mute">{mod.body}</p>
      <p className="mt-5 text-[13px] font-medium">{mod.q}</p>
      <div className="mt-2 grid gap-1.5">{mod.options.map((o, k) => (
        <button key={o} onClick={() => { setPick(k); if (k === mod.answer) onPass() }} className={cn("rounded-[4px] border px-3 py-2 text-left text-[13px]", pick === k ? (right ? "border-ok" : "border-watch") : "border-edge bg-tile2")}>{o}</button>))}</div>
      {pick !== undefined && <p className="mt-3 text-[12px] text-mute">{right ? "Correct. " : "Not quite. Try again. "}{mod.explain}</p>}
    </div>
  )
}

function Progress({ s }: { s: MissionState }) {
  const d = useMemo(() => dailyCompletion(s), [s])
  const pts = d.filter((x) => x.pct != null)
  return (
    <Tile title="Task completion by day" className="lg:col-span-2">
      {pts.length >= 2 ? <Chart x={pts.map((p) => p.day)} lines={[{ y: pts.map((p) => p.pct!), color: "#8ea0c4", label: "Daily completion" }, { y: pts.map((p) => p.roll!), color: "#e8e6dc", label: "7-day mean", dash: true }]}
        unit="%" xLabel="Mission day" height={220} />
        : <p className="text-[13px] text-mute">The graph appears after tasks have been open on two or more days. Days without scheduled tasks are left out rather than plotted as zero.</p>}
      <p className="mt-2 text-[11px] text-mute">Completion on day d is completed tasks divided by tasks open that day. This measures routine, not health.</p>
    </Tile>
  )
}

function Trends() {
  const r = useRecords()
  const [key, setKey] = useState<keyof Vitals>("hr")
  const [range, setRange] = useState<7 | 30 | 0>(0)
  const ind = IND.find((x) => x.key === key)!
  const all = r.checkins.filter((c) => c.vitals[key] != null)
  const cut = range ? Date.now() - range * 864e5 : 0
  const pts = all.filter((c) => new Date(c.date).getTime() >= cut)
  const t0 = pts.length ? new Date(pts[0].date).getTime() : 0
  const base = all.slice(0, 5).map((c) => c.vitals[key] as number)
  const lastV = pts[pts.length - 1]?.vitals[key]
  const z = lastV != null ? robustZ(base, lastV) : null
  return (
    <Tile title="Health trends" className="lg:col-span-1">
      <div className="flex flex-wrap gap-2">
        <select value={key} onChange={(e) => setKey(e.target.value as keyof Vitals)} className="h-8">{IND.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
        {([[7, "7 d"], [30, "30 d"], [0, "All"]] as const).map(([v, l]) => <Button key={l} className="h-8 px-3" tone={range === v ? "light" : "dark"} onClick={() => setRange(v)}>{l}</Button>)}
      </div>
      {pts.length >= 2 ? <div className="mt-3"><Chart x={pts.map((c) => (new Date(c.date).getTime() - t0) / 864e5)} lines={[{ y: pts.map((c) => c.vitals[key] as number), color: "#8ea0c4", label: `${ind.label} (manual)` }]}
        unit={` ${ind.unit}`} xLabel="Days" height={200} /></div> : <p className="mt-3 text-[13px] text-mute">At least two check-ins with this value are needed.</p>}
      <p className="mt-2 text-[12px] text-mute">{z == null ? "Baseline unavailable (needs five check-ins with this value and non-zero spread)." : <>Latest value vs baseline: <span className="num text-ink">{z >= 0 ? "+" : ""}{z.toFixed(1)}</span> robust SD</>}</p>
      <p className="mt-1 text-[11px] text-mute">Trends are descriptive and do not show that a mission task caused a change.</p>
    </Tile>
  )
>>>>>>> 0b9a1311cf4c747f2eb15b6ef3e299fee3fa382d
}
