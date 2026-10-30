# APEX

**A Windows-first embedded systems IDE by Apex.**

APEX is a native desktop engineering environment for embedded firmware, robotics and electronics. The first target is the Espressif ESP32 family. The application uses Tauri 2, Rust, Next.js, React, TypeScript and Monaco Editor.

## Current implementation

- Native Windows desktop shell with a custom dark engineering workspace.
- Monaco editor with workspace file browsing, creation and saving.
- Integrated PowerShell / Command Prompt terminal backed by a native PTY.
- Serial port discovery, serial monitor, baud-rate selection and transmit input.
- Toolchain discovery for Python, CMake, Ninja, Git, ESP-IDF-related tools, Xtensa/RISC-V compilers and debuggers, Arduino CLI and PlatformIO.
- New-project templates for Arduino ESP32 and ESP-IDF.
- Native firmware build and flash commands for Arduino CLI and ESP-IDF.
- Windows MSI and NSIS packaging through GitHub Actions.

## Important boundaries

- A detected COM port does not identify a board. Verify the exact module, USB bridge, flash configuration and pinout before selecting pins or flashing.
- The generic ESP32 template targets `esp32` / `esp32:esp32:esp32`. The sample GPIO 2 LED pin is illustrative and must be checked against the actual board.
- Build and flash require the selected framework's toolchain installed and initialized in the environment from which APEX is launched.
- APEX does not yet automatically install ESP-IDF or Arduino cores.
- Peripheral configuration, pin-conflict analysis, live GPIO/I2C/SPI diagnostics and OpenOCD/GDB session management are still under development. The component panel currently supports Arduino CLI library search/install and ESP-IDF dependency addition; full registry browsing and PlatformIO integration remain pending.
- No physical board has been validated as part of CI. The first hardware acceptance pass must be performed with a real ESP32 connected.

## Architecture

- `app/` — Next.js application and IDE shell.
- `frontend/components/` — editor panels, terminal, serial monitor and toolchain UI.
- `src-tauri/` — Tauri shell and native Rust process, filesystem, serial and firmware services.
- `docs/` — setup and acceptance guidance.

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Principles

1. Hardware status must come from actual detection or firmware diagnostics.
2. Never report a successful build, flash, measurement or debugger session without a successful native result.
3. Invoke external tools with argument arrays, not shell-concatenated command strings.
4. Keep filesystem operations inside the selected workspace.
5. Clearly distinguish verified board metadata from generic or user-supplied assumptions.

## License

TBD.
