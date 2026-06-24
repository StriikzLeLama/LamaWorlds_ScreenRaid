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

🚧 **Architecture phase complete** — see [Implementation Roadmap](./docs/ARCHITECTURE.md#13-implementation-roadmap) for the 10-week build plan.

## Quick Start (after implementation)

```bash
# Start server
docker compose up -d

# Run client (dev)
cd client && npm install && npm run tauri dev
```

## License

TBD
