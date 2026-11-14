import { useEffect, useState } from "react"
import { Chart } from "@/components/Chart"
import { Button, Field, Num, StatusPill, Tile, Toggle } from "@/components/ui"
import { gravity } from "@/lib/engine"
import { update, useRecords } from "@/lib/store"
import type { GravityIn, GravityOut, StandTest } from "@/lib/types"
import { COLOR, uid } from "@/lib/utils"

const DEF: GravityIn = { sex: "F", age: 38, height_cm: 168, weight_kg: 62, hr_rest: 64, sbp: 116, dbp: 74, days_in_flight: 180, flight_gravity: 0,
  target_gravity: 1, fluid_loading: false, compression: false }
const DEST: [string, number][] = [["Earth", 1], ["Mars", 3.721 / 9.80665], ["Moon", 1.625 / 9.80665]]
const ST_FIELDS: [keyof StandTest, string][] = [["hr_supine", "HR lying"], ["sbp_supine", "SBP lying"], ["dbp_supine", "DBP lying"], ["hr_1min", "HR at 1 min"],
  ["sbp_1min", "SBP at 1 min"], ["dbp_1min", "DBP at 1 min"], ["hr_3min", "HR at 3 min"], ["sbp_3min", "SBP at 3 min"], ["dbp_3min", "DBP at 3 min"]]

