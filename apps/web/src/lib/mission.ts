// Mission Protocols: a motivational layer over the existing check-in, wearable and gravity workflows.
// XP rewards completing a health action with real evidence, never the value of the result.
import type { MissionEvent, MissionInstance, MissionState, MissionTask, Records, TaskStatus } from "./types"
import { uid } from "./utils"

export type Rule = "ack" | "checkin" | "reaction" | "exercise" | "radiation" | "wearable" | "gravity" | "symptoms" | "suit" | "review" | "quiz"
export interface TaskDef { id: string; title: string; why: string; minutes: number; xp: number; rule: Rule; route?: string; fresh?: boolean; quiz?: string; optional?: boolean }
export interface Template { id: string; title: string; scenario: string; summary: string; tasks: TaskDef[] }

const T = (id: string, title: string, rule: Rule, xp: number, minutes: number, why: string, extra: Partial<TaskDef> = {}): TaskDef =>
  ({ id, title, rule, xp, minutes, why, route: ROUTE[rule], ...extra })
const ROUTE: Partial<Record<Rule, string>> = { checkin: "/check-in", reaction: "/check-in", exercise: "/check-in", radiation: "/check-in", wearable: "/wearable", gravity: "/gravity" }

export const TEMPLATES: Template[] = [
  { id: "eva", title: "Suit-Up and EVA Readiness", scenario: "Simulated extravehicular activity",
    summary: "Complete the health checks scheduled before a simulated EVA and learn why each one is taken.",
    tasks: [
      T("brief", "Mission briefing", "ack", 0, 1, "The EVA rehearsal lists the health checks that come before suit-up. Nothing in this sequence certifies a real suit or EVA."),
      T("baseline", "Baseline check-in", "checkin", 10, 3, "A fresh set of vitals gives the comparison point for the rest of the day."),
      T("wear", "Wearable readiness", "wearable", 10, 2, "A clean pulse recording confirms the sensor is usable before you depend on it."),
      T("cog", "Cognitive readiness", "reaction", 5, 1, "Reaction time is sensitive to fatigue and poor sleep. Run the 8-tap test inside a check-in."),
      T("symptoms", "Symptom review", "symptoms", 5, 1, "Symptoms are reported before an activity, not discovered during it."),
      T("suit", "Suit-up rehearsal", "suit", 0, 2, "A visual rehearsal of the order of steps. You confirm that the official procedure was followed; the app does not verify hardware."),
      T("ready", "Readiness review", "ack", 0, 1, "A summary of completed and missing checks. Active health alerts stay visible and cannot be dismissed here."),
    ] },
  { id: "transit", title: "Deep-Space Transit and Arrival", scenario: "Simulated transit to Moon or Mars",
    summary: "Keep a steady assessment routine through a long transit and finish with an arrival assessment.",
    tasks: [
      T("dep", "Pre-departure baseline", "checkin", 10, 3, "Departure values anchor the personal baseline used later in the mission."),
      T("d1", "Transit day 1 check-in", "checkin", 10, 3, "Sleep, mood and symptoms change first during early adaptation to weightlessness.", { fresh: true }),
      T("d3", "Transit day 3 recording", "wearable", 10, 2, "Routine pulse recordings show how resting heart rate settles during the transit."),
      T("wk", "Weekly cognitive check", "reaction", 5, 2, "A weekly reaction test tracks alertness across the mission.", { fresh: true }),
      T("mid", "Mid-transit trend review", "review", 5, 2, "Looking at your own trends shows gaps in measurement before arrival."),
      T("learn", "Learning: fluid shift", "quiz", 5, 2, "Explains why standing up after arrival can be difficult.", { quiz: "fluids" }),
      T("arr", "Arrival gravity scenario", "gravity", 5, 2, "The GRAVITY-HEART model estimates the blood-pressure margin on standing. Moon and Mars results are simulations."),
      T("post", "Post-arrival check-in", "checkin", 10, 3, "Records the first values after the gravity transition.", { fresh: true }),
    ] },
  { id: "surface", title: "Surface Traverse and Recovery", scenario: "Simulated lunar or Martian traverse",
    summary: "Practise monitoring before a surface activity and recording recovery after it.",
    tasks: [
      T("pre", "Pre-activity check-in", "checkin", 10, 3, "Values before the activity are needed to judge recovery afterwards."),
      T("sig", "Wearable signal check", "wearable", 10, 2, "Confirms the wrist sensor gives a reliable signal before the traverse."),
      T("obs", "Traverse checkpoint: dosimetry", "quiz", 5, 2, "A short decision checkpoint on what a dosimeter reading means. No rover is controlled.", { quiz: "dose" }),
      T("rad", "Dosimeter log", "radiation", 5, 1, "Enter the reading from an approved external dosimeter in the radiation field of a check-in."),
      T("ret", "Post-activity check-in", "checkin", 10, 3, "The return values are compared with the pre-activity values.", { fresh: true }),
      T("rec", "Recovery trend review", "review", 5, 2, "Review sleep, exercise and heart rate across the recovery window."),
    ] },
  { id: "routine", title: "Long-Duration Health Routine", scenario: "Daily and weekly maintenance",
    summary: "The recurring routine for long missions. Restart it each day or week as your schedule allows.",
    tasks: [
      T("am", "Morning check-in", "checkin", 10, 3, "One consistent morning check-in is the core of long-term monitoring."),
      T("rw", "Wearable recording", "wearable", 10, 2, "Recorded when scheduled and when a sensor is available.", { optional: true }),
      T("rc", "Cognitive check", "reaction", 5, 1, "Tracks alertness over weeks rather than a single day."),
      T("ex", "Exercise log", "exercise", 5, 1, "Exercise is the main countermeasure against bone and muscle loss. Log minutes in a check-in."),
      T("sl", "Learning: sleep timing", "quiz", 5, 2, "Explains why sleep timing is hard to keep in orbit.", { quiz: "sleep" }),
      T("wr", "Weekly trend review", "review", 5, 2, "Compare the past seven days with your personal baseline."),
    ] },
]

