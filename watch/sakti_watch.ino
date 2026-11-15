/*
 * Sakti Watch — All-in-One 6-Vitals Dashboard + Live HR/Temp Face + Body Hologram + Remedy
 * Board: ESP32-C3  |  Screen: Round 240x240 GC9A01
 *
 * Screen Views:
 *   1. [VITALS DASHBOARD] All 6 vitals on ONE single screen:
 *      - Heart Rate, Blood Pressure, Blood Sugar, Body Temp, Sleep Hours, Mood
 *
 *   2. [LIVE HR & TEMP FACE] Dedicated Real-Time Face from Dashboard JSON API:
 *      - Live Heart Rate (24x24 Heart icon + Large BPM + Sinus Rhythm status + ECG bar)
 *      - Live Body Temperature (24x24 Temp icon + Large °C + Thermal status + Reference range)
 *      - Live JSON API connection & sync indicator
 *
 *   3. [BODY HOLOGRAM] Full permanent grey body + glowing red alert layers
 *
 *   4. [REMEDY PROTOCOL] Clinical countermeasure prescription for active alerts
 *
 * Controls (Pure Button-Controlled — No Auto-Switching):
 *   - DOWN (GPIO 2) or BOOT (GPIO 9) -> Next screen / Cycle body alert regions
 *   - UP   (GPIO 0)                  -> Previous screen / Reverse cycle body regions
 *   - OK   (GPIO 5)                  -> View Remedy countermeasures / Force instant API sync
 *   - BACK (GPIO 1)                  -> Return to previous view
 *   - HOME (GPIO 8)                  -> Instant jump to 6-Vitals Dashboard
 */

#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_GC9A01A.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include "body_parts.h"
#include "doto_font.h"
#include "vital_icons.h"

// ── TFT Pins ─────────────────────────────────────
#define TFT_SCLK 4
#define TFT_MOSI 6
#define TFT_DC   3
#define TFT_CS   10
#define TFT_RST  7

// ── Button Pins (Active LOW, internal pull-up) ───
#define BTN_UP    0  // UP navigation
#define BTN_DOWN  2  // DOWN navigation / Next
#define BTN_OK    5  // OK / Select / Remedy / Sync
#define BTN_BACK  1  // BACK navigation
#define BTN_HOME  8  // HOME / Return to Dashboard
#define BTN_BOOT  9  // ESP32-C3 Onboard BOOT Button (also advances view)

// ── Colors (RGB565) ──────────────────────────────
#define C_BG      0x0000   // Deep black
#define C_LINE    0x2945   // Hairline divider
#define C_TEXT    0xFFFF   // White
#define C_MUTE    0x8410   // Slate grey for units/labels
#define C_OK      0x07E0   // Bright green (nominal)
#define C_WATCH   0xFDA0   // Amber
#define C_AMBER   0xFDA0   // Amber
#define C_ALERT   0xF800   // Red (critical)
#define C_BTNBG   0x2124   // Button card bg
#define C_BTNHI   0x4A69   // Highlighted button
#define C_DOT_BG  0x10A2   // Ambient faint matrix dot

SPIClass spi_bus = SPIClass(FSPI);
Adafruit_GC9A01A tft(&spi_bus, TFT_DC, TFT_CS, TFT_RST);

// Centered body position: 170x170 on 240x240 circle
const int BX = 35;
const int BY = 32;

// ── WiFi & Dashboard JSON API Configuration ──────
const char* WIFI_SSID     = "YOUR_WIFI_SSID";           // Replace with your WiFi SSID
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";       // Replace with your WiFi Password
const char* API_HOST      = "http://192.168.0.125:3001";  // PC's LAN IP running Sakti API

// Live Telemetry parsed from Dashboard JSON API
float liveHR       = 68.0;   // Live Heart Rate (BPM)
float liveTemp     = 36.7;   // Live Body Temperature (°C)
float liveSBP      = 118.0;  // Systolic Blood Pressure (mmHg)
float liveDBP      = 75.0;   // Diastolic Blood Pressure (mmHg)
float liveGlucose  = 92.0;   // Blood Glucose (mg/dL)
float liveSleep    = 4.8;    // Sleep Duration (Hours)
int   liveMood     = 3;      // Mood state (1-5)

bool wifiConnected   = false;
bool apiSyncSuccess  = false;
unsigned long lastApiFetch = 0;
const unsigned long API_FETCH_INTERVAL = 6000; // Auto-fetch every 6 seconds
char lastJsonPayload[320] = "{\"hr\":68,\"temp_c\":36.7,\"sbp\":118,\"dbp\":75}";

