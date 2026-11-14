import { lazy, Suspense, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowUpRight } from "lucide-react"
import { Button, DotBars, Sheet, StatusPill, Tile } from "@/components/ui"
import { useRecords } from "@/lib/store"
import { COLOR, fmtDate, WORD, type Status as S } from "@/lib/utils"

const Hologram = lazy(() => import("@/components/Hologram"))
const LEVEL: Record<S, number> = { ok: 0.35, watch: 0.65, alert: 1 }

export default function Status() {
  const r = useRecords()
  const [open, setOpen] = useState<string>()
  const last = r.checkins.at(-1)
  const res = last?.result
  const sys = res?.systems.find((s) => s.id === open)
  const g = r.gravity.at(-1), w = r.recordings.at(-1)
  const recent = r.checkins.slice(-24)

  return (
    <div className="grid flex-1 auto-rows-min gap-3 lg:grid-cols-12">
      <Tile className="lg:col-span-7" title="Crew status"
        action={<Link to="/check-in"><Button tone="light" className="h-8">New check-in</Button></Link>}>
        {res ? (
          <>
            <p className="dot text-[clamp(44px,6vw,84px)]" style={{ color: COLOR[res.overall] }}>{WORD[res.overall]}</p>
            <p className="mt-3 text-[12px] text-mute">Last check-in {fmtDate(last!.date)} · {res.baseline_days >= 5 ? `personal baseline from ${res.baseline_days} check-ins` : `${5 - res.baseline_days} more check-ins to build your personal baseline`}</p>
            <div className="mt-6 flex items-end justify-between gap-6">
              <DotBars values={recent.map((c) => LEVEL[c.result.overall])} colors={recent.map((c) => COLOR[c.result.overall])} rows={10} />
              <span className="text-[11px] text-mute">last {recent.length} check-ins</span>
            </div>
          </>
        ) : (
          <div className="py-6">
            <p className="dot text-[clamp(40px,5vw,72px)]">No data yet</p>
            <p className="mt-4 max-w-md text-mute">Enter today's measurements. Sakti checks them against clinical ranges and, after five check-ins, against your own normal.</p>
          </div>
        )}
      </Tile>

      <section className="tile relative min-h-[520px] overflow-hidden lg:col-span-5 lg:row-span-2">
        <p className="absolute left-5 top-4 z-10 text-[12px] text-mute">Body systems · tap a point</p>
        <Suspense fallback={<div className="grid h-full place-items-center text-mute">Loading body model…</div>}>
          <Hologram className="absolute inset-0" zones={(res?.systems ?? []).map((s) => ({ id: s.id, label: s.label, status: s.status }))} selected={open} onSelect={setOpen} />
        </Suspense>
        {res && <ul className="absolute inset-x-4 bottom-4 z-10 flex flex-wrap gap-2">
          {res.systems.map((s) => <li key={s.id}><button onClick={() => setOpen(s.id)} className="rounded-[4px] bg-tile2/90 px-2.5 py-1.5 text-[12px] backdrop-blur hover:bg-edge">
            <span className="mr-2 inline-block size-1.5 rounded-full align-middle" style={{ background: COLOR[s.status] }} />{s.label}</button></li>)}
        </ul>}
      </section>

      <section className="rounded-[6px] bg-cream p-5 text-[#1c1d20] lg:col-span-4">
        <h2 className="mb-4 text-[15px] font-semibold">Readings</h2>
        {res ? <ul className="grid max-h-[420px] gap-1.5 overflow-y-auto pr-1">
          {res.readings.map((x) => (
            <li key={x.key} className="flex items-center justify-between gap-3 rounded-[4px] bg-[#dcdad0] px-3 py-2">
              <span><span className="block text-[13px] font-medium">{x.label}</span><span className="text-[11px] text-[#5e5f63]">normal {x.range} {x.unit}</span></span>
              <span className="flex items-center gap-3"><span className="num text-[15px] font-semibold">{+x.value.toFixed(1)} <span className="text-[11px] font-normal">{x.unit}</span></span>
                <span className="size-2 rounded-full" style={{ background: COLOR[x.status] }} title={WORD[x.status]} /></span>
            </li>))}
        </ul> : <p className="text-[13px] text-[#5e5f63]">Your latest values appear here.</p>}
      </section>

      <Tile className="lg:col-span-3" title="Next actions">
        {res ? (res.systems.filter((s) => s.status !== "ok").length ? (
          <ol className="grid gap-3">{res.systems.filter((s) => s.status !== "ok").sort((a, b) => (a.status === "alert" ? -1 : 1) - (b.status === "alert" ? -1 : 1)).map((s) => (
            <li key={s.id}><button onClick={() => setOpen(s.id)} className="w-full text-left"><StatusPill s={s.status} label={s.label} /><p className="mt-1.5 text-[13px] leading-relaxed">{s.action}</p></button></li>))}
          </ol>) : <p className="text-mute">All systems normal. Nothing to do.</p>) : <p className="text-mute">Actions appear after a check-in.</p>}
      </Tile>

      <Tile className="lg:col-span-3" title="Gravity readiness" action={<Link to="/gravity" aria-label="Open gravity readiness"><ArrowUpRight className="size-4 text-mute" /></Link>}>
        {g ? <><p className="dot num text-5xl" style={{ color: COLOR[g.status] }}>{g.margin >= 0 ? "+" : ""}{g.margin.toFixed(0)}<span className="ml-1 font-sans text-sm font-normal text-mute">mmHg</span></p>
          <p className="mt-2 text-[12px] text-mute">Standing-up margin on arrival at {g.destination} · {fmtDate(g.date)}</p></>
          : <p className="text-mute">Predict how your blood pressure will cope with standing up after flight.</p>}
      </Tile>

      <Tile className="lg:col-span-3" title="Wearable heart rate" action={<Link to="/wearable" aria-label="Open wearable"><ArrowUpRight className="size-4 text-mute" /></Link>}>
        {w ? <><p className="dot num text-5xl" style={{ color: COLOR[w.status] }}>{w.mean_hr.toFixed(0)}<span className="ml-1 font-sans text-sm font-normal text-mute">bpm</span></p>
          <p className="mt-2 text-[12px] text-mute">{Math.round(w.seconds / 60)} min recording · {(w.reliable * 100).toFixed(0)}% reliable · {fmtDate(w.date)}</p></>
          : <p className="text-mute">Upload a wristband recording to measure heart rate under motion.</p>}
      </Tile>

      <Sheet open={!!sys} onClose={() => setOpen(undefined)} title={sys?.label ?? ""} side>
        {sys && <>
          <StatusPill s={sys.status} />
          <ul className="mt-5 grid gap-3">{res!.readings.filter((x) => sys.readings.includes(x.key)).map((x) => (
            <li key={x.key} className="rounded-[4px] bg-tile2 p-3">
              <div className="flex items-baseline justify-between"><span>{x.label}</span><span className="num text-lg font-semibold" style={{ color: COLOR[x.status] }}>{+x.value.toFixed(1)} {x.unit}</span></div>
              <p className="mt-1 text-[12px] text-mute">{x.note}</p></li>))}
          </ul>
          <p className="mt-6 text-[12px] text-mute">What to do</p>
          <p className="mt-1 leading-relaxed">{sys.action}</p>
        </>}
      </Sheet>
    </div>
  )
}
