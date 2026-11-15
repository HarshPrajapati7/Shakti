# SAKTI — Mission Protocols & Health Gamification

**Product specification and implementation blueprint**  
**Project:** SAKTI / ASTRA-HEALTH · Team Star Busters  
**Feature:** Mission Protocols  
**Version:** 1.0  
**Status:** Product/engineering specification for implementation in the existing SAKTI application

---

## 1. Product intent

Mission Protocols turns recurring astronaut health activities into short, mission-themed objectives. The astronaut completes health check-ins, wearable recordings, cognitive checks, exercise/recovery logs and short learning activities while progressing through a simulated mission narrative.

The feature is **not a separate game, spacecraft simulator, medical diagnostic system or flight-control system**. It is a motivational and educational layer on top of SAKTI's existing health-monitoring workflows.

### Core product principle

> Reward reliable health-maintenance behaviour and measurement quality—not a favourable health result.

A completed health check remains valuable when it reports an abnormal measurement. A concerning result must open the appropriate health-assessment pathway; it must never reduce points, fail a mission, or be hidden behind a game mechanic.

### Outcomes

1. Improve completion of scheduled health assessments.
2. Help crew understand why each measurement matters.
3. Make long-duration routines understandable through mission scenarios.
4. Show progress over days and weeks without inventing a single health score.
5. Connect activity history with SAKTI's existing physiological trends and personal baseline.
6. Continue to work locally when the application has no network connection.

---

## 2. Product boundaries and safety rules

### In scope

- Mission-themed task sequences and interactive scenario progression.
- Suit-up / pre-EVA health-readiness rehearsal.
- Spacecraft transit and destination-arrival health checkpoints.
- Surface-activity / post-EVA recovery checkpoints.
- Daily and weekly health-maintenance missions.
- Learning cards and short knowledge challenges.
- XP, non-competitive achievements, progress timeline and trend graphs.
- Local reminders, pause/defer controls and offline event storage.

### Out of scope

- Controlling a spacecraft, aircraft, rover, spacesuit, pressure system or life-support equipment.
- Replacing official EVA, spacecraft or medical operating procedures.
- Giving medication, fluid-loading, exercise or treatment instructions that are not part of an authorised medical/mission protocol.
- Predicting survival time, diagnosing disease, or deciding flight fitness autonomously.
- Rewarding low heart rate, high SpO₂, low stress, normal blood pressure or any other favourable biological result.
- Crew leaderboards that reveal private health information.

### Non-negotiable safety behaviour

1. A health alert always takes precedence over a game task, animation, badge or mission-completion screen.
2. The application must permit **Pause**, **Defer**, **Skip with reason** and **Open health assessment**.
3. No points are awarded for hiding, deleting or changing a concerning measurement.
4. A task that asks for a measurement is complete only when the measurement is recorded or explicitly marked unavailable with a reason. A tap on “Done” must not falsely imply that a sensor measurement occurred.
5. Manual, sensor-derived, imported and simulated values must remain distinguishable.
6. Mission scenarios are simulations. They do not validate spacecraft or spacesuit operations.
7. The system must never pressure an astronaut to exercise, stand, remove a suit, delay rest or repeat a measurement when the crew's authorised protocol says otherwise.
8. If an urgent health assessment is triggered, gamification is suspended for that event and the user is directed to the approved medical workflow.

---

## 3. Fit with the existing SAKTI application

**Do not redesign the existing UI.** Keep the current SAKTI visual language, spacing, tiles, typography, charts, navigation and interaction patterns.

### Existing frontend structure inspected

- `apps/web/src/App.tsx` — main navigation and route definitions.
- `apps/web/src/pages/Status.tsx` — crew status, next actions, body-system hologram, gravity and wearable summaries.
- `apps/web/src/pages/Checkin.tsx` — manual vitals, 8-tap reaction-time test and assessment output.
- `apps/web/src/pages/Gravity.tsx` — Earth/Moon/Mars scenario inputs and optional stand-test personalisation.
- `apps/web/src/pages/Wearable.tsx` — CSV upload, sample recording, heart-rate estimate and signal reliability.
- `apps/web/src/pages/History.tsx` — saved check-ins, gravity runs and wearable recordings.
- `apps/web/src/components/Chart.tsx` — lightweight SVG line chart with a hover readout.
- `apps/web/src/lib/store.ts` and `types.ts` — local record persistence and TypeScript data contracts.

### Current visual system to preserve

| Token | Current value | Use |
|---|---|---|
| Frame | `#17181b` | App background |
| Tile | `#1f2024` | Main cards |
| Tile 2 | `#26272c` | Nested panels and controls |
| Edge | `#2f3136` | Borders and chart grid |
| Ink | `#e7e6e1` | Primary text |
| Muted | `#8d8f96` | Secondary text |
| Slate | `#5d7096` | Primary action / mission accent |
| Slate 2 | `#8ea0c4` | Secondary accent / chart series |
| Cream | `#e8e6dc` | Existing light emphasis surfaces |
| OK | `#6fc49a` | Positive system status only |
| Watch | `#e2ad4c` | Caution status only |
| Alert | `#e0503a` | Alert status only |

