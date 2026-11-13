import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui"
import { getJSON } from "@/lib/utils"
import type { Zone } from "@/components/HoloBody"

const HoloBody = lazy(() => import("@/components/HoloBody"))

interface Metrics {
  gravity: Record<string, { rmse_hr: number; rmse_map: number }>
  ppg: { online_mae: number; classical_mae: number; coverage90: number }
  stress: Record<string, { f1: number }>
  latency: Record<string, number>
}

const HAZARDS = [
  ["Altered gravity", "Fluid shifts to the head; on landing, blood pools in the legs.", "Heart rate · blood pressure · stand test"],
  ["Isolation & confinement", "Months in a small crew, far from home.", "Mood · physiological stress"],
  ["Hostile environment", "Noise, light and workload disturb sleep.", "Sleep · reaction time"],
  ["Space radiation", "Dose builds up outside Earth's magnetic field.", "Cumulative dose vs limits"],
  ["Distance from Earth", "Up to 24 minutes before mission control can reply.", "On-board decisions, offline"],
]

const DEMO_ZONES: Zone[] = [
  { id: "brain", label: "Sleep debt", bone: "mixamorig:Head", offset: [0, 0.1, 0.02], status: "watch" },
  { id: "heart", label: "Orthostatic margin low", bone: "mixamorig:Spine2", offset: [0.04, -0.02, 0.09], status: "alert" },
  { id: "bone", label: "Bone", bone: "mixamorig:Hips", offset: [0, 0, 0.06], status: "ok" },
  { id: "legs", label: "Fluid pooling", bone: "mixamorig:LeftLeg", offset: [-0.02, 0.1, 0.06], status: "watch" },
]

function useInView<T extends Element>(margin = "200px") {
  const ref = useRef<T>(null), [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: margin })
    io.observe(ref.current); return () => io.disconnect()
  }, [margin])
  return [ref, seen] as const
}

const rise = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.4 },
  transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const } }

