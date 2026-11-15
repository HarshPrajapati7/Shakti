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
}
