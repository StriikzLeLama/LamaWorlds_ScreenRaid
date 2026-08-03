# ScreenRaid — Cloudflare backend

Edge backend: **Workers** + **D1** + **R2** + **Durable Objects** + static **dashboard**.

## Live URLs

| URL | Role |
|-----|------|
| https://screenraid.app.lama-worlds.com | Custom domain |
| https://screenraid.app.lamaworlds.com | Custom domain (alias) |
| https://screenraid.striikz.workers.dev | workers.dev |

Point the Tauri receiver **Server URL** at one of these HTTPS URLs.

## Features

- Auth (register/login/refresh) + **TOTP 2FA** + optional **Turnstile**
- Rooms, friends, consent, monitors, media (R2)
- Pranks over WebSocket + **scheduled raids** (cron + on_online)
- **Admin** (`ADMIN_USERNAMES`)
- **KLIPY** GIF search/import (`KLIPY_API_KEY`)
- WebRTC **signaling** (`signal:offer/answer/ice`)
- Dashboard SPA served from Worker assets

## API highlights

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/media/storage` | Used / remaining quota (200 MB default) |
| `GET /v1/auth/sessions` | Active refresh-token sessions |
| `DELETE /v1/auth/sessions/{id}` | Revoke one session |
| `GET /v1/audit/me` | User audit log |
| `GET/PATCH /v1/users/me/security` | Raid safety prefs |
| `GET /v1/gifs/search` | KLIPY proxy (needs `KLIPY_API_KEY` secret) |
| `POST /v1/gifs/import` | Import KLIPY asset to R2 |

WebSocket: `wss://…/v1/ws` — send `auth` after connect; client pings every **45s** ([WEBSOCKET.md](../docs/WEBSOCKET.md)).

Rust Docker (CT self-host) uses a **separate SQLite DB** unless you run `migrate:sqlite`.

## Migrate accounts from Rust SQLite

Passwords stay valid (argon2 hashes imported as-is). Sessions are reset (users log in again).

```powershell
cd cloud
# Dry-run first
npm run migrate:sqlite -- path\to\screenraid.db --dry-run

# Apply to Cloudflare D1
npm run migrate:sqlite -- path\to\screenraid.db --remote
```

Typical DB locations:
- Docker volume: copy `screenraid.db` out of the `screenraid-data` volume
- Local: `server/data/screenraid.db` or path from `DATABASE_URL` / compose

Imported: users, consent, rooms, members, friendships, totp (if present).  
**Not imported:** media files on disk → users re-upload, or use `--media-meta` for DB rows only (blobs still missing in R2).

If users had 2FA enabled, use the **same `JWT_SECRET`** as the Rust server (TOTP secrets are wrapped with it), or ask them to re-enable 2FA.

## Storage quotas (Cloudflare prod)

Enforced when `ENFORCE_STORAGE_QUOTAS=1` (default on deploy):

| Limit | Default |
|-------|---------|
| Image | 10 MB |
| GIF | 15 MB |
| Video | 50 MB |
| Audio | 10 MB |
| Per-user total | 200 MB (`USER_MEDIA_QUOTA_BYTES`) |
| Uploads / day / user | 40 (`MAX_UPLOADS_PER_DAY`) |

Local `wrangler dev` sets `ENFORCE_STORAGE_QUOTAS=0` in `.dev.vars` (relaxed).

## Deploy

```bash
cd cloud
# refresh dashboard assets from ../web (or rebuild client first)
#   cd ../client && npm run build:web
Remove-Item -Recurse -Force public -ErrorAction SilentlyContinue
Copy-Item -Recurse ../web public

npx wrangler d1 migrations apply screenraid --remote
npx wrangler secret put JWT_SECRET
# optional:
# npx wrangler secret put TURNSTILE_SECRET_KEY
# npx wrangler secret put KLIPY_API_KEY
# npx wrangler secret put ADMIN_USERNAMES   # or set vars.ADMIN_USERNAMES

npm run deploy
```

Turnstile site key (public) can be set as a var:

```bash
npx wrangler versions secret ...   # or edit wrangler.jsonc vars.TURNSTILE_SITE_KEY
```

Prefer:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
# and set TURNSTILE_SITE_KEY in wrangler.jsonc vars / dashboard
```

## Local

```bash
npm run db:local
npm run dev
# → http://127.0.0.1:8787
```

`.dev.vars` for local secrets (`JWT_SECRET`, `KLIPY_API_KEY`, Turnstile…).

## Test

```powershell
Invoke-RestMethod https://screenraid.app.lama-worlds.com/v1/health
# Open https://screenraid.app.lama-worlds.com/ in a browser (dashboard)
# Desktop receiver → Server URL = https://screenraid.app.lama-worlds.com
```

Rust Docker server remains available in parallel for self-host (`screenraid.lama-worlds.com`, CT 109).
