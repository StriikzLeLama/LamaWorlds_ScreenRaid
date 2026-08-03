-- Sessions metadata + user security prefs

ALTER TABLE refresh_tokens ADD COLUMN user_agent TEXT;
ALTER TABLE refresh_tokens ADD COLUMN ip_address TEXT;
ALTER TABLE refresh_tokens ADD COLUMN last_seen_at TEXT;
ALTER TABLE refresh_tokens ADD COLUMN label TEXT;

CREATE TABLE IF NOT EXISTS user_security_prefs (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preset TEXT NOT NULL DEFAULT 'friends',
  allow_sound INTEGER NOT NULL DEFAULT 1,
  allow_video INTEGER NOT NULL DEFAULT 1,
  allow_fullscreen INTEGER NOT NULL DEFAULT 1,
  local_cooldown_ms INTEGER NOT NULL DEFAULT 2000,
  max_pranks_per_minute INTEGER,
  target_cooldown_ms INTEGER,
  max_duration_ms INTEGER,
  max_volume REAL,
  updated_at TEXT NOT NULL
);
