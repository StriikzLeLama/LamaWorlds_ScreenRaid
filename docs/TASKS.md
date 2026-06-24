# ScreenRaid — MVP Implementation Tasks

> Actionable task breakdown for the entire MVP. Status: ✅ done · 🔄 in progress · 🔲 pending.

**Total estimated hours (MVP):** ~280h

---

## Legend

| Column | Description |
|--------|-------------|
| **ID** | Unique task identifier (`MVP-<MODULE>-<NNN>`) |
| **Dependencies** | Task IDs that must complete first |
| **Hours** | Estimated implementation time |
| **Files** | Primary files created or modified |
| **DoD** | Definition of done |

---

## 0 — Foundation

| ID | Description | Dependencies | Hours | Files | DoD | Status |
|----|-------------|--------------|-------|-------|-----|--------|
| MVP-FND-001 | Cargo workspace with shared crates | — | 4 | `Cargo.toml`, `crates/*` | `cargo build` succeeds for all members | ✅ |
| MVP-FND-002 | SQLx initial schema migration | MVP-FND-001 | 6 | `server/migrations/001_initial_schema.sql` | Migration runs clean on empty DB | ✅ |
| MVP-FND-003 | Server health endpoints | MVP-FND-001 | 2 | `server/src/api/handlers/health.rs` | `GET /health` returns 200 | ✅ |
| MVP-FND-004 | Tauri + React scaffold | MVP-FND-001 | 8 | `client/`, `client/src-tauri/` | App window opens with HomeBoard theme | ✅ |
| MVP-FND-005 | Docker compose dev stack | MVP-FND-002 | 3 | `docker-compose.yml`, `.env.example` | Server starts via compose | ✅ |
| MVP-FND-006 | Design system tokens + UI kit | MVP-FND-004 | 6 | `docs/DESIGN_SYSTEM.md`, `client/src/components/ui/*` | Button, Card, Input, Modal styled | ✅ |

---

## 1 — Authentication

| ID | Description | Dependencies | Hours | Files | DoD | Status |
|----|-------------|--------------|-------|-------|-----|--------|
| MVP-AUTH-001 | User repository (CRUD) | MVP-FND-002 | 4 | `server/src/repository/user_repo.rs` | Create/find user by email | ✅ |
| MVP-AUTH-002 | Argon2id password hashing | MVP-AUTH-001 | 3 | `server/src/service/auth_service.rs` | Passwords never stored plain | ✅ |
| MVP-AUTH-003 | JWT access + refresh tokens | MVP-AUTH-002 | 6 | `server/src/service/auth_service.rs` | Access 15min, refresh 30d hashed | ✅ |
| MVP-AUTH-004 | Auth HTTP handlers | MVP-AUTH-003 | 4 | `server/src/api/handlers/auth.rs` | Register, login, refresh, logout work | ✅ |
| MVP-AUTH-005 | Auth middleware (`AuthUser`) | MVP-AUTH-003 | 4 | `server/src/api/middleware/auth.rs` | Protected routes reject invalid JWT | ✅ |
| MVP-AUTH-006 | Shared auth types | MVP-FND-001 | 2 | `crates/screenraid-types/src/auth.rs` | Types used by server + client | ✅ |
| MVP-AUTH-007 | Client auth service + store | MVP-AUTH-004 | 6 | `client/src/services/auth.ts`, `stores/authStore.ts` | Tokens persisted, logout clears | ✅ |
| MVP-AUTH-008 | Login / Register pages | MVP-AUTH-007 | 6 | `client/src/pages/LoginPage.tsx`, `RegisterPage.tsx` | User can register and log in | ✅ |
| MVP-AUTH-009 | API client with auto-refresh | MVP-AUTH-007 | 4 | `client/src/services/api.ts` | 401 triggers refresh, retry request | ✅ |

---

## 2 — Friends

| ID | Description | Dependencies | Hours | Files | DoD | Status |
|----|-------------|--------------|-------|-------|-----|--------|
| MVP-FRD-001 | Friend repository | MVP-AUTH-001 | 4 | `server/src/repository/friend_repo.rs` | Send/accept/decline/list friends | ✅ |
| MVP-FRD-002 | Friend service | MVP-FRD-001 | 4 | `server/src/service/friend_service.rs` | Duplicate requests rejected | ✅ |
| MVP-FRD-003 | Friend HTTP handlers | MVP-FRD-002 | 4 | `server/src/api/handlers/friends.rs` | All `/v1/friends/*` routes work | ✅ |
| MVP-FRD-004 | Shared friend types | MVP-FND-001 | 2 | `crates/screenraid-types/src/friend.rs` | Request/response types aligned | ✅ |
| MVP-FRD-005 | Client friends service | MVP-FRD-003 | 4 | `client/src/services/friends.ts` | API calls typed | ✅ |
| MVP-FRD-006 | Friends page UI | MVP-FRD-005 | 8 | `client/src/pages/FriendsPage.tsx` | Send request, accept, list friends | ✅ |

