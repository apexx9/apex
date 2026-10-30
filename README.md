# APEX

**A Windows-first embedded systems IDE by Apex.**

APEX is a native desktop engineering environment for embedded firmware, robotics and electronics. The first target is the Espressif ESP32 family. The application uses Tauri 2, Rust, Next.js, React, TypeScript and Monaco Editor.

## Current implementation

- Native Windows desktop shell with a custom dark engineering workspace.
- Monaco editor with workspace file browsing, creation and saving.
- Integrated PowerShell / Command Prompt terminal backed by a native PTY.
- Serial port discovery, serial monitor, baud-rate selection and transmit input.
- Toolchain discovery for Python, CMake, Ninja, Git, ESP-IDF-related tools, Xtensa/RISC-V compilers and debuggers, Arduino CLI and PlatformIO, with guided winget installation for supported Windows prerequisites.
- New-project templates for Arduino ESP32 and ESP-IDF.
- Generic original-ESP32 capability profile with a selectable GPIO explorer, ADC/DAC/touch metadata, input-only pin indicators, strapping-pin and UART0 warnings, and explicit unverified physical header routing.
- Peripheral configuration/code-generation starting points for GPIO, I²C, SPI, UART, PWM/LEDC, ADC, DAC and CAN/TWAI, with pin validation and conflict/warning output.
- OpenOCD process start/stop, streamed server output and Xtensa/RISC-V/GNU GDB version probing.
- Arduino Library Manager, ESP-IDF dependency addition and PlatformIO package search/install workflows.
- Native firmware build and flash commands for Arduino CLI and ESP-IDF.
- Windows MSI and NSIS packaging through GitHub Actions.

## Important boundaries

- A detected COM port does not identify a board. Verify the exact module, USB bridge, flash configuration and pinout before selecting pins or flashing.
- The generic ESP32 template targets `esp32` / `esp32:esp32:esp32`. The sample GPIO 2 LED pin is illustrative and must be checked against the actual board.
- Build and flash require the selected framework's toolchain installed and initialized in the environment from which APEX is launched.
- Guided winget installation covers selected prerequisites only. ESP-IDF, its compiler toolchains, OpenOCD and GDB should be installed with Espressif’s official Windows installer; APEX does not silently download or execute third-party installers.
- The GPIO explorer is a silicon-capability reference, not a board schematic. Physical header positions remain unverified until the exact board revision is identified. Peripheral code generation produces starter snippets/configuration, not a live hardware test or a complete driver implementation for every bus.
- The OpenOCD panel manages the server process and streams logs; GDB probing checks the executable. GDB MI2 sessions can be started against a selected ELF, receive streamed output and accept MI commands. Dedicated breakpoint and variable-inspection controls are not yet implemented.
- ESP-IDF component search directs users to the official registry and accepts the exact component identifier; it does not yet query registry search APIs directly. Arduino CLI libraries install into the user library environment. PlatformIO packages are installed against the active project.
- No physical board has been validated as part of CI. The first hardware acceptance pass must be performed with a real ESP32 connected.

## Architecture

- `app/` — Next.js application and IDE shell.
- `frontend/components/` — editor panels, terminal, serial monitor, board planner, debugger, package manager and toolchain UI.
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
