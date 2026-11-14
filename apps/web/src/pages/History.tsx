import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button, Sheet, StatusPill, Tile } from "@/components/ui"
import { loadSample } from "@/lib/sample"
import { update, useRecords } from "@/lib/store"
import { fmtDate } from "@/lib/utils"

export default function History() {
  const r = useRecords()
  const [confirm, setConfirm] = useState(false)
  const del = (k: "checkins" | "recordings" | "gravity", id: string) => update((s) => ({ ...s, [k]: (s[k] as { id: string }[]).filter((x) => x.id !== id) }))
  const exportJson = () => {
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 1)], { type: "application/json" }))
    a.download = `sakti-record-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href)
  }
  const Del = ({ k, id }: { k: "checkins" | "recordings" | "gravity"; id: string }) =>
    <button onClick={() => del(k, id)} aria-label="Delete entry" className="text-mute hover:text-alert"><Trash2 className="size-4" /></button>
  const empty = <p className="text-mute">Nothing yet.</p>

  return (
    <div className="grid flex-1 auto-rows-min gap-3 lg:grid-cols-3">
      <div className="flex gap-2 lg:col-span-3">
        <Button onClick={exportJson}>Export record</Button>
        <Button onClick={() => loadSample()}>Load sample data</Button>
        <Button tone="ghost" onClick={() => setConfirm(true)} disabled={!r.checkins.length && !r.recordings.length && !r.gravity.length}>Delete all</Button>
      </div>
      <Tile title={`Check-ins · ${r.checkins.length}`}>
        {r.checkins.length ? <ul className="grid gap-2">{[...r.checkins].reverse().map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 rounded-[4px] bg-tile2 px-3 py-2.5">
            <span><StatusPill s={c.result.overall} /><span className="ml-2 text-[12px] text-mute">{fmtDate(c.date)} · {c.result.readings.length} values</span></span><Del k="checkins" id={c.id} /></li>))}</ul> : empty}
      </Tile>
      <Tile title={`Gravity predictions · ${r.gravity.length}`}>
        {r.gravity.length ? <ul className="grid gap-2">{[...r.gravity].reverse().map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-3 rounded-[4px] bg-tile2 px-3 py-2.5">
            <span><StatusPill s={g.status} label={`${g.margin >= 0 ? "+" : ""}${g.margin.toFixed(0)} mmHg`} /><span className="ml-2 text-[12px] text-mute">{g.destination} · day {g.input.days_in_flight} · {fmtDate(g.date)}</span></span><Del k="gravity" id={g.id} /></li>))}</ul> : empty}
      </Tile>
      <Tile title={`Recordings · ${r.recordings.length}`}>
        {r.recordings.length ? <ul className="grid gap-2">{[...r.recordings].reverse().map((w) => (
          <li key={w.id} className="flex items-center justify-between gap-3 rounded-[4px] bg-tile2 px-3 py-2.5">
            <span className="min-w-0"><StatusPill s={w.status} label={`${w.mean_hr.toFixed(0)} bpm`} /><span className="ml-2 truncate text-[12px] text-mute">{w.name} · {fmtDate(w.date)}</span></span><Del k="recordings" id={w.id} /></li>))}</ul> : empty}
      </Tile>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Delete all">
        <p className="text-mute">This removes every check-in, prediction and recording stored on this device. Export first if you need a copy.</p>
        <div className="mt-6 flex justify-end gap-2"><Button tone="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button className="!bg-alert !text-white" onClick={() => { update(() => ({ checkins: [], recordings: [], gravity: [] })); setConfirm(false) }}>Delete</Button></div>
      </Sheet>
    </div>
  )
}
