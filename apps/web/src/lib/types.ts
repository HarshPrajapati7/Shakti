import type { Status } from "./utils"

export interface Vitals { sbp?: number; dbp?: number; hr?: number; spo2?: number; temp_c?: number; glucose?: number; sleep_h?: number; mood?: number; reaction_ms?: number
  resp_rate?: number; weight_kg?: number; exercise_min?: number; radiation_msv?: number; vision_change?: number }
export interface Reading { key: keyof Vitals; label: string; value: number; unit: string; status: Status; range: string; baseline?: number; z?: number; note: string }
export interface System { id: string; label: string; status: Status; readings: string[]; action: string }
export interface AssessOut { overall: Status; readings: Reading[]; systems: System[]; baseline_days: number }

export interface StandTest { hr_supine: number; sbp_supine: number; dbp_supine: number; hr_1min: number; sbp_1min: number; dbp_1min: number; hr_3min: number; sbp_3min: number; dbp_3min: number }
export interface GravityIn { sex: string; age: number; height_cm: number; weight_kg: number; hr_rest: number; sbp: number; dbp: number
  days_in_flight: number; flight_gravity: number; target_gravity: number; fluid_loading: boolean; compression: boolean; stand_test?: StandTest }
export interface Stand { dmap_initial: number; dmap_sustained: number; dhr_sustained: number; map_brain: number; vpool_ml: number; initial_oh: boolean; classical_oh: boolean; margin_mmhg: number }
export interface GravityOut { map0: number; plasma_volume_ml: number; plasma_loss_ml: number; central_deficit_ml: number; personalised: boolean
  calibration_rmse?: number; pooling_factor: number; reflex_factor: number; summary: Stand; preflight: Stand
  t: number[]; map: number[]; map_preflight: number[]; hr: number[]; by_destination: [string, number, number][]; status: Status; advice: string[] }
export interface HrOut { n_windows: number; seconds: number; t_s: number[]; hr: number[]; lo: number[]; hi: number[]; sd: number[]; low_confidence: boolean[]
  mean_hr: number; min_hr: number; max_hr: number; reliable_fraction: number; skipped_rows: number; models: number; loso_mae_bpm: number; status: Status; message: string }

export interface CheckIn { id: string; date: string; vitals: Vitals; result: AssessOut }
export interface Recording { id: string; date: string; name: string; seconds: number; mean_hr: number; min_hr: number; max_hr: number; reliable: number; status: Status }
export interface GravityRun { id: string; date: string; input: GravityIn; margin: number; status: Status; destination: string }
<<<<<<< HEAD
export interface GamificationState {
  xp: number
  level: number
  streak: number
  lastActiveDate?: string
  activeEnvironment: "spacecraft" | "station" | "rover" | "moon" | "mars"
  completedTasks: string[]
  unlockedBadges: string[]
}

export interface MissionTask { id: string; title: string; route?: string; status: "available" | "completed" | "deferred"; completedAt?: string }
export interface MissionState { status: "active" | "paused" | "archived"; startedAt: string; tasks: MissionTask[]; xp: number }
export interface Records { checkins: CheckIn[]; recordings: Recording[]; gravity: GravityRun[]; profile?: Partial<GravityIn>; gamification?: GamificationState; mission?: MissionState }
=======
export type TaskStatus = "locked" | "available" | "completed" | "deferred" | "skipped"
export type EvidenceSource = "manual" | "wearable" | "simulation" | "self_report"
export interface MissionTask { taskId: string; status: TaskStatus; availableAt?: string; completedAt?: string; source?: EvidenceSource; recordId?: string; note?: string; xp: number }
export interface MissionInstance { id: string; templateId: string; startedAt: string; endedAt?: string; status: "active" | "completed" | "abandoned"; tasks: MissionTask[] }
export interface MissionEvent { id: string; date: string; type: "started" | "completed" | "deferred" | "skipped" | "resumed" | "badge" | "mission_completed" | "learning"; label: string; source: EvidenceSource | "system"; xp: number }
export interface MissionState { active?: MissionInstance; archived: MissionInstance[]; events: MissionEvent[]; xp: number; badges: string[]; learned: string[] }
export interface Records { checkins: CheckIn[]; recordings: Recording[]; gravity: GravityRun[]; profile?: Partial<GravityIn>; mission?: MissionState }
>>>>>>> 0b9a1311cf4c747f2eb15b6ef3e299fee3fa382d
