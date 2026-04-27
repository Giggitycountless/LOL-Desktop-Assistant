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

## Safe Runtime Status

The settings panel and `auto-accept-status-update` event only expose these safe states:

- `disabled`: the user setting is off.
- `waitingForClient`: the app is waiting for a usable local League Client session.
- `connected`: the app has a safe backend connection to the League Client.
- `searching`: gameflow is in matchmaking.
- `readyCheckDetected`: gameflow is exactly `ReadyCheck`.
- `accepting`: the backend is sending or verifying the accept action.
- `accepted`: the ready check appears accepted or the phase moved past `ReadyCheck`.
- `error`: accept failed or verification could not confirm progress.

These states must never include the lockfile port, password, auth headers, raw LCU URLs, or PUUIDs.

## Debug Flow

Use the status panel first, then confirm with backend logs:

1. If the status stays `waitingForClient`, look for `[lcu-adapter] league client process not detected`, `lockfile not found`, or `lockfile read failed`. That means the app has not built a usable local client session yet.
2. If the status reaches `connected` but never changes while queueing, look for `[auto-accept-monitor] fallback gameflow phase` and `phase changed`. Missing phase logs mean monitoring is not receiving client state.
3. If phase logs show values other than `ReadyCheck`, the monitor is alive but the client has not entered the accept window.
4. If logs show `[auto-accept] ready check detected` and `accept request sent`, detection is working and failures are in the accept request or confirmation path.
5. If an accept request errors but the phase has already moved on, the app logs that the result was uncertain and treats it as accepted instead of retry-spamming.
6. If the client is restarted, look for websocket disconnect/session-end logs followed by a fresh lockfile/session read. The monitor clears cached phase and in-progress accept state before reconnecting.

## Manual Test Checklist

1. Start the app with auto-accept enabled and League Client closed. The settings panel should show `waitingForClient`.
2. Start League Client. The backend should log safe lockfile/session diagnostics and the panel should move to `connected`.
3. Queue normally. The panel should move to `searching`.
4. When the ready check appears, the panel should move through `readyCheckDetected`, `accepting`, then `accepted`.
5. Restart League Client. The logs should show disconnect/reconnect, and the panel should return to `waitingForClient` or `connected` without stale credentials.
