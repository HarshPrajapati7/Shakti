import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import { 
  Trophy, Flame, CheckCircle2, Circle, AlertTriangle, ShieldCheck, 
  Clock, Activity, BookOpen, ChevronDown, ChevronUp, Rocket, Satellite, Truck, Moon, Orbit, HeartPulse, Zap, type LucideIcon
} from "lucide-react"
import { Button, StatusPill, Tile } from "@/components/ui"
import { useRecords, update } from "@/lib/store"
import type { Status } from "@/lib/utils"

// ── Environment Profiles ─────────────────────────────────────
export type EnvId = "spacecraft" | "station" | "rover" | "moon" | "mars"

interface EnvProfile {
  id: EnvId
  name: string
  tag: string
  gravity: string
  icon: LucideIcon
  ambient: string
  radiation: string
  hazards: string[]
  insights: string[]
  routineTips: string[]
  status: Status
}

const ENVIRONMENTS: EnvProfile[] = [
  {
    id: "spacecraft",
    name: "Deep Space Transit",
    tag: "Orion / Transit Vehicle",
    gravity: "0.00g (Microgravity)",
    icon: Rocket,
    ambient: "101.3 kPa · 21% O2 · Confinement",
    radiation: "0.45 mSv/day (Elevated GCR)",
    status: "watch",
    hazards: [
      "Cephalad fluid shift & plasma volume loss (-15%)",
      "Acute space motion sickness during translunar injection",
      "Confined acoustics & elevated hypercapnia risk"
    ],
    insights: [
      "Lack of gravity removes hydrostatic blood pressure gradients; blood pools in head and chest.",
      "Kidneys interpret central blood volume as excess water, dumping up to 1.5L plasma within 72h.",
      "Cardiovascular stroke volume diminishes; resting heart rate elevates by 8-15 bpm."
    ],
    routineTips: [
      "Drink 500mL isotonic saline before high-g orbital burn.",
      "Keep head movements aligned with visual axes during the first 48 hours to minimize vestibular nausea.",
      "Perform passive leg compression squeezes 3x daily."
    ]
  },
  {
    id: "station",
    name: "Space Station (ISS/LEO)",
    tag: "Low Earth Orbit Habitats",
    gravity: "0.00g (Microgravity)",
    icon: Satellite,
    ambient: "101.3 kPa · 21% O2 · Standard Cabin",
    radiation: "0.27 mSv/day (Geomagnetic shielding)",
    status: "ok",
    hazards: [
      "Bone mineral density resorption (1.0% loss/month)",
      "Spaceflight-Associated Neuro-ocular Syndrome (SANS)",
      "Circadian disruption from 16 sunrises/day"
    ],
    insights: [
      "Microgravity unloads postural muscles (calves, soleus, quadriceps), causing rapid muscular atrophy.",
      "Elevated intracranial venous pressure flattens posterior globes and induces optic disc edema.",
      "Strict 2.5-hour daily countermeasure routine with ARED is critical to maintain skeletal strength."
    ],
    routineTips: [
      "Mandatory 2.5h daily ARED resistive & cycle ergometer countermeasure session.",
      "Weekly funduscopic optic coherence tomography scan.",
      "Wear blue-blocking glasses 60 minutes before scheduled sleep cabin curfew."
    ]
  },
  {
    id: "rover",
    name: "Surface Pressurized Rover",
    tag: "Planetary EVA / Exploration",
    gravity: "Variable g · Terrain Vibration",
    icon: Truck,
    ambient: "56.5 kPa (Suit/Cabin low pressure) · 32% O2",
    radiation: "0.38 mSv/day (Unshielded EVA)",
    status: "watch",
    hazards: [
      "Acute physical exertion & elevated metabolic heat output",
      "Hand fatigue & forearm compartment pressure in spacesuit gloves",
      "Carbon dioxide pocketing inside pressurized helmets"
    ],
    insights: [
      "EVA traverse drives sustained heart rates between 130-165 bpm with heavy caloric burn (400-600 kcal/h).",
      "Vibration and uneven terrain challenge compromised postural reflexes after prolonged zero-g transit.",
      "Rapid hydration loss through perspiration requires active cooling garment flow adjustments."
    ],
    routineTips: [
      "Check in-suit liquid cooling garment (LCG) inlet temperature every 30 minutes.",
      "Monitor helmet CO2 scrubber scrub cycles; limit continuous traverse to 4-hour blocks.",
      "Log finger & grip dynamometer strength post-EVA to detect compartment strain."
    ]
  },
  {
    id: "moon",
    name: "Lunar Outpost (Artemis)",
    tag: "South Pole Basecamp",
    gravity: "0.166g (1/6th Earth Gravity)",
    icon: Moon,
    ambient: "70.3 kPa · 34% O2 · Deep Shadow / Cryo",
    radiation: "0.58 mSv/day (No atmosphere/magnetosphere)",
    status: "alert",
    hazards: [
      "Sub-micron abrasive lunar regolith dust inhalation",
      "Altered bunny-hop gait causing eccentric tendon strain",
      "14-Earth-day permanent lunar night cold cycle"
    ],
    insights: [
      "Lunar 0.166g restores partial hydrostatic pressure, but is insufficient to prevent orthostatic pooling alone.",
      "Sharp jagged silicate regolith poses toxic pulmonary risk if brought into the habitat airlock.",
      "Extreme thermal cycling and deep darkness disrupt melatonin rhythm without calibrated lighting."
    ],
    routineTips: [
      "Execute airlock electrostatic regolith decontamination before removing suit seals.",
      "Don gradient 25-35 mmHg lower-limb compression socks during all waking hours.",
      "Take 2,000 IU Vitamin D3 daily to offset 14-day solar shadow cycles."
    ]
  },
  {
    id: "mars",
    name: "Martian Surface Base",
    tag: "Jezero Crater Colony",
    gravity: "0.38g (38% Earth Gravity)",
    icon: Orbit,
    ambient: "70.3 kPa · 32% O2 · 24.6h Martian Sol",
    radiation: "0.64 mSv/day (Cosmic Ray / Solar Proton)",
    status: "watch",
    hazards: [
      "Autonomous triage necessity (4–24 min comms latency)",
      "Circadian desynchronization from 24h 39m Sol rhythm",
      "Chronic orthostatic cardiovascular re-adaptation"
    ],
    insights: [
      "At 0.38g, astronauts can stand, but standing up after 6-9 months transit causes acute pre-syncope.",
      "Earth flight surgeons cannot assist in real-time; crew must rely on Sakti's onboard clinical decisions.",
      "Extra 39 minutes per day causes cumulative sleep phase drift if light zeitgebers are not synchronized."
    ],
    routineTips: [
      "Perform orthostatic stand-test simulation with Sakti GRAVITY-HEART 7 days prior to descent.",
      "Hydrate with 1.2L oral electrolyte solution 2 hours prior to planetary touchdown.",
      "Strict schedule adherence to 24h 39m Sol dynamic LED spectrum lighting."
    ]
  }
]

