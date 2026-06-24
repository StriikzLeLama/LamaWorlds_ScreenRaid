# ScreenRaid — Deployment Guide / Guide de déploiement

> Production deployment for the ScreenRaid consent-based prank platform (Rust/Axum server, SQLite, Docker).  
> Déploiement du serveur ScreenRaid en environnement de production.

See also: [ARCHITECTURE.md](./ARCHITECTURE.md) · [DATABASE.md](./DATABASE.md) · [SECURITY.md](./SECURITY.md)

---

## Table of Contents

1. [Overview / Vue d'ensemble](#1-overview--vue-densemble)
2. [Prerequisites / Prérequis](#2-prerequisites--prérequis)
3. [Docker Compose](#3-docker-compose)
4. [Reverse Proxy / Proxy inverse](#4-reverse-proxy--proxy-inverse)
5. [HTTPS & Certificates / Certificats](#5-https--certificates--certificats)
6. [Environment Variables / Variables d'environnement](#6-environment-variables--variables-denvironnement)
7. [Production vs Development](#7-production-vs-development)
8. [Backups & Restore / Sauvegardes](#8-backups--restore--sauvegardes)
9. [Database Migrations / Migrations](#9-database-migrations--migrations)
10. [Automatic Updates / Mises à jour automatiques](#10-automatic-updates--mises-à-jour-automatiques)
11. [Health Checks & Monitoring](#11-health-checks--monitoring)
12. [Production Checklist / Checklist production](#12-production-checklist--checklist-production)

---

## 1. Overview / Vue d'ensemble

ScreenRaid ships a single **stateful** server container:

| Component | Location | Persistence |
|-----------|----------|-------------|
| API + WebSocket | `screenraid-server` binary (Axum) | Stateless process |
| SQLite database | `/data/screenraid.db` | Docker volume `screenraid-data` |
| Media blobs | `/data/media/` | Same volume |

The Tauri desktop client is distributed separately (installer / auto-update channel). This guide covers **server-side** deployment only.

```
Internet
    │
    ▼
┌─────────────┐     HTTP/WS      ┌──────────────────┐
│ Caddy/nginx │ ───────────────► │ screenraid-server│
│  :443 TLS   │   proxy :8080    │  :8080           │
└─────────────┘                  └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │ screenraid-data  │
                                 │  screenraid.db   │
                                 │  media/          │
                                 └──────────────────┘
```

---

## 2. Prerequisites / Prérequis

| Requirement | Notes |
|-------------|-------|
| Docker Engine 24+ | Or compatible container runtime |
| Docker Compose v2 | `docker compose` (plugin) |
| Domain name (production) | DNS A/AAAA record pointing to host |
| Open ports | `443` (HTTPS), optionally `80` (ACME redirect) |
| `JWT_SECRET` | Cryptographically random, ≥ 32 bytes — **never** use the dev default |

**Minimum host resources (single-node):**

| Resource | Recommended |
|----------|-------------|
| CPU | 1 vCPU |
| RAM | 512 MB – 1 GB |
| Disk | 10 GB+ (grows with media uploads) |

---

## 3. Docker Compose

The repository root contains [`docker-compose.yml`](../docker-compose.yml). It builds the server from [`server/Dockerfile`](../server/Dockerfile) using the **workspace root** as build context (required for shared crates).

### 3.1 Current Compose Definition

```yaml
# docker-compose.yml (reference — see repo for canonical version)
services:
  server:
    build:
      context: .
      dockerfile: server/Dockerfile
    ports:
      - "8080:8080"
    environment:
      - HOST=0.0.0.0
      - PORT=8080
      - DATABASE_URL=sqlite:///data/screenraid.db
      - JWT_SECRET=${JWT_SECRET:-dev-secret-change-in-production}
      - STORAGE_PATH=/data/media
      - CORS_ORIGINS=http://localhost:1420,tauri://localhost
      - RUST_LOG=screenraid_server=info
    volumes:
      - screenraid-data:/data
    restart: unless-stopped

volumes:
  screenraid-data:
```

### 3.2 Dockerfile (multi-stage)

[`server/Dockerfile`](../server/Dockerfile):

| Stage | Base image | Purpose |
|-------|------------|---------|
| **builder** | `rust:1.85-bookworm` | `cargo build --release -p screenraid-server` |
| **runtime** | `debian:bookworm-slim` | Minimal image with `libsqlite3-0`, CA certs |

Runtime layout:

| Path | Content |
|------|---------|
| `/app/screenraid-server` | Release binary |
| `/app/migrations/` | SQLx migration files |
| `/data/` | Mounted volume — DB + media |

The server runs migrations automatically on startup (`sqlx::migrate!()` in `main.rs`).

### 3.3 Quick Start — Development

```bash
# From repository root
cp .env.example .env
# Edit JWT_SECRET in .env for anything beyond local dev

docker compose up -d --build
curl http://localhost:8080/v1/health
```

### 3.4 Production Compose (extended)

For production, **do not expose port 8080 publicly**. Place a reverse proxy in front and restrict the server to an internal network:

```yaml
# docker-compose.prod.yml (recommended pattern)
services:
  server:
    build:
      context: .
      dockerfile: server/Dockerfile
    expose:
      - "8080"
    environment:
      - HOST=0.0.0.0
      - PORT=8080
      - DATABASE_URL=sqlite:///data/screenraid.db
      - JWT_SECRET=${JWT_SECRET}
      - STORAGE_PATH=/data/media
      - CORS_ORIGINS=${CORS_ORIGINS}
      - RUST_LOG=screenraid_server=info,tower_http=warn
    volumes:
      - screenraid-data:/data
    restart: unless-stopped
    networks:
      - internal

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - server
    restart: unless-stopped
    networks:
      - internal

volumes:
  screenraid-data:
  caddy-data:
  caddy-config:

networks:
  internal:
```

Create `deploy/Caddyfile` as described in [Section 4](#4-reverse-proxy--proxy-inverse).

---

## 4. Reverse Proxy / Proxy inverse

The ScreenRaid server serves both REST (`/v1/*`) and WebSocket (`/v1/ws`) on the same port. The reverse proxy **must** support HTTP/1.1 WebSocket upgrade and forward the `Authorization` header (REST) or pass through the `token` query parameter (WebSocket).

### 4.1 Caddy (recommended)

Caddy handles TLS automatically via Let's Encrypt when a public domain is configured.

```caddyfile
# deploy/Caddyfile
screenraid.example.com {
    encode gzip

    # REST API
    handle /v1/* {
        reverse_proxy server:8080
    }

    # Health endpoints (optional — for external monitors)
    handle /health* {
        reverse_proxy server:8080
    }

    # WebSocket — Caddy upgrades automatically
    handle /v1/ws* {
        reverse_proxy server:8080
    }

    # Deny everything else
    respond "Not Found" 404
}
```

**WebSocket notes:**

- Caddy 2 performs WebSocket upgrade transparently when the upstream responds with `101 Switching Protocols`.
- Client connects to `wss://screenraid.example.com/v1/ws?token=<access_token>`.
- Ensure idle timeouts on the proxy are ≥ 60 s (client pings every 30 s per [WEBSOCKET.md](./WEBSOCKET.md)).

### 4.2 nginx

```nginx
# /etc/nginx/sites-available/screenraid
upstream screenraid_backend {
    server 127.0.0.1:8080;
    keepalive 32;
}

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl http2;
    server_name screenraid.example.com;

    ssl_certificate     /etc/letsencrypt/live/screenraid.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/screenraid.example.com/privkey.pem;

    # TLS hardening (adjust to your policy)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    location /v1/ws {
        proxy_pass http://screenraid_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /v1/ {
        proxy_pass http://screenraid_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://screenraid_backend;
    }
}

server {
    listen 80;
    server_name screenraid.example.com;
    return 301 https://$host$request_uri;
}
```

Reload: `nginx -t && systemctl reload nginx`

### 4.3 Headers & Client Configuration

| Header | Purpose |
|--------|---------|
| `X-Forwarded-For` | Client IP for rate limiting / audit logs |
| `X-Forwarded-Proto` | Ensures correct URL generation if added later |
| `X-Real-IP` | Alternative client IP source |

Configure the Tauri client `server_url` / `VITE_SERVER_URL` to the public HTTPS origin:

```
VITE_SERVER_URL=https://screenraid.example.com
```

Update `CORS_ORIGINS` if the client is served from a web origin (Tauri uses `tauri://localhost` by default).

---

## 5. HTTPS & Certificates / Certificats

### 5.1 Caddy + Let's Encrypt (automatic)

Caddy obtains and renews certificates when:

1. Port `80` and `443` are reachable from the internet.
2. DNS for `screenraid.example.com` resolves to the host.
3. The site block uses a real domain (not `localhost`).

Certificate storage (default):

| Path | Content |
|------|---------|
| `/data/caddy/certificates/` | Issued certs (inside `caddy-data` volume) |
| `/config/caddy/` | Caddy config state |

No manual renewal cron is required.

### 5.2 certbot + nginx (manual)

```bash
sudo certbot certonly --nginx -d screenraid.example.com
```

Standard Let's Encrypt paths:

| File | Path |
|------|------|
| Full chain | `/etc/letsencrypt/live/screenraid.example.com/fullchain.pem` |
| Private key | `/etc/letsencrypt/live/screenraid.example.com/privkey.pem` |

Renewal: certbot installs a systemd timer. Verify with `sudo certbot renew --dry-run`.

### 5.3 Self-Signed (local staging only)

Acceptable for LAN or staging **only**. Production must use a trusted CA. Document the custom CA in client trust stores if needed.

---

## 6. Environment Variables / Variables d'environnement

Canonical reference: [`.env.example`](../.env.example) and `server/src/config.rs`.

### 6.1 Server Variables

| Variable | Required | Default (dev) | Description |
|----------|----------|---------------|-------------|
| `HOST` | No | `0.0.0.0` | Bind address |
| `PORT` | No | `8080` | Listen port |
| `DATABASE_URL` | Yes | `sqlite://./data/screenraid.db` | SQLite path (`sqlite:///data/screenraid.db` in Docker) |
| `JWT_SECRET` | **Yes (prod)** | `dev-secret-change-in-production` | HMAC secret for access tokens — **must** be unique in production |
| `STORAGE_PATH` | Yes | `./data/media` | Media filesystem root (`/data/media` in Docker) |
| `CORS_ORIGINS` | No | `http://localhost:1420,tauri://localhost` | Comma-separated allowed origins |
| `RUST_LOG` | No | `screenraid_server=info` | Tracing filter (`tower_http=info` for HTTP traces) |

### 6.2 Client Variables (build-time)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_SERVER_URL` | `http://localhost:8080` | API base URL baked into the Vite client |

### 6.3 Generating Secrets

```bash
# Linux / macOS / WSL
openssl rand -base64 32
```

Store in `.env` (never commit) or a secrets manager. Inject at deploy time:

```bash
export JWT_SECRET="$(openssl rand -base64 32)"
docker compose up -d
```

### 6.4 Planned / Roadmap Variables

Documented in [ARCHITECTURE.md](./ARCHITECTURE.md) for future phases:

| Variable | Purpose |
|----------|---------|
| `MAX_UPLOAD_BYTES` | Global upload size override |
| `S3_ENDPOINT` / `S3_BUCKET` | S3-compatible media storage (scale-out) |
| `DATABASE_URL` (Postgres) | Multi-node database backend |

---

## 7. Production vs Development

| Aspect | Development | Production |
|--------|-------------|------------|
| **Server run** | `cargo run -p screenraid-server` or `docker compose up` | Docker Compose + reverse proxy |
| **TLS** | None (`http://localhost:8080`) | HTTPS via Caddy or nginx + Let's Encrypt |
| **JWT_SECRET** | Default allowed locally | Strong random secret, rotated on compromise |
| **CORS** | `localhost:1420`, `tauri://localhost` | Production client origins only |
| **Port exposure** | `8080` published to host | `8080` internal; only `443` public |
| **Logging** | `RUST_LOG=debug` acceptable | `info`/`warn`; ship logs to aggregator |
| **Database** | `./data/screenraid.db` on host | Named volume `screenraid-data` |
| **Backups** | Optional | Scheduled, tested restore |
| **Rate limiting** | May be relaxed | Enforced per [SECURITY.md](./SECURITY.md) |
| **Client API URL** | `http://localhost:8080` | `https://screenraid.example.com` |

### 7.1 Local Development Without Docker

```bash
# From repo root
mkdir -p data/media
cp .env.example .env
cargo run -p screenraid-server
```

SQLite file: `./data/screenraid.db` (relative to working directory).

### 7.2 Client Development

```bash
cd client
npm install
npm run tauri:dev   # Vite on :1420, talks to VITE_SERVER_URL
```

---

## 8. Backups & Restore / Sauvegardes

ScreenRaid persistence is entirely in the Docker volume (or host `data/` directory). Back up **both** the database and media tree together for a consistent snapshot.

### 8.1 What to Back Up

| Path (container) | Content |
|------------------|---------|
| `/data/screenraid.db` | Users, rooms, tokens, pranks, audit log |
| `/data/media/` | Uploaded images, GIFs, videos, audio |

### 8.2 Backup Schedule (recommended)

| Frequency | Method | Retention |
|-----------|--------|-----------|
| **Daily** | Filesystem snapshot or `sqlite3 .backup` | 7 daily |
| **Weekly** | Full volume archive | 4 weekly |
| **Before upgrade** | Manual snapshot | Until upgrade verified |

### 8.3 Backup Script (Docker)

```bash
#!/bin/bash
# scripts/backup-screenraid.sh
set -euo pipefail

BACKUP_DIR="/var/backups/screenraid"
STAMP=$(date +%Y%m%d_%H%M%S)
DEST="${BACKUP_DIR}/${STAMP}"
mkdir -p "$DEST"

# Consistent SQLite backup via sqlite3 (preferred over raw copy on live DB)
docker compose exec -T server sqlite3 /data/screenraid.db ".backup '/data/screenraid_backup.db'"
docker compose cp server:/data/screenraid_backup.db "${DEST}/screenraid.db"
docker compose exec -T server rm /data/screenraid_backup.db

# Media archive
docker compose exec -T server tar -czf - -C /data media > "${DEST}/media.tar.gz"

# Optional: prune backups older than 30 days
find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
```

Cron example (`crontab -e`):

```
0 3 * * * /opt/screenraid/scripts/backup-screenraid.sh >> /var/log/screenraid-backup.log 2>&1
```

### 8.4 Restore Procedure

1. **Stop** the server: `docker compose down`
2. **Restore** database file to volume:
   ```bash
   docker volume create screenraid-data   # if missing
   docker run --rm -v screenraid-data:/data -v $(pwd)/restore:/restore alpine \
     sh -c "cp /restore/screenraid.db /data/ && tar -xzf /restore/media.tar.gz -C /data"
   ```
3. **Start** server: `docker compose up -d`
4. **Verify**: `curl https://screenraid.example.com/v1/health/ready`
5. **Check migrations**: server logs should show `Applied` or `No migrations to apply`

> **Important:** Restoring an older DB while keeping newer media files (or vice versa) can orphan records. Always restore matching pairs from the same backup timestamp.

### 8.5 Maintenance Tasks

From [DATABASE.md](./DATABASE.md):

| Task | Frequency | Command |
|------|-----------|---------|
| `VACUUM` | Weekly | `sqlite3 /data/screenraid.db 'VACUUM;'` |
| Prune `audit_log` | Monthly | Delete rows older than 90 days |
| Prune old pranks | Monthly | Delete `acked`/`expired` pranks > 30 days |
| Prune refresh tokens | Weekly | Delete revoked/expired tokens |

---

## 9. Database Migrations / Migrations

Migrations live in [`server/migrations/`](../server/migrations/) and are applied automatically at server startup.

### 9.1 Migration Strategy

| Scenario | Action |
|----------|--------|
| **Normal deploy** | New binary starts → SQLx runs pending migrations → server listens |
| **Rollback** | Deploy previous image; **do not** auto-revert migrations — restore DB from backup if schema is incompatible |
| **Zero-downtime** | Single-node SQLite: brief lock during migration; schedule maintenance window for large migrations |

### 9.2 Pre-Deploy Checklist

1. Review new files in `server/migrations/`.
2. Test against a copy of production data in staging.
3. Take a backup ([Section 8](#8-backups--restore--sauvegardes)).
4. Deploy new image.
5. Monitor logs for migration errors.

### 9.3 Manual Migration (emergency)

```bash
docker compose exec server /app/screenraid-server
# Migrations run on start; for inspection only:
docker compose exec server sqlite3 /data/screenraid.db ".tables"
```

---

## 10. Automatic Updates / Mises à jour automatiques

### 10.1 Watchtower (container image updates)

[Watchtower](https://containrrr.dev/watchtower/) polls the registry and recreates containers when a new image is pushed.

```yaml
# Add to docker-compose.prod.yml
  watchtower:
    image: containrrr/watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - WATCHTOWER_CLEANUP=true
      - WATCHTOWER_POLL_INTERVAL=3600
      - WATCHTOWER_SCOPE=screenraid
    command: --scope screenraid
```

Label the server service: `com.centurylinklabs.watchtower.scope=screenraid`

**Caveats:**

- Always back up before automatic updates.
- Migrations run on container start — verify changelog before enabling auto-update on production.
- Pin image tags (`:v1.2.3`) instead of `:latest` for reproducibility; let Watchtower update the tag via CI.

### 10.2 CI/CD Deploy (GitHub Actions)

Typical pipeline:

```
push tag → build Docker image → push to GHCR → SSH deploy / pull on host
```

Example deploy step (on self-hosted runner or SSH):

```bash
cd /opt/screenraid
git pull origin main
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --no-build
```

See [TESTING.md](./TESTING.md) for the full CI workflow example.

### 10.3 Client Updates

The Tauri client uses its own release channel (GitHub Releases, custom updater). Server and client versions are **loosely coupled** — maintain backward-compatible API/WS protocols or version gate in `/v1/health`.

### 10.4 Migration-Safe Rollout Pattern

1. Deploy server version **N+1** (backward compatible with clients on N).
2. Wait for active sessions to refresh tokens naturally.
3. Release client **N+1** with new features.
4. After 30 days, remove deprecated API paths if any.

---

## 11. Health Checks & Monitoring

### 11.1 Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness — process is running |
| `GET /health/ready` | Readiness — DB connection OK |
| `GET /v1/health` | Versioned alias |
| `GET /v1/health/ready` | Versioned readiness |

### 11.2 Docker Healthcheck

```yaml
services:
  server:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/v1/health/ready"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
```

Add `curl` to the runtime image or use a TCP check if minimizing image size.

### 11.3 Metrics to Watch

| Signal | Alert threshold (suggested) |
|--------|----------------------------|
| Disk usage on `/data` | > 80% |
| HTTP 5xx rate | > 1% over 5 min |
| WebSocket disconnect storms | Anomaly detection |
| Backup job failure | Any failure |
| Container restarts | > 2 in 1 hour |

---

## 12. Production Checklist / Checklist production

### Security

- [ ] `JWT_SECRET` is unique and stored in secrets manager
- [ ] HTTPS enabled with valid certificate
- [ ] Port `8080` not exposed publicly
- [ ] `CORS_ORIGINS` restricted to known clients
- [ ] Firewall allows only `80`/`443`
- [ ] Review [SECURITY.md](./SECURITY.md)

### Data

- [ ] `screenraid-data` volume on durable disk
- [ ] Daily backups configured and **restore tested**
- [ ] Backup encryption at rest (if required by policy)

### Operations

- [ ] `restart: unless-stopped` on all services
- [ ] Log aggregation configured
- [ ] Health checks wired to monitoring
- [ ] Runbook for rollback documented
- [ ] Staging environment mirrors production compose

### Client

- [ ] `VITE_SERVER_URL` points to production HTTPS URL
- [ ] Installers signed (Windows code signing when available)

---

## Related Documents

| Document | Topic |
|----------|-------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, Docker outline |
| [DATABASE.md](./DATABASE.md) | Schema, backup maintenance |
| [SECURITY.md](./SECURITY.md) | Auth, rate limits, hardening |
| [WEBSOCKET.md](./WEBSOCKET.md) | WebSocket protocol behind proxy |
| [TESTING.md](./TESTING.md) | CI/CD pipeline example |