Use the existing Manrope and Doto font setup. Do not introduce a second design system, gradients, neon reward effects, large game HUDs or a new colour palette.

### Minimal navigation change

Add one navigation item:

- **Mission** — route `/mission` — icon suggestion: `Orbit` or `Flag` from the existing Lucide icon set.

Add a compact **Mission progress** tile to the existing Status page. It should show the active mission name, next task, due window and a small completion indicator. It must not displace the existing health status, body hologram or critical next actions.

### Mission page layout

Reuse the current `Tile`, `Button`, `Field`, `StatusPill`, `Sheet` and `Chart` components.

1. **Active mission tile** — mission name, scenario stage, elapsed mission day and completion percentage.
2. **Current objective tile** — one primary task with a short reason and one clear action.
3. **Mission sequence** — compact vertical sequence of completed, current, locked and deferred checkpoints.
4. **Progress timeline** — task adherence graph and milestone markers.
5. **Health trends** — selectable physiological indicators, shown independently from game points.
6. **Achievements** — a small grid of earned and upcoming badges.
7. **Mission log** — dated events with source labels: manual, wearable, imported or simulation.

The round watch display should show only the next task, status and a short action. Detailed scenario instructions, graphs and explanations stay in the existing companion app.

---

## 4. Mission experience and game loop

### Standard loop

`Briefing → Objective → Health action → Validation → Feedback → Mission progress → Next checkpoint`

1. **Briefing:** Explain the scenario and why the health task matters.
2. **Objective:** Present one task, not a long list of unrelated tasks.
3. **Health action:** Open the corresponding existing SAKTI page or a short embedded activity.
4. **Validation:** Confirm completion from a saved record, successful sensor analysis, assessment completion or explicit self-report.
5. **Feedback:** Show what was completed and what data was added. Do not label a normal result as a personal achievement.
6. **Progress:** Award activity XP and advance the narrative checkpoint.
7. **Next checkpoint:** Offer the next task or allow the user to defer it.

### Task states

- `locked` — prerequisite or schedule not reached.
- `available` — ready to start.
- `in_progress` — activity opened but not completed.
- `completed` — completion evidence saved.
- `deferred` — moved to another permitted time window.
- `skipped` — intentionally skipped with optional reason.
- `expired` — time window passed; no penalty.
- `blocked_by_health_alert` — paused because the health workflow takes priority.

### Task record must show

- Task name.
- Why it matters.
- Estimated duration.
- Due window (not a punitive countdown).
- Required input or action.
- Completion evidence.
- Data source: manual, sensor, imported, or simulation.
- Whether the task is required, optional or educational.

---

## 5. Mission scenarios

Scenarios are short interactive narratives. Each scenario contains health-related objectives. The narrative may show an astronaut putting on a suit, travelling in a spacecraft or reaching a destination, but it must not imply that SAKTI controls or certifies the actual operation.

### Mission 01 — Suit-Up & EVA Readiness

**Scenario:** The astronaut is preparing for a simulated extravehicular activity (EVA). The character progresses through a suit-up sequence while SAKTI checks that the crew member has completed the health assessments scheduled by the authorised mission protocol.

**Goal:** Complete the pre-EVA health-readiness sequence and understand the reason for each check.

| Step | On-screen task | SAKTI action / evidence | Completion rule |
|---|---|---|---|
| 1 | Mission briefing | Display EVA context, task duration and safety notice | Briefing acknowledged |
| 2 | Baseline check | Open existing Check-in page | A check-in record is saved, or the task is deferred |
| 3 | Wearable readiness | Open Wearable page and analyse a supported recording | Recording saved with reliability information; no recording means not completed |
| 4 | Cognitive readiness | Run the existing 8-tap reaction-time test through Check-in | Reaction-time result stored with the check-in |
| 5 | Symptom review | Ask the approved symptom questions configured for this mission | User response recorded; concerning response routes to health assessment |
| 6 | Suit-up rehearsal | Show a simple simulated suit-up sequence and ask the user to confirm completion of the official suit procedure | Self-attestation only; never represented as hardware verification |
| 7 | Readiness review | Summarise completed checks, missing inputs and any active alert | Review acknowledged; medical alerts cannot be dismissed by the game |

**Interactive mechanics:**

- A 5–7-step visual sequence, one step per screen/card.
- A simple astronaut/suit illustration may change state as the user advances.
- Each health task opens the existing SAKTI function rather than creating a duplicate measurement form.
- A task may be deferred if mission operations or medical guidance require it.

**Important suit boundary:** SAKTI must not invent suit donning, seal-check, pressure-test, oxygen or life-support procedures. Those steps must come from the mission operator's approved checklist. In the prototype, the suit sequence is a visual rehearsal and confirmation of an external authorised procedure only.

