# APEX development and acceptance

## Windows prerequisites

1. Windows 10/11.
2. Node.js 20+ and pnpm 9+.
3. Rust stable with the MSVC target.
4. Microsoft C++ Build Tools (Desktop development with C++).
5. WebView2 Runtime.
6. Tauri 2 Windows prerequisites: https://v2.tauri.app/start/prerequisites/

## Start APEX from source

```powershell
corepack enable
pnpm install
pnpm typecheck
pnpm tauri:dev
```

## Firmware toolchains

### Arduino ESP32

Install Arduino CLI and the Espressif board core, then ensure `arduino-cli` is on PATH:

```powershell
arduino-cli config init
arduino-cli core update-index
arduino-cli core install esp32:esp32
```

APEX's Arduino template uses the generic `esp32:esp32:esp32` FQBN. This is a generic target, not a verified physical board profile.

### ESP-IDF

Install ESP-IDF using Espressif's official Windows installer or setup guide. Open APEX from an ESP-IDF initialized terminal/environment so `idf.py`, CMake, Ninja and the correct compiler toolchain are available on PATH. APEX currently detects tools; it does not install or configure ESP-IDF automatically.

## Implemented workflows

- Open an existing workspace and browse, create, edit and save UTF-8 text files.
- Start PowerShell or CMD in the integrated terminal.
- Enumerate serial ports, connect at a selected baud rate, receive device output and transmit lines.
- Create a new Arduino or ESP-IDF ESP32 starter project.
- Run `arduino-cli compile` or `idf.py build` against the active workspace.
- Run `arduino-cli upload` or `idf.py -p PORT flash` after explicitly selecting a serial port and confirming the destructive flash operation.

Build and flash commands execute native tools directly with argument arrays. Their actual exit code and output are shown in the Output panel. A missing toolchain is reported as an error; APEX does not fake a successful operation.

## Hardware acceptance checklist

The following requires a real board and is intentionally not claimed as CI-verified:

- [ ] Confirm exact ESP32 module, board revision, USB-UART bridge, flash size and boot mode.
- [ ] Confirm the selected COM port and that no other application holds it open.
- [ ] Build the generated Arduino template.
- [ ] Flash it and verify serial output at 115200 baud.
- [ ] Build and flash the ESP-IDF template.
- [ ] Verify reset, bootloader entry and recovery from an interrupted flash.
- [ ] Verify board-specific GPIO mapping before connecting external circuitry.

## Not yet implemented

- Automatic installation and environment management for ESP-IDF, Arduino cores and compiler toolchains.
- Board-specific verified pinout database, GPIO/peripheral configuration and pin conflict detection.
- Firmware-assisted I2C scan, SPI/UART/I2S/PWM/ADC/DAC/CAN diagnostics.
- Component/library registry search and installation UI.
- OpenOCD/GDB debug sessions and breakpoint controls.
- Automated hardware-in-the-loop testing.

## Security and reliability

- Workspace paths are validated and resolved against the canonical workspace root.
- Project names reject path traversal and shell metacharacters.
- External build and flash commands are invoked as executable plus argument arrays.
- Flashing requires an explicit confirmation in the UI.
- CI validates frontend types and builds the Windows desktop bundle. CI does not emulate a connected ESP32.
