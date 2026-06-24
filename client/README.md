# ScreenRaid Client

Two builds from one React codebase:

| Build | Command | Output | Used for |
|-------|---------|--------|----------|
| **Web dashboard** | `npm run build:web` | `dist/` (main only) | Embedded in Docker server at `/` |
| **Receiver** | `npm run build` | `dist/` + `overlay.html` | Tauri desktop app |

## Environment modes

- `.env.web` — `VITE_APP_MODE=web` (same-origin API, no server URL field on login)
- `.env.receiver` — `VITE_APP_MODE=receiver` (Tauri receiver UI)

## Scripts

```bash
npm run dev:web      # Web dashboard at :5173 (proxies /v1 → :8080)
npm run tauri:dev    # Desktop receiver (Vite :1420 + Tauri)
npm run build:web    # Production web bundle for server
npm run build        # Production receiver bundle for Tauri
npm run tauri:build  # Windows/macOS/Linux installer
```

## App entry

`src/App.tsx` loads `App.web.tsx` or `App.receiver.tsx` based on `VITE_APP_MODE`.

- **Web**: full dashboard (`/rooms`, `/friends`, `/media`, `/admin`, …)
- **Receiver**: minimal UI (`/` status, `/settings` for server URL & cache)

Overlay rendering lives in `src/overlay/` and is **receiver-only**.
