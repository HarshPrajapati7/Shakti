import { createContext, lazy, Suspense, useContext, useMemo, useState } from "react"
import { Link, NavLink, Route, Routes } from "react-router-dom"
import { Activity, Brain, ClipboardCheck, Gauge, HeartPulse, Orbit } from "lucide-react"
import { Badge } from "@/components/ui"
import { MISSIONS, simulateMission, type Day, type Mission } from "@/lib/crew"

const Overview = lazy(() => import("./Overview"))
const Gravity = lazy(() => import("./Gravity"))
const Heart = lazy(() => import("./Heart"))
const Stress = lazy(() => import("./Stress"))
const Checkin = lazy(() => import("./Checkin"))

interface Ctx { mission: Mission; setMission: (m: Mission) => void; day: number; setDay: (d: number) => void; days: Day[] }
const MissionCtx = createContext<Ctx | null>(null)
export const useMission = () => useContext(MissionCtx)!

const NAV = [
  ["", "Overview", Gauge], ["gravity", "Gravity twin", Orbit], ["heart", "Heart rate", HeartPulse],
  ["stress", "Stress", Brain], ["checkin", "Daily check-in", ClipboardCheck],
] as const

export default function Console() {
  const [mission, setMission] = useState<Mission>("transit")
  const [day, setDay] = useState(46)
  const days = useMemo(() => simulateMission(mission), [mission])
  const online = typeof navigator !== "undefined" ? navigator.onLine : true

  return (
    <MissionCtx.Provider value={{ mission, setMission, day, setDay, days }}>
      <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[220px_1fr]">
        <aside className="border-b border-line p-5 md:border-b-0 md:border-r">
          <Link to="/" className="display text-lg">Astra<span className="text-holo">·</span>Health</Link>
          <nav className="mt-10 flex gap-1 overflow-x-auto md:flex-col" aria-label="Console">
            {NAV.map(([to, label, Icon]) => (
              <NavLink key={to} to={`/console/${to}`} end
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${isActive ? "bg-white/[.06] text-ink" : "text-mute hover:text-ink"}`}>
                <Icon className="size-4" strokeWidth={1.5} /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-10 hidden space-y-3 md:block">
            <Badge color="#ffb340">Simulation mode</Badge>
            <Badge color={online ? "#3fd49a" : "#ffb340"}>{online ? "Link to Earth up" : "Offline · local inference"}</Badge>
            <p className="text-xs leading-relaxed text-mute">Models run in this browser. Records stay on the device and sync when a link is available.</p>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line px-6 py-4">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-holo" strokeWidth={1.5} />
              <span className="label">Crew member</span><span className="text-sm">AST-01</span>
            </div>
            <label className="flex items-center gap-2">
              <span className="label">Mission</span>
              <select value={mission} onChange={(e) => setMission(e.target.value as Mission)}
                className="border border-line bg-panel px-2 py-1 text-sm text-ink">
                {Object.entries(MISSIONS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
              </select>
            </label>
            <label className="flex min-w-64 flex-1 items-center gap-3">
              <span className="label">Day</span>
              <input type="range" min={10} max={days.length} value={day} onChange={(e) => setDay(+e.target.value)}
                className="flex-1 accent-[#5cc8ff]" aria-label="Mission day" />
              <span className="num w-14 text-right text-sm">{day} / {days.length}</span>
            </label>
            <span className="label">Comms delay {MISSIONS[mission].delay}</span>
          </header>
          <Suspense fallback={<div className="label p-10">Loading…</div>}>
            <Routes>
              <Route index element={<Overview />} />
              <Route path="gravity" element={<Gravity />} />
              <Route path="heart" element={<Heart />} />
              <Route path="stress" element={<Stress />} />
              <Route path="checkin" element={<Checkin />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </MissionCtx.Provider>
  )
}
