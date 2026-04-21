# LoL Desktop Assistant

A Windows-first desktop assistant for League of Legends, built as a clean-room Tauri application.

The app currently focuses on local, read-only workflows:

- application health, settings, activity log, import/export tools
- read-only local League Client status and self account snapshot
- current summoner profile, ranked summary, profile icon, and champion icons
- recent self match list
- completed-match analysis with participant tables, scores, damage bars, items, runes, and summoner spells
- standalone participant profile window for completed matches
- local player notes and tags

## Safety Boundaries

This project intentionally keeps League Client integration narrow:

- Read-only LCU access only.
- Localhost League Client access only.
- Frontend code never reads the lockfile and never calls LCU directly.
- Lockfile port, password, authorization headers, raw LCU URLs, and PUUIDs must not be exposed to React, DOM, logs, exports, or UI state.
- No background polling loops.
- No remote Riot API integration.
- No queue actions, auto-accept, auto-pick, auto-ban, champ-select automation, overlays, or bots.
- League Client snapshots are not persisted as product data.

Local SQLite data is for app-owned state such as settings, activity entries, and user-created notes/tags.

## Tech Stack

- Rust
- Tauri 2
- React 19
- TypeScript 5.9
- Vite 8
- Tailwind CSS 4
- SQLite via `rusqlite` with bundled SQLite

## Requirements

Windows development prerequisites:

- Node.js and npm
- Rust stable MSVC toolchain
- Microsoft C++ Build Tools / Visual Studio Build Tools
- WebView2 Runtime
- Windows packaging tools required by Tauri NSIS builds

## Getting Started

Install dependencies:

```powershell
npm install
```

Run the desktop app locally:

```powershell
npm run dev
```

Build the frontend only:

```powershell
npm run build:frontend
```

Build the Windows desktop app and installer:

```powershell
npm run build
```

The NSIS installer is produced under:

```text
target/release/bundle/nsis/
```

## Useful Commands

```powershell
npm run typecheck
npm run build:frontend
npm run build
cargo check --workspace
cargo test --workspace
cargo test -p application
cargo test -p platform
cargo test -p storage
```

## Architecture

The repository is a Rust workspace with clear backend layers and a thin React frontend.

```text
.
├─ crates/
│  ├─ domain/       # shared domain DTOs, enums, and pure model types
│  ├─ application/  # use cases, validation, orchestration, safe command behavior
│  ├─ adapters/     # read-only local League Client adapter and platform-facing reads
│  ├─ storage/      # SQLite connection, migrations, settings, activity, notes
│  └─ platform/     # Tauri setup, app state, command boundary, command DTOs
├─ src-tauri/       # Tauri executable shell and Windows packaging config
└─ src/
   ├─ backend/      # typed frontend wrappers around Tauri commands
   ├─ components/   # reusable React UI components
   ├─ pages/        # Dashboard, Profile, Matches, Activity, Settings, window routes
   ├─ state/        # AppStateProvider and frontend state boundary
   └─ windows/      # Tauri window helpers
```

Layering rules:

- Domain should stay dependency-light.
- Application owns validation and business rules.
- Storage owns SQLite and migrations.
- Adapters own external/local-client integration details.
- Platform owns Tauri commands and command DTOs.
- Frontend calls backend command wrappers only.
- Frontend should not contain business logic or direct storage/client integration logic.

## Frontend Pages

- `Dashboard`: app health and League Client availability.
- `Profile`: current user profile and ranked summary.
- `Matches`: recent completed self matches and post-match analysis.
- `Activity`: local activity entries and notes.
- `Settings`: settings persistence, local data import/export, activity clearing.
- `ParticipantProfileWindow`: standalone Tauri window for completed-match participant profiles.

## Tauri Commands

The frontend reaches backend behavior through typed wrappers in `src/backend`.

Examples of command groups:

- system health and app state
- settings load/save/defaults
- activity list/create/clear
- local data import/export
- League Client status and self snapshot
- League image/game asset lookup
- post-match detail lookup
- participant public profile lookup
- player note save/clear

Keep command results safe for frontend consumption. Do not add raw lockfile fields, auth headers, internal LCU URLs, or PUUIDs to command DTOs.

## SQLite

Storage is backend-owned. The frontend does not use a SQL plugin and does not access SQLite directly.

Migrations live in:

```text
crates/storage/migrations/
```

The database is opened from the app data directory at runtime.

## Windows Packaging

Tauri packaging is configured in:

```text
src-tauri/tauri.conf.json
```

Current bundle target:

- NSIS installer
- current-user install mode

Signing, updater configuration, overlays, tray behavior, and background automation are intentionally out of scope for the current app foundation.

## Development Guidelines

- Keep changes small and focused.
- Prefer existing workspace boundaries over new abstractions.
- Add backend validation before exposing new command surface.
- Add focused tests for command DTOs and storage/application behavior.
- Keep React as a presentation/state boundary, not an integration layer.
- Do not copy implementation, wording, layout, or structure from other product repositories.

## Verification Checklist

Before handing off a meaningful change, run the narrowest useful checks first, then broaden if needed:

```powershell
npm run typecheck
npm run build:frontend
cargo test -p application
cargo test -p platform
cargo test -p storage
cargo check --workspace
```

For release/packaging smoke tests:

```powershell
cargo test --workspace
npm run build
```

For League Client UI flows, manually verify with the local League Client running:

- client unavailable and not-logged-in states render gracefully
- Profile loads self profile/ranked data when available
- Matches loads recent completed matches
- expanded match details show participants and assets
- participant profile window opens, focuses, and reuses the same window
- local notes/tags save and refresh visible participant tags