### Mission 02 — Deep-Space Transit & Destination Arrival

**Scenario:** The astronaut is travelling in a simulated spacecraft toward a destination such as lunar orbit, a lunar surface habitat or Mars transit. The mission timeline advances through scheduled health checkpoints.

**Goal:** Maintain assessment consistency over a long mission and complete an arrival health assessment.

| Checkpoint | Mission event | Health task | Evidence |
|---|---|---|---|
| T−1 / Departure | Pre-departure | Baseline check-in and profile review | Saved baseline/check-in record |
| Transit Day 1 | Initial adaptation | Sleep, mood and symptom check-in | Manual check-in |
| Transit Day 3 | Routine monitoring | Wearable recording and signal-quality review | Saved recording |
| Weekly checkpoint | Crew health review | Check-in plus short cognitive test | Saved check-in and reaction time |
| Mid-transit | Mission review | Review personal trends and missing measurements | Trend review acknowledged |
| Pre-arrival | Destination briefing | Complete measurements specified by the authorised arrival protocol | Saved measurements or explicit deferral |
| Arrival | Gravity transition scenario | Open Gravity page and compare configured destination scenarios | Saved model run; clearly marked simulation |
| Post-arrival | Recovery observation | Record scheduled post-arrival check-in / stand-test values if authorised | Saved manual assessment |

**Interactive mechanics:**

- A simple mission-route or timeline indicator with named checkpoints.
- Mission days advance using the configured scenario schedule, not by pretending task completion changes real spacecraft position.
- Completing a health checkpoint marks that checkpoint on the mission timeline.
- The destination may be Earth, Moon or Mars where supported by the existing Gravity module.
- Gravity outputs are labelled as model simulations/extrapolations, not actual reduced-gravity observations.

### Mission 03 — Surface Traverse & Recovery

**Scenario:** The astronaut is assigned a simulated lunar/Martian surface traverse or habitat-to-worksite journey.

**Goal:** Reinforce before-activity, during-routine and post-activity health monitoring.

| Stage | Mission task | SAKTI integration |
|---|---|---|
| Before departure | Pre-activity check-in | Existing Check-in page |
| Before departure | Confirm wearable signal quality | Existing Wearable page |
| During the simulated traverse | Complete a timed observation / decision checkpoint | Short educational task; no real rover control |
| Environmental log | Enter the current dosimeter reading if provided by an approved instrument | Existing `radiation_msv` field; identify it as an external dosimeter reading |
| Return to habitat | Complete post-activity check-in | Existing Check-in page |
| Recovery window | Review sleep, exercise and recovery trends | Health trajectory view |

The scenario can animate an astronaut moving from habitat to destination. Progress is narrative and educational; it must not be presented as navigation, EVA approval or a prediction of physical safety.

### Mission 04 — Long-Duration Health Routine

**Scenario:** A recurring mission that supports daily and weekly maintenance throughout a long-duration mission.

**Daily tasks (configurable):**

- Morning health check-in.
- Sleep and mood self-report.
- Wearable recording when scheduled and available.
- Cognitive check when included in the mission schedule.
- Exercise duration logging when appropriate.
- Evening review or sleep-preparation learning card.

**Weekly tasks:**

- Review the previous seven days of measurements.
- Review missing or low-quality sensor recordings.
- Review changes relative to the personal baseline.
- Complete one short health-learning module.
- Review the next week's authorised schedule.

The task schedule must be configurable by an authorised mission profile. Avoid inventing universal daily frequencies for every measurement.

---

## 6. Progression, rewards and achievements

### XP rules

XP rewards the **completion of a health-supporting action**, not the value of the health result.

Suggested starting values (configurable):

| Activity | XP |
|---|---:|
| Complete scheduled check-in | 10 |
| Complete a valid wearable recording | 10 |
| Complete cognitive test | 5 |
| Complete an assigned exercise/recovery log | 5 |
| Complete health-learning module | 5 |
| Complete a mission checkpoint sequence | 15 |
| Review weekly health timeline | 5 |

Rules:

- One reward per task instance; repeated uploads do not generate unlimited XP.
- No XP for entering a normal result, altering a measurement, or suppressing an alert.
- An abnormal result still earns completion XP if the measurement was honestly submitted and saved.
- Low-quality sensor capture should explain how to retry; it must not be labelled a failure of the astronaut.
- Deferred or medically blocked tasks carry no penalty.
- XP never changes health status, clinical thresholds or model outputs.

### Levels

Use non-clinical mission progression labels only. Suggested labels:

1. Mission Initiate
2. Crew Monitor
3. Systems Observer
4. Mission Specialist
5. Expedition Specialist

These levels represent participation in the programme, not medical fitness, astronaut rank or operational qualification.

### Achievement badges