export interface Module { id: string; title: string; body: string; q: string; options: string[]; answer: number; explain: string }
export const MODULES: Module[] = [
  { id: "fluids", title: "Why do fluids shift in microgravity?", body: "On Earth, gravity pulls blood and tissue fluid toward the legs. In weightlessness that gradient disappears and roughly one to two litres move toward the chest and head. The body reads this as excess volume and reduces plasma volume over the first days of flight. After landing, the smaller blood volume and adapted reflexes can make it hard to hold blood pressure when standing.",
    q: "Why can standing be difficult after a long mission?", options: ["Muscles forget how to stand", "Lower plasma volume and adapted reflexes reduce blood pressure on standing", "Higher gravity increases heart rate permanently"], answer: 1,
    explain: "Orthostatic intolerance after flight is mainly circulatory: less plasma volume and a reflex system adapted to weightlessness." },
  { id: "hr", title: "What do HR and HRV tell us?", body: "A wrist sensor estimates pulse rate from changes in reflected light. Heart-rate variability describes how the interval between beats changes and is influenced by breathing, posture, stress and movement. Both are useful as trends against your own baseline. A single value is not a diagnosis.",
    q: "What can a single pulse-rate reading not provide?", options: ["An estimate of current pulse rate", "A diagnosis", "A data point for a trend"], answer: 1, explain: "One reading is a measurement. Interpretation needs context, trends and clinical judgement." },
  { id: "bp", title: "How to take a blood-pressure reading", body: "Follow the procedure supplied by your medical team. Readings are commonly affected by recent activity, posture, cuff size, arm position and talking during the measurement. Record the value you measured, even when it is unusual.",
    q: "A reading looks higher than usual. What should you record?", options: ["The value that was measured", "A value closer to your average", "Nothing, and try again tomorrow"], answer: 0, explain: "Honest values are the point of monitoring. The app never rewards a favourable number." },
  { id: "ppg", title: "What is a reliable PPG recording?", body: "Photoplethysmography (PPG) measures blood-volume changes under the skin. Motion and poor skin contact add artefacts that look like pulses. SAKTI uses the accelerometer to detect motion and reports the fraction of windows it considers reliable.",
    q: "What most often corrupts a wrist PPG recording?", options: ["Room temperature", "Wrist movement and loose contact", "Recording for too long"], answer: 1, explain: "Motion artefacts are the main error source. Keep still and wear the sensor snugly." },
  { id: "sleep", title: "Why does sleep timing matter?", body: "The circadian clock runs on a cycle of about 24 hours and is set mainly by light. In low Earth orbit the crew sees about sixteen sunrises a day, so light no longer marks day and night. Fixed sleep windows and controlled lighting help keep the clock stable.",
    q: "Why is the circadian clock disrupted in low Earth orbit?", options: ["Many short light-dark cycles each day", "Lower oxygen levels", "Weightlessness stops the clock"], answer: 0, explain: "Roughly 90-minute orbits give about sixteen sunrises per day, which removes the normal light cue." },
  { id: "dose", title: "What does a dosimeter measure?", body: "A dosimeter records the radiation dose at the instrument's location, usually reported in millisieverts (mSv). It does not measure biological damage in a particular person. Doses are tracked over the mission against limits set by the mission's radiation protection programme.",
    q: "A dosimeter shows a higher reading after a traverse. What does it tell you?", options: ["The exact damage to your cells", "The dose recorded at the instrument during that period", "Whether you are fit to fly"], answer: 1, explain: "Dose is a physical quantity at the instrument. Health risk is assessed by the radiation and medical teams." },
  { id: "stand", title: "What happens during a stand test?", body: "Heart rate and blood pressure are measured lying down and then at one and three minutes after standing. The change shows how well circulation adapts to gravity. Follow the mission-approved procedure and stop if you feel faint.",
    q: "What does a stand test measure?", options: ["Leg strength", "How heart rate and blood pressure respond to standing", "Lung capacity"], answer: 1, explain: "SAKTI can use these values to personalise the GRAVITY-HEART model." },
  { id: "report", title: "When should a symptom be reported?", body: "Report new or worsening symptoms when you notice them, using the crew's approved escalation route. Do not wait for the next scheduled check-in. SAKTI is a monitoring aid and is not an emergency channel.",
    q: "You develop a new headache and blurred vision. What should you do?", options: ["Wait for the next scheduled check-in", "Report it now through the approved route", "Complete the mission task first"], answer: 1, explain: "Health always takes priority over any mission task." },
]

