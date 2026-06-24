# ScreenRaid

A consent-based social prank platform where friends in a private room can send temporary visual and audio overlays to each other.

## Tech Stack

| Component | Stack |
|-----------|-------|
| Desktop client | Rust, Tauri 2, React, TypeScript, TailwindCSS |
| Server | Rust, Axum, SQLx, SQLite |
| Real-time | WebSocket |
| Deployment | Docker |

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

## Project Structure (planned)

```
ScreenRaid/
├── client/          # Tauri + React desktop app
├── server/          # Axum backend API + WebSocket
├── crates/          # Shared Rust types & validation
└── docs/            # Architecture & API docs
```

## Core Features

**Client**
- Always-on-top transparent overlay windows (multi-monitor)
- Images, GIFs, videos, sounds, and text overlays
- Configurable duration, volume, and animations
- Panic button and instant consent revoke
- Local media cache and optional Windows auto-start

**Server**
- User accounts, JWT authentication, private rooms
- Friend system and role-based permissions
- Media upload with validation and limits
- WebSocket real-time prank delivery

**Security**
- Consent required before receiving overlays
- File type validation and upload quotas
- Rate limiting and audit logging

## Implementation Status

**Phase 2 complete** — rooms, friends, WebSocket hub.

**Phase 1** — JWT auth. **Phase 0** — scaffold + HomeBoard UI.

```bash
# Server (from repo root)
cargo run -p screenraid-server

# Or Docker
docker compose up -d

# Client
cd client && npm run tauri:dev
```

## License

TBD
