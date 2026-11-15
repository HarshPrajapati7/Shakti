// watch_source.h — transport-agnostic data model for the SAKTI watch.
//
// The display never knows where the numbers came from. It renders a WatchData
// value. A WatchSource produces that value. Two sources are provided:
//
//   WifiApiSource   demonstration transport over WiFi/HTTP (wifi_source.cpp)
//   SuitLinkSource  operational transport over the suit data bus (suit_source.cpp)
//
// The active source is chosen at build time in config.h and returned by
// makeWatchSource(). Adding a third transport later means adding one file that
// implements WatchSource; no rendering code changes.

#pragma once
#include <Arduino.h>

// A single snapshot of the crew member's current health output, already
// reduced to what a 240x240 round display can show. Units follow the Sakti
// application: hr in bpm, spo2 in percent, sbp/dbp in mmHg, temp in Celsius.
struct WatchData {
  bool  valid   = false;          // true when the fields below are usable
  char  name[24]  = "Crew";       // crew/record label
  char  status[8] = "ok";         // "ok" | "watch" | "alert" (Sakti status)
  int   hr   = -1;                // resting/instant heart rate, bpm
  int   spo2 = -1;                // oxygen saturation, percent
  int   sbp  = -1;                // systolic blood pressure, mmHg
  int   dbp  = -1;                // diastolic blood pressure, mmHg
  float temp_c = NAN;             // body temperature, Celsius
  char  task[48]   = "";          // next Mission-Protocol task title
  char  action[48] = "";          // one short next action
  int   trend[48];                // recent heart-rate trend (oldest..newest)
  int   trend_n = 0;              // number of valid trend samples
  char  updated[24] = "";         // ISO timestamp of the reading, if provided
  char  err[40]     = "";         // human-readable error when valid == false
};

// Common interface for every transport.
class WatchSource {
 public:
  virtual ~WatchSource() {}
  // One-time initialisation (bring up WiFi, open the UART, etc.).
  virtual bool begin() = 0;
  // Fill out on success and return true. On failure return false and set
  // out.err. A source must not block for longer than its configured timeout.
  virtual bool read(WatchData &out) = 0;
  // Short label shown on the display footer, e.g. "WiFi demo" or "Suit link".
  virtual const char *label() = 0;
};

// Defined by whichever transport config.h selected.
WatchSource *makeWatchSource();