export const SYMPTOMS = ["New or worsening headache", "Dizziness or light-headedness", "Change in vision", "Chest discomfort or shortness of breath", "Nausea or vomiting"]

export const LEVELS: [number, string][] = [[0, "Mission Initiate"], [50, "Crew Monitor"], [150, "Systems Observer"], [300, "Mission Specialist"], [500, "Expedition Specialist"]]
export function level(xp: number) {
  let i = 0; while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++
  const next = LEVELS[i + 1]?.[0]
  return { index: i, name: LEVELS[i][1], next, frac: next ? (xp - LEVELS[i][0]) / (next - LEVELS[i][0]) : 1 }
}

export const BADGES: { id: string; title: string; rule: string }[] = [
  { id: "baseline", title: "Baseline Established", rule: "Save five check-ins (the personal-baseline period)" },
  { id: "seven", title: "Seven-Day Consistency", rule: "Complete a mission task on seven different days" },
  { id: "sensor", title: "Sensor Check Complete", rule: "Complete a wearable task with at least 50% reliable windows" },
  { id: "cog", title: "Cognitive Check Complete", rule: "Complete a reaction-time task" },
  { id: "checkpoint", title: "Mission Checkpoint", rule: "Complete a full mission sequence" },
  { id: "knowledge", title: "Health Knowledge", rule: "Pass a learning module" },
  { id: "weekly", title: "Weekly Review", rule: "Complete a trend review task" },
  { id: "recovery", title: "Recovery Log", rule: "Complete a post-activity or post-arrival check-in" },
]

export const EMPTY_MISSION: MissionState = { archived: [], events: [], xp: 0, badges: [], learned: [] }
export const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!
export const defOf = (m: MissionInstance, taskId: string) => tpl(m.templateId).tasks.find((t) => t.id === taskId)!
const now = () => new Date().toISOString()
const ev = (type: MissionEvent["type"], label: string, source: MissionEvent["source"], xp = 0): MissionEvent => ({ id: uid(), date: now(), type, label, source, xp })
const RESOLVED: TaskStatus[] = ["completed", "skipped"]

/** Unlock the next locked task once every earlier task is completed, skipped or deferred. */
function unlock(m: MissionInstance): MissionInstance {
  const tasks = [...m.tasks]
  const i = tasks.findIndex((t) => t.status === "locked")
  if (i >= 0 && tasks.slice(0, i).every((t) => t.status !== "available")) tasks[i] = { ...tasks[i], status: "available", availableAt: now() }
  return { ...m, tasks }
}

