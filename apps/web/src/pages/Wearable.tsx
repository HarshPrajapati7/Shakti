import { useEffect, useRef, useState } from "react"
import { Upload } from "lucide-react"
import { Chart } from "@/components/Chart"
import { Button, StatusPill, Tile } from "@/components/ui"
import { heartRate } from "@/lib/engine"
import { update } from "@/lib/store"
import type { HrOut } from "@/lib/types"
import { COLOR, uid } from "@/lib/utils"

export default function Wearable() {
  const [out, setOut] = useState<HrOut>()
  const [name, setName] = useState<string>()
  const [busy, setBusy] = useState(0)
  const [err, setErr] = useState<string>()
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!busy) return; const t = setInterval(() => setBusy((b) => (b ? b + 1 : 0)), 1000); return () => clearInterval(t) }, [busy > 0])

  const analyse = async (csv: string, n: string) => {
    setErr(undefined); setOut(undefined); setName(n); setBusy(1)
    try {
      const o = await heartRate(csv)
      setOut(o)
      update((s) => ({ ...s, recordings: [...s.recordings, { id: uid(), date: new Date().toISOString(), name: n, seconds: o.seconds, mean_hr: o.mean_hr,
        min_hr: o.min_hr, max_hr: o.max_hr, reliable: o.reliable_fraction, status: o.status }] }))
    } catch (e) { setErr((e as Error).message) } finally { setBusy(0) }
  }
  const onFile = async (f?: File) => { if (f) analyse(await f.text(), f.name) }
  const sample = async () => analyse(await (await fetch(`${import.meta.env.BASE_URL}samples/sample_wrist.csv`)).text(), "Sample recording (6 min)")

  return (
    <div className="grid flex-1 auto-rows-min gap-3 lg:grid-cols-12">
      <Tile className="lg:col-span-4" title="Recording">
        <button onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]) }}
          className={`grid h-44 w-full place-items-center rounded-[6px] border border-dashed transition-colors ${drag ? "border-slate2 bg-tile2" : "border-edge hover:bg-tile2"}`}>
          <span className="grid justify-items-center gap-2 text-mute"><Upload className="size-5" />Drop a CSV or click to choose</span>
        </button>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <Button className="mt-3 w-full" onClick={sample} disabled={!!busy}>Use sample recording</Button>
        <p className="mt-4 text-[12px] leading-relaxed text-mute">Columns <code className="text-ink">bvp, acc_x, acc_y, acc_z</code> at 64 Hz, acceleration in g. At least 30 s.</p>
      </Tile>

      <Tile className="lg:col-span-8" title={name ?? "Heart rate"}>
        {busy > 0 && <div className="grid h-64 place-items-center text-mute"><div className="grid justify-items-center gap-3"><span className="dot text-3xl text-slate2">Analysing</span>
          <span className="text-[12px]">three neural networks in parallel · {busy - 1} s</span></div></div>}
        {err && <p className="text-alert">{err}</p>}
        {out && <>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
            <div><StatusPill s={out.status} /><p className="dot num mt-2 text-6xl" style={{ color: COLOR[out.status] }}>{out.mean_hr.toFixed(0)}<span className="ml-2 font-sans text-sm font-normal text-mute">bpm average</span></p></div>
            <dl className="grid grid-cols-3 gap-6 text-[13px]">
              <div><dt className="text-[11px] text-mute">Range</dt><dd className="num mt-1">{out.min_hr.toFixed(0)}–{out.max_hr.toFixed(0)} bpm</dd></div>
              <div><dt className="text-[11px] text-mute">Reliable</dt><dd className="num mt-1">{(out.reliable_fraction * 100).toFixed(0)}%</dd></div>
              <div><dt className="text-[11px] text-mute">Length</dt><dd className="num mt-1">{(out.seconds / 60).toFixed(1)} min</dd></div>
            </dl>
          </div>
          <div className="mt-5"><Chart x={out.t_s} unit=" bpm" xLabel="seconds" marks={out.low_confidence} band={{ lo: out.lo, hi: out.hi, color: "#8ea0c4" }}
            lines={[{ y: out.hr, color: "#e7e6e1", label: "Heart rate", width: 1.6 }]} /></div>
          <p className="mt-3 text-[13px]">{out.message}</p>
          <p className="mt-2 text-[11px] text-mute">Shaded band: 90% interval. Amber: unreliable stretches (motion or poor contact). Model error on 15 unseen people: {out.loso_mae_bpm.toFixed(1)} bpm.{out.skipped_rows ? ` ${out.skipped_rows} malformed rows were skipped.` : ""}</p>
        </>}
        {!out && !busy && !err && <p className="text-mute">Choose a recording. Heart rate is estimated every 2 seconds, with a confidence band.</p>}
      </Tile>
    </div>
  )
}
