-- Security pack: sessions metadata, 2FA, room/user security, login failures

ALTER TABLE refresh_tokens ADD COLUMN user_agent TEXT;
ALTER TABLE refresh_tokens ADD COLUMN ip_address TEXT;
ALTER TABLE refresh_tokens ADD COLUMN label TEXT;
ALTER TABLE refresh_tokens ADD COLUMN last_seen_at TEXT;

CREATE TABLE user_totp (
    user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    secret_encrypted TEXT NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 0,
    recovery_hashes TEXT NOT NULL DEFAULT '[]',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE user_security_prefs (
    user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preset          TEXT NOT NULL DEFAULT 'friends'
                    CHECK (preset IN ('friends', 'strict', 'custom')),
    allow_sound     INTEGER NOT NULL DEFAULT 1,
    allow_video     INTEGER NOT NULL DEFAULT 1,
    allow_fullscreen INTEGER NOT NULL DEFAULT 1,
    local_cooldown_ms INTEGER NOT NULL DEFAULT 2000,
    max_pranks_per_minute INTEGER,
    target_cooldown_ms INTEGER,
    max_duration_ms INTEGER,
    max_volume REAL,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE room_security (
    room_id         TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
    preset          TEXT NOT NULL DEFAULT 'inherit'
                    CHECK (preset IN ('inherit', 'friends', 'strict', 'custom')),
    max_pranks_per_minute INTEGER,
    target_cooldown_ms INTEGER,
    max_duration_ms INTEGER,
    max_volume REAL,
    muted_senders   TEXT NOT NULL DEFAULT '[]',
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE login_failures (
    key             TEXT PRIMARY KEY,
    count           INTEGER NOT NULL DEFAULT 0,
    last_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pending_2fa (
    token_hash      TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token   TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_pending_2fa_user ON pending_2fa(user_id);
