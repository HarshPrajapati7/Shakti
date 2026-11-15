# SAKTI round-watch firmware (ESP32-C + GC9A01)

Firmware for the SAKTI wearable prototype. An ESP32-C development board drives a
round 240x240 GC9A01 SPI display and shows the crew member's current health
output from the Sakti application: status, heart rate, SpO2, blood pressure, a
heart-rate trend, and the next Mission-Protocol task. Four buttons switch views
and refresh.

![SAKTI prototype electronics wiring](wiring.jpg)

## Why there are two transports

The firmware separates *what it shows* from *where the data comes from*. The
display renders a `WatchData` value; a `WatchSource` produces that value. Two
sources are provided and the active one is chosen at build time in `config.h`:

| Transport | File | Status | Use |
|---|---|---|---|
| WiFi + HTTP/JSON | `wifi_source.cpp` | Demonstration only | Show live output on a bench without a suit |
| Direct suit data bus | `suit_source.cpp` | Operational design | Wearable attached to the suit, no radio |

**WiFi is a demonstration convenience, not the design.** In the prototype the
watch cannot be wired into a flight suit, so the display pulls the same numbers
from the Sakti host over the local network. The intended product attaches the
wearable directly to the suit and reads physiological telemetry over a wired
bus, with no network in the loop. Because both paths implement the one
`WatchSource` interface, moving from the demo to the suit changes a single
build flag and recompiles the same rendering code.

## Files

```
firmware/sakti_watch/
  sakti_watch.ino    main sketch: display init, polling, rendering, buttons
  config.h           pins, WiFi credentials, API URL, transport selection
  watch_source.h     WatchData struct and the WatchSource interface
  wifi_source.cpp    WiFi/HTTP/JSON demonstration transport
  suit_source.cpp    direct suit-bus (UART/CAN) operational transport
  wiring.jpg         the wiring diagram reproduced above
```

## Hardware and wiring

The wiring follows the diagram above. The display runs on hardware SPI; the four
buttons go to ground and use the internal pull-ups, so an idle button reads HIGH
and a pressed button reads LOW.

| Display (GC9A01) | ESP32-C pin in `config.h` | Note |
|---|---|---|
| VCC | 3V3 | from the board regulator |
| GND | GND | common ground |
| SCLK | `TFT_SCLK_PIN` (GPIO4) | SPI clock |
| DIN/MOSI | `TFT_MOSI_PIN` (GPIO6) | SPI data |
| CS | `TFT_CS_PIN` (GPIO7) | chip select |
| DC | `TFT_DC_PIN` (GPIO1) | data/command |
| RST | `TFT_RST_PIN` (GPIO10) | reset |
| BL | `TFT_BL_PIN` (-1) | set a GPIO if the panel has a backlight pin |

| Button | ESP32-C pin | Function |
|---|---|---|
| SW1 | `BTN1_PIN` (GPIO5) | previous view |
| SW2 | `BTN2_PIN` (GPIO8) | next view |
| SW3 | `BTN3_PIN` (GPIO9) | force refresh |
| SW4 | `BTN4_PIN` (GPIO0) | toggle backlight / acknowledge |

Power comes from USB-C 5V into the board; the on-board regulator supplies 3.3V to
the display. The GPIO numbers resolve the placeholders in the wiring diagram to a
common ESP32-C3 pin-out. **Verify them against your exact C3/C6 board and your
GC9A01 module before powering the panel**, because strapping pins and default SPI
pins differ between variants.

## Build and flash

1. Install the Arduino IDE and the **esp32** boards package (Espressif Systems).
2. Install two libraries from the Library Manager:
   - *GFX Library for Arduino* (`Arduino_GFX`, by moononournation), >= 1.4
   - *ArduinoJson* (by Benoit Blanchon), >= 6.21
3. Open `firmware/sakti_watch/sakti_watch.ino`.
4. Edit `config.h`: set the transport, and for the WiFi demo set
   `SAKTI_WIFI_SSID`, `SAKTI_WIFI_PASSWORD` and `SAKTI_API_URL`.
5. Select your ESP32-C3/C6 board and the correct port, then upload.

## API contract (WiFi demonstration)

With `SAKTI_TRANSPORT_WIFI`, the firmware sends one HTTP `GET` to
`SAKTI_API_URL` every `SAKTI_POLL_INTERVAL_MS` and expects a small JSON body:

```json
{
  "name": "Crew-01",
  "status": "ok",
  "hr": 62,
  "spo2": 98,
  "sbp": 117,
  "dbp": 75,
  "temp_c": 36.7,
  "task": "Baseline check-in",
  "action": "Open check-in",
  "updated": "2026-11-15T22:40:00Z",
  "trend": [60, 61, 63, 62, 64, 66, 63]
}
```

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Crew/record label shown in the header |
| `status` | `"ok"` \| `"watch"` \| `"alert"` | Overall Sakti status; drives the ring colour |
| `hr` | int | Heart rate, bpm |
| `spo2` | int | Oxygen saturation, percent |
| `sbp`, `dbp` | int | Systolic/diastolic blood pressure, mmHg |
| `temp_c` | number | Body temperature, Celsius |
| `task` | string | Next Mission-Protocol task title |
| `action` | string | One short next action |
| `updated` | string | ISO-8601 timestamp of the reading |
| `trend` | int array | Recent heart-rate samples, oldest to newest |

Any field may be omitted; the firmware falls back to a safe default and keeps
rendering. Missing numeric fields are shown as `--`.

### Serving the document for a demo

`status`, `hr`, `spo2`, `sbp`, `dbp` and `temp_c` map directly onto the Sakti
`Vitals`/`AssessOut` types in `apps/web/src/lib/types.ts`; `task` and `action`
come from the active Mission-Protocol step. For a bench demo, expose the latest
saved check-in from the host as the JSON above on the local network (for example
a small static endpoint on the demo PC, reachable at the `SAKTI_API_URL`
address). The ESP32-C must be on the same network.

## Real-suit integration plan

With `SAKTI_TRANSPORT_SUIT`, the WiFi stack is not compiled in. The firmware
reads framed records straight from the suit avionics physiological port over a
wired UART (`suit_source.cpp`). The frame is self-syncing and CRC-checked:

```
0xAA 0x55  LEN  PAYLOAD[LEN]  CRC16         ; CRC-16/CCITT-FALSE over PAYLOAD
PAYLOAD = int16 hr, int16 spo2, int16 sbp, int16 dbp,
          int16 temp_c_x10, uint8 status    ; little-endian
```

Integration steps when suit access is available:

1. Confirm the suit's physiological telemetry port, its electrical standard
   (UART / RS-422 / CAN) and its message schedule from the suit interface
   control document.
2. Replace `readFrame()` in `suit_source.cpp` with the suit's real framing, or
   keep the documented frame and run a small adapter on the suit side. The CRC
   check and the field layout already reject partial or corrupted reads.
3. For a CAN or RS-422 physical layer, swap the `HardwareSerial` object for the
   matching peripheral; `read()` and the display are unchanged because they only
   use `WatchData`.
4. Set `SAKTI_TRANSPORT_SUIT 1` (and `SAKTI_TRANSPORT_WIFI 0`) and rebuild.

Because the suit path carries no radio, it removes the demo's wireless attack
surface and does not depend on a host or a network. The WiFi transport remains
available for lab testing only.

## Safety

The display is decision support, not a medical device. It shows values produced
elsewhere and never computes a diagnosis on the microcontroller. A health
`alert` status is shown with the alert colour and takes visual priority; it does
not replace the crew's approved medical procedure.
