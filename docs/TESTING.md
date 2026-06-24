# ScreenRaid — Testing Guide / Guide de tests

> Testing strategy for the ScreenRaid monorepo: Rust server, shared crates, Tauri client, WebSocket protocol, and overlay engine.  
> Stratégie de tests pour le serveur Rust, le client Tauri et le protocole temps réel.

See also: [ARCHITECTURE.md](./ARCHITECTURE.md) · [API.md](./API.md) · [WEBSOCKET.md](./WEBSOCKET.md) · [OVERLAY_ENGINE.md](./OVERLAY_ENGINE.md) · [WIREFRAMES.md](./WIREFRAMES.md)

---

## Table of Contents

1. [Testing Philosophy / Philosophie](#1-testing-philosophy--philosophie)
2. [Rust Unit & Integration Tests](#2-rust-unit--integration-tests)
3. [SQLx Test Database / Base de test](#3-sqlx-test-database--base-de-test)
4. [API Integration Tests](#4-api-integration-tests)
5. [WebSocket Tests](#5-websocket-tests)
6. [Overlay Engine Tests (Phase 6)](#6-overlay-engine-tests-phase-6)
7. [Multi-Monitor Tests](#7-multi-monitor-tests)
8. [Client & E2E Tests](#8-client--e2e-tests)
9. [CI/CD — GitHub Actions](#9-cicd--github-actions)
10. [UI Mockups & Visual QA](#10-ui-mockups--visual-qa)
11. [Test Data & Fixtures](#11-test-data--fixtures)
12. [Coverage Goals](#12-coverage-goals)

---

## 1. Testing Philosophy / Philosophie

| Layer | Tooling | Scope |
|-------|---------|-------|
| **Unit** | `cargo test` | Pure functions, validation, JWT helpers |
| **Integration** | `cargo test` + test server | HTTP handlers, DB repositories |
| **WebSocket** | `tokio-tungstenite` / `axum-test` | Connect, subscribe, ping/pong |
| **Overlay (future)** | Tauri test driver + Rust queue tests | Queue policy, panic, expiration |
| **Manual** | Windows multi-monitor | Real display topology |
| **CI** | GitHub Actions | Lint, test, build on every PR |

**Principles:**

- Tests must be **deterministic** — use fixed clocks (`tokio::time::pause`) for token expiry.
- Integration tests use an **isolated SQLite file** per test module (or in-memory).
- No production secrets in tests; `JWT_SECRET=test-secret-for-ci-only`.
- Prefer testing behavior over implementation details.

---

## 2. Rust Unit & Integration Tests

### 2.1 Workspace Layout (recommended)

```
ScreenRaid/
├── crates/
│   └── screenraid-validation/
│       └── src/
│           ├── mime.rs          # #[cfg(test)] mod tests
│           └── limits.rs
├── server/
│   └── tests/
│       ├── api_auth.rs
│       ├── api_rooms.rs
│       ├── api_friends.rs
│       └── ws_protocol.rs
└── client/
    └── src-tauri/
        └── src/
            └── overlay/         # Phase 6
                └── queue.rs     # unit tests
```

### 2.2 Running Tests

```bash
# Full workspace
cargo test --workspace

# Server only
cargo test -p screenraid-server

# Shared validation crate (fast, no DB)
cargo test -p screenraid-validation

# Single test with output
cargo test -p screenraid-server test_register_success -- --nocapture

# Run ignored integration tests (require Docker / network)
cargo test -p screenraid-server -- --ignored
```

### 2.3 Unit Test Examples

**Validation — MIME sniffing** (`screenraid-validation`):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_png_magic_bytes() {
        let png_header = &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        assert_eq!(detect_mime_from_bytes(png_header), Some("image/png"));
    }

    #[test]
    fn rejects_mime_mismatch() {
        let jpeg = &[0xFF, 0xD8, 0xFF, 0x00];
        let err = validate_upload(jpeg, "image/png").unwrap_err();
        assert!(matches!(err, ValidationError::MimeMismatch { .. }));
    }
}
```

**Auth — token TTL** (`screenraid-server`):

```rust
#[tokio::test]
async fn access_token_expires_in_900_seconds() {
    let response = register_test_user().await;
    assert_eq!(response.expires_in, 900);
}
```

**Refresh rotation:**

```rust
#[tokio::test]
async fn refresh_token_rotation_revokes_old_token() {
    let auth = register_test_user().await;
    let refreshed = refresh(&auth.refresh_token).await.unwrap();
    // Old refresh token must fail
    assert!(refresh(&auth.refresh_token).await.is_err());
    // New token works
    assert!(refresh(&refreshed.refresh_token).await.is_ok());
}
```

### 2.4 Integration Test Harness

Use `axum-test` or spawn the real server on a random port:

```rust
async fn spawn_test_server() -> (String, TestApp) {
    let pool = setup_test_db().await;
    let config = test_config();
    let state = AppState::new(pool, config);
    let app = create_router(state);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://{}", addr), TestApp { /* ... */ })
}
```

---

## 3. SQLx Test Database / Base de test

### 3.1 Options

| Mode | `DATABASE_URL` | Use case |
|------|----------------|----------|
| **In-memory** | `sqlite::memory:` | Fast unit tests, no filesystem |
| **Temp file** | `sqlite:///tmp/screenraid-test-{uuid}.db` | Integration tests with migrations |
| **SQLx fixtures** | `sqlx::test` macro | Per-test transaction rollback (Postgres) |

ScreenRaid uses SQLite. Recommended pattern for server integration tests:

```rust
async fn setup_test_db() -> SqlitePool {
    let db_url = format!("sqlite:///tmp/screenraid-test-{}.db", Uuid::new_v4());
    let options = SqliteConnectOptions::from_str(&db_url)
        .unwrap()
        .create_if_missing(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    pool
}
```

Drop the temp file in `Drop` impl or use `tempfile` crate.

### 3.2 SQLx Offline Mode (CI)

For compile-time query checking without a live DB during `cargo build`:

```bash
# Generate query metadata (run once when SQL changes)
cargo sqlx prepare --workspace

# CI build with offline flag
SQLX_OFFLINE=true cargo build -p screenraid-server
```

Commit `.sqlx/` directory to the repository when using offline mode.

### 3.3 Seed Fixtures

Reference seed script (not auto-run): `scripts/seed-dev.sql` per [DATABASE.md](./DATABASE.md).

For tests, prefer programmatic fixtures:

```rust
async fn seed_alice_bob(pool: &SqlitePool) -> (Uuid, Uuid) {
    // Insert users, friendship, room — return IDs
}
```

---

## 4. API Integration Tests

Base URL: `/v1`. Reference: [API.md](./API.md).

### 4.1 Authentication

| Test case | Method | Expected |
|-----------|--------|----------|
| Register valid user | `POST /auth/register` | `201`, tokens + user |
| Register duplicate username | `POST /auth/register` | `409` |
| Register short password | `POST /auth/register` | `400` validation |
| Login valid | `POST /auth/login` | `200`, tokens |
| Login wrong password | `POST /auth/login` | `401` |
| Login banned user (`is_active=0`) | `POST /auth/login` | `403` |
| Refresh valid token | `POST /auth/refresh` | `200`, new tokens |
| Refresh reused token | `POST /auth/refresh` | `401` (rotation) |
| Logout | `POST /auth/logout` | `204` |
| Me without token | `GET /auth/me` | `401` |
| Me with token | `GET /auth/me` | `200`, profile |

### 4.2 Rooms

| Test case | Method | Expected |
|-----------|--------|----------|
| Create room | `POST /rooms/` | `201`, invite code |
| List my rooms | `GET /rooms/` | `200`, array |
| Join by invite | `POST /rooms/join` | `200` |
| Join invalid code | `POST /rooms/join` | `404` |
| Get room detail | `GET /rooms/{id}` | `200` |
| Non-member get room | `GET /rooms/{id}` | `403` |
| Leave room | `POST /rooms/{id}/leave` | `204` |
| Kick member (admin) | `DELETE /rooms/{id}/members/{uid}` | `204` |
| Kick without permission | `DELETE /rooms/{id}/members/{uid}` | `403` |
| Delete room (owner) | `DELETE /rooms/{id}` | `204` |

### 4.3 Friends

| Test case | Method | Expected |
|-----------|--------|----------|
| Send request | `POST /friends/request` | `201` |
| List requests | `GET /friends/requests` | `200` |
| Accept request | `POST /friends/{id}/accept` | `200` |
| Decline request | `POST /friends/{id}/decline` | `204` |
| Block user | `POST /friends/{id}/block` | `200` |
| Request to blocked user | `POST /friends/request` | `403` |
| List friends | `GET /friends/` | `200` |
| Remove friend | `DELETE /friends/{id}` | `204` |

### 4.4 Health

```bash
curl -s http://localhost:8080/v1/health | jq .
curl -s http://localhost:8080/v1/health/ready | jq .
```

### 4.5 Example Test Skeleton

```rust
// server/tests/api_auth.rs
use reqwest::Client;

#[tokio::test]
async fn register_and_login_roundtrip() {
    let base = test_server_url().await;
    let client = Client::new();

    let reg = client
        .post(format!("{}/v1/auth/register", base))
        .json(&serde_json::json!({
            "username": "testuser",
            "email": "test@example.com",
            "password": "password123",
            "display_name": "Test User"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(reg.status(), 201);

    let login = client
        .post(format!("{}/v1/auth/login", base))
        .json(&serde_json::json!({
            "username": "testuser",
            "password": "password123"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(login.status(), 200);
}
```

---

## 5. WebSocket Tests

Protocol: [WEBSOCKET.md](./WEBSOCKET.md). Endpoint: `GET /v1/ws?token=<access_token>`.

### 5.1 Test Matrix

| Test case | Steps | Expected |
|-----------|-------|----------|
| Connect valid JWT | WS upgrade with query token | `101`, first message `connected` |
| Connect invalid JWT | WS with bad token | HTTP `401`, no upgrade |
| Connect expired JWT | WS with expired token | HTTP `401` |
| `connected` payload | Parse first frame | `user_id`, `session_id` match JWT |
| `subscribe_room` member | Send subscribe for joined room | `subscribed` ack |
| `subscribe_room` non-member | Subscribe foreign room | `error` or no subscription (per spec) |
| `unsubscribe_room` | Subscribe then unsubscribe | No further room events |
| `ping` / `pong` | Send `ping` JSON | Receive `pong` within 5 s |
| Presence on connect | Second client watches | `presence:update` `online` |
| Presence on disconnect | Close socket | `offline` when last session |
| `prank:incoming` (future) | Send prank via REST | Target WS receives event |

### 5.2 Example WebSocket Test

```rust
// server/tests/ws_protocol.rs
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[tokio::test]
async fn ws_connected_and_ping_pong() {
    let token = obtain_access_token().await;
    let url = format!("ws://127.0.0.1:{}/v1/ws?token={}", port(), token);

    let (mut ws, _) = connect_async(&url).await.unwrap();

    // First message: connected
    let msg = ws.next().await.unwrap().unwrap();
    let text = msg.to_text().unwrap();
    let envelope: serde_json::Value = serde_json::from_str(text).unwrap();
    assert_eq!(envelope["type"], "connected");
    assert!(envelope["payload"]["user_id"].is_string());

    // ping → pong
    let ping = serde_json::json!({
        "type": "ping",
        "payload": {},
        "timestamp": chrono::Utc::now().to_rfc3339()
    });
    ws.send(Message::Text(ping.to_string())).await.unwrap();

    let pong = ws.next().await.unwrap().unwrap();
    let pong_json: serde_json::Value = serde_json::from_str(pong.to_text().unwrap()).unwrap();
    assert_eq!(pong_json["type"], "pong");
}
```

### 5.3 Subscribe Room Test

```rust
#[tokio::test]
async fn ws_subscribe_room_ack() {
    let (token, room_id) = user_with_room().await;
    let url = format!("ws://127.0.0.1:{}/v1/ws?token={}", port(), token);
    let (mut ws, _) = connect_async(&url).await.unwrap();

    // Skip connected
    ws.next().await;

    let sub = serde_json::json!({
        "type": "subscribe_room",
        "payload": { "room_id": room_id },
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "request_id": "test-001"
    });
    ws.send(Message::Text(sub.to_string())).await.unwrap();

    let ack = ws.next().await.unwrap().unwrap();
    let ack_json: serde_json::Value = serde_json::from_str(ack.to_text().unwrap()).unwrap();
    assert_eq!(ack_json["type"], "subscribed");
    assert_eq!(ack_json["payload"]["room_id"], room_id);
}
```

---

## 6. Overlay Engine Tests (Phase 6)

> **Status:** Planned for Phase 6 — overlay window system. Specification: [OVERLAY_ENGINE.md](./OVERLAY_ENGINE.md).

### 6.1 Rust Unit Tests (`client/src-tauri/src/overlay/`)

| Module | Tests |
|--------|-------|
| `queue.rs` | Priority ordering, max 8 global / 4 per monitor, eviction of `Low` |
| `queue.rs` | Expiration tick (16 ms), grace period, hard cap at `duration + 5s` |
| `monitor.rs` | `Primary` resolution, `Monitor(n)` mapping |
| `panic.rs` | `panic_hide_all()` clears queue + signals webviews |
| `cache.rs` | LRU eviction at 500 MB limit |

```rust
#[test]
fn queue_drops_low_priority_when_full() {
    let mut q = OverlayQueue::new(test_config());
    fill_to_capacity(&mut q, QueuePriority::Normal);
    let result = q.enqueue(make_overlay(QueuePriority::Low));
    assert!(matches!(result, EnqueueResult::Dropped(QueueFull)));
}
```

### 6.2 WebView / React Tests

| Area | Tool | Cases |
|------|------|-------|
| `OverlayCanvas` | Vitest + RTL | Renders image/GIF/video/audio |
| Animations | Vitest | Fade in/out timing |
| IPC handlers | Mock Tauri events | `overlay:show`, `overlay:clear` |

### 6.3 Integration (Tauri)

| Test | Method |
|------|--------|
| Window created on prank | `tauri::test` harness |
| Click-through default | Window flags assertion |
| Multi-window per monitor | Mock `MonitorInfo` with 2 displays |

### 6.4 Consent Gate

Verify overlay manager **does not** call `show_overlay` when `global_consent = false` or `is_paused = true` even if WS delivers event (defense in depth).

---

## 7. Multi-Monitor & Virtual Placement Tests

### 7.0 Virtual Monitor Placement (MVP)

| Test ID | Scenario | Type | Pass criteria |
|---------|----------|------|---------------|
| VMP-01 | Single monitor placement | Integration | `PUT /users/me/monitors` with 1 monitor; `GET` returns same topology |
| VMP-02 | Dual monitor placement | Integration | Two monitors with offsets; canvas renders side-by-side |
| VMP-03 | Triple monitor placement | Manual | Three monitors; all indices mapped correctly |
| VMP-04 | DPI scaling | Unit | `scale_factor: 1.25` stored; canvas preview aspect ratio correct |
| VMP-05 | Coordinate normalization | Unit | `(0.5, 0.5)` → center pixels for 1920×1080 and 2560×1440 |
| VMP-06 | Monitor hotplug update | Integration | Layout change → `monitor:changed` WS → canvas refresh |
| VMP-07 | Drag-and-drop placement | E2E | Drag on canvas → prank config `x/y` in 0.0–1.0 range |
| VMP-08 | Overlay rendering accuracy | E2E | Sent `(0.5, 0.5)` appears visually centered on target monitor |
| VMP-09 | No screen data in API | Security | Monitor endpoints JSON contains no image/binary fields |
| VMP-10 | Per-monitor targeting | Unit | `monitor_index: 1` renders only on second display |

**Coordinate normalization unit test example:**

```rust
#[test]
fn normalized_center_maps_to_monitor_center() {
    let monitor = MonitorInfo { x: 0, y: 0, width: 2560, height: 1440, .. };
    let pos = OverlayTargetPosition { x: 0.5, y: 0.5, monitor_index: 0, .. };
    let (px, py) = to_pixel_coords(&monitor, &pos);
    assert_eq!(px, 1280);
    assert_eq!(py, 720);
}
```

**Drag-and-drop E2E (Playwright/Tauri):**

1. User A syncs dual-monitor layout.
2. User B opens room, selects User A as target.
3. B drags overlay to center of Monitor 1 on canvas.
4. B sends prank → config contains `x: ~0.5`, `y: ~0.5`, `monitor_index: 0`.
5. User A sees overlay centered on primary display.

### 7.1 Manual Tests (Windows)

ScreenRaid targets Windows for multi-monitor overlay support.

| Scenario | Procedure | Pass criteria |
|----------|-----------|---------------|
| Primary only | 1 monitor | Overlay on primary |
| Extended desktop | 2+ monitors | Select monitor in Settings → overlay on correct display |
| Monitor hotplug | Disconnect/reconnect | App rescans; no crash |
| Different DPI | Mixed 100%/150% | Overlay scaled correctly, no offset drift |
| Per-monitor queue | Pranks to monitor 0 and 1 | Independent queues, max 4 each |

**Setup checklist:**

1. Windows Display Settings → extend displays.
2. ScreenRaid Settings → `selected_monitor` = `primary` / `0` / `1`.
3. Send test prank from second account in same room.
4. Verify position via screenshot or visual inspection.

### 7.2 Mocked Tests (CI-safe)

CI runners typically have no real multi-monitor topology. Mock `MonitorInfo`:

```rust
fn mock_monitors_dual() -> Vec<MonitorInfo> {
    vec![
        MonitorInfo { id: 0, name: "DISPLAY1".into(), x: 0, y: 0, width: 1920, height: 1080, scale: 1.0, is_primary: true },
        MonitorInfo { id: 1, name: "DISPLAY2".into(), x: 1920, y: 0, width: 1920, height: 1080, scale: 1.0, is_primary: false },
    ]
}

#[test]
fn routes_overlay_to_monitor_1() {
    let monitors = mock_monitors_dual();
    let target = resolve_monitor(&monitors, MonitorTarget::Monitor(1));
    assert_eq!(target.id, 1);
    assert_eq!(target.x, 1920);
}
```

### 7.3 Regression Targets

- Window label `overlay-{monitor_id}` matches target
- `overlay.html` URL loads on each window
- Panic hides **all** monitor windows

---

## 8. Client & E2E Tests

### 8.1 Frontend (Vitest)

```bash
cd client
npm test
```

| Area | Tests |
|------|-------|
| Auth store | Token refresh before expiry |
| API client | Attaches Bearer header |
| WS wrapper | Reconnect with backoff |

### 8.2 Manual E2E checklist (MVP)

Run with server + two Tauri clients (or one client + API). Mark each scenario before release.

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| MVP-QA-001 | Register + befriend | Two users register → send friend request → accept | Both see each other online in Friends |
| MVP-QA-002 | Room prank (image) | Create room → join → upload image → send prank to member | Receiver overlay shows image, auto-dismisses |
| MVP-QA-003 | Consent revoke | Target revokes consent → sender sends prank | `prank:blocked`, no overlay |
| MVP-QA-004 | Panic hotkey | Overlay visible → `Ctrl+Shift+Esc` | All overlays cleared immediately |
| MVP-QA-VMP | Monitor placement | Target syncs monitors → sender drags on canvas → text prank | Overlay appears at normalized position on correct monitor |

### 8.3 Automated E2E (future)

| Tool | Scope |
|------|-------|
| Playwright (web mode) | Auth pages, dashboard navigation |
| Tauri WebDriver | Full desktop flow with real window |

Mark E2E as `#[ignore]` or separate workflow job (slower, Windows runner).

---

## 9. CI/CD — GitHub Actions

Example workflow for the monorepo. Save as `.github/workflows/ci.yml` when ready.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1
  JWT_SECRET: test-secret-for-ci-only
  DATABASE_URL: sqlite::memory:
  SQLX_OFFLINE: true

jobs:
  rust:
    name: Rust — lint & test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Cache cargo registry
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}

      - name: cargo fmt
        run: cargo fmt --all -- --check

      - name: cargo clippy
        run: cargo clippy --workspace --all-targets -- -D warnings

      - name: cargo test (workspace)
        run: cargo test --workspace

      - name: cargo test (server integration)
        run: cargo test -p screenraid-server --test '*' -- --test-threads=1

  docker:
    name: Docker — build image
    runs-on: ubuntu-latest
    needs: rust
    steps:
      - uses: actions/checkout@v4

      - name: Build server image
        run: docker compose build server

      - name: Smoke test container
        run: |
          docker compose up -d server
          sleep 5
          curl -sf http://localhost:8080/v1/health
          curl -sf http://localhost:8080/v1/health/ready
          docker compose down

  client:
    name: Client — typecheck & unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: client/package-lock.json

      - name: Install dependencies
        working-directory: client
        run: npm ci

      - name: Typecheck
        working-directory: client
        run: npm run build --if-present || npx tsc --noEmit

      - name: Vitest
        working-directory: client
        run: npm test --if-present
```

### 9.1 Optional Jobs

| Job | Trigger | Purpose |
|-----|---------|---------|
| `release` | Tag `v*` | Build Tauri installer, push Docker image to GHCR |
| `deploy` | Push to `main` | SSH to production host, `docker compose pull && up -d` |
| `windows-overlay` | Nightly | Manual multi-monitor suite on `windows-latest` |

### 9.2 Deploy Integration

See [DEPLOYMENT.md](./DEPLOYMENT.md) Section 10 for Watchtower and migration-safe rollout.

---

## 10. UI Mockups & Visual QA

### 10.1 Wireframes Reference

Screen layouts, consent gate, dashboard, room view, and settings are documented in **[WIREFRAMES.md](./WIREFRAMES.md)** (UI mockups and flow diagrams).

Use wireframes as the visual acceptance baseline when implementing or reviewing UI PRs.

### 10.2 Design System Compliance

All UI tests should reference tokens from [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md):

| Check | Token |
|-------|-------|
| Background | `#1a1a1a` |
| Card surfaces | `#2f2f2f`, `rounded-2xl` |
| Accent | `#f97316` (not on panic button) |
| No glassmorphism | No `backdrop-filter` |

### 10.3 Visual Regression (future)

| Tool | Scope |
|------|-------|
| Chromatic / Percy | Storybook components |
| Manual screenshot diff | Key screens vs WIREFRAMES.md |

### 10.4 Accessibility Smoke Tests

- Consent gate: keyboard navigable, focus visible
- Panic button: reachable via keyboard shortcut
- Color contrast: WCAG AA per DESIGN_SYSTEM.md

---

## 11. Test Data & Fixtures

### 11.1 Test Users

| Username | Password | Role in fixtures |
|----------|----------|------------------|
| `alice` | `password123` | Room owner |
| `bob` | `password123` | Room member |
| `charlie` | `password123` | Outsider (non-member) |

### 11.2 Factory Helpers

```rust
pub async fn TestUser::register(client: &Client, name: &str) -> Self { /* ... */ }
pub async fn TestRoom::create(owner: &TestUser) -> Self { /* ... */ }
pub async fn TestFriendship::accept(a: &TestUser, b: &TestUser) -> Self { /* ... */ }
```

### 11.3 Cleanup

- Delete temp SQLite files after each test
- `docker compose down -v` in CI smoke job
- Never use production `JWT_SECRET` or database in tests

---

## 12. Coverage Goals

| Area | Target | Priority |
|------|--------|----------|
| `screenraid-validation` | ≥ 90% | P0 |
| Auth service (JWT, rotation) | ≥ 85% | P0 |
| Room / friend handlers | ≥ 75% | P1 |
| WebSocket handler | ≥ 70% | P1 |
| Overlay queue (Phase 6) | ≥ 80% | P1 |
| Tauri IPC / windows | Manual + mocked | P2 |
| UI components | Snapshot + a11y | P2 |

Generate coverage (optional):

```bash
cargo llvm-cov --workspace --html
```

---

## Related Documents

| Document | Topic |
|----------|-------|
| [API.md](./API.md) | Endpoint contracts for API tests |
| [WEBSOCKET.md](./WEBSOCKET.md) | Event shapes for WS tests |
| [SECURITY.md](./SECURITY.md) | Security regression cases |
| [OVERLAY_ENGINE.md](./OVERLAY_ENGINE.md) | Overlay test specification (Phase 6) |
| [WIREFRAMES.md](./WIREFRAMES.md) | UI mockups for visual QA |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | CI deploy and Docker smoke tests |
