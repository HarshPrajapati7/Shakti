// User_Setup.h for ESP32-C3 with 240x240 TFT (ST7789 / GC9A01)
// Copy this content into: Documents/Arduino/libraries/TFT_eSPI/User_Setup.h

#define USER_SETUP_INFO "User_Setup_Sakti_ESP32C3"

// ── Display Driver (Uncomment YOUR driver) ────────────────
#define ST7789_DRIVER      // For square 240x240 display (e.g. 1.3", 1.54", 2.0")
//#define GC9A01_DRIVER    // For round 240x240 display (uncomment if you have a round screen)

// ── Resolution ───────────────────────────────────────────
#define TFT_WIDTH  240
#define TFT_HEIGHT 240

// Optional color order / inversion (uncomment if colors look swapped/inverted)
//#define TFT_INVERSION_ON
//#define TFT_RGB_ORDER TFT_RGB
//#define TFT_RGB_ORDER TFT_BGR

// ── ESP32-C3 Exact Pin Mapping ───────────────────────────
#define TFT_SCLK 4
#define TFT_MOSI 6
#define TFT_DC   3
#define TFT_CS   10
#define TFT_RST  7

// ── Fonts ────────────────────────────────────────────────
#define LOAD_GLCD   // Font 1. Original Adafruit 8 pixel font
#define LOAD_FONT2  // Small 16 pixel high font
#define LOAD_FONT4  // Medium 26 pixel high font
#define LOAD_FONT6  // Large 48 pixel font
#define LOAD_FONT7  // 7 segment 48 pixel font
#define LOAD_FONT8  // Large 75 pixel font
#define LOAD_GFXFF  // FreeFonts

#define SMOOTH_FONT

// ── SPI Speed ────────────────────────────────────────────
#define SPI_FREQUENCY  40000000   // 40MHz for fast image pushes
#define SPI_READ_FREQUENCY  20000000

