CREATE TABLE monitor_layouts (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_monitor_layouts_user ON monitor_layouts(user_id);

CREATE TABLE monitors (
    id              TEXT PRIMARY KEY,
    layout_id       TEXT NOT NULL REFERENCES monitor_layouts(id) ON DELETE CASCADE,
    monitor_index   INTEGER NOT NULL,
    x               INTEGER NOT NULL,
    y               INTEGER NOT NULL,
    width           INTEGER NOT NULL,
    height          INTEGER NOT NULL,
    scale_factor    REAL NOT NULL DEFAULT 1.0,
    is_primary      INTEGER NOT NULL DEFAULT 0,
    UNIQUE (layout_id, monitor_index)
);

CREATE INDEX idx_monitors_layout ON monitors(layout_id);
