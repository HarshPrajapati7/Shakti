// config.h — build-time configuration for the SAKTI round-watch firmware.
//
// Edit the values in this file to match your board, your network and your
// Sakti host. Nothing else in the sketch needs to change to move between the
// WiFi demonstration transport and the direct suit transport.
//
// Hardware target: ESP32-C series development board (C3 or C6) driving a
// round GC9A01 240x240 SPI TFT, with four momentary push-buttons. The pin
// names below follow the SAKTI prototype wiring diagram.

#pragma once

// ---------------------------------------------------------------------------
// 1. Transport selection (the core architectural choice)
// ---------------------------------------------------------------------------
// Exactly ONE of the following must be 1.
//
//   SAKTI_TRANSPORT_WIFI  Pull the watch output from the Sakti host over
//                         WiFi using an HTTP/JSON request. This is the
//                         DEMONSTRATION transport only. It lets the display
//                         show live output on a bench without a flight suit.
//
//   SAKTI_TRANSPORT_SUIT  Read the watch output directly from the suit's
//                         physiological data bus over a wired serial link.
//                         This is the intended operational transport: the
//                         wearable is attached to the suit, not to a network.
//
// The rendering code is identical in both cases. Only the data source changes.
#define SAKTI_TRANSPORT_WIFI 1
#define SAKTI_TRANSPORT_SUIT 0

// ---------------------------------------------------------------------------
// 2. WiFi demonstration settings (used only when SAKTI_TRANSPORT_WIFI == 1)
// ---------------------------------------------------------------------------
#define SAKTI_WIFI_SSID     "your-network"
#define SAKTI_WIFI_PASSWORD "your-password"

// Full URL of the Sakti host endpoint that returns the watch JSON document.
// On the demo machine this is the small HTTP server described in the README,
// for example a PC on the same LAN at 192.168.1.50 port 8080.
#define SAKTI_API_URL "http://192.168.1.50:8080/api/watch"

// How often to poll the endpoint, in milliseconds.
#define SAKTI_POLL_INTERVAL_MS 4000UL

// Socket/read timeout for one HTTP request, in milliseconds.
#define SAKTI_HTTP_TIMEOUT_MS 4000

// ---------------------------------------------------------------------------
// 3. Suit link settings (used only when SAKTI_TRANSPORT_SUIT == 1)
// ---------------------------------------------------------------------------
// UART connected to the suit avionics physiological telemetry port.
// The framing is documented in suit_source.cpp and the README.
#define SAKTI_SUIT_UART_NUM  1
#define SAKTI_SUIT_BAUD      115200
#define SAKTI_SUIT_RX_PIN    20     // ESP32 RX  <- suit TX
#define SAKTI_SUIT_TX_PIN    21     // ESP32 TX  -> suit RX (for keep-alive / request)

// ---------------------------------------------------------------------------
// 4. Display pins (GC9A01 over hardware SPI)
// ---------------------------------------------------------------------------
// These follow the SAKTI prototype wiring diagram. The GPIO numbers are the
// placeholders from that diagram resolved to a common ESP32-C3 pin-out.
// VERIFY against your exact board before powering the panel.
#define TFT_SCLK_PIN   4    // GPIO_SCK  -> TFT SCLK
#define TFT_MOSI_PIN   6    // GPIO_MOSI -> TFT DIN/MOSI
#define TFT_CS_PIN     7    // GPIO_CS   -> TFT CS
#define TFT_DC_PIN     1    // GPIO_DC   -> TFT DC
#define TFT_RST_PIN    10   // GPIO_RST  -> TFT RST
#define TFT_BL_PIN     -1   // Backlight. -1 if the panel has no BL pin or BL is tied to 3V3.

// The TFT VCC pin is powered from the board 3V3 regulator and GND is common,
// exactly as in the wiring diagram. Those are not GPIOs.

// ---------------------------------------------------------------------------
// 5. Button pins
// ---------------------------------------------------------------------------
// Four momentary buttons to local ground. Each pin uses the internal pull-up,
// so an idle button reads HIGH and a pressed button reads LOW.
#define BTN1_PIN   5    // GPIO_BTN1 -> SW1  (previous view)
#define BTN2_PIN   8    // GPIO_BTN2 -> SW2  (next view)
#define BTN3_PIN   9    // GPIO_BTN3 -> SW3  (force refresh)
#define BTN4_PIN   0    // GPIO_BTN4 -> SW4  (toggle brightness / acknowledge)

// Debounce window for a button edge, in milliseconds.
#define BTN_DEBOUNCE_MS 40
