# Web UI build (dashboard served by the server)
FROM node:22-bookworm-slim AS web

WORKDIR /web
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build:web && ls -la /web/dist/

# Rust server build
FROM rust:1.90-bookworm AS builder

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY server ./server
COPY client ./client

RUN cargo build --release -p screenraid-server

# Runtime
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/screenraid-server /app/screenraid-server
COPY --from=builder /app/server/migrations /app/migrations
COPY --from=web /web/dist /app/web

ENV HOST=0.0.0.0
ENV PORT=8080
ENV DATABASE_URL=sqlite:///data/screenraid.db
ENV STORAGE_PATH=/data/media
ENV STATIC_PATH=/app/web

EXPOSE 8080

VOLUME ["/data"]

CMD ["/app/screenraid-server"]
