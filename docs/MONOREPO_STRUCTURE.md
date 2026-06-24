# ScreenRaid — Monorepo Structure

> Target repository layout with folder responsibilities and complete file tree.

---

## Top-level layout

```
LamaWorlds_ScreenRaid/
├── Cargo.toml                 # Rust workspace root
├── .env.example               # Server environment template
├── .gitignore
├── docker-compose.yml         # Local dev stack (server + volumes)
├── README.md
│
├── crates/                    # Shared Rust libraries
├── server/                    # Axum API + WebSocket backend
├── client/                    # Tauri 2 + React frontend
├── docker/                    # Production Dockerfiles (planned)
├── scripts/                   # Dev/ops helper scripts (planned)
├── docs/                      # Architecture & product documentation
└── .github/workflows/         # CI pipelines (planned)
```

---

## Folder responsibilities

### `crates/` — Shared Rust crates

| Crate | Responsibility |
|-------|----------------|
| `screenraid-types` | Serde types shared between server and client: auth, user, room, friend, consent, prank, media, websocket envelopes |
| `screenraid-validation` | MIME allowlists, file size limits, input validation helpers |

Both crates are workspace members and published only within the monorepo (no crates.io).

### `server/` — Backend (`screenraid-server`)

Axum HTTP server with SQLite (SQLx), JWT auth, WebSocket hub, and file storage.

| Path | Responsibility |
|------|----------------|
| `src/main.rs` | Binary entrypoint, binds TCP listener |
| `src/lib.rs` | App bootstrap, router assembly |
| `src/config.rs` | Environment-based configuration |
| `src/state.rs` | `AppState` — DB pool, services, WS hub, rate limiters |
| `src/error.rs` | Unified `AppError` → HTTP responses |
| `src/api/router.rs` | Route definitions under `/v1/*` |
| `src/api/handlers/` | HTTP handlers: auth, rooms, friends, consent, health |
| `src/api/middleware/` | JWT auth, rate limiting |
| `src/service/` | Business logic: auth, room, friend, consent |
| `src/repository/` | SQLx data access layer |
| `src/websocket/` | WS upgrade, hub, session management |
| `migrations/` | SQLx schema migrations |

### `client/` — Desktop app (`screenraid-client`)

Tauri 2 shell wrapping a React + Vite + Tailwind UI.

| Path | Responsibility |
|------|----------------|
| `src/` | React application (pages, components, hooks, stores, services) |
| `src-tauri/` | Rust native layer: overlay commands, settings, plugins |
| `src-tauri/src/commands/` | Tauri invoke handlers (overlay, settings) |
| `src-tauri/migrations/` | Client-side SQLite cache schema |
| `src-tauri/capabilities/` | Tauri 2 permission capabilities |
| `public/` | Static assets |
| `package.json` | Frontend dependencies and scripts |

### `docker/` (planned)

| Path | Responsibility |
|------|----------------|
| `Dockerfile.server` | Multi-stage build for production server image |
| `Dockerfile.nginx` | Reverse proxy with TLS termination |
| `nginx.conf` | Upstream proxy to Axum |

### `scripts/` (planned)

| Path | Responsibility |
|------|----------------|
| `dev.ps1` / `dev.sh` | Start server + client in dev mode |
| `migrate.sh` | Run SQLx migrations |
| `seed.sh` | Dev seed data |
| `backup-db.sh` | SQLite backup helper |

### `docs/`

Product and engineering documentation. See `ARCHITECTURE.md` as the master index.

### `.github/workflows/` (planned)

| Workflow | Responsibility |
|----------|----------------|
| `ci.yml` | `cargo test`, `cargo clippy`, `npm run build` |
| `release.yml` | Tauri client builds per platform |
| `docker.yml` | Server image publish |

---

## Complete tree (current + planned)