---

## 3 — Rooms

| ID | Description | Dependencies | Hours | Files | DoD | Status |
|----|-------------|--------------|-------|-------|-----|--------|
| MVP-ROOM-001 | Room repository | MVP-AUTH-001 | 6 | `server/src/repository/room_repo.rs` | CRUD rooms, members, roles | ✅ |
| MVP-ROOM-002 | Room service | MVP-ROOM-001 | 6 | `server/src/service/room_service.rs` | Join/leave, owner permissions | ✅ |
| MVP-ROOM-003 | Room HTTP handlers | MVP-ROOM-002 | 6 | `server/src/api/handlers/rooms.rs` | All `/v1/rooms/*` routes work | ✅ |
| MVP-ROOM-004 | Shared room types | MVP-FND-001 | 2 | `crates/screenraid-types/src/room.rs` | Member, role types exported | ✅ |
| MVP-ROOM-005 | Client rooms service | MVP-ROOM-003 | 4 | `client/src/services/rooms.ts` | Create, list, join API | ✅ |
| MVP-ROOM-006 | Rooms list page | MVP-ROOM-005 | 6 | `client/src/pages/RoomsPage.tsx` | Create room, see room list | ✅ |
| MVP-ROOM-007 | Room detail page | MVP-ROOM-006 | 8 | `client/src/pages/RoomPage.tsx` | Members, consent status per member | ✅ |

---

## 4 — WebSocket

| ID | Description | Dependencies | Hours | Files | DoD | Status |
|----|-------------|--------------|-------|-------|-----|--------|
| MVP-WS-001 | WS hub (sessions, rooms) | MVP-AUTH-005 | 8 | `server/src/websocket/hub.rs` | Register/unregister sessions | ✅ |
| MVP-WS-002 | WS handler + upgrade | MVP-WS-001 | 6 | `server/src/websocket/handler.rs` | JWT auth on connect | ✅ |
| MVP-WS-003 | Presence broadcast | MVP-WS-002 | 4 | `server/src/websocket/hub.rs` | `presence:changed` on connect/disconnect | ✅ |
| MVP-WS-004 | Room subscribe/unsubscribe | MVP-WS-002 | 4 | `server/src/websocket/handler.rs` | Room events routed to subscribers | ✅ |
| MVP-WS-005 | Shared WS envelope types | MVP-FND-001 | 2 | `crates/screenraid-types/src/websocket.rs` | Typed message envelopes | ✅ |
| MVP-WS-006 | Client WebSocket service | MVP-WS-002 | 6 | `client/src/services/websocket.ts` | Connect, reconnect, heartbeat | ✅ |
| MVP-WS-007 | `useWebSocket` hook | MVP-WS-006 | 4 | `client/src/hooks/useWebSocket.ts` | Auto-connect on auth, dispatch events | ✅ |
| MVP-WS-008 | Friend/room event wiring | MVP-WS-007 | 4 | `client/src/pages/*` | UI refreshes on WS events | ✅ |

---

## 5 — Consent & Security