export default function Gravity() {
  const r = useRecords()
  const [x, setX] = useState<GravityIn>({ ...DEF, ...r.profile })
  const [st, setSt] = useState<Partial<StandTest>>(r.profile?.stand_test ?? {})
  const [out, setOut] = useState<GravityOut>()
  const [err, setErr] = useState<string>()
  const stComplete = ST_FIELDS.every(([k]) => typeof st[k] === "number")
  const set = <K extends keyof GravityIn>(k: K, v: GravityIn[K] | undefined) => v !== undefined && setX({ ...x, [k]: v })

  useEffect(() => {
    const t = setTimeout(() => {
      gravity({ ...x, stand_test: stComplete ? (st as StandTest) : undefined }).then((o) => { setOut(o); setErr(undefined) }).catch((e) => setErr(e.message))
    }, 200)
    return () => clearTimeout(t)
  }, [x, st, stComplete])

  const dest = DEST.find(([, g]) => Math.abs(g - x.target_gravity) < 1e-3)?.[0] ?? "destination"
  const save = () => out && update((s) => ({ ...s, profile: { ...x, stand_test: stComplete ? (st as StandTest) : undefined },
    gravity: [...s.gravity, { id: uid(), date: new Date().toISOString(), input: x, margin: out.summary.margin_mmhg, status: out.status, destination: dest }] }))

  return (
    <div className="grid flex-1 gap-3 lg:grid-cols-12">
      <Tile className="lg:col-span-4" title="Your details">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sex"><select value={x.sex} onChange={(e) => set("sex", e.target.value)}><option value="F">Female</option><option value="M">Male</option></select></Field>
          <Field label="Age" unit="y"><Num value={x.age} min={18} max={80} onChange={(v) => set("age", v)} /></Field>
          <Field label="Height" unit="cm"><Num value={x.height_cm} min={120} max={220} onChange={(v) => set("height_cm", v)} /></Field>
          <Field label="Weight" unit="kg"><Num value={x.weight_kg} min={30} max={200} onChange={(v) => set("weight_kg", v)} /></Field>
          <Field label="Resting HR" unit="bpm"><Num value={x.hr_rest} min={30} max={140} onChange={(v) => set("hr_rest", v)} /></Field>
          <Field label="Blood pressure" unit="mmHg"><div className="flex items-center gap-1"><Num value={x.sbp} min={70} max={220} onChange={(v) => set("sbp", v)} /><span className="text-mute">/</span><Num value={x.dbp} min={40} max={140} onChange={(v) => set("dbp", v)} /></div></Field>
        </div>
        <h3 className="mb-3 mt-6 text-[13px] font-semibold">Mission</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Days in flight"><Num value={x.days_in_flight} min={0} max={1500} onChange={(v) => set("days_in_flight", v)} /></Field>
          <Field label="Gravity during flight"><select value={x.flight_gravity} onChange={(e) => set("flight_gravity", +e.target.value)}>
            <option value={0}>Weightless</option><option value={1.625 / 9.80665}>Moon base</option><option value={3.721 / 9.80665}>Mars base</option></select></Field>
        </div>
        <Field label="Arriving at"><div className="mt-0.5 grid grid-cols-3 rounded-[4px] border border-edge">
          {DEST.map(([n, g]) => <button key={n} onClick={() => set("target_gravity", g)} aria-pressed={dest === n}
            className={`py-2 text-[13px] ${dest === n ? "bg-cream text-[#1c1d20]" : "text-mute hover:text-ink"}`}>{n}</button>)}</div></Field>
        <h3 className="mb-1 mt-6 text-[13px] font-semibold">Countermeasures</h3>
        <Toggle label="Fluid loading before arrival" checked={x.fluid_loading} onChange={(b) => set("fluid_loading", b)} />
        <Toggle label="Compression garment" checked={x.compression} onChange={(b) => set("compression", b)} />
        <details className="mt-5 border-t border-edge pt-4">
          <summary className="cursor-pointer text-[13px] font-semibold">Personalise with a stand test {stComplete && <span className="ml-2 text-ok">· active</span>}</summary>
          <p className="my-3 text-[12px] text-mute">Lie down 5 minutes, measure, then stand and measure at 1 and 3 minutes. The engine fits your own pooling and reflex strength.</p>
          <div className="grid grid-cols-3 gap-2">{ST_FIELDS.map(([k, l]) => <Field key={k} label={l}><Num value={st[k]} onChange={(v) => setSt({ ...st, [k]: v })} /></Field>)}</div>
          {Object.keys(st).length > 0 && <Button tone="ghost" className="mt-2 px-0" onClick={() => setSt({})}>Clear stand test</Button>}
        </details>
      </Tile>

      <Tile className="lg:col-span-8" title={`Standing up on ${dest}`} action={out && <Button tone="light" className="h-8" onClick={save}>Save to record</Button>}>
        {err && <p className="mb-3 text-[13px] text-alert">{err}</p>}
        {out && <>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div><StatusPill s={out.status} label={out.status === "alert" ? "Fainting risk predicted" : out.status === "watch" ? "Low margin" : "Tolerated"} />
              <p className="dot num mt-2 text-6xl" style={{ color: COLOR[out.status] }}>{out.summary.margin_mmhg >= 0 ? "+" : ""}{out.summary.margin_mmhg.toFixed(1)}</p>
              <p className="text-[12px] text-mute">mmHg margin to orthostatic hypotension</p></div>
            <dl className="grid grid-cols-3 gap-6 text-[13px]">
              <div><dt className="text-[11px] text-mute">Initial BP drop</dt><dd className="num mt-1">{out.summary.dmap_initial.toFixed(0)} mmHg</dd></div>
              <div><dt className="text-[11px] text-mute">Heart-rate rise</dt><dd className="num mt-1">+{out.summary.dhr_sustained.toFixed(0)} bpm</dd></div>
              <div><dt className="text-[11px] text-mute">Plasma lost</dt><dd className="num mt-1">{out.plasma_loss_ml.toFixed(0)} mL</dd></div>
            </dl>
          </div>
          <div className="mt-5">
            <Chart x={out.t} unit="" xLabel="seconds from standing up"
              lines={[{ y: out.map_preflight, color: "#8d8f96", label: "Before flight", width: 1 }, { y: out.map, color: "#8ea0c4", label: "After flight", width: 2 }]}
              refs={[{ y: out.map0 - 13.3, label: "orthostatic limit", color: "#e0503a" }]} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">{out.by_destination.map(([n, , m]) => {
            const s = m < 0 ? "alert" : m < 4 ? "watch" : "ok"
            return <div key={n} className="rounded-[4px] bg-tile2 p-3"><p className="text-[11px] text-mute">{n}</p><p className="dot num mt-1 text-2xl" style={{ color: COLOR[s] }}>{m >= 0 ? "+" : ""}{m.toFixed(0)}</p></div>
          })}</div>
          <ul className="mt-5 grid gap-2">{out.advice.map((a) => <li key={a} className="rounded-[4px] bg-tile2 px-3 py-2.5 text-[13px] leading-relaxed">{a}</li>)}</ul>
          <p className="mt-4 text-[11px] leading-relaxed text-mute">
            {out.personalised ? `Personalised from your stand test (fit error ${out.calibration_rmse?.toFixed(1)}): venous pooling ×${out.pooling_factor.toFixed(2)}, reflex ×${out.reflex_factor.toFixed(2)} of average. ` : "Population model scaled to your height, resting HR and BP. Add a stand test to personalise. "}
            Fitted on 1 g tilt-table data. Moon and Mars are physics-based extrapolations.
          </p>
        </>}
      </Tile>
    </div>
  )
}
