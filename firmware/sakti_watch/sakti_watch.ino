// sakti_watch.ino — SAKTI round-watch firmware for the ESP32-C prototype.
//
// Drives a round GC9A01 240x240 SPI TFT and shows the crew member's current
// health output from the Sakti application: status, heart rate, SpO2, blood
// pressure, a heart-rate trend, and the next Mission-Protocol task. Four
// buttons switch views and refresh.
//
// The data source is chosen at build time in config.h:
//   - WiFi (demonstration only), or
//   - direct suit data bus (operational).
// Rendering here is identical for both; it consumes a WatchData value.
//
// Libraries (install from the Arduino Library Manager):
//   - GFX Library for Arduino  (Arduino_GFX, by moononournation)  >= 1.4
//   - ArduinoJson              (by Benoit Blanchon)               >= 6.21
// Board support: "esp32" by Espressif Systems (select your ESP32-C3/C6 board).
//
// See firmware/README.md for wiring, the API contract and the suit plan.

#include <Arduino_GFX_Library.h>
#include "config.h"
#include "watch_source.h"

// ---- Display --------------------------------------------------------------
// Hardware SPI data bus, then the GC9A01 panel on top of it.
static Arduino_DataBus *bus = new Arduino_ESP32SPI(
    TFT_DC_PIN, TFT_CS_PIN, TFT_SCLK_PIN, TFT_MOSI_PIN, GFX_NOT_DEFINED /* MISO unused */);
static Arduino_GFX *gfx = new Arduino_GC9A01(bus, TFT_RST_PIN, 0 /* rotation */, true /* IPS */);

static const int16_t CX = 120, CY = 120;  // centre of a 240x240 panel

// Palette aligned with the Sakti application (index.css status colours).
static const uint16_t COL_BG    = RGB565(0x17, 0x18, 0x1b);
static const uint16_t COL_INK   = RGB565(0xe7, 0xe6, 0xe1);
static const uint16_t COL_MUTE  = RGB565(0x8d, 0x8f, 0x96);
static const uint16_t COL_OK    = RGB565(0x6f, 0xc4, 0x9a);
static const uint16_t COL_WATCH = RGB565(0xe2, 0xad, 0x4c);
static const uint16_t COL_ALERT = RGB565(0xe0, 0x50, 0x3a);

// ---- Views ----------------------------------------------------------------
enum View { VIEW_SUMMARY = 0, VIEW_HEART, VIEW_PRESSURE, VIEW_MISSION, VIEW_COUNT };
static View view = VIEW_SUMMARY;

// ---- State ----------------------------------------------------------------
static WatchSource *source = nullptr;
static WatchData    data;
static unsigned long lastPoll = 0;
static bool          needRedraw = true;
static uint8_t       brightness = 1;  // used only if TFT_BL_PIN is wired

// ---- Buttons --------------------------------------------------------------
static const uint8_t BTN_PINS[4] = { BTN1_PIN, BTN2_PIN, BTN3_PIN, BTN4_PIN };
static bool          btnLast[4]  = { true, true, true, true };  // HIGH = released
static unsigned long btnAt[4]    = { 0, 0, 0, 0 };

static uint16_t statusColor(const char *s) {
  if (!strcmp(s, "alert")) return COL_ALERT;
  if (!strcmp(s, "watch")) return COL_WATCH;
  return COL_OK;
}

// Centre a text label horizontally at a given baseline y, using the current
// text size. Arduino_GFX glyphs are 6x8 pixels scaled by the text size.
static void drawCentered(const char *txt, int16_t y, uint8_t size, uint16_t color) {
  const int16_t w = (int16_t)strlen(txt) * 6 * size;
  gfx->setTextSize(size);
  gfx->setTextColor(color);
  gfx->setCursor(CX - w / 2, y);
  gfx->print(txt);
}

static void drawHeader(const char *title, uint16_t accent) {
  gfx->fillCircle(CX, 34, 4, accent);
  drawCentered(title, 56, 2, COL_INK);
}

static void drawFooter() {
  char line[40];
  snprintf(line, sizeof(line), "%s  %d/%d", source->label(), (int)view + 1, (int)VIEW_COUNT);
  drawCentered(line, 196, 1, COL_MUTE);
}

static void renderError() {
  gfx->fillScreen(COL_BG);
  drawHeader("SAKTI", COL_WATCH);
  drawCentered("No data", 104, 2, COL_INK);
  drawCentered(data.err[0] ? data.err : "waiting", 134, 1, COL_MUTE);
  drawFooter();
}

static void renderSummary() {
  const uint16_t c = statusColor(data.status);
  gfx->fillScreen(COL_BG);
  gfx->drawCircle(CX, CY, 116, c);
  drawHeader(data.name, c);

  char hr[8];
  snprintf(hr, sizeof(hr), "%d", data.hr);
  drawCentered(hr, 92, 6, COL_INK);
  drawCentered("bpm", 150, 2, COL_MUTE);

  char st[16];
  snprintf(st, sizeof(st), "%s", data.status);
  for (char *p = st; *p; ++p) *p = toupper(*p);
  drawCentered(st, 170, 2, c);
  drawFooter();
}

