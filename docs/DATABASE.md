# ScreenRaid Database Schema

SQLite for development and single-node deployment. Schema is compatible with PostgreSQL with minor type adjustments for production scale-out.

Migrations live in `server/migrations/` and are applied via SQLx at startup.

---

## ER Diagram

```mermaid
erDiagram
    users ||--o{ refresh_tokens : has
    users ||--o| user_consent : has
    users ||--o{ friendships : participates
    users ||--o{ room_members : joins
    users ||--o{ media : uploads
    users ||--o{ pranks : sends
    rooms ||--o{ room_members : contains
    rooms ||--o{ media : scopes
    rooms ||--o{ pranks : contains
    media ||--o{ pranks : used_in

    users {
        text id PK
        text username UK
        text email UK
        text password_hash
        text display_name
        text avatar_url
        int is_active
        text created_at
        text updated_at
    }

    rooms {
        text id PK
        text name
        text invite_code UK
        text owner_id FK
        int max_members
        int is_active
        text created_at
        text updated_at
    }

    room_members {
        text room_id PK,FK
        text user_id PK,FK
        text role
        text joined_at
    }

    friendships {
        text id PK
        text requester_id FK
        text addressee_id FK
        text status
        text created_at
        text updated_at
    }

    user_consent {
        text user_id PK,FK
        int global_consent
        int is_paused
        text room_consents
        text consented_at
        text updated_at
    }

    media {
        text id PK
        text uploader_id FK
        text room_id FK
        text filename
        text original_name
        text mime_type
        int size_bytes
        text media_type
        text storage_path
        text hash_sha256
        int duration_ms
        int width
        int height
        int is_approved
        text created_at
    }

    pranks {
        text id PK
        text room_id FK
        text sender_id FK
        text target_id FK
        text media_id FK
        text overlay_type
        text text_content
        text config
        int duration_ms
        text status
        text created_at
        text delivered_at
        text expires_at
    }
```

---

## Migration 001 — Initial Schema

File: `server/migrations/001_initial_schema.sql`

Contains all tables from ARCHITECTURE.md Section 6:
- `users`, `refresh_tokens`
- `rooms`, `room_members`
- `friendships`
- `user_consent`
- `media`, `pranks`
- `audit_log`, `upload_quotas`

---

## Table Reference

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID v4 |
| `username` | TEXT UNIQUE | 3–32 chars |
| `email` | TEXT UNIQUE | Lowercased on insert |
| `password_hash` | TEXT | argon2id PHC string |
| `display_name` | TEXT | Shown in UI |
| `avatar_url` | TEXT NULL | URL or null |
| `is_active` | INTEGER | 0 = banned |
| `created_at` | TEXT | ISO 8601 |
| `updated_at` | TEXT | ISO 8601 |

### `refresh_tokens`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `user_id` | TEXT FK | → users |
| `token_hash` | TEXT UNIQUE | SHA-256 of raw token |
| `expires_at` | TEXT | |
| `revoked_at` | TEXT NULL | Set on logout/rotation |

### `rooms`

| Column | Type | Notes |
|--------|------|-------|
| `invite_code` | TEXT UNIQUE | 8 chars, Crockford base32 |
| `max_members` | INTEGER | Default 20, max 50 |
| `owner_id` | TEXT FK | Must also exist in room_members as owner |

### `room_members`

Composite PK `(room_id, user_id)`. Role enum: `owner`, `admin`, `member`, `guest`.

**Invariant:** Every room has exactly one `owner` row.

### `friendships`

Unique on `(requester_id, addressee_id)`. Status: `pending`, `accepted`, `blocked`.

Friendship is bidirectional for queries — application normalizes so `requester_id < addressee_id` OR queries both directions.

### `user_consent`

| Column | Type | Notes |
|--------|------|-------|
| `global_consent` | INTEGER | Master opt-in (0/1) |
| `is_paused` | INTEGER | Panic pause (0/1) |
| `room_consents` | TEXT | JSON map `room_id → bool` |

Row created on user registration with all flags false.

### `media`

| Column | Type | Notes |
|--------|------|-------|
| `media_type` | TEXT | `image`, `gif`, `video`, `audio` |
| `storage_path` | TEXT | Relative to STORAGE_PATH |
| `hash_sha256` | TEXT | Dedup key |
| `is_approved` | INTEGER | For future moderation queue |

### `pranks`

| Column | Type | Notes |
|--------|------|-------|
| `target_id` | TEXT NULL | NULL = broadcast to all consented members |
| `config` | TEXT | JSON OverlayConfig |
| `status` | TEXT | See lifecycle below |
| `expires_at` | TEXT | `created_at + duration_ms + 30s buffer` |

**Prank status lifecycle:**
```
pending → delivered → acked
pending → blocked (consent)
pending → expired (no connected clients)
```

### `audit_log`

Append-only. Actions: `login`, `logout`, `prank_sent`, `consent_granted`, `consent_revoked`, `media_upload`, `room_join`, etc.

### `upload_quotas`

Daily rollup per user. Reset implicitly by `date` key (new day = new row).

---

## Client Local Database

Separate SQLite file in Tauri app data directory (`screenraid-client.db`).

```sql
-- migrations/client/001_cache.sql

CREATE TABLE IF NOT EXISTS cached_media (
    media_id    TEXT PRIMARY KEY,
    url         TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    mime_type   TEXT NOT NULL,
    size_bytes  INTEGER NOT NULL,
    hash_sha256 TEXT,
    cached_at   TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_cached_media_last_used ON cached_media(last_used_at);

CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_pranks (
    id          TEXT PRIMARY KEY,
    payload     TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Default `app_settings` keys

| Key | Default | Description |
|-----|---------|-------------|
| `autostart` | `false` | Windows auto-start |
| `default_duration_ms` | `5000` | Default overlay duration |
| `default_volume` | `0.8` | Sound volume |
| `default_animation` | `fade` | Default animation |
| `cache_limit_mb` | `500` | Max cache size |
| `panic_hotkey` | `Ctrl+Shift+Escape` | Global panic shortcut |
| `server_url` | `http://localhost:8080` | API base URL |
| `selected_monitor` | `primary` | Overlay target monitor |

---

## Indexes Summary

| Table | Index | Purpose |
|-------|-------|---------|
| users | username, email | Login lookup |
| rooms | invite_code | Join by code |
| room_members | user_id | List user's rooms |
| friendships | requester, addressee, status | Friend queries |
| media | uploader, room, hash | Library + dedup |
| pranks | room, sender, target, status | History + dispatch |
| audit_log | user_id, created_at | Audit queries |

---

## Seed Data (Development)

```sql
-- scripts/seed-dev.sql (not auto-run)
-- Creates test users: alice/password, bob/password
-- Creates room "Test Squad" with invite code
-- Pre-accepts friendship between alice and bob
```

---

## Backup & Maintenance

| Task | Command / Notes |
|------|-----------------|
| Backup SQLite | Copy `screenraid.db` + media directory |
| Vacuum | `VACUUM;` weekly via cron |
| Prune audit | Delete audit_log older than 90 days |
| Prune pranks | Delete pranks older than 30 days (status acked/expired) |
| Prune tokens | Delete revoked/expired refresh_tokens |
