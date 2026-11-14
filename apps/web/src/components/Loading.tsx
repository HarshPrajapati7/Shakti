import { useEffect, useState } from "react"
import { engineReady, info } from "@/lib/engine"
import { MODEL_URL } from "@/lib/utils"

const MIN_MS = 2600 // let the clip play at least once through its opening

async function fetchWithProgress(url: string, onBytes: (frac: number) => void) {
  const r = await fetch(url)
  const total = Number(r.headers.get("content-length")) || 0
  if (!r.body || !total) { await r.arrayBuffer(); onBytes(1); return }
  const rd = r.body.getReader()
  let got = 0
  for (;;) { const { done, value } = await rd.read(); if (done) break; got += value.length; onBytes(got / total) }
  onBytes(1)
}

export default function Loading({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    let model = 0, engine = 0, time = 0, alive = true
    const t0 = performance.now()
    const tick = () => setP(0.55 * model + 0.3 * engine + 0.15 * time)
    const clock = setInterval(() => { time = Math.min(1, (performance.now() - t0) / MIN_MS); tick() }, 50)
    Promise.all([
      fetchWithProgress(MODEL_URL, (f) => { model = f; tick() }).catch(() => { model = 1 }),
      engineReady().then(() => info()).then(() => { engine = 1; tick() }).catch(() => { engine = 1 }),
      document.fonts?.ready,
      new Promise((r) => setTimeout(r, MIN_MS)),
    ]).then(() => {
      if (!alive) return
      clearInterval(clock); setP(1)
      setTimeout(() => setLeaving(true), 250)
      setTimeout(onDone, 750)
    })
    return () => { alive = false; clearInterval(clock) }
  }, [onDone])

  return (
    <div className={`fixed inset-0 z-50 flex flex-col bg-frame px-8 py-7 transition-opacity duration-500 md:px-14 md:py-10 ${leaving ? "opacity-0" : "opacity-100"}`}>
      <p className="dot text-2xl">Sakti</p>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[6vh]">
        <div className="overflow-hidden rounded-[10px] border border-edge bg-tile" style={{ width: "min(56rem, 88vw, calc(56vh * 16 / 9))" }}>
          <video className="aspect-video w-full object-cover" src={`${import.meta.env.BASE_URL}media/loading.mp4`} poster={`${import.meta.env.BASE_URL}media/loading.jpg`}
            autoPlay muted loop playsInline aria-hidden />
        </div>
        <div style={{ width: "min(48rem, 80vw)" }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-label="Loading">
          <p className="mb-3 text-center text-[15px] text-ink/90">Loading<span className="inline-block w-6 text-left">{".".repeat(1 + (Math.floor(p * 40) % 3))}</span></p>
          <div className="h-px w-full bg-edge"><div className="h-px bg-slate2 transition-[width] duration-150" style={{ width: `${p * 100}%` }} /></div>
        </div>
      </div>
      <p className="text-center text-[11px] text-mute">Made by Team Star Busters</p>
    </div>
  )
}