| ID | Description | Dependencies | Hours | Files | DoD | Status |
|----|-------------|--------------|-------|-------|-----|--------|
| MVP-CNS-001 | Consent repository | MVP-FND-002 | 4 | `server/src/repository/consent_repo.rs` | Global + per-room consent rows | ✅ |
| MVP-CNS-002 | Consent service | MVP-CNS-001 | 6 | `server/src/service/consent_service.rs` | grant/revoke/pause/resume, `can_receive()` | ✅ |
| MVP-CNS-003 | Consent HTTP handlers | MVP-CNS-002 | 4 | `server/src/api/handlers/consent.rs` | All `/v1/consent/*` routes work | ✅ |
| MVP-CNS-004 | Room member consent status | MVP-CNS-002 | 3 | `server/src/service/room_service.rs` | Members show real consent in API | ✅ |
| MVP-CNS-005 | WS `consent:sync` handler | MVP-CNS-002 | 3 | `server/src/websocket/handler.rs` | Client sync updates server state | ✅ |
| MVP-CNS-006 | Rate limiting middleware | MVP-AUTH-004 | 6 | `server/src/api/middleware/rate_limit.rs` | Login/register/API limits enforced | ✅ |
| MVP-CNS-007 | Client consent service | MVP-CNS-003 | 4 | `client/src/services/consent.ts` | API calls for all consent actions | ✅ |
| MVP-CNS-008 | Consent Zustand store | MVP-CNS-007 | 4 | `client/src/stores/consentStore.ts` | State persisted, WS sync on change | ✅ |
| MVP-CNS-009 | Consent gate component | MVP-CNS-008 | 4 | `client/src/components/ConsentGate.tsx` | First-run prompt grants via API | ✅ |
| MVP-CNS-010 | Settings consent controls | MVP-CNS-008 | 3 | `client/src/pages/SettingsPage.tsx` | Grant/revoke/resume buttons work | ✅ |
| MVP-CNS-011 | Panic hotkey (Ctrl+Shift+Esc) | MVP-FND-004 | 4 | `client/src-tauri/src/lib.rs`, `hooks/usePanicHotkey.ts` | Hotkey clears overlays + pauses consent | ✅ |
| MVP-CNS-012 | Load consent on login/WS | MVP-CNS-008 | 2 | `hooks/useWebSocket.ts` | Consent fetched on connect | ✅ |
| MVP-CNS-013 | Audit log for consent changes | MVP-CNS-002 | 4 | `server/src/service/consent_service.rs` | Consent changes written to audit table | ✅ |

---

## 6 — Media Upload

| ID | Description | Dependencies | Hours | Files | DoD | Status |
|----|-------------|--------------|-------|-------|-----|--------|
| MVP-MED-001 | Validation crate (MIME, size) | MVP-FND-001 | 4 | `crates/screenraid-validation/*` | PNG/JPG/WebP/GIF allowed, limits enforced | ✅ |
| MVP-MED-002 | Media repository | MVP-FND-002 | 4 | `server/src/repository/media_repo.rs` | Store metadata in DB | ✅ |
| MVP-MED-003 | Media storage service | MVP-MED-001 | 8 | `server/src/service/media_service.rs` | Files saved to `MEDIA_ROOT`, SHA-256 dedup | ✅ |
| MVP-MED-004 | Upload HTTP handler | MVP-MED-003 | 6 | `server/src/api/handlers/media.rs` | `POST /v1/media/upload` multipart | ✅ |
| MVP-MED-005 | Media download endpoint | MVP-MED-003 | 4 | `server/src/api/handlers/media.rs` | `GET /v1/media/{id}/file` streams file | ✅ |
| MVP-MED-006 | Shared media types | MVP-FND-001 | 2 | `crates/screenraid-types/src/media.rs` | Upload response, media record types | ✅ |
| MVP-MED-007 | Client media service | MVP-MED-004 | 4 | `client/src/services/media.ts` | Upload with progress, list media | ✅ |
| MVP-MED-008 | Media library page | MVP-MED-007 | 8 | `client/src/pages/MediaLibraryPage.tsx` | Upload, preview thumbnails, delete | ✅ |
| MVP-MED-009 | Room-scoped media list | MVP-MED-004 | 4 | `server/src/api/handlers/media.rs` | `GET /v1/rooms/{id}/media` | ✅ |

---

## 6b — Virtual Monitor Placement (MVP)

| ID | Description | Dependencies | Hours | Files | DoD | Status |
|----|-------------|--------------|-------|-------|-----|--------|
| MVP-VMP-001 | Monitor layout DB migration | MVP-FND-002 | 3 | `server/migrations/002_monitor_layouts.sql` | Tables created | ✅ |
| MVP-VMP-002 | Monitor repo + service | MVP-VMP-001 | 6 | `server/src/repository/monitor_repo.rs` | Upsert layout + monitors | ✅ |
| MVP-VMP-003 | Monitor HTTP handlers | MVP-VMP-002 | 4 | `server/src/api/handlers/monitors.rs` | GET/PUT monitor endpoints | ✅ |
| MVP-VMP-004 | WS monitor:update/changed | MVP-VMP-002 | 4 | `server/src/websocket/handler.rs` | Room broadcast on change | ✅ |
| MVP-VMP-005 | Client monitor collector | MVP-FND-004 | 6 | `client/src-tauri/src/commands/monitor.rs` | Tauri monitor enumeration | ✅ |
| MVP-VMP-006 | MonitorCanvas UI | MVP-VMP-003 | 12 | `client/src/components/placement/MonitorCanvas.tsx` | Virtual layout + drag-drop | ✅ |
| MVP-VMP-007 | OverlayTargetPosition types | MVP-FND-001 | 2 | `crates/screenraid-types/src/prank.rs` | Normalized coords model | ✅ |
| MVP-VMP-008 | Coordinate transform in overlay | MVP-OVL-004 | 6 | `client/src-tauri/src/commands/window.rs` | Per-monitor overlay window | ✅ |