// ── Screen Views ─────────────────────────────────
enum AppView {
  VIEW_VITALS_DASHBOARD = 0, // All 6 vitals on ONE single screen
  VIEW_HR_TEMP_LIVE,         // Dedicated Live Heart Rate & Temperature Face from JSON API
  VIEW_BODY_HOLOGRAM,        // Hologram with pulsing active alert layers
  VIEW_REMEDY                // Clinical remedy countermeasure view
};

AppView currentView = VIEW_VITALS_DASHBOARD;

// ── Body Alert Modes ─────────────────────────────
enum Mode {
  MODE_BASE = 0,
  MODE_HEAD,
  MODE_CHEST,
  MODE_STOMACH,
  MODE_ARMS,
  MODE_LEGS,
  MODE_FULL,
  MODE_COUNT
};

int curMode = MODE_BASE;

unsigned long lastPulse = 0;
const unsigned long PULSE_MS = 450;
bool pulseOn = false;

// ── Rock-Solid Button Debounce & Falling-Edge Engine ──
struct ButtonConfig {
  uint8_t pin;
  const char *name;
  bool isDown;              // Current debounced pressed state
  uint8_t lastReading;      // Raw reading from last sample
  unsigned long lastChange; // Time of last change
  bool clicked;             // Latched single falling-edge event
  bool disabledAtBoot;      // Set true if held LOW at power-up (e.g. GPIO 8 LED)
};

ButtonConfig buttons[] = {
  { BTN_UP,   "UP",   false, HIGH, 0, false, false },
  { BTN_DOWN, "DOWN", false, HIGH, 0, false, false },
  { BTN_OK,   "OK",   false, HIGH, 0, false, false },
  { BTN_BACK, "BACK", false, HIGH, 0, false, false },
  { BTN_HOME, "HOME", false, HIGH, 0, false, false },
  { BTN_BOOT, "BOOT", false, HIGH, 0, false, false }
};
const int NUM_BUTTONS = sizeof(buttons) / sizeof(buttons[0]);

// ── Remedy Protocols (Fitted strictly for 240x240 circle) ────
struct RemedyProtocol {
  const char* modeLabel;
  const char* title;
  const char* region;
  const char* cause;
  const char* s1;
  const char* s2;
  const char* s3;
  const char* rx;
};

const RemedyProtocol REMEDIES[MODE_COUNT] = {
  {
    "01: NOMINAL",
    "NOMINAL STATUS",
    "ALL BODY NOMINAL",
    "VITALS IN RANGE",
    "1. Hydrate 2.5L/day",
    "2. Daily ARED 2.5h",
    "3. Log check-in",
    "Rx: Standard Diet"
  },
  {
    "02: HEAD / EYE",
    "NEURO / SANS",
    "HEAD & OPTIC EYE",
    "CEPHALAD FLUID SHIFT",
    "1. 500mL oral saline",
    "2. 15-deg head tilt",
    "3. Low cabin CO2",
    "Rx: Fundus Exam"
  },
  {
    "03: CHEST/HEART",
    "CARDIOVASCULAR",
    "HEART & CHEST",
    "STROKE VOLUME DROP",
    "1. LBNP 30mmHg 20m",
    "2. 1.2L electrolytes",
    "3. Recumbent rest",
    "Rx: LBNP Chamber"
  },
  {
    "04: STOMACH/GUT",
    "GUT / METABOLIC",
    "STOMACH & DIGEST",
    "SPACE MOTION SICK",
    "1. Promethazine 25mg",
    "2. Ginger infusion",
    "3. Defer EVA tasks",
    "Rx: Antiemetics"
  },
  {
    "05: ARMS/UPPER",
    "UPPER MUSCLE",
    "ARMS & SHOULDERS",
    "MICROGRAVITY ATROPHY",
    "1. ARED bands 25min",
    "2. 25g whey protein",
    "3. Heat pad 15min",
    "Rx: Resistive Bands"
  },
  {
    "06: LEGS/POOL",
    "VENOUS POOLING",
    "LEGS, KNEES, FEET",
    "ORTHOSTATIC POOLING",
    "1. Don G-suit 35mmHg",
    "2. 1L water + salt",
    "3. 50 calf pumps",
    "Rx: G-Suit Cuffs"
  },
  {
    "07: MULTI-ALERT",
    "MULTI-ALERT",
    "CARDIO & NEURO",
    "ACUTE DECOMPENSATION",
    "1. Cease workloads",
    "2. Anti-G suit 40mmHg",
    "3. Flight Surgeon",
    "Rx: Medical Hold"
  }
};