// ── Mission Routine Tasks ─────────────────────────────────────
interface RoutineTask {
  id: string
  time: string
  title: string
  description: string
  category: "vitals" | "exercise" | "biomarker" | "decompression"
  xp: number
  urgency: "routine" | "priority" | "critical"
  measurement: string
}

const ROUTINE_TASKS: RoutineTask[] = [
  {
    id: "rt_morning",
    time: "07:00",
    title: "Morning Supine Vitals & Orthostatic Baseline",
    description: "Measure resting blood pressure, heart rate, and body temperature before exiting sleep pod.",
    category: "vitals",
    xp: 60,
    urgency: "priority",
    measurement: "BP + HR + Temp"
  },
  {
    id: "rt_exercise",
    time: "11:30",
    title: "ARED 2.5h Resistance & Cycle Countermeasure",
    description: "High-intensity resistive squats/deadlifts on ARED to stimulate osteoblasts and prevent bone demineralization.",
    category: "exercise",
    xp: 120,
    urgency: "critical",
    measurement: "45m Cycle + 60m ARED"
  },
  {
    id: "rt_glucose",
    time: "15:00",
    title: "Mid-Mission Biomarker & Hydration Check",
    description: "Capillary blood glucose, saliva hydration balance, and personal radiation dosimeter read.",
    category: "biomarker",
    xp: 50,
    urgency: "routine",
    measurement: "Glucose + Saline Level"
  },
  {
    id: "rt_evening",
    time: "21:00",
    title: "Circadian Decompression & Optic Fundus Scan",
    description: "Self-administered eye fundus inspection for SANS and 10-minute quiet respiratory relaxation.",
    category: "decompression",
    xp: 70,
    urgency: "routine",
    measurement: "Vision Acuity + Sleep Plan"
  }
]

// ── Achievement Badges ─────────────────────────────────────────
interface Badge {
  id: string
  name: string
  description: string
  icon: LucideIcon
  xpBonus: number
  criteria: string
}

const BADGES: Badge[] = [
  {
    id: "b_vanguard",
    name: "Zero-G Sentinel",
    description: "Logged 5 or more comprehensive check-ins with vitals in nominal range.",
    icon: ShieldCheck,
    xpBonus: 250,
    criteria: "5+ Check-ins"
  },
  {
    id: "b_streak",
    name: "Relentless Orbit",
    description: "Maintained a 7-day uninterrupted mission routine streak.",
    icon: Flame,
    xpBonus: 350,
    criteria: "7-Day Streak"
  },
  {
    id: "b_gravity",
    name: "Gravity Master",
    description: "Executed a GRAVITY-HEART stand simulation with positive brain perfusion margin.",
    icon: Orbit,
    xpBonus: 300,
    criteria: "Margin > 0 mmHg"
  },
  {
    id: "b_cardio",
    name: "Cardiac Shield",
    description: "Maintained resting heart rate below 75 bpm across microgravity transit.",
    icon: HeartPulse,
    xpBonus: 200,
    criteria: "Mean HR < 75"
  },
  {
    id: "b_radiation",
    name: "Cosmic Bastion",
    description: "Monitored personal radiation badge and kept cumulative exposure safely managed.",
    icon: Zap,
    xpBonus: 200,
    criteria: "Dosimetry Active"
  }
]

