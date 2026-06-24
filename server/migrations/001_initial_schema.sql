-- ScreenRaid initial schema

CREATE TABLE users (
    id              TEXT PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    avatar_url      TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);

CREATE TABLE refresh_tokens (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    expires_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    revoked_at      TEXT
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE rooms (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    invite_code     TEXT NOT NULL UNIQUE,
    owner_id        TEXT NOT NULL REFERENCES users(id),
    max_members     INTEGER NOT NULL DEFAULT 20,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_rooms_invite_code ON rooms(invite_code);
CREATE INDEX idx_rooms_owner ON rooms(owner_id);

CREATE TABLE room_members (
    room_id         TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner', 'admin', 'member', 'guest')),
    joined_at       TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (room_id, user_id)
);

CREATE INDEX idx_room_members_user ON room_members(user_id);

CREATE TABLE friendships (
    id              TEXT PRIMARY KEY,
    requester_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (requester_id, addressee_id)
);

CREATE INDEX idx_friendships_requester ON friendships(requester_id);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX idx_friendships_status ON friendships(status);

CREATE TABLE user_consent (
    user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    global_consent  INTEGER NOT NULL DEFAULT 0,
    is_paused       INTEGER NOT NULL DEFAULT 0,
    room_consents   TEXT NOT NULL DEFAULT '{}',
    consented_at    TEXT,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE media (
    id              TEXT PRIMARY KEY,
    uploader_id     TEXT NOT NULL REFERENCES users(id),
    room_id         TEXT REFERENCES rooms(id) ON DELETE SET NULL,
    filename        TEXT NOT NULL,
    original_name   TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    size_bytes      INTEGER NOT NULL,
    media_type      TEXT NOT NULL
                    CHECK (media_type IN ('image', 'gif', 'video', 'audio')),
    storage_path    TEXT NOT NULL,
    hash_sha256     TEXT NOT NULL,
    duration_ms     INTEGER,
    width           INTEGER,
    height          INTEGER,
    is_approved     INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_media_uploader ON media(uploader_id);
CREATE INDEX idx_media_room ON media(room_id);
CREATE INDEX idx_media_hash ON media(hash_sha256);

CREATE TABLE pranks (
    id              TEXT PRIMARY KEY,
    room_id         TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    sender_id       TEXT NOT NULL REFERENCES users(id),
    target_id       TEXT REFERENCES users(id),
    media_id        TEXT REFERENCES media(id),
    overlay_type    TEXT NOT NULL
                    CHECK (overlay_type IN ('image', 'gif', 'video', 'text', 'sound')),
    text_content    TEXT,
    config          TEXT NOT NULL DEFAULT '{}',
    duration_ms     INTEGER NOT NULL DEFAULT 5000,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'delivered', 'acked', 'blocked', 'expired')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    delivered_at    TEXT,
    expires_at      TEXT NOT NULL
);

CREATE INDEX idx_pranks_room ON pranks(room_id);
CREATE INDEX idx_pranks_sender ON pranks(sender_id);
CREATE INDEX idx_pranks_target ON pranks(target_id);
CREATE INDEX idx_pranks_status ON pranks(status);

CREATE TABLE audit_log (
    id              TEXT PRIMARY KEY,
    user_id         TEXT REFERENCES users(id),
    action          TEXT NOT NULL,
    resource_type   TEXT,
    resource_id     TEXT,
    metadata        TEXT,
    ip_address      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);

CREATE TABLE upload_quotas (
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date            TEXT NOT NULL,
    upload_count    INTEGER NOT NULL DEFAULT 0,
    bytes_uploaded  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
);