// ── Draw Centered Text Helper ────────────────────
void drawCenterText(int16_t y, const char* str, uint16_t color, uint8_t size = 1) {
  int16_t len = strlen(str);
  int16_t w = len * 6 * size;
  int16_t x = 120 - (w / 2);
  tft.setTextSize(size);
  tft.setTextColor(color);
  tft.setCursor(x, y);
  tft.print(str);
}

// ── Draw Permanent Grey Body ─────────────────────
void drawGreyBody() {
  tft.drawRGBBitmap(BX, BY, (const uint16_t*)grey_image, 170, 170);
}

// ── Fast Single-Pass Layer Renderer (Zero Division/Modulo) ───
void drawModeLayer(bool alertColor) {
  tft.startWrite();
  int16_t x = BX;
  int16_t y = BY;

  for (int16_t i = 0; i < 28900; i++) {
    bool active = false;
    switch (curMode) {
      case MODE_HEAD:
        active = (head[i] != 0 || face[i] != 0 || neck[i] != 0);
        break;
      case MODE_CHEST:
        active = (left_chest[i] != 0 || right_chest[i] != 0);
        break;
      case MODE_STOMACH:
        active = (stomach[i] != 0);
        break;
      case MODE_ARMS:
        active = (left_shoulder[i] != 0 || right_shoulder[i] != 0 ||
                  left_biceps[i] != 0   || right_biceps[i] != 0 ||
                  left_fore_arm[i] != 0 || right_fore_arm[i] != 0 ||
                  left_palm[i] != 0     || right_palm[i] != 0);
        break;
      case MODE_LEGS:
        active = (left_thigh[i] != 0 || right_thigh[i] != 0 ||
                  left_knee[i] != 0  || right_knee[i] != 0 ||
                  left_leg[i] != 0   || right_leg[i] != 0 ||
                  left_foot[i] != 0  || right_foot[i] != 0);
        break;
      case MODE_FULL:
        active = (head[i] != 0 || left_chest[i] != 0 || right_chest[i] != 0 ||
                  stomach[i] != 0 || left_foot[i] != 0 || right_foot[i] != 0);
        break;
      default:
        break;
    }
    if (active) {
      tft.writePixel(x, y, alertColor ? C_ALERT : grey_image[i]);
    }
    x++;
    if (x == BX + 170) {
      x = BX;
      y++;
    }
  }
  tft.endWrite();
}

// ── Left Side [Rx] Button Icon on Body Screen ────
void drawRxBtn(bool hi) {
  uint16_t accent = (curMode == MODE_BASE) ? C_OK : C_ALERT;
  tft.fillRoundRect(7, 102, 20, 36, 4, hi ? C_BTNHI : C_BTNBG);
  tft.drawRoundRect(7, 102, 20, 36, 4, accent);
  tft.setTextSize(1);
  tft.setTextColor(C_TEXT);
  tft.setCursor(12, 107);
  tft.print("R");
  tft.setTextColor(accent);
  tft.setCursor(12, 121);
  tft.print("x");
}

// ── Built-in Zero-Dependency Fast JSON Value Extractor ───
float parseJsonFloat(const String& json, const char* key, float fallback) {
  String searchKey = String("\"") + key + "\":";
  int idx = json.indexOf(searchKey);
  if (idx < 0) {
    searchKey = String("\"") + key + "\" :";
    idx = json.indexOf(searchKey);
    if (idx < 0) return fallback;
  }
  idx += searchKey.length();
  while (idx < json.length() && (json[idx] == ' ' || json[idx] == '\t')) idx++;
  int endIdx = idx;
  while (endIdx < json.length() && (json[endIdx] == '-' || json[endIdx] == '.' || (json[endIdx] >= '0' && json[endIdx] <= '9'))) {
    endIdx++;
  }
  if (endIdx > idx) {
    return json.substring(idx, endIdx).toFloat();
  }
  return fallback;
}

