# Development setup

## Windows prerequisites

1. Install Node.js 20 or newer.
2. Enable Corepack and install pnpm 9.
3. Install Rust stable with the MSVC toolchain.
4. Install Microsoft C++ Build Tools (Desktop development with C++).
5. Install WebView2 Runtime if it is not already present.
6. Follow the official Tauri 2 Windows prerequisites guide: https://v2.tauri.app/start/prerequisites/

## Run the desktop shell

From the repository root:

```powershell
corepack enable
pnpm install
pnpm tauri:dev
```

For frontend-only development, run `pnpm dev`.

## Current implementation boundary

The current frontend is an early workspace shell with a Monaco editor and illustrative project tree. The terminal shown in the UI is explicitly a placeholder; it is not yet connected to a native PTY or shell process. Board detection, serial I/O, builds, flashing and debugging are not implemented yet. Do not use the sample project view as evidence that a device is connected or that code has been built or flashed.

## Implementation sequence

- Phase 1: desktop shell, application layout, editor foundation, typed native command boundary and project structure.
- Phase 2: secure native terminal process management and project filesystem operations.
- Phase 3: toolchain detection and ESP-IDF project/build workflows.
- Phase 4: serial port discovery, monitor and esptool flashing.
- Phase 5: board profiles, pin/peripheral metadata and firmware-assisted diagnostics.
- Phase 6: debugging, component management, Git integration and acceptance testing.

Each phase should add automated tests and document Windows-specific manual verification.
