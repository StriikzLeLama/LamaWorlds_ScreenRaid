# ScreenRaid

Consent-based social prank platform for friends: send temporary overlays (GIF, image, video, sound, text) to each other’s screens — only if they opted in.

**Live stack (Lama Worlds):** dashboard at [screenraid.lama-worlds.com](https://screenraid.lama-worlds.com) · Windows receiver with auto-update.

## How it works

| Piece | Role |
|-------|------|
| **Web dashboard** | Rooms, friends, media, composer, admin — served by the API |
| **Desktop receiver** | Tauri app — WebSocket + always-on-top overlays + panic hotkey |
| **Server** | Rust / Axum + SQLite + WebSocket |

```
Browser  ──► https://your-host/          (manage & send)
Receiver ──► wss://your-host/v1/ws       (display overlays)
```

No overlay without **consent**. Receivers can pause, set quiet hours, or panic-hide everything.

## Features

- Rooms & friends, media library, GIF search (optional KLIPY)
- Overlay types: text, image/GIF, video, sound
- Placement + AR motions (follow mouse, orbit, trail, dodge, clickbait, takeover)
- Multi-monitor targeting, raid bomb, scheduled raids
- Desktop: system tray, media cache, soft mode, auto-update (signed GitHub releases)
- Security: JWT + refresh rotation, optional Turnstile, optional TOTP 2FA, room quotas

## Tech stack

| Layer | Stack |
|-------|--------|
| Dashboard + receiver UI | React 19, TypeScript, Tailwind, Vite |
| Desktop shell | Tauri 2 (Rust) |
| API | Rust, Axum, SQLx, SQLite |
| Deploy | Docker Compose |

## Quick start

### 1. Server (Docker)

```bash
cp .env.example .env
# Edit JWT_SECRET, ADMIN_USERNAMES, optional KLIPY_API_KEY / Turnstile

docker compose up -d --build
# Open http://localhost:8080/
```

**Important:** keep the Docker volume `screenraid-data` when rebuilding (`docker compose up -d --build` — never wipe the volume unless you intend to reset the DB).

### 2. Desktop receiver (dev)

```bash
cd client
npm ci
npm run tauri:dev
```

Sign in with the same account as the web UI, grant consent, then send a raid from a room.

### 3. Release / auto-update

See [docs/CLIENT_RELEASE.md](./docs/CLIENT_RELEASE.md). Tag `client-v*` → GitHub Actions builds a signed Windows installer. Users who already installed an NSIS build get updates without reinstalling.

## Project layout

```
├── client/          # React (web + Tauri) + overlay engine
├── server/          # Axum API + static web UI in Docker
├── crates/          # Shared Rust types & validation
├── docs/            # Architecture, API, security, deploy
├── web/             # Built dashboard assets (Docker)
└── docker-compose.yml
```

## Documentation

| Doc | Topic |
|-----|--------|
| [Architecture](./docs/ARCHITECTURE.md) | System design |
| [API](./docs/API.md) | REST |
| [WebSocket](./docs/WEBSOCKET.md) | Real-time events |
| [Database](./docs/DATABASE.md) | Schema |
| [Deployment](./docs/DEPLOYMENT.md) | Docker, TLS, backups |
| [Security](./docs/SECURITY.md) | Auth, anti-abuse |
| [Client release](./docs/CLIENT_RELEASE.md) | Windows builds & updater |
| [Client README](./client/README.md) | Web vs receiver builds |

## Security notes (before going public)

- **Never commit** `.env` or `client/screenraid-updater.key` (private signing key).
- The **updater public key** in `tauri.conf.json` is meant to be public.
- Put production secrets only in host `.env` / GitHub Actions secrets (`TAURI_SIGNING_PRIVATE_KEY`, etc.).
- Rotate `JWT_SECRET` / API keys if they ever leaked outside the repo.

## License

[MIT](./LICENSE) © 2026 StriikzLeLama / Lama Worlds
