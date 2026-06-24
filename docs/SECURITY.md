# ScreenRaid — Security Guide / Guide de sécurité

> Security architecture for the consent-based ScreenRaid platform: authentication, authorization, anti-abuse, and media safety.  
> Modèle de sécurité : authentification, consentement, anti-spam et protection des médias.

See also: [ARCHITECTURE.md](./ARCHITECTURE.md) · [API.md](./API.md) · [WEBSOCKET.md](./WEBSOCKET.md) · [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## Table of Contents

1. [Security Principles / Principes](#1-security-principles--principes)
2. [Authentication — JWT & Tokens](#2-authentication--jwt--tokens)
3. [Refresh Token Rotation / Rotation des jetons](#3-refresh-token-rotation--rotation-des-jetons)
4. [Authorization & Consent / Autorisation](#4-authorization--consent--autorisation)
5. [Anti-Spam & Rate Limiting / Anti-spam](#5-anti-spam--rate-limiting--anti-spam)
6. [Audit Logging / Journal d'audit](#6-audit-logging--journal-daudit)
7. [Upload Protection / Protection des uploads](#7-upload-protection--protection-des-uploads)
8. [WebSocket Security / Sécurité WebSocket](#8-websocket-security--sécurité-websocket)
9. [Per-User Limits / Limites par utilisateur](#9-per-user-limits--limites-par-utilisateur)
10. [Bans & Blocks / Bannissements](#10-bans--blocks--bannissements)
11. [Client-Side Defenses](#11-client-side-defenses)
12. [Incident Response / Réponse aux incidents](#12-incident-response--réponse-aux-incidents)
13. [Security Checklist / Checklist sécurité](#13-security-checklist--checklist-sécurité)

---

## 1. Security Principles / Principes

ScreenRaid is a **consent-first** social prank platform. Security goals:

| Principle | Implementation |
|-----------|----------------|
| **Explicit consent** | Server, WebSocket, and client each enforce consent before rendering overlays |
| **Room isolation** | Pranks and media are scoped to private rooms; no cross-room leakage |
| **Least privilege** | Role-based permissions (`owner`, `admin`, `member`, `guest`) |
| **Defense in depth** | Validation at upload, dispatch, WebSocket emit, and client render |
| **Ephemeral impact** | Overlays expire; panic button provides immediate local kill |
| **Auditability** | Sensitive actions logged to `audit_log` |
| **Abuse resistance** | Rate limits, quotas, cooldowns, and bans |

---

## 2. Authentication — JWT & Tokens

Implementation: `server/src/service/auth_service.rs`, shared claims in `crates/screenraid-types/src/auth.rs`.

### 2.1 Token Types

| Token | Format | TTL | Storage | Transport |
|-------|--------|-----|---------|-----------|
| **Access token** | JWT (HS256) | **15 minutes** (`900` s) | Client memory only | `Authorization: Bearer <token>` |
| **Refresh token** | Opaque UUID + random hex | **30 days** | Client secure storage | Request body on `/auth/refresh`, `/auth/logout` |

### 2.2 Access Token Claims (`JwtClaims`)

| Claim | Meaning |
|-------|---------|
| `sub` | User UUID |
| `sid` | Session UUID (unique per login/refresh cycle) |
| `iat` | Issued-at (Unix timestamp) |
| `exp` | Expiry (Unix timestamp) |

Signed with `JWT_SECRET` from environment. Production **must** use a cryptographically random secret (≥ 256 bits). See [DEPLOYMENT.md](./DEPLOYMENT.md).

### 2.3 Password Storage

| Property | Value |
|----------|-------|
| Algorithm | **argon2id** (via `argon2` crate) |
| Salt | Per-user random salt (`SaltString`) |
| Verification | Constant-time compare via `PasswordVerifier` |

Registration validation: username 3–32 chars (alphanumeric + `_`), password ≥ 8 chars, email format check.

### 2.4 Auth Endpoints

| Endpoint | Auth required | Notes |
|----------|---------------|-------|
| `POST /v1/auth/register` | No | Creates user + consent row (all flags false) |
| `POST /v1/auth/login` | No | Rejects `is_active = 0` users |
| `POST /v1/auth/refresh` | Refresh token body | Rotates tokens (see Section 3) |
| `POST /v1/auth/logout` | Bearer + refresh body | Revokes refresh token hash |
| `GET /v1/auth/me` | Bearer | Returns profile |

### 2.5 Session Lifecycle

```
Register/Login
    │
    ▼
issue_tokens()
    ├── create_access_token(user_id, session_id)
    └── store_refresh_token(SHA-256(refresh_token))
    │
    ▼
Client uses access_token for API + WS
    │
    ├── (before expiry) POST /auth/refresh → new pair, old refresh revoked
    └── POST /auth/logout → refresh revoked
```

---

## 3. Refresh Token Rotation / Rotation des jetons

**Status: implemented** in `AuthService::refresh`.

### 3.1 Storage Model

Refresh tokens are **never** stored in plaintext. The server persists only:

```text
token_hash = SHA-256(raw_refresh_token)
```

Table: `refresh_tokens` (`id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`).

### 3.2 Rotation Flow

On `POST /v1/auth/refresh`:

1. Hash the presented refresh token.
2. Look up active (non-revoked, non-expired) row.
3. **Immediately revoke** the presented token (`revoked_at = now`).
4. Verify user still exists and `is_active = 1`.
5. Issue **new** access + refresh token pair.

This implements **refresh token rotation**: a stolen refresh token works only once; reuse of a revoked token indicates possible theft (future: revoke all user sessions on reuse detection).

### 3.3 Logout

`POST /v1/auth/logout` sets `revoked_at` on the matching `token_hash`. Access tokens remain valid until natural expiry (max 15 min) — acceptable window; optional future token blocklist if needed.

### 3.4 Threat Mitigations

| Threat | Mitigation |
|--------|------------|
| Refresh token theft | Single-use rotation; HTTPS only in production |
| JWT secret leak | Rotate `JWT_SECRET` (invalidates all access tokens); force re-login |
| Session fixation | New `session_id` on every `issue_tokens` |
| Brute-force login | Rate limit (Section 5) |

---

## 4. Authorization & Consent / Autorisation

### 4.1 Role Matrix

| Action | Minimum role |
|--------|--------------|
| Send prank | `member` + target consent |
| Upload media | `member` + within quota |
| Kick member | `admin` |
| Change member role | `admin` |
| Delete room | `owner` |

Roles are stored in `room_members.role`. Enforcement in `RoomService` via `is_member()` and `can_moderate()`.

### 4.2 Consent Enforcement (defense in depth)

| Layer | Check |
|-------|-------|
| **Server (REST)** | Reject prank if `global_consent = false`, `is_paused = true`, or per-room consent false |
| **WebSocket** | Do not emit `prank:incoming` to non-consented sessions |
| **Client** | Overlay manager checks local consent cache before render |

Consent state: `user_consent` table (`global_consent`, `is_paused`, `room_consents` JSON map).

### 4.3 Room Membership

All room-scoped operations verify membership via `RoomRepository::is_member(room_id, user_id)`. Inactive rooms (`rooms.is_active = 0`) are excluded from queries.

---

## 5. Anti-Spam & Rate Limiting / Anti-spam

Architecture defines layered limits to prevent abuse while allowing playful use within a friend group.

### 5.1 HTTP Rate Limits (planned middleware)

From [ARCHITECTURE.md](./ARCHITECTURE.md) Section 9:

| Endpoint / action | Limit | Key |
|-------------------|-------|-----|
| Login | **5 / min** | Client IP |
| Register | **3 / hour** | Client IP |
| Media upload | **20 / hour** | User ID |
| Send prank | **30 / min** | User ID + room ID |

Implementation target: Tower middleware with in-memory sliding window (single-node) or Redis (multi-node). Return `429 Too Many Requests` with `Retry-After` header.

### 5.2 Shared Constants (`screenraid-validation`)

```rust
// crates/screenraid-validation/src/limits.rs
MAX_UPLOADS_PER_HOUR: u32 = 20
MAX_PRANKS_PER_MINUTE: u32 = 30
```

These constants are shared between server enforcement and client-side UX hints.

### 5.3 Overlay Queue Limits (client)

From [OVERLAY_ENGINE.md](./OVERLAY_ENGINE.md) — prevents visual spam even when server allows delivery:

| Limit | Value |
|-------|-------|
| Max simultaneous overlays (global) | **8** |
| Max per monitor | **4** |
| Max concurrent sounds | **2** |
| Full-screen visual cooldown (same sender) | **2 s** |
| Queue overflow | Drop `Low` priority; evict oldest `Low` active |

When queue is full, client ACKs `rendered=false`, reason `QUEUE_FULL`.

### 5.4 Prank Dispatch Cooldowns

| Layer | Behavior |
|-------|----------|
| Server | `MAX_PRANKS_PER_MINUTE` per user per room |
| Client overlay engine | 2 s minimum between full-screen visuals from same sender |
| Priority system | Targeted pranks (`High`) can preempt `Low` backlog |

### 5.5 Friendship Anti-Spam

| Action | Protection |
|--------|------------|
| Friend request flood | Rate limit on `POST /v1/friends/request` (planned) |
| Blocked users | `friendships.status = 'blocked'` — requests rejected with `403` |

---

## 6. Audit Logging / Journal d'audit

### 6.1 Schema

Table `audit_log` (migration `001_initial_schema.sql`):

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `user_id` | TEXT FK | Acting user (nullable for anonymous) |
| `action` | TEXT | Event name |
| `resource_type` | TEXT | e.g. `room`, `media`, `prank` |
| `resource_id` | TEXT | Target entity UUID |
| `metadata` | TEXT | JSON blob (details, old/new values) |
| `ip_address` | TEXT | From `X-Forwarded-For` or socket |
| `created_at` | TEXT | ISO 8601 UTC |

Indexes: `idx_audit_user`, `idx_audit_created`.

### 6.2 Logged Actions (target catalog)

| Action | Trigger |
|--------|---------|
| `login` | Successful authentication |
| `logout` | Token revocation |
| `register` | New account |
| `prank_sent` | Prank created and dispatched |
| `prank_blocked` | Prank rejected (consent/role) |
| `consent_granted` | User opts in |
| `consent_revoked` | User opts out or panic pause |
| `media_upload` | File stored |
| `room_join` | Member added |
| `room_leave` | Member removed |
| `member_kicked` | Admin/owner kick |
| `friend_request` | Outgoing request |
| `friend_blocked` | Block action |

### 6.3 Properties

- **Append-only** — no updates or deletes in application code (admin maintenance prunes old rows).
- **Retention:** delete rows older than **90 days** (scheduled job). See [DATABASE.md](./DATABASE.md).
- **Privacy:** do not log passwords, raw tokens, or file contents in `metadata`.

### 6.4 Querying (admin / forensics)

```sql
SELECT action, resource_type, resource_id, ip_address, created_at
FROM audit_log
WHERE user_id = ?
ORDER BY created_at DESC
LIMIT 100;
```

---

## 7. Upload Protection / Protection des uploads

Implementation: `crates/screenraid-validation` (shared by server and client).

### 7.1 Validation Pipeline

```
Upload request
    │
    ▼
Size check (per media type)
    │
    ▼
Declared MIME vs magic-byte sniff
    │
    ▼
Allowlist mapping → MediaType
    │
    ▼
SHA-256 hash compute
    │
    ▼
Store to STORAGE_PATH + metadata row
    │
    └── (future) ClamAV / external scan hook
```

### 7.2 Allowed MIME Types

| MediaType | MIME types | Max size |
|-----------|------------|----------|
| Image | `image/png`, `image/jpeg`, `image/webp` | **10 MB** |
| GIF | `image/gif` | **15 MB** |
| Video | `video/mp4`, `video/webm` | **50 MB** |
| Audio | `audio/mpeg`, `audio/wav`, `audio/ogg` | **10 MB** |

### 7.3 Magic-Byte Detection

`detect_mime_from_bytes()` inspects file headers (PNG, JPEG, GIF, MP4 `ftyp`, RIFF/WAV, OggS, MP3 sync word). Declared `Content-Type` **must** match detected type or upload is rejected (`MimeMismatch`).

### 7.4 Extension Allowlist

Client and server reject extensions that do not match allowed types. Never trust filename alone.

### 7.5 Storage Safety

| Measure | Detail |
|---------|--------|
| Path layout | `{STORAGE_PATH}/{room_id}/{media_id}.{ext}` — no user-controlled paths |
| Content-Disposition | `attachment` for downloads |
| Dedup | `hash_sha256` index prevents duplicate storage |
| Moderation hook | `media.is_approved` flag for future queue |

### 7.6 API Errors

| Error | HTTP | Meaning |
|-------|------|---------|
| `FileTooLarge` | `413` | Exceeds per-type limit |
| `InvalidMime` | `415` | Type not allowed |
| `MimeMismatch` | `415` | Spoofed Content-Type |

---

## 8. WebSocket Security / Sécurité WebSocket

Specification: [WEBSOCKET.md](./WEBSOCKET.md). Handler: `server/src/websocket/handler.rs`.

### 8.1 Connection Authentication

| Property | Value |
|----------|-------|
| Endpoint | `GET /v1/ws?token=<access_token>` |
| Validation | JWT verified **before** upgrade (`verify_access_token`) |
| Failure | HTTP `401` — no WebSocket upgrade |

**Why query param?** Browser WebSocket API cannot set custom headers on handshake in all environments; access token in query is standard for WS auth. Mitigations:

- **HTTPS/WSS only** in production (token not exposed on wire)
- Short-lived access token (15 min)
- Do not log query strings in access logs (configure proxy: `log { format { uri query { - token } } } }` in Caddy)

### 8.2 Session Registry

On successful connect:

1. Register `(user_id, session_id)` in `WsHub`.
2. Emit `connected` event with `user_id` + `session_id`.
3. Broadcast `presence:update` (`online`).

On disconnect: unregister session; if last session for user, broadcast `offline`.

### 8.3 Room Subscription Authorization

Client sends `subscribe_room` with `room_id`.

**Required checks (target behavior):**

| Check | Purpose |
|-------|---------|
| Valid JWT | Already enforced at handshake |
| `is_member(room_id, user_id)` | Prevent subscribing to foreign rooms |
| Room `is_active = 1` | No events from deleted rooms |

> **Implementation note:** Membership verification on `subscribe_room` is specified in architecture; ensure `WsHub::subscribe_room` calls `RoomRepository::is_member` before adding the subscription. Reject with `error` event if not a member.

### 8.4 Event Emission Rules

| Event | Rule |
|-------|------|
| `prank:incoming` | Only to sessions subscribed to prank's room **and** target user matches (or broadcast) **and** consent OK |
| `room:member_joined` | Subscribed members only |
| `presence:update` | Friends or room members per privacy settings |

### 8.5 Keep-Alive & Timeouts

| Parameter | Value |
|-----------|-------|
| Client ping interval | 30 s |
| Server pong deadline | 5 s |
| Proxy read timeout | ≥ 3600 s (see [DEPLOYMENT.md](./DEPLOYMENT.md)) |

Stale sessions are dropped; pranks replay within 60 s if `prank:ack` missing (per architecture).

### 8.6 Message Validation

- Parse JSON envelope (`type`, `payload`, `timestamp`).
- Ignore unknown event types (forward compatibility).
- Validate payload schemas before side effects.

---

## 9. Per-User Limits / Limites par utilisateur

### 9.1 Upload Quotas (`upload_quotas` table)

Daily rollup per user:

| Column | Purpose |
|--------|---------|
| `user_id` + `date` | Composite PK (`YYYY-MM-DD`) |
| `upload_count` | Number of uploads today |
| `bytes_uploaded` | Total bytes today |

New day → new row (implicit reset). Server increments before accepting upload; reject when `upload_count >= MAX_UPLOADS_PER_HOUR` (20) within rolling window or daily cap per product decision.

### 9.2 Prank Rate Limits

| Constant | Value | Scope |
|----------|-------|-------|
| `MAX_PRANKS_PER_MINUTE` | 30 | Per user per room |

Exceeded → `429` with retry guidance; optional audit log entry `prank_rate_limited`.

### 9.3 Room Limits

| Limit | Value |
|-------|-------|
| `max_members` default | 20 |
| `max_members` hard cap | 50 |

### 9.4 Media Library

No hard global cap in MVP; disk quota enforced at infrastructure level. Client cache default: **500 MB** LRU ([DATABASE.md](./DATABASE.md) client settings).

---

## 10. Bans & Blocks / Bannissements

### 10.1 Account Ban (`users.is_active`)

| Value | Effect |
|-------|--------|
| `1` | Normal operation |
| `0` | **Banned** — login returns `403 Forbidden`; refresh rejected; active WS disconnected on next message |

Ban is server-side only (no client bypass). Admin tooling (future) sets `is_active = 0` and revokes all `refresh_tokens` for user.

### 10.2 Friendship Block (`friendships.status = 'blocked'`)

| Action | Result |
|--------|--------|
| `POST /v1/friends/request` to blocked user | `403 Forbidden` |
| Existing `blocked` row | `FriendService` checks status before request/accept |
| Pranks between blocked users | Rejected at dispatch (friendship + room checks) |

Block is directional in storage but effectively mutual for interactions.

### 10.3 Room Removal (kick)

Admins/owners can `DELETE /v1/rooms/{id}/members/{user_id}`. Kicked user:

- Removed from `room_members`
- WebSocket room subscription should be dropped server-side
- Cannot rejoin without new invite (if invite code still valid)

### 10.4 Room Deletion

`DELETE /v1/rooms/{id}` sets `rooms.is_active = 0` (soft delete). All prank/media scoped to room becomes inaccessible.

---

## 11. Client-Side Defenses

| Feature | Location | Purpose |
|---------|----------|---------|
| Consent gate | UI blocking screen | No WS prank render until opt-in |
| Panic button | Global hotkey (`Ctrl+Shift+Escape`) | Hide all overlays; `is_paused = true` |
| Local consent cache | Tauri SQLite | Fast reject before render |
| Overlay queue caps | Rust `OverlayQueue` | Anti-spam visual layer |
| MIME pre-validation | Client upload UI | Early reject before network |

See [OVERLAY_ENGINE.md](./OVERLAY_ENGINE.md) Section 11 (Overlay Security).

---

## 11.1 Monitor Metadata Privacy / Métadonnées écran

ScreenRaid's **Virtual Monitor Placement** shares monitor **geometry only** — never screen contents.

### Allowed (transmitted to server & room members)

| Data | Example | Purpose |
|------|---------|---------|
| Resolution | `2560×1440` | Scale virtual canvas |
| Monitor count | `2` | Layout preview |
| Monitor positions | `x: 2560, y: 0` | Multi-monitor canvas |
| DPI scale factor | `1.25` | Preview proportions |
| Primary monitor flag | `is_primary: true` | Default target |

### Not allowed (never implemented)

| Data | Status |
|------|--------|
| Screen pixels / framebuffer | ❌ Not collected |
| Window contents | ❌ Not collected |
| Running applications | ❌ Not collected |
| Desktop screenshots | ❌ Not collected |
| Desktop streaming | ❌ Not implemented |
| Screen capture APIs | ❌ Not used for placement |

### Threat model

- **Monitor metadata** is considered **low sensitivity** — similar to sharing display resolution in a game lobby.
- Room members who can see layout are already in a **trusted social context** (friends + room).
- Attackers cannot reconstruct screen content from geometry alone.
- Users can revoke consent to stop receiving overlays entirely; layout sync does not bypass consent.

### API & transport

- `PUT /users/me/monitors` — authenticated, user-owned data only
- `GET /users/{id}/monitors` — restricted to users who share a room with the target
- `monitor:changed` WebSocket — geometry JSON only, no binary screen data

---

## 12. Incident Response / Réponse aux incidents

| Incident | Immediate action |
|----------|------------------|
| JWT secret compromise | Rotate secret, redeploy, invalidate all sessions |
| Mass abuse / spam | Lower rate limits; ban `user_id`; pause room |
| Malicious upload | Delete `media` row + file; ban uploader; review audit log |
| WS token leak in logs | Scrub logs; shorten access TTL temporarily; fix proxy logging |

Preserve `audit_log` and backups before destructive actions.

---

## 13. Security Checklist / Checklist sécurité

### Deployment

- [ ] HTTPS/WSS only
- [ ] Strong `JWT_SECRET`
- [ ] CORS restricted
- [ ] Proxy does not log `token` query param
- [ ] Firewall configured

### Application

- [ ] Refresh token rotation enabled
- [ ] `is_active` checked on login/refresh
- [ ] Upload validation pipeline active
- [ ] Rate limiting middleware deployed
- [ ] WS room membership verified on subscribe
- [ ] Audit logging wired for sensitive actions

### Operations

- [ ] Backup encryption
- [ ] Audit log retention job
- [ ] Security review before major releases

---

## Related Documents

| Document | Topic |
|----------|-------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Security model overview |
| [DATABASE.md](./DATABASE.md) | `audit_log`, `upload_quotas`, `users.is_active` |
| [OVERLAY_ENGINE.md](./OVERLAY_ENGINE.md) | Queue limits, client cooldowns |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | TLS, secrets, production hardening |
| [TESTING.md](./TESTING.md) | Security regression tests |