// ── Fast Non-Blocking API Fetch in JSON Format ────
bool fetchVitalsFromApi() {
  if (WiFi.status() != WL_CONNECTED) {
    wifiConnected = false;
    return false;
  }
  wifiConnected = true;

  HTTPClient http;
  String url = String(API_HOST) + "/api/vitals";
  http.begin(url);
  http.setTimeout(400); // Fast 400ms timeout: never blocks button scan

  int httpCode = http.GET();
  bool updated = false;

  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    strncpy(lastJsonPayload, payload.c_str(), sizeof(lastJsonPayload) - 1);

    if (payload.indexOf("\"hr\"") >= 0 || payload.indexOf("\"temp_c\"") >= 0) {
      liveHR      = parseJsonFloat(payload, "hr", liveHR);
      liveTemp    = parseJsonFloat(payload, "temp_c", liveTemp);
      liveSBP     = parseJsonFloat(payload, "sbp", liveSBP);
      liveDBP     = parseJsonFloat(payload, "dbp", liveDBP);
      liveGlucose = parseJsonFloat(payload, "glucose", liveGlucose);
      liveSleep   = parseJsonFloat(payload, "sleep_h", liveSleep);
      liveMood    = (int)parseJsonFloat(payload, "mood", liveMood);
      apiSyncSuccess = true;
      updated = true;
      Serial.printf("[JSON API] Sync OK -> HR: %.0f BPM | Temp: %.1f C | SBP/DBP: %.0f/%.0f\n",
                    liveHR, liveTemp, liveSBP, liveDBP);
    }
  }
  http.end();
  return updated;
}

// ═══════════════════════════════════════════════════
//  SCREEN 1: ALL-IN-ONE 6-VITALS DASHBOARD
// ═══════════════════════════════════════════════════
void drawVitalsDashboard() {
  tft.fillScreen(C_BG);

  // Outer subtle circular ring
  tft.drawCircle(120, 120, 117, C_LINE);

  // Top Title in Doto font (At Y=14, safe chord 100px)
  drawDotoCenter(tft, 120, 14, "CREW VITALS", C_TEXT, C_DOT_BG, 1, 2);

  // Top header divider
  tft.drawFastHLine(60, 28, 120, C_LINE);

  // Dynamic values linked to live API
  char hrVal[16];
  snprintf(hrVal, sizeof(hrVal), "%.0f BPM", liveHR);
  uint16_t hrCol = (liveHR > 95 || liveHR < 50) ? C_ALERT : ((liveHR > 85) ? C_WATCH : C_OK);

  char bpVal[16];
  snprintf(bpVal, sizeof(bpVal), "%.0f/%.0f", liveSBP, liveDBP);
  uint16_t bpCol = (liveSBP > 135 || liveDBP > 90) ? C_ALERT : C_OK;

  char gluVal[16];
  snprintf(gluVal, sizeof(gluVal), "%.0f mg", liveGlucose);
  uint16_t gluCol = (liveGlucose > 120) ? C_WATCH : C_OK;

  char tmpVal[16];
  snprintf(tmpVal, sizeof(tmpVal), "%.1f C", liveTemp);
  uint16_t tmpCol = (liveTemp > 37.8 || liveTemp < 35.5) ? C_ALERT : ((liveTemp > 37.2) ? C_WATCH : C_OK);

  char slpVal[16];
  snprintf(slpVal, sizeof(slpVal), "%.1f HRS", liveSleep);
  uint16_t slpCol = (liveSleep < 6.0) ? C_WATCH : C_OK;

  const char* modVal = (liveHR > 95 || liveTemp > 37.8) ? "ALERT" : "OPTIMAL";
  uint16_t modCol = (liveHR > 95 || liveTemp > 37.8) ? C_ALERT : C_OK;

  // ── ROW 1: Heart Rate & Blood Pressure ───────────
  // HR (Col 1: X=35..108, Y=40..70)
  tft.drawRGBBitmap(35, 42, (const uint16_t*)icon_heart, 24, 24);
  tft.setTextSize(1);
  tft.setTextColor(C_MUTE);
  tft.setCursor(62, 42);
  tft.print("HEART");
  tft.setTextColor(hrCol);
  tft.setCursor(62, 54);
  tft.print(hrVal);

  // BP (Col 2: X=124..194, Y=40..70)
  tft.drawRGBBitmap(124, 42, (const uint16_t*)icon_bp, 24, 24);
  tft.setTextColor(C_MUTE);
  tft.setCursor(152, 42);
  tft.print("BLOOD");
  tft.setTextColor(bpCol);
  tft.setCursor(152, 54);
  tft.print(bpVal);

  // Divider between Row 1 and Row 2
  tft.drawFastHLine(35, 78, 170, C_LINE);

  // ── ROW 2: Blood Sugar & Body Temperature ────────
  // Glucose (Col 1: X=26..104, Y=94..124)
  tft.drawRGBBitmap(26, 94, (const uint16_t*)icon_sugar, 24, 24);
  tft.setTextColor(C_MUTE);
  tft.setCursor(54, 94);
  tft.print("SUGAR");
  tft.setTextColor(gluCol);
  tft.setCursor(54, 106);
  tft.print(gluVal);

  // Temp (Col 2: X=124..194, Y=94..124)
  tft.drawRGBBitmap(124, 94, (const uint16_t*)icon_temp, 24, 24);
  tft.setTextColor(C_MUTE);
  tft.setCursor(152, 94);
  tft.print("TEMP");
  tft.setTextColor(tmpCol);
  tft.setCursor(152, 106);
  tft.print(tmpVal);

  // Divider between Row 2 and Row 3
  tft.drawFastHLine(35, 130, 170, C_LINE);

  // ── ROW 3: Sleep Hours & Mood State ──────────────
  // Sleep (Col 1: X=35..108, Y=146..176)
  tft.drawRGBBitmap(35, 146, (const uint16_t*)icon_sleep, 24, 24);
  tft.setTextColor(C_MUTE);
  tft.setCursor(62, 146);
  tft.print("SLEEP");
  tft.setTextColor(slpCol);
  tft.setCursor(62, 158);
  tft.print(slpVal);

  // Mood (Col 2: X=124..194, Y=146..176)
  tft.drawRGBBitmap(124, 146, (const uint16_t*)icon_mood, 24, 24);
  tft.setTextColor(C_MUTE);
  tft.setCursor(152, 146);
  tft.print("MOOD");
  tft.setTextColor(modCol);
  tft.setCursor(152, 158);
  tft.print(modVal);

  // Vertical center hairline divider
  tft.drawFastVLine(120, 36, 146, C_LINE);

  // Bottom footer divider
  tft.drawFastHLine(55, 192, 130, C_LINE);

  // Navigation hint (At Y=202 & 214, safe chords 162px / 137px)
  drawCenterText(202, "[DOWN: LIVE] [UP: BODY]", C_TEXT, 1);
  drawCenterText(214, "[OK: LIVE] [HOME: DASH]", C_MUTE, 1);
}

