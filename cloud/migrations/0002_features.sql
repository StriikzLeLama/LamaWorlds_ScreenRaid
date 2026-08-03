-- 2FA, scheduled pranks, audit log

CREATE TABLE IF NOT EXISTS user_totp (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret_encrypted TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  recovery_hashes TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduled_pranks (
  id TEXT PRIMARY KEY NOT NULL,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  target_id TEXT REFERENCES users(id),
  media_id TEXT REFERENCES media(id),
  overlay_type TEXT NOT NULL,
  text_content TEXT,
  config TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  trigger_type TEXT NOT NULL,
  run_at TEXT,
  online_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  fired_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduled_pending_time
  ON scheduled_pranks(status, trigger_type, run_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_online
  ON scheduled_pranks(status, trigger_type, online_user_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  actor_id TEXT,
  actor_username TEXT,
  ip_address TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
