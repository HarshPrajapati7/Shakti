// wifi_source.cpp — DEMONSTRATION transport.
//
// Pulls the watch output from the Sakti host over WiFi using a single HTTP GET
// and parses the JSON body. This exists so the display can show live output on
// a bench, at a demo table, or over a laptop hotspot, without a flight suit.
// It is deliberately isolated behind the WatchSource interface so it can be
// removed entirely in a flight build (see suit_source.cpp).
//
// Expected response from SAKTI_API_URL (see README for the full contract):
//   {
//     "name": "Crew-01",
//     "status": "ok",                 // "ok" | "watch" | "alert"
//     "hr": 62, "spo2": 98,
//     "sbp": 117, "dbp": 75,
//     "temp_c": 36.7,
//     "task": "Baseline check-in",
//     "action": "Open check-in",
//     "updated": "2026-11-15T22:40:00Z",
//     "trend": [60,61,63,62,64]
//   }

#include "config.h"

#if SAKTI_TRANSPORT_WIFI

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "watch_source.h"

class WifiApiSource : public WatchSource {
 public:
  bool begin() override {
    WiFi.mode(WIFI_STA);
    WiFi.begin(SAKTI_WIFI_SSID, SAKTI_WIFI_PASSWORD);
    // Non-fatal: read() retries the association if it is not up yet.
    return true;
  }

  bool read(WatchData &out) override {
    if (WiFi.status() != WL_CONNECTED) {
      WiFi.begin(SAKTI_WIFI_SSID, SAKTI_WIFI_PASSWORD);
      snprintf(out.err, sizeof(out.err), "WiFi connecting...");
      return false;
    }

    HTTPClient http;
    http.setConnectTimeout(SAKTI_HTTP_TIMEOUT_MS);
    http.setTimeout(SAKTI_HTTP_TIMEOUT_MS);
    if (!http.begin(SAKTI_API_URL)) {
      snprintf(out.err, sizeof(out.err), "bad URL");
      return false;
    }

    const int code = http.GET();
    if (code != HTTP_CODE_OK) {
      snprintf(out.err, sizeof(out.err), "HTTP %d", code);
      http.end();
      return false;
    }

    // The watch document is small; a fixed arena avoids heap fragmentation.
    StaticJsonDocument<1024> doc;
    const DeserializationError jsonErr = deserializeJson(doc, http.getStream());
    http.end();
    if (jsonErr) {
      snprintf(out.err, sizeof(out.err), "JSON: %s", jsonErr.c_str());
      return false;
    }

    copyStr(out.name,   sizeof(out.name),   doc["name"]   | "Crew");
    copyStr(out.status, sizeof(out.status), doc["status"] | "ok");
    out.hr     = doc["hr"]     | -1;
    out.spo2   = doc["spo2"]   | -1;
    out.sbp    = doc["sbp"]    | -1;
    out.dbp    = doc["dbp"]    | -1;
    out.temp_c = doc["temp_c"] | NAN;
    copyStr(out.task,    sizeof(out.task),    doc["task"]    | "");
    copyStr(out.action,  sizeof(out.action),  doc["action"]  | "");
    copyStr(out.updated, sizeof(out.updated), doc["updated"] | "");

    out.trend_n = 0;
    JsonArrayConst tr = doc["trend"].as<JsonArrayConst>();
    for (int v : tr) {
      if (out.trend_n >= (int)(sizeof(out.trend) / sizeof(out.trend[0]))) break;
      out.trend[out.trend_n++] = v;
    }

    out.err[0] = '\0';
    out.valid = true;
    return true;
  }

  const char *label() override { return "WiFi demo"; }

 private:
  static void copyStr(char *dst, size_t n, const char *src) {
    if (!src) src = "";
    strncpy(dst, src, n - 1);
    dst[n - 1] = '\0';
  }
};

WatchSource *makeWatchSource() { return new WifiApiSource(); }

#endif  // SAKTI_TRANSPORT_WIFI