// ═══════════════════════════════════════════════════
//  SCREEN 2: DEDICATED LIVE HR & TEMPERATURE FACE
// ═══════════════════════════════════════════════════
void drawHrTempLiveFace() {
  tft.fillScreen(C_BG);

  // Outer circular ring
  tft.drawCircle(120, 120, 117, C_LINE);

  // Top Title in Doto font (At Y=14, safe chord 110px)
  drawDotoCenter(tft, 120, 14, "LIVE TELEMETRY", C_TEXT, C_DOT_BG, 1, 2);

  // WiFi / Sync pill at Y=30
  uint16_t syncCol = (wifiConnected && apiSyncSuccess) ? C_OK : (wifiConnected ? C_WATCH : C_MUTE);
  const char* syncTxt = (wifiConnected && apiSyncSuccess) ? "API: JSON SYNCED" :
                        (wifiConnected ? "API: CONNECTING" : "API: OFFLINE DEMO");
  tft.drawFastHLine(60, 27, 120, C_LINE);
  drawCenterText(32, syncTxt, syncCol, 1);

  // ── UPPER HALF: HEART BEAT (BPM) ─────────────────
  // Heart Icon (24x24)
  tft.drawRGBBitmap(34, 52, (const uint16_t*)icon_heart, 24, 24);

  // Label
  tft.setTextSize(1);
  tft.setTextColor(C_MUTE);
  tft.setCursor(64, 48);
  tft.print("HEART RATE");

  // Large numeric BPM
  char hrBuf[16];
  snprintf(hrBuf, sizeof(hrBuf), "%d", (int)round(liveHR));
  tft.setTextSize(3);
  uint16_t hrColor = (liveHR > 95 || liveHR < 50) ? C_ALERT : ((liveHR > 85) ? C_WATCH : C_OK);
  tft.setTextColor(hrColor);
  tft.setCursor(64, 60);
  tft.print(hrBuf);

  // BPM unit
  tft.setTextSize(1);
  tft.setTextColor(C_MUTE);
  tft.setCursor(64 + (strlen(hrBuf) * 18) + 4, 72);
  tft.print("BPM");

  // Dynamic rhythm status tag
  const char* hrStatus = (liveHR > 95) ? "TACHYCARDIA" :
                         ((liveHR < 50) ? "BRADYCARDIA" : "NORMAL SINUS");
  tft.setTextColor(hrColor);
  tft.setCursor(64, 88);
  tft.print(hrStatus);

  // Mini Pulse ECG indicator bar
  for (int x = 0; x < 7; x++) {
    int barH = (x == 3) ? 10 : ((x == 2 || x == 4) ? 5 : 2);
    tft.drawFastVLine(160 + (x * 4), 68 - (barH / 2), barH, hrColor);
  }

  // Center horizontal divider at Y=114
  tft.drawFastHLine(30, 114, 180, C_LINE);

  // ── LOWER HALF: BODY TEMPERATURE (°C) ────────────
  // Temp Icon (24x24)
  tft.drawRGBBitmap(34, 128, (const uint16_t*)icon_temp, 24, 24);

  // Label
  tft.setTextSize(1);
  tft.setTextColor(C_MUTE);
  tft.setCursor(64, 124);
  tft.print("BODY TEMP");

  // Large numeric Temp (e.g. "36.7")
  char tempBuf[16];
  snprintf(tempBuf, sizeof(tempBuf), "%.1f", liveTemp);
  tft.setTextSize(3);
  uint16_t tempColor = (liveTemp > 37.8 || liveTemp < 35.5) ? C_ALERT :
                       ((liveTemp > 37.2) ? C_WATCH : C_OK);
  tft.setTextColor(tempColor);
  tft.setCursor(64, 136);
  tft.print(tempBuf);

  // °C unit
  tft.setTextSize(1);
  tft.setTextColor(C_MUTE);
  tft.setCursor(64 + (strlen(tempBuf) * 18) + 4, 148);
  tft.print("C");

  // Dynamic thermal status tag
  const char* tempStatus = (liveTemp > 37.8) ? "FEVER ALERT" :
                           ((liveTemp < 35.5) ? "HYPOTHERMIA" : "NORMOTHERMIC");
  tft.setTextColor(tempColor);
  tft.setCursor(64, 164);
  tft.print(tempStatus);

  // Target range hint
  tft.setTextColor(C_MUTE);
  tft.setCursor(64, 176);
  tft.print("Ref: 36.5 - 37.5 C");

  // Bottom footer divider at Y=192
  tft.drawFastHLine(55, 192, 130, C_LINE);

  // Navigation hint at Y=202 & 214
  drawCenterText(202, "[DOWN: BODY] [UP: DASH]", C_TEXT, 1);
  drawCenterText(214, "[OK: SYNC JSON]", C_MUTE, 1);
}