```
LamaWorlds_ScreenRaid/
├── .env.example
├── .gitignore
├── Cargo.toml
├── Cargo.lock
├── README.md
├── docker-compose.yml
│
├── .github/
│   └── workflows/
│       ├── ci.yml                    # planned
│       ├── docker.yml                # planned
│       └── release.yml               # planned
│
├── crates/
│   ├── screenraid-types/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── auth.rs
│   │       ├── consent.rs
│   │       ├── friend.rs
│   │       ├── media.rs
│   │       ├── prank.rs
│   │       ├── roles.rs
│   │       ├── room.rs
│   │       ├── user.rs
│   │       └── websocket.rs
│   └── screenraid-validation/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── limits.rs
│           └── mime.rs
│
├── server/
│   ├── Cargo.toml
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── config.rs
│       ├── error.rs
│       ├── state.rs
│       ├── api/
│       │   ├── mod.rs
│       │   ├── router.rs
│       │   ├── handlers/
│       │   │   ├── mod.rs
│       │   │   ├── auth.rs
│       │   │   ├── consent.rs
│       │   │   ├── friends.rs
│       │   │   ├── health.rs
│       │   │   ├── media.rs          # planned
│       │   │   ├── pranks.rs         # planned
│       │   │   └── rooms.rs
│       │   └── middleware/
│       │       ├── mod.rs
│       │       ├── auth.rs
│       │       └── rate_limit.rs
│       ├── repository/
│       │   ├── mod.rs
│       │   ├── consent_repo.rs
│       │   ├── friend_repo.rs
│       │   ├── media_repo.rs         # planned
│       │   ├── prank_repo.rs         # planned
│       │   ├── room_repo.rs
│       │   └── user_repo.rs
│       ├── service/
│       │   ├── mod.rs
│       │   ├── auth_service.rs
│       │   ├── consent_service.rs
│       │   ├── friend_service.rs
│       │   ├── media_service.rs      # planned
│       │   ├── prank_service.rs      # planned
│       │   └── room_service.rs
│       └── websocket/
│           ├── mod.rs
│           ├── handler.rs
│           └── hub.rs
│
├── client/
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── .oxlintrc.json
│   ├── public/
│   │   └── (assets)
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── components/
│   │   │   ├── ConsentGate.tsx
│   │   │   ├── layout/
│   │   │   │   ├── MainLayout.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── TitleBar.tsx
│   │   │   ├── overlay/              # planned
│   │   │   │   ├── OverlayWindow.tsx
│   │   │   │   ├── ImageOverlay.tsx
│   │   │   │   └── TextOverlay.tsx
│   │   │   └── ui/
│   │   │       ├── Badge.tsx
│   │   │       ├── Button.tsx
│   │   │       ├── Card.tsx
│   │   │       ├── Input.tsx
│   │   │       ├── Modal.tsx
│   │   │       └── index.ts
│   │   ├── hooks/
│   │   │   ├── usePanicHotkey.ts
│   │   │   ├── useWebSocket.ts
│   │   │   └── useOverlay.ts         # planned
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── FriendsPage.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   ├── MediaLibraryPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── RoomPage.tsx
│   │   │   ├── RoomsPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   ├── auth.ts
│   │   │   ├── consent.ts
│   │   │   ├── friends.ts
│   │   │   ├── media.ts              # planned
│   │   │   ├── pranks.ts             # planned
│   │   │   ├── rooms.ts
│   │   │   └── websocket.ts
│   │   ├── stores/
│   │   │   ├── authStore.ts
│   │   │   ├── consentStore.ts
│   │   │   └── overlayStore.ts       # planned
│   │   └── types/
│   │       ├── auth.ts
│   │       ├── friend.ts
│   │       ├── index.ts
│   │       └── room.ts
│   └── src-tauri/
│       ├── Cargo.toml
│       ├── build.rs
│       ├── tauri.conf.json
│       ├── capabilities/
│       │   └── default.json
│       ├── migrations/
│       │   └── 001_client_cache.sql
│       └── src/
│           ├── main.rs
│           ├── lib.rs
│           └── commands/
│               ├── mod.rs
│               ├── overlay.rs
│               ├── settings.rs
│               └── window.rs           # planned
│
├── docker/
│   ├── Dockerfile.server             # planned
│   ├── Dockerfile.nginx              # planned
│   └── nginx.conf                    # planned
│
├── scripts/
│   ├── dev.ps1                       # planned
│   ├── dev.sh                        # planned
│   ├── migrate.sh                    # planned
│   └── backup-db.sh                  # planned
│
└── docs/
    ├── API.md
    ├── ARCHITECTURE.md
    ├── DATABASE.md
    ├── DEPLOYMENT.md
    ├── DESIGN_SYSTEM.md
    ├── MONOREPO_STRUCTURE.md         # this file
    ├── OVERLAY_ENGINE.md
    ├── ROADMAP.md
    ├── SECURITY.md
    ├── TASKS.md
    ├── TESTING.md
    ├── WEBSOCKET.md
    └── WIREFRAMES.md
```

---

## Workspace members

Defined in root `Cargo.toml`:

```toml
members = [
    "crates/screenraid-types",
    "crates/screenraid-validation",
    "server",
    "client/src-tauri",
]
```

The React frontend (`client/`) is managed by npm independently but built together via `npm run tauri:build`.

---

## Data boundaries

| Store | Location | Owner |
|-------|----------|-------|
| User accounts, rooms, consent | Server SQLite | `server/migrations/` |
| Uploaded media files | Server disk (`MEDIA_ROOT`) | `server` media service |
| JWT secrets | Server env | `server` config |
| Client settings, media cache | Client SQLite | `client/src-tauri` |
| Overlay runtime state | In-memory (Rust) | `OverlayManager` |

---

## Dev commands

```powershell
# Server
cargo run -p screenraid-server

# Client
cd client
npm run tauri:dev
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production layout.
