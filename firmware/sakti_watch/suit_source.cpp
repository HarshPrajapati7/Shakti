// suit_source.cpp — OPERATIONAL transport (direct suit attachment).
//
// This is the intended design: the wearable is wired into the suit and reads
// the crew member's health output straight from the suit's physiological
// telemetry bus. There is no radio and no network. WiFi is only a bench
// demonstration (wifi_source.cpp); this file is the real path.
//
// Physical layer: a wired UART tap on the suit avionics physiological port.
// A production build may instead use the suit CAN bus or RS-422 pair; only the
// readFrame() body below changes, because the rest of the firmware consumes
// the same WatchData struct.
//
// Wire framing (one reading per frame), chosen to be simple and self-syncing:
//
//     0xAA 0x55  LEN  PAYLOAD[LEN]  CRC16
//
// PAYLOAD is a little-endian packed record:
//     int16 hr, int16 spo2, int16 sbp, int16 dbp,
//     int16 temp_c_x10, uint8 status (0=ok,1=watch,2=alert)
//
// This mirrors the documented suit telemetry record. The function below
// validates the header and CRC before accepting a frame, so a partial or
// corrupted read is rejected rather than shown.

#include "config.h"

#if SAKTI_TRANSPORT_SUIT

#include <Arduino.h>
#include "watch_source.h"

static HardwareSerial SuitSerial(SAKTI_SUIT_UART_NUM);

class SuitLinkSource : public WatchSource {
 public:
  bool begin() override {
    SuitSerial.begin(SAKTI_SUIT_BAUD, SERIAL_8N1, SAKTI_SUIT_RX_PIN, SAKTI_SUIT_TX_PIN);
    return true;
  }

  bool read(WatchData &out) override {
    uint8_t payload[16];
    int len = readFrame(payload, sizeof(payload));
    if (len < 11) {
      snprintf(out.err, sizeof(out.err), "suit: no frame");
      return false;
    }

    out.hr     = rd16(payload + 0);
    out.spo2   = rd16(payload + 2);
    out.sbp    = rd16(payload + 4);
    out.dbp    = rd16(payload + 6);
    out.temp_c = rd16(payload + 8) / 10.0f;
    const uint8_t st = payload[10];
    const char *s = (st == 2) ? "alert" : (st == 1) ? "watch" : "ok";
    strncpy(out.status, s, sizeof(out.status) - 1);
    out.status[sizeof(out.status) - 1] = '\0';

    // The suit provides live vitals; mission task/trend fields stay as set by
    // the host-side configuration and are not part of the raw telemetry frame.
    strncpy(out.name, "Suit crew", sizeof(out.name) - 1);
    out.name[sizeof(out.name) - 1] = '\0';
    out.err[0] = '\0';
    out.valid = true;
    return true;
  }

  const char *label() override { return "Suit link"; }

 private:
  static int16_t rd16(const uint8_t *p) {
    return (int16_t)(p[0] | (p[1] << 8));
  }

  // Read one validated frame. Returns payload length, or 0 on timeout/bad CRC.
  int readFrame(uint8_t *payload, int maxLen) {
    const unsigned long deadline = millis() + 50;
    // Sync to the 0xAA 0x55 header.
    int sync = 0;
    while (millis() < deadline) {
      if (!SuitSerial.available()) continue;
      const uint8_t b = SuitSerial.read();
      if (sync == 0 && b == 0xAA) sync = 1;
      else if (sync == 1 && b == 0x55) { sync = 2; break; }
      else sync = (b == 0xAA) ? 1 : 0;
    }
    if (sync != 2) return 0;

    const int len = readByte(deadline);
    if (len <= 0 || len > maxLen) return 0;
    for (int i = 0; i < len; i++) {
      const int v = readByte(deadline);
      if (v < 0) return 0;
      payload[i] = (uint8_t)v;
    }
    const int lo = readByte(deadline), hi = readByte(deadline);
    if (lo < 0 || hi < 0) return 0;
    const uint16_t rxCrc = (uint16_t)(lo | (hi << 8));
    return (crc16(payload, len) == rxCrc) ? len : 0;
  }

  int readByte(unsigned long deadline) {
    while (!SuitSerial.available()) {
      if (millis() >= deadline) return -1;
    }
    return SuitSerial.read();
  }

  static uint16_t crc16(const uint8_t *data, int n) {  // CRC-16/CCITT-FALSE
    uint16_t crc = 0xFFFF;
    for (int i = 0; i < n; i++) {
      crc ^= (uint16_t)data[i] << 8;
      for (int b = 0; b < 8; b++)
        crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : (crc << 1);
    }
    return crc;
  }
};

WatchSource *makeWatchSource() { return new SuitLinkSource(); }

#endif  // SAKTI_TRANSPORT_SUIT
