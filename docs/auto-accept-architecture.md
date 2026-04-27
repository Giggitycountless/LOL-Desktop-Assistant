# Auto-Accept Architecture

This note maps the current auto-accept path before reliability changes.

## Boundaries

- React never reads the League lockfile.
- React never calls League Client APIs directly.
- Lockfile credentials stay inside the Rust adapter layer.
- Logs and UI must not expose the lockfile port, password, auth headers, raw LCU URLs, or PUUIDs.
- Auto-accept is the only allowed League Client write in this flow.

## Current Flow

1. `src-tauri/src/main.rs` starts the platform event service during Tauri setup.
2. `crates/platform/src/lib.rs` owns the League event loop.
3. `crates/adapters/src/lib.rs` discovers the local League Client, reads the lockfile, creates local HTTP/WebSocket sessions, and subscribes to gameflow events.
4. The platform event loop listens for `/lol-gameflow/v1/gameflow-phase`.
5. When the phase becomes `ReadyCheck`, platform calls `run_ready_check_automation`.
6. `crates/application/src/lib.rs` checks the saved `auto_accept_enabled` setting, verifies the phase is still `ReadyCheck`, sends accept through the reader, and verifies whether the phase changed.
7. The adapter sends the isolated local request `POST /lol-matchmaking/v1/ready-check/accept`.
8. Frontend settings only save the sanitized `autoAcceptEnabled` preference and display safe status.

## Related Files

- `crates/adapters/src/lib.rs`: local LCU session, websocket, lockfile parsing, ready-check accept request.
- `crates/platform/src/lib.rs`: websocket monitor, reconnect loop, phase event handling, Tauri events.
- `crates/application/src/lib.rs`: auto-accept decision, retry, verification, system activity entries.
- `src/pages/Settings.tsx`: user-facing toggle and safe status area.
- `src/backend/types.ts`: sanitized frontend types.

## Debug Goals

The diagnostics should make it clear whether a failure is caused by:

- League Client not running or unreachable.
- Lockfile/session setup failing.
- Gameflow monitor not receiving phase changes.
- Monitor seeing a phase other than `ReadyCheck`.
- Ready check detected but accept request failing.
- Accept request sent but phase staying in `ReadyCheck`.
- League Client restart causing stale monitor state.
