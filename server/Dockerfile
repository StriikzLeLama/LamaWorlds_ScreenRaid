# Build stage
FROM rust:1.85-bookworm AS builder

WORKDIR /app

# Copy workspace manifests
COPY Cargo.toml Cargo.lock* ./
COPY crates ./crates
COPY server ./server

# Build server binary
RUN cargo build --release -p screenraid-server

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/screenraid-server /app/screenraid-server
COPY server/migrations /app/migrations

ENV HOST=0.0.0.0
ENV PORT=8080
ENV DATABASE_URL=sqlite:///data/screenraid.db
ENV STORAGE_PATH=/data/media

EXPOSE 8080

VOLUME ["/data"]

CMD ["/app/screenraid-server"]