export default function Landing() {
  const [m, setM] = useState<Metrics>()
  const [twinRef, twinSeen] = useInView<HTMLDivElement>()
  useEffect(() => { getJSON<Metrics>("metrics.json").then(setM).catch(() => undefined) }, [])
  const gain = m ? (1 - m.gravity.E3.rmse_hr / m.gravity.E1.rmse_hr) * 100 : undefined
  const bestStress = m ? m.stress["binary|chest|cnn_personal"]?.f1 : undefined
  const wristStress = m ? m.stress["binary|wrist|cnn_personal"]?.f1 : undefined
  const ms = m ? m.latency["PPG CNN forward, 1 CPU thread (ms/window)"] : undefined

  return (
    <main className="bg-void">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between px-6 md:px-12">
        <Link to="/" className="display text-xl tracking-[0.04em]">Astra<span className="text-holo">·</span>Health</Link>
        <nav className="flex items-center gap-8" aria-label="Main">
          <a href="#hazards" className="label hidden !text-ink/80 hover:!text-ink md:inline">Hazards</a>
          <a href="#twin" className="label hidden !text-ink/80 hover:!text-ink md:inline">Digital twin</a>
          <a href="#evidence" className="label hidden !text-ink/80 hover:!text-ink md:inline">Evidence</a>
          <Button asChild variant="outline" size="sm"><Link to="/console">Console</Link></Button>
        </nav>
      </header>

      {/* Hero: NASA public-domain footage from the ISS */}
      <section className="relative h-dvh min-h-[640px] overflow-hidden">
        <video className="absolute inset-0 size-full object-cover" src={`${import.meta.env.BASE_URL}media/earth-orbit.mp4`} poster={`${import.meta.env.BASE_URL}media/earth-orbit.jpg`}
          autoPlay muted loop playsInline preload="metadata" aria-hidden />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,#04060a_2%,rgba(4,6,10,.55)_38%,rgba(4,6,10,.15)_70%,rgba(4,6,10,.5))]" />
        <div className="relative z-10 flex h-full flex-col justify-end px-6 pb-20 md:px-12 md:pb-24">
          <motion.p className="label mb-5 !text-ink/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 1 }}>
            NASA Space Apps 2026 · Human exploration
          </motion.p>
          <motion.h1 className="display max-w-[14ch] text-[clamp(3rem,9vw,8.5rem)] font-semibold"
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}>
            Know your body before the mission does
          </motion.h1>
          <motion.div className="mt-8 flex flex-wrap items-center gap-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.8 }}>
            <Button asChild><Link to="/console">Open mission console <ArrowRight className="size-4" /></Link></Button>
            <p className="max-w-md text-[15px] leading-relaxed text-ink/75">
              A health console for crews far from a doctor. It learns each astronaut's normal and shows what is changing and what to do next.
            </p>
          </motion.div>
        </div>
      </section>

      <section id="hazards" className="border-t border-line px-6 py-28 md:px-12">
        <motion.h2 {...rise} className="display max-w-[18ch] text-[clamp(2.2rem,5vw,4.5rem)]">Five hazards. One person on board to notice.</motion.h2>
        <div className="mt-16 grid gap-px bg-line md:grid-cols-5">
          {HAZARDS.map(([h, what, watch], i) => (
            <motion.div key={h} {...rise} transition={{ ...rise.transition, delay: i * 0.07 }} className="bg-void p-6 md:min-h-64">
              <p className="num text-xs text-mute">0{i + 1}</p>
              <h3 className="mt-6 text-lg font-medium">{h}</h3>
              <p className="mt-3 text-sm leading-relaxed text-mute">{what}</p>
              <p className="label mt-6 !text-holo">{watch}</p>
            </motion.div>
          ))}
        </div>
        <p className="mt-6 text-sm text-mute">Hazard framework: <a className="underline underline-offset-4 hover:text-ink" href="https://www.nasa.gov/hrp/hazards/">NASA Human Research Program</a>.</p>
      </section>

      <section id="twin" className="grid items-center gap-12 border-t border-line px-6 py-24 md:grid-cols-[1fr_1.1fr] md:px-12">
        <div>
          <motion.h2 {...rise} className="display text-[clamp(2.2rem,5vw,4.5rem)]">A twin that knows your normal</motion.h2>
          <motion.p {...rise} className="mt-8 max-w-lg text-[17px] leading-relaxed text-ink/80">
            Two astronauts with the same heart rate can be in very different states. ASTRA-HEALTH compares each reading with
            that person's own baseline. It runs a physics model of their circulation to predict how their body will respond
            when gravity returns, on the Moon, on Mars or back home.
          </motion.p>
          <motion.ul {...rise} className="mt-10 grid gap-4 text-sm">
            {[["#ff4a3d", "Act now", "Predicted to cross a clinical limit"], ["#ffb340", "Watch", "Drifting from personal baseline"], ["#3fd49a", "Nominal", "Within personal range"]].map(([c, a, b]) => (
              <li key={a} className="flex items-center gap-4"><span className="size-2 rounded-full" style={{ background: c, boxShadow: `0 0 10px ${c}` }} />
                <span className="label w-20 !text-ink">{a}</span><span className="text-mute">{b}</span></li>
            ))}
          </motion.ul>
        </div>
        <div ref={twinRef} className="relative h-[70vh] min-h-[520px]">
          {twinSeen && <Suspense fallback={null}><HoloBody zones={DEMO_ZONES} selected="heart" className="size-full" /></Suspense>}
        </div>
      </section>

      <section id="evidence" className="border-t border-line px-6 py-28 md:px-12">
        <motion.h2 {...rise} className="display max-w-[20ch] text-[clamp(2.2rem,5vw,4.5rem)]">Trained on real physiology. Tested on people it never saw.</motion.h2>
        <div className="mt-16 grid gap-px bg-line md:grid-cols-4">
          {[
            [m ? m.ppg.online_mae.toFixed(1) : "—", "bpm", "Heart-rate error from a wrist sensor during daily activities", m ? `Classical method: ${m.ppg.classical_mae.toFixed(1)} bpm · PPG-DaLiA, 15 people` : ""],
            [gain ? `−${gain.toFixed(0)}` : "—", "%", "Error when the circulation twin is personalised", "Tilt-table and stand tests · PhysioNet PRCP, 10 people"],
            [bestStress ? bestStress.toFixed(2) : "—", "F1", "Physiological stress detection", wristStress ? `Wrist only: ${wristStress.toFixed(2)} · WESAD, 15 people` : ""],
            [ms ? ms.toFixed(0) : "—", "ms", "To analyse 8 s of pulse on one CPU core", "Runs on board, without a link to Earth"],
          ].map(([v, u, t, s]) => (
            <motion.div key={t} {...rise} className="bg-void p-6 md:p-8">
              <p className="num text-[clamp(2.5rem,4.5vw,4rem)] leading-none text-ink">{v}<span className="ml-2 text-base text-mute">{u}</span></p>
              <p className="mt-6 text-[15px] leading-snug">{t}</p>
              <p className="mt-3 text-xs leading-relaxed text-mute">{s}</p>
            </motion.div>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-mute">
          Every figure comes from leave-one-subject-out evaluation. Moon and Mars responses are simulations extrapolated from
          1 g data. ASTRA-HEALTH is decision support, not a medical device.
        </p>
      </section>

      <section className="relative grid min-h-[80vh] place-items-center overflow-hidden border-t border-line px-6 text-center">
        <div className="relative">
          <h2 className="display text-[clamp(2.6rem,8vw,7rem)]">Earth · Moon · Mars</h2>
          <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-ink/80">
            Move a slider and watch one astronaut's blood pressure respond to standing up in each gravity, before and after months in orbit.
          </p>
          <Button asChild className="mt-10"><Link to="/console/gravity">Try the gravity twin <ArrowRight className="size-4" /></Link></Button>
        </div>
      </section>

      <footer className="border-t border-line px-6 py-10 text-xs leading-relaxed text-mute md:px-12">
        <p>Hero footage: “Earth Views from the ISS”, NASA (public domain). Datasets: PhysioNet PRCP, PPG-DaLiA, WESAD (credited in the research notebook).
          Body model: three.js examples (Mixamo). Built for the 2026 NASA Space Apps Challenge.</p>
      </footer>
    </main>
  )
}