// ═══════════════════════════════════════════════════
//  SCREEN 3: ASTRONAUT BODY HOLOGRAM VIEW
// ═══════════════════════════════════════════════════
void drawHUD() {
  const RemedyProtocol &r = REMEDIES[curMode];
  uint16_t statusCol = (curMode == MODE_BASE) ? C_OK : C_ALERT;

  // Top Title in Doto font (At Y=14, safe chord 100px)
  tft.fillRect(60, 12, 120, 18, C_BG);
  drawDotoCenter(tft, 120, 14, "BODY MONITOR", C_TEXT, C_DOT_BG, 1, 2);

  // Bottom Status Banner (At Y=198, safe chord 168px)
  tft.fillRect(35, 198, 170, 15, C_BG);
  drawCenterText(198, r.modeLabel, statusCol, 1);

  // Navigation Hint (At Y=213, safe chord 135px)
  tft.fillRect(40, 213, 160, 15, C_BG);
  drawCenterText(213, "[DOWN]NEXT [OK]RX [UP]LIVE", C_MUTE, 1);

  // Left Side [Rx] button icon
  drawRxBtn(false);
}

void drawBodyView() {
  tft.fillScreen(C_BG);
  drawGreyBody();
  drawHUD();
  pulseOn = true;
  if (curMode != MODE_BASE) {
    drawModeLayer(true);
  }
  lastPulse = millis();
}

// ═══════════════════════════════════════════════════
//  SCREEN 4: CLINICAL REMEDY COUNTERMEASURE VIEW
// ═══════════════════════════════════════════════════
void drawRemedyView() {
  const RemedyProtocol &r = REMEDIES[curMode];
  uint16_t accent = (curMode == MODE_BASE) ? C_OK : C_ALERT;

  tft.fillScreen(C_BG);
  tft.drawCircle(120, 120, 117, C_LINE);

  // Header Pill (At Y=14: 110px pill, safe chord 110px)
  tft.fillRoundRect(65, 14, 110, 18, 4, accent);
  tft.setTextSize(1);
  tft.setTextColor(C_BG);
  tft.setCursor(77, 19);
  tft.print("REMEDY");

  // Target Region (Y=38: safe chord 174px)
  drawCenterText(38, r.region, C_TEXT, 1);

  // Cause Tag (Y=56: safe chord 196px)
  drawCenterText(56, r.cause, C_AMBER, 1);

  // Divider
  tft.drawFastHLine(40, 72, 160, C_LINE);

  // Action Steps (Y=86, 108, 130: safe chord 220px)
  drawCenterText(86, r.s1, C_OK, 1);
  drawCenterText(108, r.s2, C_OK, 1);
  drawCenterText(130, r.s3, C_OK, 1);

  // Divider
  tft.drawFastHLine(45, 150, 150, C_LINE);

  // Prescribed Gear/Med (Y=164: safe chord 210px)
  drawCenterText(164, r.rx, C_AMBER, 1);

  // Exit Instruction (Y=198: safe chord 168px)
  drawCenterText(198, "[ OK / BACK: RETURN ]", C_MUTE, 1);
}