// ── Field Manual Educational Guides ───────────────────────────
interface GuideItem {
  id: string
  title: string
  plainEnglish: string
  spaceMechanism: string
  dangerSigns: string
  countermeasures: string
  normalRange: string
  status: Status
}

const FIELD_GUIDE: GuideItem[] = [
  {
    id: "g_ortho",
    title: "Orthostatic Intolerance (Post-Flight Fainting)",
    plainEnglish: "When you return to Earth, Moon, or Mars after floating in space, gravity suddenly pulls your blood down into your feet and belly. If your brain doesn't get enough blood, you get dizzy or faint immediately upon standing.",
    spaceMechanism: "In zero-g, your body doesn't need high leg vascular tone. It perceives fluid shifting to your chest as 'too much water' and dumps up to 15% of your blood volume through your kidneys.",
    dangerSigns: "Sudden drop in systolic blood pressure (>20 mmHg) when standing up, dizziness, tunnel vision, graying out.",
    countermeasures: "1) Drink 1.2L oral electrolyte solution with salt tablets 2 hours before landing. 2) Inflate lower-body anti-G suit to 35-40 mmHg. 3) Contract calf muscles repeatedly before standing.",
    normalRange: "Stand test MAP margin >= +10 mmHg above fainting threshold",
    status: "alert"
  },
  {
    id: "g_fluid",
    title: "Cephalad Fluid Shift ('Puffy Head, Bird Legs')",
    plainEnglish: "Without Earth's gravity pulling blood downward, about 1.5 to 2 liters of fluid immediately migrates up into your head, chest, and face. Your face swells up, your nose feels congested like a head cold, and your legs become very thin.",
    spaceMechanism: "Loss of the 100 mmHg hydrostatic column. Increased central venous pressure triggers baroreceptors to inhibit ADH and aldosterone, reducing total circulating blood volume.",
    dangerSigns: "Severe throbbing headaches, neck vein distension, sinus pressure, reduced exercise tolerance.",
    countermeasures: "1) Elevate sleep restraint head by 15 degrees. 2) Lower-Body Negative Pressure (LBNP) chamber sessions for 30 mins to draw fluid down. 3) Avoid high dietary sodium during first 48 hours.",
    normalRange: "Central Venous Pressure 3 - 8 mmHg",
    status: "watch"
  },
  {
    id: "g_sans",
    title: "SANS (Spaceflight-Associated Neuro-ocular Syndrome)",
    plainEnglish: "The increased fluid pressure inside your skull pushes directly against the back of your eyeballs. This flattens the back of your eye, pushes the optic nerve forward, and can cause permanent blurry vision.",
    spaceMechanism: "Absence of gravity-driven downward venous drainage elevates optic nerve sheath diameter (ONSD) and causes choroidal folds and cotton wool spots.",
    dangerSigns: "Sudden difficulty reading instrument panels up close, blind spot enlargement, blurry vision.",
    countermeasures: "1) Daily fundus auto-refraction check. 2) Optimize cabin CO2 levels below 2.0 mmHg (elevated CO2 dilates cerebral vessels). 3) Chaste berry / LBNP fluid redistribution.",
    normalRange: "ONSD < 5.0 mm; Visual Acuity 20/20",
    status: "alert"
  },
  {
    id: "g_bone",
    title: "Bone Demineralization & Muscle Atrophy",
    plainEnglish: "Because you don't walk or carry weight in space, your body thinks your bones and muscles are useless extra weight. Osteoclasts eat away bone minerals, dumping calcium into your blood (which can cause painful kidney stones).",
    spaceMechanism: "Unloading of mechanotransduction pathways in osteocytes. Astronauts lose 1.0% to 1.5% bone density in hips and spine per month in microgravity.",
    dangerSigns: "Lower back pain, flank pain (kidney stone formation), muscle weakness in legs, high serum calcium.",
    countermeasures: "1) 2.5 hours of daily resistive exercise on ARED (squats, heel raises, deadlifts). 2) Adequate dietary protein (1.2g/kg/day). 3) High fluid intake to prevent calcium crystallization in kidneys.",
    normalRange: "Bone mineral loss < 0.8%/month with strict ARED adherence",
    status: "watch"
  },
  {
    id: "g_motion",
    title: "Space Motion Sickness (SMS)",
    plainEnglish: "Your inner ear has tiny balance organs (otoliths) that normally tell your brain which way is down. In zero-g, they float freely and send zero gravity signals, but your eyes see the room. This sensory clash makes over 60% of astronauts nauseous for the first 3 days.",
    spaceMechanism: "Neuro-vestibular sensory mismatch between visual reference frames, semicircular canals, and gravitational otolith cues.",
    dangerSigns: "Stomach awareness, cold sweating, projectile vomiting, loss of spatial orientation.",
    countermeasures: "1) Avoid moving your head rapidly or pitching out of your visual plane. 2) Take prescribed promethazine (25-50mg). 3) Keep EVA and complex docking tasks deferred until Flight Day 4.",
    normalRange: "Full vestibular adaptation within 72 - 96 hours post-launch",
    status: "ok"
  }
]