| Badge | Unlock condition |
|---|---|
| Baseline Established | Complete the configured baseline collection period |
| Seven-Day Consistency | Complete at least one scheduled health task on seven distinct days |
| Sensor Check Complete | Save a wearable recording that passes the configured data-quality criteria |
| Cognitive Check Complete | Complete a scheduled reaction-time assessment |
| Mission Checkpoint | Complete a mission checkpoint sequence |
| Health Knowledge | Finish a learning module and pass its short knowledge check |
| Weekly Review | Open and review the seven-day trend summary |
| Recovery Log | Save a scheduled post-activity or post-exercise record |

Avoid badges named “Perfect Health”, “Zero Risk”, “Medically Cleared” or “EVA Approved”.

### Streaks

- Track consistency, not perfection.
- A streak means the user completed at least one scheduled task during a day or completed a configured set of tasks during a defined schedule window.
- Allow rest days and mission-duty exceptions.
- Never reset progress because an astronaut deferred a task for medical or operational reasons.
- Do not show a red broken-streak warning.

### No competitive leaderboard by default

The primary design is individual and crew-private. If a future crew challenge is added, show only aggregated participation (for example, “crew assessment cycle completed”) and never expose individual vitals, symptoms, stress, mood or risk estimates.

---

## 7. Timeline tracking and progress graphs

This is a core part of the feature. The application must show **two separate kinds of progress**.

### A. Mission activity progress

Answers: “Are scheduled health-maintenance activities being completed consistently?”

Recommended graphs:

1. **Daily completion line:** percentage of scheduled tasks completed per day.
2. **Seven-day rolling completion:** rolling average of daily completion percentage.
3. **Mission timeline:** milestone markers for departure, transit checkpoints, arrival and recovery.
4. **Task duration trend:** time taken to complete a task, only where duration is measured reliably.
5. **Measurement coverage:** count/percentage of scheduled measurements with valid records.

Definitions:

\[
C_d = 100\times\frac{N_{completed,d}}{N_{scheduled,d}}
\]

\[
\overline{C}_{7,d}=\frac{1}{7}\sum_{i=0}^{6}C_{d-i}
\]

If no task was scheduled on a day, show a gap or “No scheduled tasks”; do not plot zero completion.

Task-duration comparison must use like-for-like tasks. Do not compare a short mood check with a longer wearable recording and call the change an improvement.

### B. Physiological health trajectory

Answers: “How have the astronaut's measured indicators changed over time?”

Use the existing `Chart` component where possible, and extend it only where required for date labels and multiple time ranges.

| Indicator | Unit | Source in current SAKTI |
|---|---|---|
| Resting heart rate | bpm | Check-in or PPG-HR recording |
| Systolic / diastolic BP | mmHg | Manual check-in |
| SpO₂ | % | Manual entry / future validated sensor input |
| Sleep duration | hours | Manual check-in |
| Reaction time | ms | Existing 8-tap test |
| Exercise duration | minutes | Manual check-in |
| Body mass | kg | Manual measurement |
| Mood | 1–5 | Self-report |
| Respiration rate | breaths/min | Manual check-in |
| Temperature | °C | Manual entry |
| Radiation dose | mSv | External dosimeter entry |
| PPG reliability | fraction / % | Wearable analysis output |

Requirements:

- Provide `24 h`, `7 d`, `30 d` and `mission` ranges where sufficient data exists.
- Show actual observation points; do not fill missing measurements with interpolated values unless the graph explicitly marks an estimated interpolation.
- Mark source type: manual, wearable, imported, or simulated.
- Show the individual's baseline or reference band only when sufficient baseline data exists.
- Show measurement units and collection timestamps.
- Allow the user to select one or two compatible variables; avoid mixing incompatible scales on one axis.
- Preserve abnormal readings and show them in context rather than smoothing them away.
- Add a note that a trend is descriptive and does not prove that a mission task caused the change.

### Personal-baseline display

The current Status page indicates that the personal baseline is formed after five check-ins. The Mission page should reuse that same baseline rule unless the model specification is deliberately changed and revalidated.

For an indicator with a suitable personal baseline, show:

\[
z_t=\frac{x_t-\operatorname{median}(B)}{1.4826\,\operatorname{MAD}(B)}
\]

This robust deviation is an analytical reference, not a diagnosis. If MAD is zero or data are insufficient, show “baseline unavailable” rather than divide by zero or fabricate a deviation.

### C. Mission progress line

A separate horizontal mission path can show:

`Pre-departure → Transit → Mid-mission review → Arrival preparation → Arrival → Recovery`

The marker represents the current simulated mission checkpoint. It is not the spacecraft's real position, navigation solution or physical travel distance.

---

## 8. Learning challenges

Learning missions should be short (about 1–3 minutes) and use plain language, diagrams and one knowledge check.

Suggested modules:

