CREATE TABLE IF NOT EXISTS player_notes (
    player_puuid TEXT PRIMARY KEY,
    last_display_name TEXT NOT NULL,
    note TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_player_notes_updated_at
ON player_notes(updated_at DESC);

UPDATE app_metadata
SET value = '3',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'schema_version';