---

## 7 — Prank Pipeline

| ID | Description | Dependencies | Hours | Files | DoD | Status |
|----|-------------|--------------|-------|-------|-----|--------|
| MVP-PRK-001 | Prank repository | MVP-FND-002 | 4 | `server/src/repository/prank_repo.rs` | Store prank records + status | ✅ |
| MVP-PRK-002 | Prank service | MVP-PRK-001 | 8 | `server/src/service/prank_service.rs` | Validate consent, role, rate limits | ✅ |
| MVP-PRK-003 | Send prank HTTP handler | MVP-PRK-002 | 4 | `server/src/api/handlers/pranks.rs` | `POST /v1/rooms/{id}/pranks` | ✅ |
| MVP-PRK-004 | WS `prank:incoming` event | MVP-PRK-002 | 4 | `server/src/websocket/hub.rs` | Target user receives prank payload | ✅ |
| MVP-PRK-005 | WS `prank:ack` from receiver | MVP-PRK-004 | 3 | `server/src/websocket/handler.rs` | Delivery acknowledged | ✅ |
| MVP-PRK-006 | Shared prank types | MVP-FND-001 | 2 | `crates/screenraid-types/src/prank.rs` | Prank config, overlay payload types | ✅ |
| MVP-PRK-007 | Client prank service | MVP-PRK-003 | 4 | `client/src/services/pranks.ts` | Send prank API | ✅ |
| MVP-PRK-008 | Send prank UI in room | MVP-PRK-007 | 8 | `client/src/pages/RoomPage.tsx` | Pick media/text, send to member | ✅ |
| MVP-PRK-009 | Incoming prank handler (client) | MVP-PRK-004 | 6 | `client/src/hooks/usePrankReceiver.ts` | WS event triggers overlay show | ✅ |
| MVP-PRK-010 | Consent gate on receive | MVP-CNS-002 | 3 | `server/src/service/prank_service.rs` | Prank rejected if `can_receive()` false | ✅ |

---

## 8 — Overlay Engine

| ID | Description | Dependencies | Hours | Files | DoD | Status |
|----|-------------|--------------|-------|-------|-----|--------|
| MVP-OVL-001 | Overlay window (transparent) | MVP-FND-004 | 12 | `client/src-tauri/src/commands/window.rs` | Always-on-top, click-through, fullscreen | ✅ |
| MVP-OVL-002 | Overlay manager (Rust) | MVP-FND-004 | 6 | `client/src-tauri/src/commands/overlay.rs` | Track active overlays, panic clear | ✅ |
| MVP-OVL-003 | `show_overlay` / `hide_overlay` commands | MVP-OVL-002 | 4 | `client/src-tauri/src/commands/overlay.rs` | Tauri invoke + IPC emit | ✅ |
| MVP-OVL-004 | Overlay React window | MVP-OVL-001 | 8 | `client/src/overlay/*`, `overlay.html` | Dedicated webview renders overlays | ✅ |
| MVP-OVL-005 | Overlay Zustand store | MVP-OVL-003 | 4 | `client/src/overlay/OverlayApp.tsx` | Event-driven overlay state | ✅ |
| MVP-OVL-006 | `useOverlay` hook | MVP-OVL-005 | 4 | `client/src/hooks/usePrankReceiver.ts` | WS → invoke show_overlay | ✅ |
| MVP-OVL-007 | Duration auto-dismiss timer | MVP-OVL-003 | 3 | `client/src-tauri/src/commands/overlay.rs` | Rust timer emits overlay:hide | ✅ |
| MVP-OVL-008 | Notification on incoming prank | MVP-PRK-009 | 3 | `client/src/hooks/usePrankReceiver.ts` | Desktop notification before overlay | ✅ |

---