// ── Refresh Screen Based on Current View ─────────
void refreshScreen() {
  switch (currentView) {
    case VIEW_VITALS_DASHBOARD:
      drawVitalsDashboard();
      break;
    case VIEW_HR_TEMP_LIVE:
      drawHrTempLiveFace();
      break;
    case VIEW_BODY_HOLOGRAM:
      drawBodyView();
      break;
    case VIEW_REMEDY:
      drawRemedyView();
      break;
  }
}

// ── Robust Non-Blocking Falling-Edge Button Scanner ────
void scanButtons() {
  unsigned long now = millis();
  for (int i = 0; i < NUM_BUTTONS; i++) {
    if (buttons[i].disabledAtBoot) continue; // Skip permanently stuck pins (e.g. onboard LED)

    uint8_t raw = digitalRead(buttons[i].pin);

    if (raw != buttons[i].lastReading) {
      buttons[i].lastChange = now;
      buttons[i].lastReading = raw;
    }

    if ((now - buttons[i].lastChange) >= 20) {
      if (raw == LOW && !buttons[i].isDown) {
        // Falling edge: physical button pressed down!
        buttons[i].isDown = true;
        buttons[i].clicked = true;
      } else if (raw == HIGH && buttons[i].isDown) {
        // Rising edge: button released
        buttons[i].isDown = false;
      }
    }
  }
}

int getClickedButton() {
  for (int i = 0; i < NUM_BUTTONS; i++) {
    if (buttons[i].clicked) {
      buttons[i].clicked = false; // consume click event once
      return buttons[i].pin;
    }
  }
  return -1;
}

// ═══════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);

  // Configure all button pins with internal pull-ups
  for (int i = 0; i < NUM_BUTTONS; i++) {
    pinMode(buttons[i].pin, INPUT_PULLUP);
    buttons[i].lastReading = digitalRead(buttons[i].pin);
  }

  delay(60);
  Serial.println("\n==========================================");
  Serial.println("  SAKTI SMARTWATCH — 6-VITALS & TELEMETRY ");
  Serial.println("==========================================");
  for (int i = 0; i < NUM_BUTTONS; i++) {
    uint8_t s1 = digitalRead(buttons[i].pin);
    delay(15);
    uint8_t s2 = digitalRead(buttons[i].pin);

    // If pin is LOW continuously at boot, check if it's the onboard LED (GPIO 8)
    if (s1 == LOW && s2 == LOW) {
      if (buttons[i].pin == BTN_HOME) {
        // On ESP32-C3 SuperMini, GPIO 8 is wired to the blue LED circuit, pulling it LOW!
        buttons[i].disabledAtBoot = true;
        Serial.printf("  BTN_%-4s (GPIO %2d): STUCK LOW (Onboard LED/Pull-down) -> Auto-disabled\n",
                      buttons[i].name, buttons[i].pin);
      } else {
        Serial.printf("  BTN_%-4s (GPIO %2d): HELD LOW at startup\n", buttons[i].name, buttons[i].pin);
      }
    } else {
      Serial.printf("  BTN_%-4s (GPIO %2d): HIGH (Ready)\n", buttons[i].name, buttons[i].pin);
    }
  }
  Serial.println("==========================================\n");

  // Non-blocking WiFi initialization
  if (strlen(WIFI_SSID) > 0 && strcmp(WIFI_SSID, "YOUR_WIFI_SSID") != 0) {
    Serial.printf("[WiFi] Connecting to %s...\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  } else {
    Serial.println("[WiFi] No credentials provided, running in standalone/demo mode.");
  }

  // Init SPI & GC9A01
  spi_bus.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);
  tft.begin(40000000);
  tft.setRotation(0);
  tft.fillScreen(C_BG);

  // Splash Screen with Doto font
  tft.drawCircle(120, 120, 117, C_OK);
  drawDotoCenter(tft, 120, 85, "SAKTI", C_TEXT, C_DOT_BG, 2, 4);
  drawDotoCenter(tft, 120, 125, "CREW MONITOR", C_OK, C_DOT_BG, 1, 2);
  delay(1200);

  // Start on the 6-Vitals Dashboard!
  currentView = VIEW_VITALS_DASHBOARD;
  refreshScreen();
}