1. **Why do fluids shift in microgravity?** — headward fluid redistribution and cardiovascular adaptation.
2. **What do HR and HRV tell us?** — explain what can and cannot be inferred from pulse-derived measures.
3. **How to take a blood-pressure reading** — use the measurement procedure supplied by the authorised medical team.
4. **What is a reliable PPG recording?** — explain motion artefacts, contact quality and signal confidence.
5. **Why does sleep timing matter?** — circadian rhythm and sleep opportunity.
6. **What does a radiation dosimeter measure?** — distinguish an external dose reading from biological damage.
7. **What happens during a stand test?** — explain the purpose and the exact mission-approved procedure.
8. **When should a crew member report a symptom?** — use the approved escalation wording and emergency pathway.

Knowledge checks are formative. A wrong answer should explain the correct concept and allow a retry; do not make medical support conditional on passing a quiz.

---

## 9. Notifications and schedule logic

### Notification types

- Scheduled task reminder.
- Deferred-task reminder.
- Low-quality recording follow-up.
- Weekly trend review reminder.
- New learning mission availability.
- Health alert / medical workflow notification (separate from gamification).

### Reminder behaviour

- Use a configurable quiet window aligned with the mission sleep schedule.
- Never interrupt a protected sleep period for a non-urgent game reminder.
- Permit `Remind later`, `Defer`, `Skip` and `Pause mission tasks`.
- Do not send repeated reminders after the astronaut has deferred or acknowledged the task.
- Health alerts must use their separate, authorised priority and escalation rules.

### Schedule generation

The task schedule is built from:

1. Mission template.
2. Authorised mission/medical schedule.
3. Crew member's configured sleep and duty windows.
4. Completed task instances.
5. Defer/skip events.
6. Sensor availability and data-quality state.

The game engine may recommend when to perform a routine activity, but it cannot modify clinical thresholds or countermeasure prescriptions.

---

## 10. Mapping to existing SAKTI functions

Reuse current functionality instead of making duplicate data-entry forms.

| Mission task | Existing route/function | Existing evidence |
|---|---|---|
| Daily measurements | `/check-in` | `CheckIn` with `Vitals` and `AssessOut` |
| Reaction-time challenge | `/check-in` | Existing 8-tap reaction test stores `reaction_ms` |
| Wearable check | `/wearable` | `Recording`, reliability, HR estimate and analysis result |
| Gravity / arrival scenario | `/gravity` | `GravityRun`, destination and model margin |
| Review historical progress | `/history` | Check-ins, recordings and gravity runs |
| Mission summary | `/` Status | Add compact mission summary tile; do not replace current health summary |

### Available fields in current `Vitals`

`sbp`, `dbp`, `hr`, `spo2`, `temp_c`, `glucose`, `sleep_h`, `mood`, `reaction_ms`, `resp_rate`, `weight_kg`, `exercise_min`, `radiation_msv`, `vision_change`.

Fields such as hydration volume, suit telemetry, core temperature, radiation instrument metadata or actual spacecraft location are **not currently established by the inspected frontend contract**. Add them only when a verified device/API and validation method exist. For now, a radiation value is a manually entered external dosimeter reading and must be labelled accordingly.

### Existing wearable CSV requirement

The current Wearable page accepts CSV data with `bvp, acc_x, acc_y, acc_z` at 64 Hz and requires at least 30 seconds. Mission Protocols should route the user to this existing upload/analysis path and should not imply that the round watch prototype is already acquiring those signals unless the hardware integration proves it.

---

## 11. Data model and persistence

Extend the existing local `Records` store. Preserve existing records and add optional mission fields so old local data remains loadable.

### Suggested TypeScript contracts

```ts
export type TaskStatus =
  | "locked" | "available" | "in_progress" | "completed"
  | "deferred" | "skipped" | "expired" | "blocked_by_health_alert";

export type EvidenceSource = "manual" | "wearable" | "imported" | "simulation" | "self_report";

export interface MissionTaskDefinition {
  id: string;
  title: string;
  description: string;
  whyItMatters: string;
  category: "checkin" | "wearable" | "cognitive" | "exercise" | "learning" | "scenario" | "review";
  route?: string;
  required: boolean;
  estimatedMinutes: number;
  dueOffsetMinutes?: number;
  xp: number;
  evidenceRule: "checkin_record" | "wearable_recording" | "reaction_test" |
    "self_report" | "learning_quiz" | "scenario_acknowledgement" | "review_acknowledgement";
}

export interface MissionTemplate {
  id: string;
  title: string;
  scenario: "eva_readiness" | "spacecraft_transit" | "surface_traverse" | "long_duration_routine";
  description: string;
  stages: Array<{ id: string; title: string; taskIds: string[] }>;
  version: number;
}

export interface MissionTaskInstance {
  id: string;
  templateId: string;
  taskId: string;
  status: TaskStatus;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  deferredUntil?: string;
  evidenceSource?: EvidenceSource;
  evidenceRecordId?: string;
  completionNote?: string;
  xpAwarded: number;
}

export interface MissionEvent {
  id: string;
  missionInstanceId: string;
  taskInstanceId?: string;
  type: "started" | "completed" | "deferred" | "skipped" | "expired" |
    "alert_blocked" | "badge_unlocked" | "stage_completed";
  timestamp: string;
  source: EvidenceSource | "system";
  metadata?: Record<string, string | number | boolean>;
}

export interface MissionInstance {
  id: string;
  templateId: string;
  title: string;
  scenario: MissionTemplate["scenario"];
  startedAt: string;
  plannedEndAt?: string;
  currentStageId: string;
  status: "active" | "paused" | "completed" | "archived";
  tasks: MissionTaskInstance[];
}

export interface MissionProgressSnapshot {
  date: string;
  scheduledTasks: number;
  completedTasks: number;
  completionPct: number | null;
  validMeasurements: number;
}

export interface MissionState {
  active?: MissionInstance;
  archived: MissionInstance[];
  events: MissionEvent[];
  xpTotal: number;
  unlockedBadges: string[];
  snapshots: MissionProgressSnapshot[];
}
```