## 9 — Image Overlays

| ID | Description | Dependencies | Hours | Files | DoD | Status |
|----|-------------|--------------|-------|-------|-----|--------|
| MVP-IMG-001 | Download media to client cache | MVP-MED-005 | 6 | `client/src/hooks/usePrankReceiver.ts` | Blob URL for authenticated media | ✅ |
| MVP-IMG-002 | Image overlay renderer | MVP-OVL-004 | 8 | `client/src/overlay/components/ImageOverlay.tsx` | PNG/JPG/WebP/GIF displayed | ✅ |
| MVP-IMG-003 | Position + scale config | MVP-IMG-002 | 4 | `OverlayPayload` position_x/y | Config applied to render | ✅ |
| MVP-IMG-004 | Fade-in animation | MVP-IMG-002 | 3 | `client/src/overlay/overlay.css` | CSS fade/zoom/bounce | ✅ |

---

## 10 — Text Overlays

| ID | Description | Dependencies | Hours | Files | DoD | Status |
|----|-------------|--------------|-------|-------|-----|--------|
| MVP-TXT-001 | Text overlay renderer | MVP-OVL-004 | 6 | `client/src/overlay/components/TextOverlay.tsx` | Text with sender name | ✅ |
| MVP-TXT-002 | Text prank config types | MVP-PRK-006 | 2 | `crates/screenraid-types/src/prank.rs` | Text, position fields | ✅ |
| MVP-TXT-003 | Send text prank UI | MVP-PRK-008 | 4 | `client/src/pages/RoomPage.tsx` | Text input + send | ✅ |
| MVP-TXT-004 | Text fade animation | MVP-TXT-001 | 2 | `client/src/overlay/overlay.css` | Shared animation classes | ✅ |

---

## 11 — Integration & QA

| ID | Description | Dependencies | Hours | Files | DoD | Status |
|----|-------------|--------------|-------|-------|-----|--------|
| MVP-QA-001 | E2E: register two users, befriend | MVP-FRD-006 | 4 | manual / `docs/TESTING.md` | Full friend flow works | 🔲 |
| MVP-QA-002 | E2E: create room, join, send image prank | MVP-IMG-002 | 6 | manual | Receiver sees overlay, auto-dismiss | 🔲 |
| MVP-QA-003 | E2E: consent revoke blocks prank | MVP-CNS-010 | 3 | manual | Prank rejected after revoke | 🔲 |
| MVP-QA-004 | E2E: panic hotkey hides overlay | MVP-CNS-011 | 2 | manual | Ctrl+Shift+Esc clears screen | 🔲 |
| MVP-QA-005 | CI workflow (cargo + npm build) | MVP-FND-001 | 4 | `.github/workflows/ci.yml` | PR checks pass | ✅ |
| MVP-QA-006 | Server integration tests | MVP-AUTH-004 | 8 | `server/tests/` | Auth + room API tests in CI | ✅ |

---

## Summary by module

| Module | Tasks | Done | Remaining hours |
|--------|-------|------|-----------------|
| Foundation | 6 | 6 | 0 |
| Authentication | 9 | 9 | 0 |
| Friends | 6 | 6 | 0 |
| Rooms | 7 | 7 | 0 |
| WebSocket | 8 | 8 | 0 |
| Consent & Security | 13 | 13 | 0 |
| Media Upload | 9 | 9 | 0 |
| Virtual Monitor Placement | 8 | 8 | 0 |
| Prank Pipeline | 10 | 10 | 0 |
| Overlay Engine | 8 | 8 | 0 |
| Image Overlays | 4 | 4 | 0 |
| Text Overlays | 4 | 4 | 0 |
| Integration & QA | 6 | 2 | 15 |
| **Total** | **98** | **90** | **~15** |

---

## Suggested sprint order

1. **Sprint A** (done): Foundation → Auth → Friends → Rooms → WebSocket → Consent
2. **Sprint B** (done): Media Upload (MVP-MED-001 → 009)
3. **Sprint C** (done): Virtual Monitor Placement (MVP-VMP-001 → 008)
4. **Sprint D** (done): Prank Pipeline (MVP-PRK-001 → 010)
5. **Sprint E** (done): Overlay Engine + Image + Text (MVP-OVL-001 → MVP-TXT-004)
6. **Sprint F** (in progress): Integration & QA (MVP-QA-001 → 006)

See [ROADMAP.md](./ROADMAP.md) for milestone context and dependency graph.