// ═══════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  // ── 1. Periodic Non-Blocking API Fetch (JSON Format) ───
  if (now - lastApiFetch > API_FETCH_INTERVAL) {
    lastApiFetch = now;
    if (WiFi.status() == WL_CONNECTED) {
      if (!wifiConnected) {
        wifiConnected = true;
        Serial.printf("[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
      }
      bool updated = fetchVitalsFromApi();
      if (updated && (currentView == VIEW_HR_TEMP_LIVE || currentView == VIEW_VITALS_DASHBOARD)) {
        refreshScreen();
      }
    } else {
      wifiConnected = false;
    }
  }

  // ── 2. Scan & Process Button Events (Strictly User-Controlled) ─
  scanButtons();
  int clickedPin = getClickedButton();

  if (clickedPin >= 0) {
    Serial.printf(">>> BUTTON CLICKED: GPIO %d\n", clickedPin);

    if (clickedPin == BTN_DOWN || clickedPin == BTN_BOOT) {
      // Step forward: Dashboard -> Live HR/Temp Face -> Body Hologram (Regions) -> Dashboard
      if (currentView == VIEW_VITALS_DASHBOARD) {
        currentView = VIEW_HR_TEMP_LIVE;
      } else if (currentView == VIEW_HR_TEMP_LIVE) {
        currentView = VIEW_BODY_HOLOGRAM;
        curMode = MODE_HEAD;
      } else if (currentView == VIEW_BODY_HOLOGRAM) {
        curMode = (curMode + 1) % MODE_COUNT;
        if (curMode == MODE_BASE) {
          currentView = VIEW_VITALS_DASHBOARD;
        }
      } else if (currentView == VIEW_REMEDY) {
        currentView = VIEW_BODY_HOLOGRAM;
      }
      refreshScreen();
    }
    else if (clickedPin == BTN_UP) {
      // Step backward: Dashboard <- Live HR/Temp Face <- Body Hologram <- Dashboard
      if (currentView == VIEW_VITALS_DASHBOARD) {
        currentView = VIEW_BODY_HOLOGRAM;
        curMode = MODE_FULL;
      } else if (currentView == VIEW_HR_TEMP_LIVE) {
        currentView = VIEW_VITALS_DASHBOARD;
      } else if (currentView == VIEW_BODY_HOLOGRAM) {
        if (curMode == MODE_HEAD || curMode == MODE_BASE) {
          currentView = VIEW_HR_TEMP_LIVE;
        } else {
          curMode = (curMode - 1 + MODE_COUNT) % MODE_COUNT;
        }
      } else if (currentView == VIEW_REMEDY) {
        currentView = VIEW_BODY_HOLOGRAM;
      }
      refreshScreen();
    }
    else if (clickedPin == BTN_OK) {
      // Action: Force JSON Sync / Open Remedy Prescription / Return
      if (currentView == VIEW_HR_TEMP_LIVE) {
        Serial.println(">>> OK: Force refreshing JSON telemetry from API...");
        fetchVitalsFromApi();
        refreshScreen();
      } else if (currentView == VIEW_BODY_HOLOGRAM) {
        currentView = VIEW_REMEDY;
        refreshScreen();
      } else if (currentView == VIEW_REMEDY) {
        currentView = VIEW_BODY_HOLOGRAM;
        refreshScreen();
      } else if (currentView == VIEW_VITALS_DASHBOARD) {
        currentView = VIEW_HR_TEMP_LIVE;
        refreshScreen();
      }
    }
    else if (clickedPin == BTN_BACK) {
      // Back: Step out from Remedy -> Body -> Live Face -> Dashboard
      if (currentView == VIEW_REMEDY) {
        currentView = VIEW_BODY_HOLOGRAM;
      } else if (currentView == VIEW_BODY_HOLOGRAM) {
        currentView = VIEW_HR_TEMP_LIVE;
      } else if (currentView == VIEW_HR_TEMP_LIVE) {
        currentView = VIEW_VITALS_DASHBOARD;
      } else {
        currentView = VIEW_VITALS_DASHBOARD;
      }
      refreshScreen();
    }
    else if (clickedPin == BTN_HOME) {
      // Home: Always directly returns to Vitals Dashboard
      currentView = VIEW_VITALS_DASHBOARD;
      refreshScreen();
    }
  }

  // ── 3. Pulse Active Layer (Only in Body View when an alert region is active) ─
  if (currentView == VIEW_BODY_HOLOGRAM && curMode != MODE_BASE) {
    if (now - lastPulse > PULSE_MS) {
      lastPulse = now;
      pulseOn = !pulseOn;
      drawModeLayer(pulseOn);
    }
  }
}
