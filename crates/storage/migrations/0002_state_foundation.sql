CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    startup_page TEXT NOT NULL CHECK (startup_page IN ('dashboard', 'activity', 'settings')),
    compact_mode INTEGER NOT NULL DEFAULT 0 CHECK (compact_mode IN (0, 1)),
    activity_limit INTEGER NOT NULL DEFAULT 100 CHECK (activity_limit BETWEEN 1 AND 500),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app_settings (id, startup_page, compact_mode, activity_limit)
VALUES (1, 'dashboard', 0, 100)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS activity_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('note', 'settings', 'system')),
    title TEXT NOT NULL,
    body TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_entries_created_at
ON activity_entries(created_at DESC, id DESC);

UPDATE app_metadata
SET value = '2',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'schema_version';