export function start(s: MissionState, templateId: string): MissionState {
  const t = tpl(templateId)
  const archived = s.active ? [...s.archived, { ...s.active, status: "abandoned" as const, endedAt: now() }] : s.archived
  const m: MissionInstance = { id: uid(), templateId, startedAt: now(), status: "active", tasks: t.tasks.map((d) => ({ taskId: d.id, status: "locked", xp: 0 })) }
  return { ...s, archived, active: unlock(m), events: [...s.events, ev("started", t.title, "system")] }
}

/** Mark one task complete. XP is granted once per task instance. */
export function complete(s: MissionState, taskId: string, source: MissionTask["source"], recordId?: string, note?: string): MissionState {
  const m = s.active; if (!m) return s
  const t = m.tasks.find((x) => x.taskId === taskId); if (!t || t.status === "completed") return s
  const d = defOf(m, taskId)
  const tasks = m.tasks.map((x) => x.taskId === taskId ? { ...x, status: "completed" as const, completedAt: now(), source, recordId, note, xp: d.xp } : x)
  let next: MissionState = { ...s, xp: s.xp + d.xp, active: unlock({ ...m, tasks }), events: [...s.events, ev("completed", d.title, source ?? "self_report", d.xp)] }
  next = finishIfDone(next)
  return next
}

export function defer(s: MissionState, taskId: string): MissionState {
  const m = s.active; if (!m) return s
  const tasks = m.tasks.map((x) => x.taskId === taskId ? { ...x, status: "deferred" as const } : x)
  return { ...s, active: unlock({ ...m, tasks }), events: [...s.events, ev("deferred", defOf(m, taskId).title, "self_report")] }
}

export function skip(s: MissionState, taskId: string, reason: string): MissionState {
  const m = s.active; if (!m) return s
  const tasks = m.tasks.map((x) => x.taskId === taskId ? { ...x, status: "skipped" as const, note: reason } : x)
  return finishIfDone({ ...s, active: unlock({ ...m, tasks }), events: [...s.events, ev("skipped", `${defOf(m, taskId).title}${reason ? ` (${reason})` : ""}`, "self_report")] })
}

export function resume(s: MissionState, taskId: string): MissionState {
  const m = s.active; if (!m) return s
  const tasks = m.tasks.map((x) => x.taskId === taskId ? { ...x, status: "available" as const, availableAt: x.availableAt ?? now() } : x)
  return { ...s, active: { ...m, tasks }, events: [...s.events, ev("resumed", defOf(m, taskId).title, "self_report")] }
}

function finishIfDone(s: MissionState): MissionState {
  const m = s.active
  if (!m || !m.tasks.every((t) => RESOLVED.includes(t.status))) return s
  const bonus = 15
  return { ...s, xp: s.xp + bonus, active: undefined, archived: [...s.archived, { ...m, status: "completed", endedAt: now() }],
    events: [...s.events, ev("mission_completed", tpl(m.templateId).title, "system", bonus)] }
}

export function learn(s: MissionState, moduleId: string): MissionState {
  if (s.learned.includes(moduleId)) return s
  const mod = MODULES.find((x) => x.id === moduleId)!
  let next: MissionState = { ...s, learned: [...s.learned, moduleId] }
  const t = s.active?.tasks.find((x) => x.status !== "completed" && x.status !== "locked" && defOf(s.active!, x.taskId).quiz === moduleId)
  if (t) next = complete(next, t.taskId, "self_report", undefined, "quiz passed")
  else next = { ...next, xp: next.xp + 5, events: [...next.events, ev("learning", mod.title, "self_report", 5)] }
  return next
}

/** Find saved records that satisfy record-based tasks. A record counts once per rule within a mission. */
export function sync(r: Records): MissionState {
  let s = r.mission ?? EMPTY_MISSION
  for (let guard = 0; guard < 20; guard++) {
    const m = s.active; if (!m) break
    let changed = false
    for (const t of m.tasks) {
      if (t.status !== "available" && t.status !== "deferred") continue
      const d = defOf(m, t.taskId)
      const used = new Set(m.tasks.filter((x) => x.recordId && defOf(m, x.taskId).rule === d.rule).map((x) => x.recordId))
      const since = d.fresh ? t.availableAt ?? m.startedAt : m.startedAt
      const ok = (x: { id: string; date: string }) => x.date >= since && !used.has(x.id)
      let hit: { id: string; src: MissionTask["source"] } | undefined
      const ci = (f: (c: Records["checkins"][number]) => boolean) => { const c = r.checkins.find((c) => ok(c) && f(c)); return c && { id: c.id, src: "manual" as const } }
      if (d.rule === "checkin") hit = ci(() => true)
      else if (d.rule === "reaction") hit = ci((c) => c.vitals.reaction_ms != null)
      else if (d.rule === "exercise") hit = ci((c) => c.vitals.exercise_min != null)
      else if (d.rule === "radiation") hit = ci((c) => c.vitals.radiation_msv != null)
      else if (d.rule === "wearable") { const w = r.recordings.find(ok); hit = w && { id: w.id, src: "wearable" } }
      else if (d.rule === "gravity") { const g = r.gravity.find(ok); hit = g && { id: g.id, src: "simulation" } }
      if (hit) { s = complete(s, t.taskId, hit.src, hit.id); changed = true; break }
    }
    if (!changed) break
  }
  return badges(r, s)
}