static void renderHeart() {
  gfx->fillScreen(COL_BG);
  drawHeader("Heart rate", COL_OK);
  // Trend sparkline inside the round area, autoscaled to its min/max.
  if (data.trend_n >= 2) {
    int lo = 9999, hi = -9999;
    for (int i = 0; i < data.trend_n; i++) { lo = min(lo, data.trend[i]); hi = max(hi, data.trend[i]); }
    if (hi == lo) hi = lo + 1;
    const int16_t x0 = 40, x1 = 200, y0 = 150, y1 = 90;
    int16_t px = x0, py = map(data.trend[0], lo, hi, y0, y1);
    for (int i = 1; i < data.trend_n; i++) {
      const int16_t x = map(i, 0, data.trend_n - 1, x0, x1);
      const int16_t y = map(data.trend[i], lo, hi, y0, y1);
      gfx->drawLine(px, py, x, y, COL_INK);
      px = x; py = y;
    }
    char rng[20];
    snprintf(rng, sizeof(rng), "%d - %d bpm", lo, hi);
    drawCentered(rng, 168, 1, COL_MUTE);
  } else {
    drawCentered("no trend yet", 118, 2, COL_MUTE);
  }
  char now[16];
  snprintf(now, sizeof(now), "now %d", data.hr);
  drawCentered(now, 88, 2, COL_INK);
  drawFooter();
}

static void renderPressure() {
  gfx->fillScreen(COL_BG);
  drawHeader("Vitals", COL_OK);
  char bp[16], spo2[16], temp[16];
  snprintf(bp, sizeof(bp), "%d/%d", data.sbp, data.dbp);
  snprintf(spo2, sizeof(spo2), "SpO2 %d%%", data.spo2);
  snprintf(temp, sizeof(temp), isnan(data.temp_c) ? "temp --" : "temp %.1fC", data.temp_c);
  drawCentered(bp, 92, 4, COL_INK);
  drawCentered("mmHg", 128, 1, COL_MUTE);
  drawCentered(spo2, 148, 2, COL_INK);
  drawCentered(temp, 172, 1, COL_MUTE);
  drawFooter();
}

static void renderMission() {
  gfx->fillScreen(COL_BG);
  drawHeader("Mission", statusColor(data.status));
  drawCentered(data.task[0] ? data.task : "No task", 96, 2, COL_INK);
  drawCentered(data.action[0] ? data.action : "-", 128, 2, COL_MUTE);
  drawFooter();
}

static void render() {
  if (!data.valid) { renderError(); return; }
  switch (view) {
    case VIEW_SUMMARY:  renderSummary();  break;
    case VIEW_HEART:    renderHeart();    break;
    case VIEW_PRESSURE: renderPressure(); break;
    case VIEW_MISSION:  renderMission();  break;
    default: break;
  }
}

// Returns the index (0..3) of a button that was just pressed, or -1.
static int pollButtons() {
  int hit = -1;
  const unsigned long t = millis();
  for (int i = 0; i < 4; i++) {
    const bool now = digitalRead(BTN_PINS[i]);     // HIGH idle, LOW pressed
    if (btnLast[i] && !now && (t - btnAt[i]) > BTN_DEBOUNCE_MS) {
      btnAt[i] = t;
      hit = i;
    }
    btnLast[i] = now;
  }
  return hit;
}

void setup() {
  Serial.begin(115200);

  for (int i = 0; i < 4; i++) pinMode(BTN_PINS[i], INPUT_PULLUP);
  if (TFT_BL_PIN >= 0) { pinMode(TFT_BL_PIN, OUTPUT); digitalWrite(TFT_BL_PIN, HIGH); }

  gfx->begin();
  gfx->fillScreen(COL_BG);
  drawCentered("SAKTI", 100, 3, COL_INK);
  drawCentered("starting", 140, 1, COL_MUTE);

  source = makeWatchSource();
  source->begin();
  lastPoll = millis() - SAKTI_POLL_INTERVAL_MS;  // poll immediately
}

void loop() {
  const int btn = pollButtons();
  if (btn == 0) { view = (View)((view + VIEW_COUNT - 1) % VIEW_COUNT); needRedraw = true; }
  else if (btn == 1) { view = (View)((view + 1) % VIEW_COUNT); needRedraw = true; }
  else if (btn == 2) { lastPoll = millis() - SAKTI_POLL_INTERVAL_MS; }      // force refresh
  else if (btn == 3) {                                                      // toggle backlight
    brightness ^= 1;
    if (TFT_BL_PIN >= 0) digitalWrite(TFT_BL_PIN, brightness ? HIGH : LOW);
  }

  if (millis() - lastPoll >= SAKTI_POLL_INTERVAL_MS) {
    lastPoll = millis();
    WatchData fresh;
    if (source->read(fresh)) { data = fresh; }
    else { data.valid = false; strncpy(data.err, fresh.err, sizeof(data.err)); }
    needRedraw = true;
  }

  if (needRedraw) { render(); needRedraw = false; }
  delay(10);
}