export default function Gamification() {
  const r = useRecords()
  const g = r.gamification ?? {
    xp: 1420,
    level: 2,
    streak: 7,
    activeEnvironment: "spacecraft",
    completedTasks: ["rt_morning"],
    unlockedBadges: ["b_vanguard", "b_streak"]
  }

  const [activeEnvId, setActiveEnvId] = useState<EnvId>(g.activeEnvironment ?? "spacecraft")
  const [completedTasks, setCompletedTasks] = useState<string[]>(g.completedTasks ?? ["rt_morning"])
  const [openGuide, setOpenGuide] = useState<string | null>("g_ortho")
  const [chartMetric, setChartMetric] = useState<"cardio" | "metabolic" | "sleep">("cardio")

  // Calculate XP & Rank
  const currentXP = g.xp + (completedTasks.length * 40)
  const levelRanks = [
    { lvl: 1, name: "Flight Trainee", minXP: 0, maxXP: 500 },
    { lvl: 2, name: "Flight Specialist", minXP: 500, maxXP: 1500 },
    { lvl: 3, name: "Lead Medical Officer", minXP: 1500, maxXP: 3000 },
    { lvl: 4, name: "Station Commander", minXP: 3000, maxXP: 5000 },
    { lvl: 5, name: "Interplanetary Pioneer", minXP: 5000, maxXP: 10000 }
  ]
  const currentRank = levelRanks.slice().reverse().find(rk => currentXP >= rk.minXP) || levelRanks[0]
  const nextRank = levelRanks.find(rk => rk.lvl === currentRank.lvl + 1) || currentRank
  const progressPercent = Math.min(100, Math.round(((currentXP - currentRank.minXP) / (nextRank.maxXP - currentRank.minXP)) * 100))

  const activeEnv = ENVIRONMENTS.find(e => e.id === activeEnvId) || ENVIRONMENTS[0]

  // Toggle routine task
  const toggleTask = (taskId: string, xp: number) => {
    let nextCompleted: string[]
    if (completedTasks.includes(taskId)) {
      nextCompleted = completedTasks.filter(id => id !== taskId)
    } else {
      nextCompleted = [...completedTasks, taskId]
    }
    setCompletedTasks(nextCompleted)

    update(s => ({
      ...s,
      gamification: {
        ...(s.gamification ?? { xp: 1420, level: 2, streak: 7, activeEnvironment: activeEnvId, completedTasks: [], unlockedBadges: ["b_vanguard", "b_streak"] }),
        xp: completedTasks.includes(taskId) ? (s.gamification?.xp || 1420) - xp : (s.gamification?.xp || 1420) + xp,
        activeEnvironment: activeEnvId,
        completedTasks: nextCompleted
      }
    }))
  }

  // Handle environment switch
  const selectEnv = (envId: EnvId) => {
    setActiveEnvId(envId)
    update(s => ({
      ...s,
      gamification: {
        ...(s.gamification ?? { xp: 1420, level: 2, streak: 7, activeEnvironment: envId, completedTasks: [], unlockedBadges: ["b_vanguard", "b_streak"] }),
        activeEnvironment: envId
      }
    }))
  }

  // Dynamic Chart Data based on actual check-in records
  const chartData = useMemo(() => {
    const checkins = r.checkins.length ? r.checkins : [
      { id: "s1", date: "2026-11-08T07:00:00Z", vitals: { hr: 68, sbp: 116, dbp: 74, glucose: 92, spo2: 98, sleep_h: 7.8, mood: 4 } },
      { id: "s2", date: "2026-11-09T07:00:00Z", vitals: { hr: 72, sbp: 122, dbp: 78, glucose: 95, spo2: 98, sleep_h: 7.2, mood: 4 } },
      { id: "s3", date: "2026-11-10T07:00:00Z", vitals: { hr: 75, sbp: 128, dbp: 82, glucose: 104, spo2: 97, sleep_h: 6.5, mood: 3 } },
      { id: "s4", date: "2026-11-11T07:00:00Z", vitals: { hr: 78, sbp: 134, dbp: 86, glucose: 110, spo2: 97, sleep_h: 5.8, mood: 3 } },
      { id: "s5", date: "2026-11-12T07:00:00Z", vitals: { hr: 82, sbp: 138, dbp: 90, glucose: 118, spo2: 96, sleep_h: 5.2, mood: 2 } },
      { id: "s6", date: "2026-11-13T07:00:00Z", vitals: { hr: 76, sbp: 126, dbp: 80, glucose: 102, spo2: 98, sleep_h: 7.0, mood: 4 } },
      { id: "s7", date: "2026-11-14T07:00:00Z", vitals: { hr: 74, sbp: 120, dbp: 78, glucose: 98, spo2: 98, sleep_h: 7.5, mood: 4 } }
    ]

    const labels = checkins.map(c => new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }))
    const hrs = checkins.map(c => c.vitals.hr ?? 72)
    const sbps = checkins.map(c => c.vitals.sbp ?? 120)
    const dbps = checkins.map(c => c.vitals.dbp ?? 80)
    const glucoses = checkins.map(c => c.vitals.glucose ?? 95)
    const spo2s = checkins.map(c => c.vitals.spo2 ?? 98)
    const sleeps = checkins.map(c => c.vitals.sleep_h ?? 7)
    const moods = checkins.map(c => c.vitals.mood ?? 3)

    return { labels, hrs, sbps, dbps, glucoses, spo2s, sleeps, moods, count: checkins.length }
  }, [r.checkins])

  return (
    <div className="grid flex-1 auto-rows-min gap-3 lg:grid-cols-12 pb-8">
      
      {/* ── TOP BANNER: GAMIFICATION STATUS & LEVEL ────────────────── */}
      <Tile className="lg:col-span-8 flex flex-col justify-between">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Trophy className="size-5 text-[#e2ad4c]" />
              <span className="dot text-2xl font-bold">Crew Readiness & Gamification</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-[4px] bg-tile2 px-2.5 py-1 text-[13px] font-semibold text-[#e2ad4c]">
                <Flame className="size-4 text-[#e0503a]" />
                {g.streak}-Day Mission Streak!
              </span>
              <StatusPill s={currentRank.lvl >= 3 ? "ok" : "watch"} label={`Level ${currentRank.lvl}`} />
            </div>
          </div>

          <p className="mt-3 text-[13px] leading-relaxed text-mute">
            Engage with mission-critical health routines, maintain cardiovascular baseline, and earn rank rewards.
            Consistent health logging protects crew against orthostatic collapse and microgravity atrophy.
          </p>
        </div>

        {/* Level Progression Bar */}
        <div className="mt-6 rounded-[4px] bg-tile2 p-4">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-semibold text-ink">Rank: {currentRank.name}</span>
            <span className="num font-bold text-[#e2ad4c]">{currentXP.toLocaleString()} XP <span className="font-normal text-mute">/ {nextRank.maxXP.toLocaleString()} XP</span></span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-edge">
            <div 
              className="h-full rounded-full transition-all duration-500" 
              style={{ width: `${progressPercent}%`, background: "linear-gradient(90deg, #6fc49a 0%, #e2ad4c 100%)" }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-mute">
            <span>Next Level: {nextRank.name}</span>
            <span>{100 - progressPercent}% remaining to rank up</span>
          </div>
        </div>
      </Tile>

      {/* ── RIGHT TILE: CURRENT OPERATIONAL ENVIRONMENT ────────────── */}
      <Tile className="lg:col-span-4" title="Active Environment">
        <div className="flex items-center gap-3">
          <activeEnv.icon className="size-9 text-slate2" aria-label={activeEnv.name} />
          <div>
            <h3 className="text-[16px] font-bold text-ink">{activeEnv.name}</h3>
            <p className="text-[12px] text-mute">{activeEnv.tag}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-[4px] bg-tile2 p-2">
            <span className="block text-[10px] uppercase text-mute">Gravity Field</span>
            <span className="num font-semibold text-ink">{activeEnv.gravity}</span>
          </div>
          <div className="rounded-[4px] bg-tile2 p-2">
            <span className="block text-[10px] uppercase text-mute">Dosimetry</span>
            <span className="num font-semibold text-[#e2ad4c]">{activeEnv.radiation}</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] text-mute">Switch target environment:</span>
          <StatusPill s={activeEnv.status} />
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {ENVIRONMENTS.map(env => (
            <button
              key={env.id}
              onClick={() => selectEnv(env.id)}
              className={`flex items-center gap-1 rounded-[4px] px-2 py-1 text-[11px] font-medium transition-all ${
                env.id === activeEnvId 
                  ? "bg-slate text-white ring-1 ring-white/30" 
                  : "bg-tile2 text-mute hover:bg-tile2/80 hover:text-ink"
              }`}
            >
              <env.icon className="size-4" aria-hidden="true" />
              <span>{env.name.split(" ")[0]}</span>
            </button>
          ))}
        </div>
      </Tile>

      {/* ── SECTION 1: ENVIRONMENT HEALTH INSIGHTS & PROTOCOLS ─────── */}
      <Tile className="lg:col-span-12" title={`${activeEnv.name} · Environment Insights & Hazards`}>
        <div className="grid gap-4 md:grid-cols-3">
          
          {/* Physiological Hazards */}
          <div className="rounded-[4px] bg-tile2 p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#e0503a]">
              <AlertTriangle className="size-4" />
              <span>Primary Environmental Hazards</span>
            </div>
            <ul className="mt-3 grid gap-2">
              {activeEnv.hazards.map((h, idx) => (
                <li key={idx} className="flex items-start gap-2 text-[12px] text-ink">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#e0503a]" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Clinical Insights */}
          <div className="rounded-[4px] bg-tile2 p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#e2ad4c]">
              <Activity className="size-4" />
              <span>Physiological Response Insights</span>
            </div>
            <ul className="mt-3 grid gap-2">
              {activeEnv.insights.map((ins, idx) => (
                <li key={idx} className="flex items-start gap-2 text-[12px] text-ink">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#e2ad4c]" />
                  <span>{ins}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Routine Advice */}
          <div className="rounded-[4px] bg-tile2 p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#6fc49a]">
              <ShieldCheck className="size-4" />
              <span>Target Countermeasure Protocol</span>
            </div>
            <ul className="mt-3 grid gap-2">
              {activeEnv.routineTips.map((tip, idx) => (
                <li key={idx} className="flex items-start gap-2 text-[12px] text-ink">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#6fc49a]" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </Tile>

      {/* ── SECTION 2: TIMED MISSION ROUTINE PROMPTS & CHECKLIST ──── */}
      <Tile className="lg:col-span-6" title="Mission Routine Schedule & Timed Prompts" 
        action={
          <span className="flex items-center gap-1.5 text-[12px] text-[#6fc49a]">
            <Clock className="size-3.5" />
            <span>Next Window: 15:00 Biomarkers</span>
          </span>
        }
      >
        <p className="text-[12px] text-mute mb-4">
          Timely routine actions prompt astronauts to maintain bodily equilibrium. Check items as completed to claim XP.
        </p>

        <div className="grid gap-2.5">
          {ROUTINE_TASKS.map(task => {
            const isDone = completedTasks.includes(task.id)
            return (
              <div 
                key={task.id}
                onClick={() => toggleTask(task.id, task.xp)}
                className={`flex cursor-pointer items-start justify-between gap-3 rounded-[4px] border p-3 transition-colors ${
                  isDone 
                    ? "border-edge bg-tile2/40 opacity-75" 
                    : "border-edge/70 bg-tile2 hover:border-[#6fc49a]/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <button className="mt-0.5 text-ink focus:outline-none">
                    {isDone ? (
                      <CheckCircle2 className="size-5 text-[#6fc49a]" />
                    ) : (
                      <Circle className="size-5 text-mute hover:text-ink" />
                    )}
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="num text-[11px] font-semibold text-[#8ea0c4]">{task.time}</span>
                      <h4 className={`text-[13px] font-semibold ${isDone ? "line-through text-mute" : "text-ink"}`}>
                        {task.title}
                      </h4>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-mute">{task.description}</p>
                    <span className="mt-2 inline-block rounded-[2px] bg-edge px-1.5 py-0.5 text-[10px] text-mute">
                      Action: {task.measurement}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span className={`num text-[12px] font-bold ${isDone ? "text-mute" : "text-[#e2ad4c]"}`}>
                    +{task.xp} XP
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-edge pt-3 text-[12px]">
          <span className="text-mute">
            Completed: {completedTasks.length} of {ROUTINE_TASKS.length} today
          </span>
          <Link to="/check-in">
            <Button tone="light" className="h-8 text-[12px]">
              Perform Check-in Now
            </Button>
          </Link>
        </div>
      </Tile>

      {/* ── SECTION 3: CREW ACHIEVEMENT BADGES ─────────────────────── */}
      <Tile className="lg:col-span-6" title="Crew Achievements & Badges">
        <p className="text-[12px] text-mute mb-4">
          Milestones unlocked through continuous compliance with countermeasure regimens.
        </p>

        <div className="grid gap-2.5 sm:grid-cols-2">
          {BADGES.map(badge => {
            const isUnlocked = (g.unlockedBadges || []).includes(badge.id) || (r.checkins.length >= 3 && badge.id === "b_vanguard")
            return (
              <div 
                key={badge.id}
                className={`flex flex-col justify-between rounded-[4px] border p-3 ${
                  isUnlocked 
                    ? "border-edge bg-tile2" 
                    : "border-edge/40 bg-tile2/30 opacity-50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <badge.icon className="size-6 text-slate2" aria-label={badge.name} />
                  <span className="num text-[11px] font-bold text-[#e2ad4c]">+{badge.xpBonus} XP</span>
                </div>
                <div className="mt-2">
                  <h4 className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
                    {badge.name}
                    {isUnlocked && <CheckCircle2 className="size-3.5 text-[#6fc49a]" />}
                  </h4>
                  <p className="mt-1 text-[11px] leading-relaxed text-mute">{badge.description}</p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-edge/60 pt-2 text-[10px]">
                  <span className="text-mute">{badge.criteria}</span>
                  <span className={isUnlocked ? "text-[#6fc49a] font-semibold" : "text-mute"}>
                    {isUnlocked ? "UNLOCKED" : "LOCKED"}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </Tile>

      {/* ── SECTION 4: DYNAMIC HEALTH INDICATOR CHARTS OVER TIME ───── */}
      <Tile className="lg:col-span-12" title="Dynamic Crew Health Indicators Over Time"
        action={
          <div className="flex gap-1.5">
            <button 
              onClick={() => setChartMetric("cardio")}
              className={`rounded-[4px] px-2.5 py-1 text-[12px] font-medium transition-colors ${
                chartMetric === "cardio" ? "bg-cream text-[#1c1d20]" : "bg-tile2 text-mute hover:text-ink"
              }`}
            >
              Heart Rate & BP
            </button>
            <button 
              onClick={() => setChartMetric("metabolic")}
              className={`rounded-[4px] px-2.5 py-1 text-[12px] font-medium transition-colors ${
                chartMetric === "metabolic" ? "bg-cream text-[#1c1d20]" : "bg-tile2 text-mute hover:text-ink"
              }`}
            >
              Glucose & SpO2
            </button>
            <button 
              onClick={() => setChartMetric("sleep")}
              className={`rounded-[4px] px-2.5 py-1 text-[12px] font-medium transition-colors ${
                chartMetric === "sleep" ? "bg-cream text-[#1c1d20]" : "bg-tile2 text-mute hover:text-ink"
              }`}
            >
              Sleep & Mood
            </button>
          </div>
        }
      >
        <p className="text-[12px] text-mute mb-3">
          Telemetry trends tracked across mission check-ins. Color coding reflects clinical danger thresholds.
        </p>

        {/* SVG Dynamic Trend Chart */}
        <div className="rounded-[4px] bg-tile2/60 p-4">
          <div className="relative h-60 w-full">
            <svg viewBox="0 0 800 220" className="h-full w-full select-none" preserveAspectRatio="none">
              {/* Grid Lines */}
              <line x1="40" y1="30" x2="780" y2="30" stroke="#2f3136" strokeDasharray="3 3" />
              <line x1="40" y1="80" x2="780" y2="80" stroke="#2f3136" strokeDasharray="3 3" />
              <line x1="40" y1="130" x2="780" y2="130" stroke="#2f3136" strokeDasharray="3 3" />
              <line x1="40" y1="180" x2="780" y2="180" stroke="#2f3136" strokeDasharray="3 3" />

              {/* Data Lines based on selected view */}
              {chartMetric === "cardio" && (
                <>
                  {/* SBP line (Red/Amber) */}
                  <polyline
                    fill="none"
                    stroke="#e0503a"
                    strokeWidth="2.4"
                    points={chartData.sbps.map((val, i) => {
                      const x = 50 + (i * (720 / (chartData.count - 1 || 1)))
                      const y = 200 - ((val - 60) * 1.5)
                      return `${x},${y}`
                    }).join(" ")}
                  />
                  {/* DBP line (Amber) */}
                  <polyline
                    fill="none"
                    stroke="#e2ad4c"
                    strokeWidth="2"
                    points={chartData.dbps.map((val, i) => {
                      const x = 50 + (i * (720 / (chartData.count - 1 || 1)))
                      const y = 200 - ((val - 60) * 1.5)
                      return `${x},${y}`
                    }).join(" ")}
                  />
                  {/* HR line (Green) */}
                  <polyline
                    fill="none"
                    stroke="#6fc49a"
                    strokeWidth="2.2"
                    points={chartData.hrs.map((val, i) => {
                      const x = 50 + (i * (720 / (chartData.count - 1 || 1)))
                      const y = 200 - ((val - 40) * 1.6)
                      return `${x},${y}`
                    }).join(" ")}
                  />

                  {/* Data Points */}
                  {chartData.hrs.map((val, i) => {
                    const x = 50 + (i * (720 / (chartData.count - 1 || 1)))
                    const y = 200 - ((val - 40) * 1.6)
                    return <circle key={`hr-${i}`} cx={x} cy={y} r="4" fill="#6fc49a" />
                  })}
                  {chartData.sbps.map((val, i) => {
                    const x = 50 + (i * (720 / (chartData.count - 1 || 1)))
                    const y = 200 - ((val - 60) * 1.5)
                    return <circle key={`sbp-${i}`} cx={x} cy={y} r="4" fill="#e0503a" />
                  })}
                </>
              )}

              {chartMetric === "metabolic" && (
                <>
                  {/* Glucose line (Amber) */}
                  <polyline
                    fill="none"
                    stroke="#e2ad4c"
                    strokeWidth="2.4"
                    points={chartData.glucoses.map((val, i) => {
                      const x = 50 + (i * (720 / (chartData.count - 1 || 1)))
                      const y = 210 - ((val - 60) * 1.4)
                      return `${x},${y}`
                    }).join(" ")}
                  />
                  {/* SpO2 line (Green) */}
                  <polyline
                    fill="none"
                    stroke="#6fc49a"
                    strokeWidth="2.4"
                    points={chartData.spo2s.map((val, i) => {
                      const x = 50 + (i * (720 / (chartData.count - 1 || 1)))
                      const y = 210 - ((val - 90) * 14)
                      return `${x},${y}`
                    }).join(" ")}
                  />
                  {chartData.glucoses.map((val, i) => {
                    const x = 50 + (i * (720 / (chartData.count - 1 || 1)))
                    const y = 210 - ((val - 60) * 1.4)
                    return <circle key={`glu-${i}`} cx={x} cy={y} r="4" fill="#e2ad4c" />
                  })}
                </>
              )}

              {chartMetric === "sleep" && (
                <>
                  {/* Sleep line (Slate / Blue) */}
                  <polyline
                    fill="none"
                    stroke="#8ea0c4"
                    strokeWidth="2.4"
                    points={chartData.sleeps.map((val, i) => {
                      const x = 50 + (i * (720 / (chartData.count - 1 || 1)))
                      const y = 210 - (val * 18)
                      return `${x},${y}`
                    }).join(" ")}
                  />
                  {chartData.sleeps.map((val, i) => {
                    const x = 50 + (i * (720 / (chartData.count - 1 || 1)))
                    const y = 210 - (val * 18)
                    return <circle key={`slp-${i}`} cx={x} cy={y} r="4" fill="#8ea0c4" />
                  })}
                </>
              )}

              {/* X-axis date labels */}
              {chartData.labels.map((dateStr, i) => {
                const x = 50 + (i * (720 / (chartData.count - 1 || 1)))
                return (
                  <text key={i} x={x} y="210" fill="#8d8f96" fontSize="10" textAnchor="middle">
                    {dateStr}
                  </text>
                )
              })}
            </svg>
          </div>

          {/* Chart Legends */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-edge pt-2 text-[12px]">
            <div className="flex items-center gap-4">
              {chartMetric === "cardio" && (
                <>
                  <span className="flex items-center gap-1.5 text-ink">
                    <span className="size-2 rounded-full bg-[#6fc49a]" /> Heart Rate (BPM)
                  </span>
                  <span className="flex items-center gap-1.5 text-ink">
                    <span className="size-2 rounded-full bg-[#e0503a]" /> Systolic BP (mmHg)
                  </span>
                  <span className="flex items-center gap-1.5 text-ink">
                    <span className="size-2 rounded-full bg-[#e2ad4c]" /> Diastolic BP (mmHg)
                  </span>
                </>
              )}
              {chartMetric === "metabolic" && (
                <>
                  <span className="flex items-center gap-1.5 text-ink">
                    <span className="size-2 rounded-full bg-[#e2ad4c]" /> Blood Glucose (mg/dL)
                  </span>
                  <span className="flex items-center gap-1.5 text-ink">
                    <span className="size-2 rounded-full bg-[#6fc49a]" /> Pulse Oximetry SpO2 (%)
                  </span>
                </>
              )}
              {chartMetric === "sleep" && (
                <>
                  <span className="flex items-center gap-1.5 text-ink">
                    <span className="size-2 rounded-full bg-[#8ea0c4]" /> Sleep Duration (Hours)
                  </span>
                </>
              )}
            </div>

            <span className="text-[11px] text-mute">
              {r.checkins.length ? `${r.checkins.length} logged check-ins` : "Simulated sample mission trend"}
            </span>
          </div>
        </div>
      </Tile>

      {/* ── SECTION 5: PLAIN-ENGLISH EDUCATIONAL FIELD MANUAL ───────── */}
      <Tile className="lg:col-span-12" title="Astronaut Health & Risk Field Manual"
        action={
          <span className="flex items-center gap-1 text-[12px] text-mute">
            <BookOpen className="size-4" />
            <span>Essential Medical Explanations</span>
          </span>
        }
      >
        <p className="text-[13px] text-mute mb-4">
          Never assume astronauts know clinical jargon. The guides below describe what your body goes through in simple, everyday language along with concrete action steps.
        </p>

        <div className="grid gap-3">
          {FIELD_GUIDE.map(item => {
            const isOpen = openGuide === item.id
            return (
              <div 
                key={item.id}
                className="overflow-hidden rounded-[4px] border border-edge bg-tile2 transition-all"
              >
                <button
                  onClick={() => setOpenGuide(isOpen ? null : item.id)}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-tile2/80 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <StatusPill s={item.status} />
                    <span className="text-[14px] font-semibold text-ink">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-3 text-mute">
                    <span className="text-[12px] hidden sm:inline">{item.normalRange}</span>
                    {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-edge/60 bg-[#141517] p-4 text-[13px] space-y-3">
                    <div>
                      <h5 className="text-[11px] uppercase tracking-wider text-[#8ea0c4] font-semibold">What is happening in plain English:</h5>
                      <p className="mt-1 leading-relaxed text-ink">{item.plainEnglish}</p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3 pt-2">
                      <div className="rounded-[4px] bg-tile2 p-3">
                        <h6 className="text-[11px] uppercase text-[#e0503a] font-semibold">Danger Signs & Symptoms:</h6>
                        <p className="mt-1 text-[12px] text-mute">{item.dangerSigns}</p>
                      </div>
                      <div className="rounded-[4px] bg-tile2 p-3">
                        <h6 className="text-[11px] uppercase text-[#6fc49a] font-semibold">What To Do Immediately:</h6>
                        <p className="mt-1 text-[12px] text-mute">{item.countermeasures}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Tile>

    </div>
  )
}
