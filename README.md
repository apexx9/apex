# APEX

**A professional embedded systems IDE by Apex.**

APEX is a Windows-first desktop engineering environment for embedded firmware, robotics and electronics. The initial release focuses on a dependable desktop foundation and ESP32 development, with a modular architecture for future platforms.

## Status

APEX is in active development. Phase 1 establishes the Tauri 2 + Rust desktop shell, static-export Next.js frontend, editor workspace, project explorer, terminal foundation, onboarding and settings. Hardware workflows will be added incrementally and will only report capabilities that are actually detected or tested.

## Architecture

- `frontend/` — Next.js static-export React application.
- `src-tauri/` — Tauri 2 desktop shell and native Rust services.
- `docs/` — architecture, setup and implementation notes.
- `tests/` — acceptance and integration test plans.

## Development prerequisites

- Node.js 20+
- pnpm 9+
- Rust stable toolchain
- Windows 10/11 with Microsoft C++ Build Tools and WebView2 Runtime
- Tauri 2 prerequisites: https://v2.tauri.app/start/prerequisites/

## Getting started

```powershell
corepack enable
pnpm install
pnpm tauri dev
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup details.

## Project principles

1. Native hardware and process functionality belongs in Rust, not the browser UI.
2. Never fake a successful build, flash, device scan or measurement.
3. Destructive operations require explicit confirmation.
4. Platform and board capabilities must be backed by board metadata and actual detection.
5. Prefer complete, tested workflows over superficial feature breadth.

## License

TBD.