Extend `Records` with `mission?: MissionState`. Keep `mission` optional during migration and default it to an empty state when absent.

### Persistence rules

- Continue using the existing `store.ts` local record update pattern initially.
- Preserve desktop local app-data persistence through the existing engine bridge.
- Preserve browser local storage for the web build.
- Store timestamps in ISO-8601 UTC; display them in the configured local mission time zone.
- Use stable IDs and idempotent completion handling.
- Never duplicate XP when the same completion event is replayed.
- Do not store raw wearable waveform data in mission events; link to the recording ID and keep data under the existing recording policy.
- Provide export and delete controls consistent with the existing History page.

---

## 12. Implementation architecture

```text
Mission Template
      │
      ▼
Mission Scheduler ─────── Mission Profile / Quiet Hours
      │
      ▼
Mission Task Engine
      │
      ├── Check-in adapter ─────── existing /check-in + assess()
      ├── Wearable adapter ─────── existing /wearable + ppg()
      ├── Gravity adapter ──────── existing /gravity + gravity()
      ├── Learning adapter ─────── quiz / acknowledgement
      └── Scenario adapter ─────── simulated sequence state
      │
      ▼
Evidence Validator
      │
      ├── Record ID / source / timestamp
      ├── Data-quality result where applicable
      └── Health-alert precedence check
      │
      ▼
Mission State Store
      │
      ├── Task status
      ├── XP / badges
      ├── Mission event log
      └── Daily progress snapshots
      │
      ▼
Mission UI + Timeline Charts + History
```

### Suggested files

```text
apps/web/src/
├── pages/
│   └── Mission.tsx
├── components/mission/
│   ├── MissionSummary.tsx
│   ├── MissionTaskCard.tsx
│   ├── MissionSequence.tsx
│   ├── MissionTimeline.tsx
│   ├── MissionProgressChart.tsx
│   ├── HealthTrajectory.tsx
│   ├── AchievementGrid.tsx
│   ├── LearningMission.tsx
│   └── ScenarioSequence.tsx
└── lib/
    ├── missionTypes.ts
    ├── missionTemplates.ts
    ├── missionEngine.ts
    ├── missionEvidence.ts
    └── missionProgress.ts
```

### Route and navigation

- Add `Mission` to `NAV` in `App.tsx`.
- Add lazy route `/mission`.
- Add a compact `MissionSummary` tile in `Status.tsx`.
- Add mission events and achievements to `History.tsx` or a filterable Mission Log within Mission page.
- Do not modify the existing `Checkin`, `Gravity` or `Wearable` forms unless a small deep-link callback is required.

---

## 13. Progress calculations

### Task completion

For a mission instance:

\[
P_{mission}=100\times\frac{N_{completed}}{N_{eligible}}
\]

`N_eligible` excludes locked, medically blocked and explicitly unscheduled tasks. Deferred tasks remain visible but are not counted as failures.

### Daily adherence

\[
A_d=100\times\frac{N_{completed,d}}{N_{scheduled,d}}
\]

Only calculate when `N_scheduled,d > 0`.

### Measurement coverage

\[
M_d=100\times\frac{N_{valid\\ measurements,d}}{N_{scheduled\\ measurements,d}}
\]

Validity must use the relevant sensor/data-quality rules. A manually self-reported value must be labelled manual and not counted as sensor-verified.

### Task duration

\[
T_{task}=t_{completed}-t_{started}
\]

Compare only the same task type and report the median plus sample count. A faster completion is not automatically better; the user must not be encouraged to rush health measurements.

### Health indicator trends

Use the original measurement values and units. Plot personal reference bands where available, keep gaps for missing data and distinguish source types. Do not calculate a composite “health improvement score” from unrelated physiological variables.

---

## 14. Progress and trend graph specification

### Graph 1 — Mission adherence

- X-axis: date / mission day.
- Y-axis: completed scheduled tasks (%).
- Series: daily adherence and optional 7-day rolling mean.
- Mark no-task days as gaps.
- Tooltip: completed, scheduled, deferred, skipped and medically blocked counts.

### Graph 2 — Measurement consistency

