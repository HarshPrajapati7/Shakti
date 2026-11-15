const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// ── Records storage ─────────────────────────────
// The web app stores records in localStorage; this API keeps its own copy
// so the ESP32 watch can read it. The web app can POST to /api/sync to push
// its records here, or you can use the shared file written by the desktop app.
const RECORDS_FILE = path.join(__dirname, "records.json");

function loadRecords() {
  try {
    return JSON.parse(fs.readFileSync(RECORDS_FILE, "utf-8"));
  } catch {
    return { checkins: [], recordings: [], gravity: [] };
  }
}

function saveRecords(data) {
  fs.writeFileSync(RECORDS_FILE, JSON.stringify(data, null, 2));
}

// Initialise file if missing
if (!fs.existsSync(RECORDS_FILE)) saveRecords({ checkins: [], recordings: [], gravity: [] });

// ── POST /api/sync — web app pushes its full records here ──
app.post("/api/sync", (req, res) => {
  const data = req.body;
  if (!data || !Array.isArray(data.checkins)) {
    return res.status(400).json({ error: "invalid records" });
  }
  saveRecords(data);
  console.log(`Synced ${data.checkins.length} check-ins, ${(data.gravity || []).length} gravity runs`);
  res.json({ ok: true, checkins: data.checkins.length });
});

// ── GET /api/status — overall health status ─────
app.get("/api/status", (req, res) => {
  const r = loadRecords();
  const last = (r.checkins || []).at(-1);
  if (!last) return res.json({ overall: "none", baseline_days: 0, checkin_count: 0 });
  res.json({
    overall: last.result.overall,
    baseline_days: last.result.baseline_days,
    date: last.date,
    checkin_count: r.checkins.length,
  });
});

// ── GET /api/vitals — latest raw vitals ─────────
app.get("/api/vitals", (req, res) => {
  const r = loadRecords();
  const last = (r.checkins || []).at(-1);
  if (!last) return res.json({});
  res.json(last.vitals);
});

// ── GET /api/readings — vital readings with status (compact for ESP32) ──
app.get("/api/readings", (req, res) => {
  const r = loadRecords();
  const last = (r.checkins || []).at(-1);
  if (!last) return res.json([]);
  res.json(
    last.result.readings.map((rd) => ({
      k: rd.key,
      l: rd.label,
      v: rd.value,
      u: rd.unit,
      s: rd.status,
      n: rd.note,
    }))
  );
});

// ── GET /api/systems — all body systems ─────────
app.get("/api/systems", (req, res) => {
  const r = loadRecords();
  const last = (r.checkins || []).at(-1);
  if (!last) return res.json([]);
  res.json(
    last.result.systems.map((s) => ({
      id: s.id,
      label: s.label,
      status: s.status,
    }))
  );
});

// ── GET /api/system/:id — single system detail ──
app.get("/api/system/:id", (req, res) => {
  const r = loadRecords();
  const last = (r.checkins || []).at(-1);
  if (!last) return res.status(404).json({ error: "no data" });
  const sys = last.result.systems.find((s) => s.id === req.params.id);
  if (!sys) return res.status(404).json({ error: "system not found" });
  res.json(sys);
});

// ── GET /api/gravity — latest gravity sim ───────
app.get("/api/gravity", (req, res) => {
  const r = loadRecords();
  const last = (r.gravity || []).at(-1);
  if (!last) return res.json({ status: "none" });
  res.json({
    status: last.status,
    margin: last.margin,
    destination: last.destination,
    date: last.date,
  });
});

// ── Body parts mapping logic ────────────────────
let manualActiveParts = null;

function getActiveBodyParts(lastC, lastG) {
  if (manualActiveParts && manualActiveParts.length > 0) return manualActiveParts;
  const parts = new Set();
  if (lastC && lastC.result && Array.isArray(lastC.result.systems)) {
    for (const sys of lastC.result.systems) {
      if (sys.status !== "ok") {
        const id = (sys.id || "").toLowerCase();
        const label = (sys.label || "").toLowerCase();
        if (id.includes("cardio") || id.includes("resp") || label.includes("heart") || label.includes("circulation") || label.includes("breathing")) {
          parts.add("left_chest");
          parts.add("right_chest");
        }
        if (id.includes("neuro") || label.includes("brain") || label.includes("sleep") || label.includes("alertness") || label.includes("eye")) {
          parts.add("head");
          parts.add("face");
        }
        if (id.includes("meta") || id.includes("renal") || label.includes("metabolism") || label.includes("immunity")) {
          parts.add("stomach");
        }
        if (id.includes("musculo") || label.includes("muscle") || label.includes("bone")) {
          parts.add("left_thigh");
          parts.add("right_thigh");
          parts.add("left_leg");
          parts.add("right_leg");
        }
      }
    }
  }
  if (lastG && typeof lastG.margin === "number" && lastG.margin < 0) {
    parts.add("left_foot");
    parts.add("right_foot");
    parts.add("left_leg");
    parts.add("right_leg");
  }
  return Array.from(parts);
}

// ── GET/POST /api/test-parts — override parts for testing UI ──
app.get("/api/test-parts", (req, res) => {
  res.json({ active_parts: manualActiveParts || [] });
});

app.post("/api/test-parts", (req, res) => {
  manualActiveParts = Array.isArray(req.body.parts) ? req.body.parts : null;
  console.log("Updated active body parts:", manualActiveParts);
  res.json({ ok: true, active_parts: manualActiveParts });
});

// ── GET /api/summary — everything in one call (saves ESP32 round-trips) ──
app.get("/api/summary", (req, res) => {
  const r = loadRecords();
  const lastC = (r.checkins || []).at(-1);
  const lastG = (r.gravity || []).at(-1);

  res.json({
    status: lastC
      ? { overall: lastC.result.overall, baseline_days: lastC.result.baseline_days, checkin_count: r.checkins.length }
      : { overall: "none", baseline_days: 0, checkin_count: 0 },
    vitals: lastC ? lastC.vitals : {},
    readings: lastC
      ? lastC.result.readings.slice(0, 8).map((rd) => ({
          l: rd.label, v: rd.value, u: rd.unit, s: rd.status,
        }))
      : [],
    systems: lastC
      ? lastC.result.systems.map((s) => ({ l: s.label, s: s.status }))
      : [],
    gravity: lastG
      ? { s: lastG.status, m: lastG.margin, d: lastG.destination }
      : { s: "none" },
    parts: getActiveBodyParts(lastC, lastG),
  });
});

// ── Start ───────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  Sakti API running on http://0.0.0.0:${PORT}`);
  console.log(`  ESP32 should connect to http://<YOUR_PC_IP>:${PORT}`);
  console.log(`  Test: http://localhost:${PORT}/api/status\n`);
});

