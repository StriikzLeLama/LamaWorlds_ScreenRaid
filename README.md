# ScreenRaid

A consent-based social prank platform where friends in a private room can send temporary visual and audio overlays to each other.

## Architecture (web + receiver)

| Component | Role |
|-----------|------|
| **Web dashboard** | Hosted by the server at `http://<server>:8080/` — login, rooms, friends, media, admin, send pranks |
| **Desktop receiver** | Tauri app on each PC — WebSocket, overlays, panic, monitor sync, media cache |
| **Server** | Rust/Axum API + WebSocket + static web UI (Docker) |

```
Browser  ──► http://192.168.1.109:8080/     (manage everything)
Receiver ──► ws://192.168.1.109:8080/v1/ws  (display overlays only)
```

## Tech Stack

| Component | Stack |
|-----------|-------|
| Web dashboard | React 19, TypeScript, TailwindCSS, Vite |
| Desktop receiver | Rust, Tauri 2, React (minimal UI) |
| Server | Rust, Axum, SQLx, SQLite |
| Real-time | WebSocket |
| Deployment | Docker (server + embedded web UI) |

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./docs/ARCHITECTURE.md) | Full system design, folder structure, roadmap |
| [API Reference](./docs/API.md) | REST endpoint catalog |
| [WebSocket Protocol](./docs/WEBSOCKET.md) | Real-time event specification |
| [Database Schema](./docs/DATABASE.md) | Tables, migrations, client cache DB |
| [Design System](./docs/DESIGN_SYSTEM.md) | HomeBoard Anthracite Orange UI tokens & components |
| [Overlay Engine](./docs/OVERLAY_ENGINE.md) | Overlay rendering architecture specification |
| [Deployment](./docs/DEPLOYMENT.md) | Docker, HTTPS, backups, production |
| [Security](./docs/SECURITY.md) | JWT, anti-spam, audit, upload protection |
| [Testing](./docs/TESTING.md) | Test strategy and CI/CD |
| [Wireframes](./docs/WIREFRAMES.md) | Desktop UI wireframes (HomeBoard) |

## Project Structure

```
ScreenRaid/
├── client/          # React — web dashboard + Tauri receiver (same codebase, two builds)
├── server/          # Axum backend + serves web/dist in Docker
├── crates/          # Shared Rust types & validation
└── docs/            # Architecture & API docs
```

## Quick start

### Server + web dashboard (Docker)

```bash
# On the server / CT
docker compose up -d --build

# Open in browser
http://<server-ip>:8080/
```

Set `ADMIN_USERNAMES`, `ALLOW_SELF_PRANK`, `JWT_SECRET` in `.env` on the host.

### Desktop receiver (Windows dev)

```bash
cd client
npm install
npm run tauri:dev
```

1. Sign in with the **same account** as the web dashboard
2. Set **Server URL** to `http://<server-ip>:8080` on first login
3. **Grant consent** (receiver home or web Settings)
4. Send pranks from the **browser**; overlays appear on the PC running the receiver

### Local development (split)

```bash
# Terminal 1 — API only (no web UI unless you copy dist to ./web)
cargo run -p screenraid-server

# Terminal 2 — web dashboard dev (proxies API)
cd client && npm run dev:web

# Terminal 3 — Tauri receiver
cd client && npm run tauri:dev
```

## Core Features

**Web dashboard**
- Rooms, friends, media library, admin panel
- Prank composer with monitor placement preview
- Consent management (synced with receiver)

**Desktop receiver**
- Always-on-top transparent overlay windows (multi-monitor)
- Images, GIFs, videos, sounds, and text overlays
- Panic button and global hotkey
- Local media cache and optional Windows auto-start

**Server**
- User accounts, JWT authentication, private rooms
- Media upload with validation
- WebSocket prank delivery to connected receivers

## License

TBD