- X-axis: date / mission day.
- Y-axis: valid measurement coverage (%).
- Series: scheduled measurement coverage.
- Tooltip: source breakdown and missing/low-quality count.

### Graph 3 — Personal health trajectory

- Select one indicator at a time by default.
- X-axis: date / mission day.
- Y-axis: actual indicator unit.
- Series: observed values, optional personal baseline and reference band.
- Mark manual, wearable and imported values differently.
- Do not draw interpolated values across missing periods.

### Graph 4 — Mission timeline

- Horizontal checkpoint sequence.
- Show planned and actual timestamps.
- Completed checkpoints use the existing OK colour; current checkpoint uses slate; deferred checkpoints use neutral grey; blocked items use alert only when a real health alert is active.
- Include event markers for check-ins, wearable uploads, Gravity simulations and learning modules.

### Chart component change

The current `Chart.tsx` accepts numeric `x` values and rounds them in axis labels. Extend it minimally with optional `xLabels?: string[]` and a `formatX?: (value: number, index: number) => string` callback, while preserving existing chart behaviour. Do not replace the chart library solely for this feature.

---

## 15. Mission content and task catalogue

Use a catalogue so tasks can be reused across scenario templates.

| Task ID | Name | Category | Existing integration | Evidence |
|---|---|---|---|---|
| `CHECKIN_AM` | Morning health check | checkin | `/check-in` | Saved check-in ID |
| `CHECKIN_PM` | Evening health check | checkin | `/check-in` | Saved check-in ID |
| `PPG_RECORD` | Wearable recording | wearable | `/wearable` | Saved recording ID and reliability |
| `COGNITIVE_8TAP` | Reaction-time test | cognitive | Existing Check-in test | `reaction_ms` in saved check-in |
| `EXERCISE_LOG` | Exercise log | exercise | Check-in `exercise_min` | Saved check-in / explicit log |
| `SLEEP_LOG` | Sleep report | checkin | Check-in `sleep_h` | Saved check-in |
| `MOOD_LOG` | Mood report | checkin | Check-in `mood` | Saved check-in |
| `RADIATION_LOG` | Dosimeter reading | checkin | Check-in `radiation_msv` | Manual external reading |
| `GRAVITY_ARRIVAL` | Arrival gravity scenario | scenario | `/gravity` | Saved GravityRun ID; output marked simulated |
| `HEALTH_LEARN_*` | Health knowledge module | learning | Mission page | Quiz result / acknowledgement |
| `WEEKLY_REVIEW` | Review health timeline | review | `/history` and charts | Review acknowledgement |
| `SUIT_REHEARSAL` | Suit-up health-readiness rehearsal | scenario | Mission page + Check-in links | Self-attestation + linked health records |
| `TRANSIT_CHECKPOINT` | Spacecraft transit checkpoint | scenario | Mission page + existing pages | Linked task evidence |
| `POST_EVA_RECOVERY` | Post-activity recovery check | checkin | `/check-in` | Saved post-activity check-in |

Do not require every task in every mission. Mission templates define the applicable tasks and schedule.

---

## 16. UI copy guidelines

Keep text short and operational. Use a single clear action per card.

**Good task card**

- Title: `Complete pre-EVA health check`
- Reason: `Records the measurements scheduled before this simulated EVA.`
- Action: `Open check-in`
- Status: `Available · 3 min`

**Good sensor task**

- Title: `Check wearable signal`
- Reason: `A reliable pulse recording is needed before the system estimates heart rate.`
- Action: `Open wearable`
- Status after upload: `Recording saved · 92% reliable` (only when that is the actual result)

**Good health alert behaviour**

- Title: `Health assessment needs attention`
- Message: Use the actual assessment output and approved action text.
- Actions: `Open assessment` and `Contact / follow mission medical protocol` as configured.
- Do not show XP, badge animation or a “mission failed” message in this state.

**Avoid**

- “You failed your health mission.”
- “Your body score is 92.”
- “You are cleared for EVA.”
- “You are safe on Mars.”
- “Complete this task to lower your radiation risk.”

---

## 17. Offline operation and data privacy

- All mission templates and current task state should be available locally after installation.
- Task completion, XP, badge unlocking and timeline snapshots must work offline.
- Do not require a cloud account or a network connection for mission progression.
- If future crew synchronisation is added, encrypt data in transit and at rest and use explicit role-based access.
- Keep personal health measurements private to the astronaut and authorised medical roles.
- Store only the minimum information needed for mission progress. Mission events should reference existing measurement records rather than copy raw clinical values.
- Provide export and delete behaviour consistent with the existing History feature.
- Retain an audit record for edits to mission schedules and task status.

---

## 18. Acceptance criteria

### Functional

