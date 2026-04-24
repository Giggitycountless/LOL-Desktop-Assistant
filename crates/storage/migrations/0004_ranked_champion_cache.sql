CREATE TABLE IF NOT EXISTS ranked_champion_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    patch TEXT,
    region TEXT,
    queue TEXT,
    tier TEXT,
    generated_at TEXT,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ranked_champion_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL,
    champion_id INTEGER NOT NULL,
    champion_name TEXT NOT NULL,
    champion_alias TEXT,
    lane TEXT NOT NULL,
    games INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    picks INTEGER NOT NULL,
    bans INTEGER NOT NULL,
    win_rate REAL NOT NULL,
    pick_rate REAL NOT NULL,
    ban_rate REAL NOT NULL,
    overall_score REAL NOT NULL,
    FOREIGN KEY(snapshot_id) REFERENCES ranked_champion_snapshots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ranked_champion_entries_snapshot_lane
ON ranked_champion_entries(snapshot_id, lane);

CREATE INDEX IF NOT EXISTS idx_ranked_champion_snapshots_imported_at
ON ranked_champion_snapshots(imported_at DESC, id DESC);

UPDATE app_metadata
SET value = '4',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'schema_version';
