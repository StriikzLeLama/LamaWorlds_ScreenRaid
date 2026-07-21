-- scheduled_pranks
CREATE TABLE IF NOT EXISTS scheduled_pranks (
  id TEXT PRIMARY KEY NOT NULL,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  target_id TEXT REFERENCES users(id),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('at_time', 'on_online')),
  run_at TEXT, -- RFC3339, required for at_time
  online_user_id TEXT REFERENCES users(id), -- required for on_online: fire when this user comes online
  payload_json TEXT NOT NULL, -- full SendPrankRequest JSON
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fired', 'cancelled', 'failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  fired_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_scheduled_pending ON scheduled_pranks(status, trigger_type, run_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_online ON scheduled_pranks(status, trigger_type, online_user_id);

-- room_invites (guest links)
CREATE TABLE IF NOT EXISTS room_invites (
  id TEXT PRIMARY KEY NOT NULL,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'guest' CHECK (role IN ('guest', 'member')),
  created_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT, -- RFC3339 nullable = no expiry
  max_uses INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_room_invites_token ON room_invites(token);
CREATE INDEX IF NOT EXISTS idx_room_invites_room ON room_invites(room_id);