- [ ] Mission appears as a new route without changing the existing app layout or theme.
- [ ] Status page shows a compact active-mission summary.
- [ ] User can start, pause, resume, defer and archive a mission.
- [ ] User can open the existing Check-in, Wearable, Gravity and History pages from relevant tasks.
- [ ] Task completion links to a real saved record or is explicitly labelled self-attested / simulated.
- [ ] Suit-up rehearsal is clearly identified as a simulation and does not claim to verify suit systems.
- [ ] Spacecraft transit progress is a narrative timeline, not real navigation telemetry.
- [ ] Daily and weekly adherence graphs render correctly with missing/no-task days.
- [ ] Health trends display real units, timestamps and source labels.
- [ ] Achievements unlock once and XP cannot be duplicated by replaying the same event.
- [ ] Local data persists after refresh and desktop app restart.
- [ ] Existing records migrate safely when the optional `mission` field is absent.

### Safety and scientific integrity

- [ ] Abnormal health results do not reduce XP or cause mission failure.
- [ ] A health alert blocks or pauses routine gamification and takes priority.
- [ ] No leaderboard exposes private health information.
- [ ] No simulated value is displayed as a measurement.
- [ ] No unvalidated composite health score is created.
- [ ] No model output is labelled as flight clearance or medical diagnosis.
- [ ] Reminders respect sleep windows and mission schedule exceptions.

### Quality

- [ ] Layout works on desktop, tablet and the existing round-watch companion display.
- [ ] Reduced-motion preference is respected.
- [ ] All controls are keyboard accessible and have visible focus states.
- [ ] Empty, loading, error, offline and no-data states are designed.
- [ ] Charts remain readable with sparse and irregular time-series data.

---

## 19. Suggested implementation order

### Phase 1 — Core mission layer

1. Add mission types and optional `Records.mission` state.
2. Add one reusable task catalogue and one mission template.
3. Add `/mission` route and navigation item.
4. Add active mission summary tile to Status.
5. Connect check-in, wearable and gravity tasks to current routes and saved record IDs.

### Phase 2 — Scenario experience

1. Implement Suit-Up & EVA Readiness sequence.
2. Implement Spacecraft Transit & Arrival timeline.
3. Implement Surface Traverse & Recovery sequence.
4. Add learning missions and short quizzes.
5. Add scenario illustration/state transitions without changing the global visual system.

### Phase 3 — Progress and rewards

1. Add idempotent XP and badge unlocking.
2. Add daily/weekly adherence calculations.
3. Add mission timeline and event log.
4. Extend `Chart.tsx` for readable date labels.
5. Add health trajectory selectors and source markers.

### Phase 4 — Robustness

1. Test offline persistence and migration.
2. Test duplicate event handling.
3. Test missing measurements, invalid sensor captures and deferred tasks.
4. Test alert-precedence behaviour.
5. Test privacy, export and delete controls.
6. Test small screens and reduced-motion mode.

---

## 20. Recommended first release

Do not implement every scenario at once. The first release should be small but complete:

1. **Mission page** with an active mission and a clear next task.
2. **Suit-Up & EVA Readiness** as the first interactive scenario.
3. **Spacecraft Transit** with three or four health checkpoints and an arrival Gravity simulation.
4. **XP and six simple badges** based only on task completion.
5. **Daily adherence line graph** and **separate physiological trend graph**.
6. **Status-page mission summary** and **mission event history**.
7. **Offline persistence** using the existing store.

This is enough to demonstrate the NASA challenge's gamification concept while keeping SAKTI focused on astronaut health monitoring.

---

## 21. References and implementation context

### Existing SAKTI implementation

- Repository: https://github.com/HarshPrajapati7/Shakti
- Main app and navigation: `apps/web/src/App.tsx`
- Status dashboard: `apps/web/src/pages/Status.tsx`
- Check-in and reaction-time test: `apps/web/src/pages/Checkin.tsx`
- Gravity scenario: `apps/web/src/pages/Gravity.tsx`
- Wearable recording: `apps/web/src/pages/Wearable.tsx`
- History: `apps/web/src/pages/History.tsx`
- Chart component: `apps/web/src/components/Chart.tsx`
- Local persistence: `apps/web/src/lib/store.ts`
- Current data contracts: `apps/web/src/lib/types.ts`

### Challenge context

The NASA Space Apps 2026 challenge asks for software that helps astronauts assess their own health, understand measurements and health risks, and take appropriate actions. Its potential considerations include recurring health tasks, dynamic charts, colour-coded indicators and simple explanations. This Mission Protocols feature is designed to implement the gamification and recurring-task part without replacing the medical monitoring functions.

### NASA research context

- NASA Human Research Program — Hazards: https://www.nasa.gov/hrp/hazards/
- NASA Human Research Program — Risks: https://www.nasa.gov/hrp/risks/
- NASA Human Research Program — Ongoing Research: https://www.nasa.gov/hrp/ongoing-hrp-research/
- NASA Human System Standard: https://www.nasa.gov/human-systems-integration-standards/

Use mission-approved operational and medical procedures for actual suit, EVA, exercise, sleep and medical tasks. This document defines the software feature and does not replace those procedures.

---

**End of specification**