function badges(r: Records, s: MissionState): MissionState {
  const all = [...s.archived, ...(s.active ? [s.active] : [])]
  const done = all.flatMap((m) => m.tasks.filter((t) => t.status === "completed").map((t) => ({ t, d: defOf(m, t.taskId) })))
  const days = new Set(s.events.filter((e) => e.type === "completed" || e.type === "learning").map((e) => e.date.slice(0, 10)))
  const earned: Record<string, boolean> = {
    baseline: r.checkins.length >= 5,
    seven: days.size >= 7,
    sensor: done.some(({ t, d }) => d.rule === "wearable" && (r.recordings.find((w) => w.id === t.recordId)?.reliable ?? 0) >= 0.5),
    cog: done.some(({ d }) => d.rule === "reaction"),
    checkpoint: s.archived.some((m) => m.status === "completed"),
    knowledge: s.learned.length > 0,
    weekly: done.some(({ d }) => d.rule === "review"),
    recovery: done.some(({ d }) => d.rule === "checkin" && d.fresh && /post|ret/.test(d.id)),
  }
  const fresh = BADGES.filter((b) => earned[b.id] && !s.badges.includes(b.id))
  if (!fresh.length) return s
  return { ...s, badges: [...s.badges, ...fresh.map((b) => b.id)], events: [...s.events, ...fresh.map((b) => ev("badge", b.title, "system"))] }
}

/** Daily completion C_d = 100 * completed_d / scheduled_d. A task counts as scheduled on every day it was open. Days with none are gaps (null). */
export function dailyCompletion(s: MissionState) {
  const all = [...s.archived, ...(s.active ? [s.active] : [])]
  const open: { from: string; to: string; doneDay?: string }[] = []
  for (const m of all) for (const t of m.tasks) {
    if (!t.availableAt) continue
    const end = t.completedAt ?? m.endedAt ?? now()
    open.push({ from: t.availableAt.slice(0, 10), to: end.slice(0, 10), doneDay: t.status === "completed" ? t.completedAt!.slice(0, 10) : undefined })
  }
  if (!open.length) return []
  const first = open.reduce((a, o) => o.from < a ? o.from : a, open[0].from)
  const out: { day: number; date: string; pct: number | null; roll: number | null }[] = []
  const d0 = new Date(first + "T00:00:00Z").getTime(), last = now().slice(0, 10)
  for (let k = 0; ; k++) {
    const date = new Date(d0 + k * 864e5).toISOString().slice(0, 10)
    if (date > last || k > 400) break
    const sched = open.filter((o) => o.from <= date && o.to >= date).length
    const doneN = open.filter((o) => o.doneDay === date).length
    out.push({ day: k + 1, date, pct: sched ? (100 * doneN) / sched : null, roll: null })
  }
  // 7-day rolling mean over days that had scheduled tasks
  out.forEach((o, i) => { const w = out.slice(Math.max(0, i - 6), i + 1).map((x) => x.pct).filter((v): v is number => v != null); o.roll = w.length ? w.reduce((a, b) => a + b, 0) / w.length : null })
  return out
}

/** Robust deviation z = (x - median(B)) / (1.4826 MAD(B)) against the first five check-ins. Null when unavailable. */
export function robustZ(base: number[], x: number) {
  if (base.length < 5) return null
  const med = (v: number[]) => { const a = [...v].sort((p, q) => p - q), h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2 }
  const m = med(base), mad = med(base.map((v) => Math.abs(v - m)))
  return mad ? (x - m) / (1.4826 * mad) : null
}
