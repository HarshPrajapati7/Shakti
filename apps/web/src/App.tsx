import { lazy, Suspense, useCallback, useState } from "react"
import { NavLink, Route, Routes, useLocation } from "react-router-dom"
import { ClipboardPlus, History as HistoryIcon, LayoutGrid, Orbit, Watch } from "lucide-react"
import Loading from "@/components/Loading"
import { Button } from "@/components/ui"
import { loadSample } from "@/lib/sample"
import { useRecords } from "@/lib/store"

const Status = lazy(() => import("@/pages/Status"))
const CheckIn = lazy(() => import("@/pages/CheckIn"))
const Gravity = lazy(() => import("@/pages/Gravity"))
const Wearable = lazy(() => import("@/pages/Wearable"))
const History = lazy(() => import("@/pages/History"))

const NAV = [
  { to: "/", label: "Status", icon: LayoutGrid }, { to: "/check-in", label: "Check-in", icon: ClipboardPlus },
  { to: "/gravity", label: "Gravity", icon: Orbit }, { to: "/wearable", label: "Wearable", icon: Watch }, { to: "/history", label: "History", icon: HistoryIcon },
]
const SEEN = "sakti-welcomed"

function Logo() {
  return <span className="inline-grid shrink-0 grid-cols-3 gap-[2px]" aria-hidden>{[1, .45, 1, .45, 1, .45, 1, .45, 1].map((o, i) => <span key={i} className="size-[4px] rounded-[1px] bg-slate2" style={{ opacity: o }} />)}</span>
}

function Welcome({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const sample = async () => { setBusy(true); try { await loadSample() } finally { onClose() } }
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-frame/80 p-6 backdrop-blur-sm">
      <div className="tile w-full max-w-lg p-8">
        <Logo />
        <h1 className="dot mt-6 text-5xl">Welcome to Sakti</h1>
        <p className="mt-4 leading-relaxed text-mute">Log your health measurements, see which body systems need attention and get a clear next step.
          You can also predict how your body will cope with gravity after a mission.</p>
        <div className="mt-8 grid gap-2 sm:grid-cols-2">
          <Button tone="light" className="h-11" onClick={sample} disabled={busy}>{busy ? "Loading sample…" : "Explore with sample data"}</Button>
          <Button className="h-11" onClick={onClose} disabled={busy}>Start with my own data</Button>
        </div>
        <p className="mt-4 text-[12px] text-mute">Sample data is a 14-day crew record. Remove it any time from History.</p>
      </div>
    </div>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)
  const r = useRecords()
  const loc = useLocation()
  const [welcome, setWelcome] = useState(() => !localStorage.getItem(SEEN))
  const done = useCallback(() => setReady(true), [])
  const closeWelcome = () => { localStorage.setItem(SEEN, "1"); setWelcome(false) }
  const title = NAV.find((n) => n.to === loc.pathname)?.label ?? "Status"

  if (!ready) return <Loading onDone={done} />
  return (
    <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-3 p-3 md:flex-row">
      <nav aria-label="Main" className="tile flex shrink-0 items-center gap-1 p-2 md:w-52 md:flex-col md:items-stretch md:p-3">
        <div className="hidden items-center gap-2.5 px-2 pb-6 pt-1 md:flex"><Logo /><span className="dot text-xl">Sakti</span></div>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end className={({ isActive }) => `flex flex-1 items-center justify-center gap-3 rounded-[4px] px-3 py-2.5 text-[13px] transition-colors md:flex-none md:justify-start ${isActive ? "bg-tile2 text-ink" : "text-mute hover:bg-tile2/50 hover:text-ink"}`}>
            <Icon className="size-4" strokeWidth={1.6} /><span className="hidden sm:inline">{label}</span>
          </NavLink>
        ))}
        <p className="mt-auto hidden px-2 pt-6 text-[11px] text-mute md:block">Made by Team Star Busters</p>
      </nav>
      <main className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
        <header className="tile flex items-center justify-between px-5 py-3.5">
          <h1 className="dot text-[26px]">{title}</h1>
          <span className="text-[12px] text-mute">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</span>
        </header>
        <Suspense fallback={<div className="tile grid flex-1 place-items-center text-mute">Loading…</div>}>
          <Routes>
            <Route path="/" element={<Status />} />
            <Route path="/check-in" element={<CheckIn />} />
            <Route path="/gravity" element={<Gravity />} />
            <Route path="/wearable" element={<Wearable />} />
            <Route path="/history" element={<History />} />
            <Route path="*" element={<Status />} />
          </Routes>
        </Suspense>
      </main>
      {welcome && !r.checkins.length && <Welcome onClose={closeWelcome} />}
    </div>
  )
}
